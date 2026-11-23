// backend/services/housekeepingService.js
const HousekeepingTask = require("../models/HousekeepingTask");
const Room = require("../models/Room");
const User = require("../models/User");
const Reservation = require("../models/Reservation");
const { runWithOptionalTransaction } = require("../utils/transactionHelper");
const { syncFromHousekeepingTask } = require("./lostItemService");

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

/**
 * Automatically & idempotently create a housekeeping task upon reservation check-out.
 */
async function createCheckoutTask(roomId, reservationId = null, userId = null, session = null) {
  if (!roomId) return null;
  const targetRoomId = roomId._id || roomId;
  const targetReservationId = reservationId?._id || reservationId;

  // 1. Idempotency check: see if an active task already exists for this room/checkout
  let query;
  if (targetReservationId) {
    query = HousekeepingTask.findOne({
      room: targetRoomId,
      reservation: targetReservationId
    });
  } else {
    query = HousekeepingTask.findOne({
      room: targetRoomId,
      status: { $in: ["Pending", "Assigned", "In Progress", "Needs Recleaning"] }
    });
  }
  if (session) query = query.session(session);
  const existingTask = await query;

  if (existingTask) {
    // Ensure room reflects Cleaning / Dirty
    let roomQuery = Room.findByIdAndUpdate(targetRoomId, {
      status: "Cleaning",
      cleaningStatus: "Dirty",
      currentReservation: null
    });
    if (session) roomQuery = roomQuery.session(session);
    await roomQuery;
    return existingTask;
  }

  // 2. Ensure room status transitions to Cleaning / Dirty and clears current reservation
  let roomQuery = Room.findByIdAndUpdate(targetRoomId, {
    status: "Cleaning",
    cleaningStatus: "Dirty",
    currentReservation: null
  });
  if (session) roomQuery = roomQuery.session(session);
  await roomQuery;

  // 3. Resolve property from room or active property
  let propertyId = null;
  const roomDoc = await Room.findById(targetRoomId).select("property").lean();
  if (roomDoc && roomDoc.property) {
    propertyId = roomDoc.property;
  } else {
    const { getActivePropertyId } = require("../middleware/propertyContext");
    propertyId = await getActivePropertyId();
  }

  // 4. Create canonical HousekeepingTask
  const task = new HousekeepingTask({
    property: propertyId,
    room: targetRoomId,
    reservation: targetReservationId || null,
    taskType: "Check-out Cleaning",
    status: "Pending",
    priority: "High",
    createdBy: userId || null,
    auditLog: [{
      action: "TASK_CREATED",
      performedBy: userId || null,
      timestamp: new Date(),
      details: "Automated housekeeping task created on reservation check-out"
    }]
  });

  await task.save({ session });
  return task;
}

/**
 * Assign staff member to a housekeeping task.
 */
async function assignTask(taskId, staffId, assignedByUserId) {
  const task = await HousekeepingTask.findById(taskId);
  if (!task) {
    const err = new Error("Housekeeping task not found");
    err.statusCode = 404;
    throw err;
  }

  const staff = await User.findById(staffId);
  if (!staff) {
    const err = new Error("Staff member not found");
    err.statusCode = 404;
    throw err;
  }

  if (staff.role !== "housekeeping" && staff.role !== "staff" && staff.role !== "admin" && staff.role !== "manager") {
    const err = new Error("User cannot be assigned housekeeping tasks");
    err.statusCode = 400;
    throw err;
  }

  assertTaskTransition(task.status, "Assigned");

  task.assignedTo = staffId;
  task.status = "Assigned";
  task.auditLog.push({
    action: "TASK_ASSIGNED",
    performedBy: assignedByUserId,
    timestamp: new Date(),
    details: `Task assigned to ${staff.name} (${staff.email})`
  });

  await task.save();
  return task.populate([
    { path: "room", select: "roomNumber roomType floor status cleaningStatus" },
    { path: "assignedTo", select: "name email role phone" },
    {
      path: "reservation",
      select: "reservationNumber checkInDate checkOutDate actualCheckOutDate guest",
      populate: { path: "guest", select: "firstName lastName name phone" }
    }
  ]);
}

/**
 * Housekeeper starts an assigned or pending task.
 */
async function startTask(taskId, staffUserId) {
  return runWithOptionalTransaction(async (session) => {
    let taskQuery = HousekeepingTask.findById(taskId);
    if (session) taskQuery = taskQuery.session(session);
    const task = await taskQuery;
    if (!task) {
      const err = new Error("Housekeeping task not found");
      err.statusCode = 404;
      throw err;
    }

    let userQuery = User.findById(staffUserId);
    if (session) userQuery = userQuery.session(session);
    const currentUser = await userQuery;
    if (!currentUser || !["admin", "manager", "staff", "housekeeping"].includes(currentUser.role)) {
      const err = new Error("Not authorized to start housekeeping tasks");
      err.statusCode = 403;
      throw err;
    }

    const isManagerOrAdmin = ["admin", "manager"].includes(currentUser.role);
    if (!isManagerOrAdmin && task.assignedTo && task.assignedTo.toString() !== staffUserId.toString()) {
      const err = new Error("Not authorized to start a task assigned to another housekeeper");
      err.statusCode = 403;
      throw err;
    }

    assertTaskTransition(task.status, "In Progress");

    task.status = "In Progress";
    task.startedAt = new Date();
    if (!task.assignedTo) {
      task.assignedTo = staffUserId;
    }
    task.auditLog.push({
      action: "TASK_STARTED",
      performedBy: staffUserId,
      timestamp: new Date(),
      details: `Cleaning started by ${currentUser.name || "housekeeping staff"}`
    });

    await task.save({ session });

    // Update room status consistently
    let roomQuery = Room.findById(task.room);
    if (session) roomQuery = roomQuery.session(session);
    const room = await roomQuery;
    if (room) {
      if (room.status !== "Occupied" && room.status !== "Maintenance" && room.status !== "Out of Order") {
        room.status = "Cleaning";
      }
      room.cleaningStatus = "Dirty";
      await room.save({ session });
    }

    return HousekeepingTask.findById(task._id)
      .session(session || null)
      .populate([
        { path: "room", select: "roomNumber roomType floor status cleaningStatus" },
        { path: "assignedTo", select: "name email role phone" },
        {
          path: "reservation",
          select: "reservationNumber checkInDate checkOutDate actualCheckOutDate guest",
          populate: { path: "guest", select: "firstName lastName name phone" }
        }
      ]);
  });
}

/**
 * Housekeeper marks cleaning as completed.
 * Restores room availability and marks room hygiene as Clean.
 */
async function completeTask(taskId, staffUserId, { notes, lostItems = [] } = {}) {
  return runWithOptionalTransaction(async (session) => {
    let taskQuery = HousekeepingTask.findById(taskId);
    if (session) taskQuery = taskQuery.session(session);
    const task = await taskQuery;
    if (!task) {
      const err = new Error("Housekeeping task not found");
      err.statusCode = 404;
      throw err;
    }

    let userQuery = User.findById(staffUserId);
    if (session) userQuery = userQuery.session(session);
    const currentUser = await userQuery;
    if (!currentUser || !["admin", "manager", "staff", "housekeeping"].includes(currentUser.role)) {
      const err = new Error("Not authorized to complete housekeeping tasks");
      err.statusCode = 403;
      throw err;
    }

    const isManagerOrAdmin = ["admin", "manager"].includes(currentUser.role);
    if (!isManagerOrAdmin && task.assignedTo && task.assignedTo.toString() !== staffUserId.toString()) {
      const err = new Error("Not authorized to complete a task assigned to another housekeeper");
      err.statusCode = 403;
      throw err;
    }

    assertTaskTransition(task.status, "Completed");

    task.status = "Completed";
    task.completedAt = new Date();
    if (!task.startedAt) {
      task.startedAt = new Date();
    }
    if (!task.assignedTo) {
      task.assignedTo = staffUserId;
    }
    if (notes) task.notes = notes;
    if (Array.isArray(lostItems) && lostItems.length > 0) {
      task.lostItems.push(...lostItems);
    }

    task.auditLog.push({
      action: "TASK_COMPLETED",
      performedBy: staffUserId,
      timestamp: new Date(),
      details: `Cleaning completed by ${currentUser.name || "housekeeping staff"}. Room status updated to Available.`
    });

    await task.save({ session });

    // Synchronize lost items to canonical LostItem collection (idempotent, backward-compatible)
    if (Array.isArray(lostItems) && lostItems.length > 0) {
      try {
        await syncFromHousekeepingTask(task, staffUserId, session);
      } catch (syncErr) {
        console.error("Error synchronizing lost items from housekeeping task:", syncErr);
      }
    }

    // Check if room has an active Checked-In reservation or blocking maintenance
    let checkedInQuery = Reservation.findOne({
      room: task.room,
      status: "Checked-In"
    });
    if (session) checkedInQuery = checkedInQuery.session(session);
    const activeCheckedIn = await checkedInQuery;

    let roomQuery = Room.findById(task.room);
    if (session) roomQuery = roomQuery.session(session);
    const room = await roomQuery;
    if (!room) {
      const err = new Error("Associated room not found");
      err.statusCode = 404;
      throw err;
    }

    const isBlockedByMaintenance = room.status === "Maintenance" || room.status === "Out of Order";
    const targetStatus = (activeCheckedIn || isBlockedByMaintenance) ? room.status : "Available";

    room.cleaningStatus = "Clean";
    room.status = targetStatus;
    room.lastCleanedAt = new Date();
    if (!activeCheckedIn) {
      room.currentReservation = null;
    }

    await room.save({ session });

    return HousekeepingTask.findById(task._id)
      .session(session || null)
      .populate([
        { path: "room", select: "roomNumber roomType floor status cleaningStatus" },
        { path: "assignedTo", select: "name email role phone" },
        {
          path: "reservation",
          select: "reservationNumber checkInDate checkOutDate actualCheckOutDate guest",
          populate: { path: "guest", select: "firstName lastName name phone" }
        }
      ]);
  });
}

/**
 * Supervisor/Manager inspects completed task (Approve or Reject).
 */
async function inspectTask(taskId, supervisorUserId, { approved, notes = "" }) {
  return runWithOptionalTransaction(async (session) => {
    let taskQuery = HousekeepingTask.findById(taskId);
    if (session) taskQuery = taskQuery.session(session);
    const task = await taskQuery;
    if (!task) {
      const err = new Error("Housekeeping task not found");
      err.statusCode = 404;
      throw err;
    }

    let supervisorQuery = User.findById(supervisorUserId);
    if (session) supervisorQuery = supervisorQuery.session(session);
    const supervisor = await supervisorQuery;
    if (!supervisor || !["admin", "manager"].includes(supervisor.role)) {
      const err = new Error("Only supervisors, managers, or admins can inspect housekeeping tasks");
      err.statusCode = 403;
      throw err;
    }

    let roomQuery = Room.findById(task.room);
    if (session) roomQuery = roomQuery.session(session);
    const room = await roomQuery;
    if (!room) {
      const err = new Error("Associated room not found");
      err.statusCode = 404;
      throw err;
    }

    if (approved) {
      assertTaskTransition(task.status, "Inspected");

      task.status = "Inspected";
      task.inspectedAt = new Date();
      task.inspectedBy = supervisorUserId;
      task.inspectionNotes = notes;

      task.auditLog.push({
        action: "INSPECTION_APPROVED",
        performedBy: supervisorUserId,
        timestamp: new Date(),
        details: `Inspection approved by ${supervisor.name}: room confirmed Available & Clean`
      });

      await task.save({ session });

      let checkedInQuery = Reservation.findOne({
        room: task.room,
        status: "Checked-In"
      });
      if (session) checkedInQuery = checkedInQuery.session(session);
      const activeCheckedIn = await checkedInQuery;
      const isBlockedByMaintenance = room.status === "Maintenance" || room.status === "Out of Order";

      room.cleaningStatus = "Clean";
      room.status = (activeCheckedIn || isBlockedByMaintenance) ? room.status : "Available";
      if (!activeCheckedIn) {
        room.currentReservation = null;
      }
      await room.save({ session });
    } else {
      assertTaskTransition(task.status, "Needs Recleaning");

      task.status = "Needs Recleaning";
      task.inspectedAt = new Date();
      task.inspectedBy = supervisorUserId;
      task.inspectionNotes = notes || "Cleaning failed inspection, sent back for recleaning";

      task.auditLog.push({
        action: "INSPECTION_REJECTED",
        performedBy: supervisorUserId,
        timestamp: new Date(),
        details: `Inspection rejected by ${supervisor.name}. Reason: ${notes || "Needs recleaning"}`
      });

      await task.save({ session });

      // Rejected: room returns to Cleaning / Dirty!
      if (room.status !== "Occupied" && room.status !== "Maintenance" && room.status !== "Out of Order") {
        room.status = "Cleaning";
      }
      room.cleaningStatus = "Dirty";
      await room.save({ session });
    }

    return HousekeepingTask.findById(task._id)
      .session(session || null)
      .populate([
        { path: "room", select: "roomNumber roomType floor status cleaningStatus" },
        { path: "assignedTo", select: "name email role phone" },
        { path: "inspectedBy", select: "name email role" },
        {
          path: "reservation",
          select: "reservationNumber checkInDate checkOutDate actualCheckOutDate guest",
          populate: { path: "guest", select: "firstName lastName name phone" }
        }
      ]);
  });
}

module.exports = {
  ALLOWED_TASK_TRANSITIONS,
  assertTaskTransition,
  createCheckoutTask,
  assignTask,
  startTask,
  completeTask,
  inspectTask
};
