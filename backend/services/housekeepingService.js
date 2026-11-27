// backend/services/housekeepingService.js
const HousekeepingTask = require("../models/HousekeepingTask");
const Room = require("../models/Room");
const User = require("../models/User");
const Reservation = require("../models/Reservation");
const { runWithOptionalTransaction, withRoomLock } = require("../utils/transactionHelper");
const { syncFromHousekeepingTask } = require("./lostItemService");
const { findCheckedInLegacyBooking } = require("./availabilityService");

const ALLOWED_TASK_TRANSITIONS = {
  Pending: ["Assigned", "In Progress", "Completed"],
  Assigned: ["In Progress", "Pending", "Completed"],
  "In Progress": ["Completed"],
  Completed: ["Inspected", "Needs Recleaning"],
  "Needs Recleaning": ["In Progress", "Assigned", "Completed"],
  Inspected: []
};

function assertTaskTransition(currentStatus, nextStatus) {
  const allowed = ALLOWED_TASK_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(nextStatus)) {
    const error = new Error(`Invalid housekeeping task transition from ${currentStatus} to ${nextStatus}`);
    error.statusCode = 409;
    throw error;
  }
}

const CLEANING_QUEUE_STATUSES = ["Pending", "Assigned", "In Progress", "Needs Recleaning"];
const ACTIVE_CLEANING_STATUSES = [...CLEANING_QUEUE_STATUSES, "Completed"];

function workflowError(message, statusCode = 409) {
  return Object.assign(new Error(message), { statusCode });
}

function findCheckedInStay(roomId, session) {
  return Reservation.findOne({ room: roomId, status: "Checked-In" }).select("_id").session(session);
}

async function assertVacant(room, session) {
  if (room.status === "Occupied" || await findCheckedInStay(room._id, session) ||
      await findCheckedInLegacyBooking(room._id, session)) {
    throw workflowError("Room is occupied. Complete checkout before starting or releasing cleaning.");
  }
}

async function assertRoomCanBeCleaned(room, session) {
  await assertVacant(room, session);
  if (!room.isActive || ["Maintenance", "Out of Order"].includes(room.status)) {
    throw workflowError("Room must be active and released from maintenance before cleaning.");
  }
}

function isActiveCleaningTask(task, room) {
  return CLEANING_QUEUE_STATUSES.includes(task.status) ||
    (task.status === "Completed" && room.status === "Cleaning" && room.cleaningStatus === "Clean");
}

async function loadCurrentCleaningTasks(rooms, session = null, includeAssignee = false) {
  if (rooms.length === 0) return new Map();
  const roomsById = new Map(rooms.map(room => [String(room._id), room]));
  const query = HousekeepingTask.find({
    room: { $in: rooms.map(room => room._id) },
    status: { $in: ACTIVE_CLEANING_STATUSES }
  }).sort({ updatedAt: -1, createdAt: -1, _id: -1 })
    .session(session);
  if (includeAssignee) query.populate("assignedTo", "name email role phone");
  const tasks = await query.lean();

  const current = new Map();
  for (const task of tasks) {
    const id = String(task.room);
    if (!isActiveCleaningTask(task, roomsById.get(id))) continue;
    const selected = current.get(id);
    if (!selected || (task.status === "In Progress" && selected.status !== "In Progress")) {
      current.set(id, task);
    }
  }
  return current;
}

async function currentCleaningTask(room, session) {
  const selected = (await loadCurrentCleaningTasks([room], session)).get(String(room._id));
  return selected ? HousekeepingTask.findById(selected._id).session(session) : null;
}

async function queueCleaningTask(room, {
  reservationId = null, userId = null, taskType = "Check-out Cleaning",
  assignedTo = null, priority = "High", notes = "", newTurnover = false
}, session) {
  const existing = await currentCleaningTask(room, session);
  if (existing && !newTurnover) {
    if (room.property && !room.property.equals(existing.property)) {
      await HousekeepingTask.updateOne({ _id: existing._id }, { property: room.property }, { session, runValidators: true });
      existing.property = room.property;
    }
    if (existing.status !== "Completed" && (room.status !== "Cleaning" || room.cleaningStatus !== "Dirty")) {
      room.status = "Cleaning";
      room.cleaningStatus = "Dirty";
      await room.save({ session });
    }
    return { task: existing, created: false };
  }

  const task = existing || new HousekeepingTask({
    room: room._id,
    property: room.property || await require("../middleware/propertyContext").getActivePropertyId(),
    createdBy: userId,
    assignedTo,
    priority,
    notes
  });
  if (room.property) task.property = room.property;
  task.taskType = taskType;
  task.reservation = reservationId;
  task.status = task.assignedTo ? "Assigned" : "Pending";
  task.startedAt = undefined;
  task.completedAt = undefined;
  task.inspectedAt = undefined;
  task.inspectedBy = undefined;
  task.inspectionNotes = "";
  task.auditLog.push({
    action: existing ? "TASK_REOPENED" : "TASK_CREATED",
    performedBy: userId,
    details: taskType
  });

  // Force a room write even when already dirty, so concurrent Atlas transactions
  // serialize task creation for this room.
  room.status = "Cleaning";
  room.cleaningStatus = "Dirty";
  if (reservationId && room.currentReservation?.equals(reservationId)) room.currentReservation = null;
  await task.validate();
  room.increment();
  await room.save({ session });
  await task.save({ session });
  return { task, created: !existing };
}

async function createCheckoutTask(roomId, reservationId = null, userId = null, session = null, { roomLocked = false } = {}) {
  if (!roomId) return null;
  const id = roomId._id || roomId;
  const targetReservationId = reservationId?._id || reservationId;

  const create = async (dbSession) => {
    const room = await Room.findById(id).session(dbSession);
    if (!room) throw workflowError("Room not found", 404);
    if (targetReservationId) {
      const previous = await HousekeepingTask.findOne({
        room: id, reservation: targetReservationId
      }).session(dbSession);
      if (previous) return previous;

      const remainingStay = await findCheckedInStay(id, dbSession);
      if (remainingStay || await findCheckedInLegacyBooking(id, dbSession)) {
        // Another guest is still checked in. Only the last checkout queues cleaning.
        room.status = "Occupied";
        room.cleaningStatus = "Dirty";
        room.currentReservation = remainingStay?._id || null;
        await room.save({ session: dbSession });
        return null;
      }
      if (!room.isActive || ["Maintenance", "Out of Order"].includes(room.status)) {
        if (room.currentReservation?.equals(targetReservationId)) {
          room.currentReservation = null;
          await room.save({ session: dbSession });
        }
        return null;
      }
    } else {
      await assertRoomCanBeCleaned(room, dbSession);
    }

    const { task } = await queueCleaningTask(room, {
      reservationId: targetReservationId, userId, newTurnover: Boolean(targetReservationId)
    }, dbSession);
    return task;
  };
  return session || roomLocked ? create(session) : withRoomLock(id, () => runWithOptionalTransaction(create));
}

async function createManualTask(roomFilter, options) {
  return withRoomLock(roomFilter._id, () => runWithOptionalTransaction(async (session) => {
    const room = await Room.findOne(roomFilter).session(session);
    if (!room) throw workflowError("Room not found", 404);
    await assertRoomCanBeCleaned(room, session);
    const result = await queueCleaningTask(room, options, session);
    return { ...result, room };
  }));
}

function needsCleaning(room) {
  return room.status === "Cleaning" || ["Dirty", "Pickup"].includes(room.cleaningStatus);
}

async function syncCleaningTasks(propertyId, userId) {
  const rooms = await Room.find({ property: propertyId }).select("status cleaningStatus isActive").lean();
  const roomsById = new Map(rooms.map(room => [String(room._id), room]));
  const tasks = await HousekeepingTask.find({
    $or: [{ property: propertyId }, { room: { $in: rooms.map(room => room._id) } }]
  }).select("property room status").lean();
  const counts = { created: 0, reused: 0, skipped: 0, duplicateTasks: 0, invalidRoomReferences: 0, invalidStatuses: 0 };
  const issues = { duplicateRoomIds: [], invalidRoomTaskIds: [], invalidStatusTaskIds: [] };
  const statusValues = HousekeepingTask.schema.path("status").enumValues;
  const activeCounts = new Map();

  for (const task of tasks) {
    const roomId = String(task.room);
    const room = roomsById.get(roomId);
    if (!room) {
      if (ACTIVE_CLEANING_STATUSES.includes(task.status)) {
        counts.invalidRoomReferences++;
        issues.invalidRoomTaskIds.push(task._id);
      }
      continue;
    }
    if (!statusValues.includes(task.status)) {
      counts.invalidStatuses++;
      issues.invalidStatusTaskIds.push(task._id);
    }
    if (isActiveCleaningTask(task, room)) activeCounts.set(roomId, (activeCounts.get(roomId) || 0) + 1);
  }
  for (const [roomId, count] of activeCounts) {
    if (count < 2) continue;
    counts.duplicateTasks += count - 1;
    issues.duplicateRoomIds.push(roomId);
  }

  for (const candidate of rooms.filter(needsCleaning)) {
    try {
      const outcome = await withRoomLock(candidate._id, () => runWithOptionalTransaction(async (session) => {
        const room = await Room.findOne({ _id: candidate._id, property: propertyId }).session(session);
        if (!room || !needsCleaning(room)) return "skipped";
        await assertRoomCanBeCleaned(room, session);
        const { created } = await queueCleaningTask(room, { taskType: "Daily Cleaning", userId }, session);
        return created ? "created" : "reused";
      }));
      counts[outcome]++;
    } catch (error) {
      if (error.statusCode !== 409) throw error;
      counts.skipped++;
    }
  }
  return { ...counts, issues };
}

const taskPopulate = [
  { path: "room", select: "roomNumber roomType floor status cleaningStatus" },
  { path: "assignedTo", select: "name email role phone" },
  { path: "inspectedBy", select: "name email role" },
  {
    path: "reservation",
    select: "reservationNumber checkInDate checkOutDate actualCheckOutDate guest",
    populate: { path: "guest", select: "firstName lastName name phone" }
  }
];

async function updateCleaningTask(taskId, propertyId, update) {
  const roomId = (await HousekeepingTask.findById(taskId).select("room").lean())?.room;
  if (!roomId) throw workflowError("Housekeeping task not found", 404);

  return withRoomLock(roomId, () => runWithOptionalTransaction(async (session) => {
    const room = await Room.findOne({
      _id: roomId,
      ...(propertyId ? { property: propertyId } : {})
    }).session(session);
    if (!room) throw workflowError("Housekeeping task not found", 404);
    const task = await HousekeepingTask.findById(taskId).session(session);
    if (!task) throw workflowError("Housekeeping task not found", 404);
    await update(task, room, session);

    return HousekeepingTask.findById(taskId).session(session).populate(taskPopulate);
  }));
}

async function assertCurrentTask(task, room, session) {
  const current = await currentCleaningTask(room, session);
  if (!current?._id.equals(task._id)) {
    throw workflowError("This task is no longer the current room cleaning task.");
  }
}

async function assertCleaner(task, userId, session) {
  const user = await User.findById(userId).session(session);
  if (!user || !["admin", "manager", "staff", "housekeeping"].includes(user.role)) {
    throw workflowError("Not authorized to update housekeeping tasks", 403);
  }
  if (!["admin", "manager"].includes(user.role) && task.assignedTo && !task.assignedTo.equals(userId)) {
    throw workflowError("Task is assigned to another housekeeper", 403);
  }
  return user;
}

/**
 * Assign staff member to a housekeeping task.
 */
async function assignTask(taskId, staffId, assignedByUserId, propertyId) {
  return updateCleaningTask(taskId, propertyId, async (task, room, session) => {
    const staff = await User.findById(staffId).session(session);
    if (!staff) throw workflowError("Staff member not found", 404);
    if (!["housekeeping", "staff", "admin", "manager"].includes(staff.role)) {
      throw workflowError("User cannot be assigned housekeeping tasks", 400);
    }

    assertTaskTransition(task.status, "Assigned");
    await assertCurrentTask(task, room, session);
    task.assignedTo = staffId;
    task.status = "Assigned";
    task.auditLog.push({
      action: "TASK_ASSIGNED",
      performedBy: assignedByUserId,
      details: `Task assigned to ${staff.name}`
    });
    await task.save({ session });
  });
}

async function startTask(taskId, staffUserId, propertyId) {
  return updateCleaningTask(taskId, propertyId, async (task, room, session) => {
    const user = await assertCleaner(task, staffUserId, session);
    assertTaskTransition(task.status, "In Progress");
    await assertRoomCanBeCleaned(room, session);
    await assertCurrentTask(task, room, session);

    task.status = "In Progress";
    task.startedAt = new Date();
    task.assignedTo ||= staffUserId;
    task.auditLog.push({
      action: "TASK_STARTED",
      performedBy: staffUserId,
      details: `Cleaning started by ${user.name}`
    });

    room.status = "Cleaning";
    room.cleaningStatus = "Dirty";
    await room.save({ session });
    await task.save({ session });
  });
}

async function completeTask(taskId, staffUserId, { notes, lostItems = [], propertyId } = {}) {
  return updateCleaningTask(taskId, propertyId, async (task, room, session) => {
    const user = await assertCleaner(task, staffUserId, session);
    assertTaskTransition(task.status, "Completed");
    await assertRoomCanBeCleaned(room, session);
    await assertCurrentTask(task, room, session);

    task.status = "Completed";
    task.completedAt = new Date();
    task.startedAt ||= task.completedAt;
    task.assignedTo ||= staffUserId;
    if (notes) task.notes = notes;
    if (Array.isArray(lostItems)) task.lostItems.push(...lostItems);
    task.auditLog.push({
      action: "TASK_COMPLETED",
      performedBy: staffUserId,
      details: `Cleaning completed by ${user.name}. Room awaits inspection.`
    });

    room.status = "Cleaning";
    room.cleaningStatus = "Clean";
    room.lastCleanedAt = task.completedAt;
    await task.validate();
    await room.save({ session });
    await task.save({ session });

    if (Array.isArray(lostItems) && lostItems.length > 0) {
      try {
        await syncFromHousekeepingTask(task, staffUserId, session);
      } catch (syncErr) {
        console.error("Error synchronizing lost items from housekeeping task:", syncErr);
      }
    }
  });
}

async function inspectTask(taskId, supervisorUserId, { approved, notes = "", propertyId }) {
  if (typeof approved !== "boolean") throw workflowError("An inspection decision is required", 400);

  return updateCleaningTask(taskId, propertyId, async (task, room, session) => {
    const supervisor = await User.findById(supervisorUserId).session(session);
    if (!supervisor || !["admin", "manager"].includes(supervisor.role)) {
      throw workflowError("Only managers or admins can inspect housekeeping tasks", 403);
    }

    const nextStatus = approved ? "Inspected" : "Needs Recleaning";
    assertTaskTransition(task.status, nextStatus);
    await assertRoomCanBeCleaned(room, session);
    if (room.status !== "Cleaning" || room.cleaningStatus !== "Clean") {
      throw workflowError("Room must be clean and awaiting inspection.");
    }
    await assertCurrentTask(task, room, session);

    task.status = nextStatus;
    task.inspectedAt = new Date();
    task.inspectedBy = supervisorUserId;
    task.inspectionNotes = notes;
    task.auditLog.push({
      action: approved ? "INSPECTION_APPROVED" : "INSPECTION_REJECTED",
      performedBy: supervisorUserId,
      details: notes
    });

    room.status = approved ? "Available" : "Cleaning";
    room.cleaningStatus = approved ? "Clean" : "Dirty";
    // Release only after recording approval. Preserve any future reservation reference.
    if (approved) await task.save({ session });
    await room.save({ session });
    if (!approved) await task.save({ session });
  });
}

module.exports = {
  ACTIVE_CLEANING_STATUSES,
  CLEANING_QUEUE_STATUSES,
  ALLOWED_TASK_TRANSITIONS,
  assertTaskTransition,
  createCheckoutTask,
  createManualTask,
  loadCurrentCleaningTasks,
  syncCleaningTasks,
  queueCleaningTask,
  assertVacant,
  assignTask,
  startTask,
  completeTask,
  inspectTask
};
