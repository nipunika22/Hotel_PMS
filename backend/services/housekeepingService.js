// backend/services/housekeepingService.js
const HousekeepingTask = require("../models/HousekeepingTask");
const Room = require("../models/Room");
const User = require("../models/User");
const { syncFromHousekeepingTask } = require("./lostItemService");

const ALLOWED_TASK_TRANSITIONS = {
  Pending: ["Assigned", "In Progress"],
  Assigned: ["In Progress", "Pending"],
  "In Progress": ["Completed"],
  Completed: ["Inspected", "Needs Recleaning"],
  "Needs Recleaning": ["In Progress", "Assigned"],
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

  // 1. Idempotency check: see if an active (uninspected) task already exists for this room/checkout
  let query = HousekeepingTask.findOne({
    room: targetRoomId,
    status: { $ne: "Inspected" }
  });
  if (session) query = query.session(session);
  const existingTask = await query;

  if (existingTask) {
    return existingTask;
  }

  // 2. Ensure room status transitions to Cleaning / Dirty
  let roomQuery = Room.findByIdAndUpdate(targetRoomId, {
    status: "Cleaning",
    cleaningStatus: "Dirty"
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
    { path: "assignedTo", select: "name email role phone" }
  ]);
}

/**
 * Housekeeper starts an assigned task.
 */
async function startTask(taskId, staffUserId) {
  const task = await HousekeepingTask.findById(taskId);
  if (!task) {
    const err = new Error("Housekeeping task not found");
    err.statusCode = 404;
    throw err;
  }

  // Authorization: user must be assigned to task or admin/manager
  const currentUser = await User.findById(staffUserId);
  const isManagerOrAdmin = ["admin", "manager"].includes(currentUser?.role);
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
    details: "Cleaning started by housekeeping staff"
  });

  await task.save();
  return task.populate([
    { path: "room", select: "roomNumber roomType floor status cleaningStatus" },
    { path: "assignedTo", select: "name email role phone" }
  ]);
}

/**
 * Housekeeper marks cleaning as completed.
 */
async function completeTask(taskId, staffUserId, { notes, lostItems = [] } = {}) {
  const task = await HousekeepingTask.findById(taskId);
  if (!task) {
    const err = new Error("Housekeeping task not found");
    err.statusCode = 404;
    throw err;
  }

  const currentUser = await User.findById(staffUserId);
  const isManagerOrAdmin = ["admin", "manager"].includes(currentUser?.role);
  if (!isManagerOrAdmin && task.assignedTo && task.assignedTo.toString() !== staffUserId.toString()) {
    const err = new Error("Not authorized to complete a task assigned to another housekeeper");
    err.statusCode = 403;
    throw err;
  }

  assertTaskTransition(task.status, "Completed");

  task.status = "Completed";
  task.completedAt = new Date();
  if (notes) task.notes = notes;
  if (Array.isArray(lostItems) && lostItems.length > 0) {
    task.lostItems.push(...lostItems);
  }

  task.auditLog.push({
    action: "TASK_COMPLETED",
    performedBy: staffUserId,
    timestamp: new Date(),
    details: "Cleaning completed, room marked Clean and awaiting inspection"
  });

  await task.save();

  // Synchronize lost items to canonical LostItem collection (idempotent, backward-compatible)
  if (Array.isArray(lostItems) && lostItems.length > 0) {
    try {
      await syncFromHousekeepingTask(task, staffUserId);
    } catch (syncErr) {
      console.error("Error synchronizing lost items from housekeeping task:", syncErr);
    }
  }

  // Update room: cleaningStatus becomes Clean, but status stays Cleaning until inspected!
  await Room.findByIdAndUpdate(task.room, {
    cleaningStatus: "Clean",
    status: "Cleaning",
    lastCleanedAt: new Date()
  });

  return task.populate([
    { path: "room", select: "roomNumber roomType floor status cleaningStatus" },
    { path: "assignedTo", select: "name email role phone" }
  ]);
}

/**
 * Supervisor/Manager inspects completed task (Approve or Reject).
 */
async function inspectTask(taskId, supervisorUserId, { approved, notes = "" }) {
  const task = await HousekeepingTask.findById(taskId);
  if (!task) {
    const err = new Error("Housekeeping task not found");
    err.statusCode = 404;
    throw err;
  }

  const supervisor = await User.findById(supervisorUserId);
  if (!supervisor || !["admin", "manager"].includes(supervisor.role)) {
    const err = new Error("Only supervisors, managers, or admins can inspect housekeeping tasks");
    err.statusCode = 403;
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
      details: `Inspection approved by ${supervisor.name}: room is now Available`
    });

    await task.save();

    // Approved: room is now Available and Clean!
    await Room.findByIdAndUpdate(task.room, {
      status: "Available",
      cleaningStatus: "Clean"
    });
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

    await task.save();

    // Rejected: room returns to Cleaning / Dirty!
    await Room.findByIdAndUpdate(task.room, {
      status: "Cleaning",
      cleaningStatus: "Dirty"
    });
  }

  return task.populate([
    { path: "room", select: "roomNumber roomType floor status cleaningStatus" },
    { path: "assignedTo", select: "name email role phone" },
    { path: "inspectedBy", select: "name email role" }
  ]);
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
