// backend/controllers/housekeepingController.js
const HousekeepingTask = require("../models/HousekeepingTask");
const User = require("../models/User");
const Room = require("../models/Room");
const { isValidObjectId } = require("mongoose");
const {
  ACTIVE_CLEANING_STATUSES,
  createManualTask,
  loadCurrentCleaningTasks,
  syncCleaningTasks,
  assignTask,
  startTask,
  completeTask,
  inspectTask
} = require("../services/housekeepingService");
const { buildPropertyFilter } = require("../middleware/propertyContext");
const notificationService = require("../services/notificationService");

async function listTasks(req, res, assignedOnly = false) {
  try {
    const { status, roomId, priority } = req.query;
    if (roomId && (typeof roomId !== "string" || !isValidObjectId(roomId))) {
      return res.status(400).json({ error: "Invalid room ID" });
    }
    const statuses = HousekeepingTask.schema.path("status").enumValues;
    const pendingInspection = status === "Pending Inspection";
    if (status && !pendingInspection && !statuses.includes(status)) {
      return res.status(400).json({ error: "Invalid task status" });
    }
    if (priority && !HousekeepingTask.schema.path("priority").enumValues.includes(priority)) {
      return res.status(400).json({ error: "Invalid task priority" });
    }

    // The room is authoritative for tenancy, including legacy tasks with no task property.
    const rooms = await Room.find(buildPropertyFilter(req, roomId ? { _id: roomId } : {}))
      .select("roomNumber roomType floor status cleaningStatus isActive").lean();
    const roomsById = new Map(rooms.map(room => [String(room._id), room]));
    const query = { room: { $in: rooms.map(room => room._id) } };
    const restrictUnassigned = !assignedOnly && req.user.role === "housekeeping";
    if (assignedOnly) query.assignedTo = req.user.id;
    else if (restrictUnassigned) {
      query.$or = [
        { assignedTo: req.user.id },
        { assignedTo: null, status: { $in: ACTIVE_CLEANING_STATUSES } }
      ];
    }
    if (status) query.status = pendingInspection ? "Completed" : status;
    if (priority) query.priority = priority;

    const [tasks, current] = await Promise.all([
      HousekeepingTask.find(query)
        .populate("assignedTo", "name email role phone")
        .populate("inspectedBy", "name email role")
        .populate("createdBy", "name email")
        .populate({
          path: "reservation",
          match: buildPropertyFilter(req, {}),
          select: "reservationNumber checkInDate checkOutDate actualCheckOutDate guest",
          populate: { path: "guest", select: "firstName lastName name phone" }
        })
        .sort({ createdAt: -1, _id: -1 })
        .lean(),
      loadCurrentCleaningTasks(rooms)
    ]);

    const result = tasks.filter(task => !restrictUnassigned || task.assignedTo ||
      task.status !== "Completed" || String(current.get(String(task.room))?._id) === String(task._id)
    ).map(task => {
      const room = roomsById.get(String(task.room));
      const isCurrent = String(current.get(String(task.room))?._id) === String(task._id);
      const displayStatus = isCurrent && task.status === "Completed" ? "Pending Inspection" : task.status;
      return { ...task, room, isCurrent, displayStatus };
    });
    res.json(pendingInspection ? result.filter(task => task.displayStatus === status) : result);
  } catch (err) {
    console.error("Get housekeeping tasks error:", err);
    res.status(500).json({ error: "Failed to load housekeeping tasks" });
  }
}

exports.getTasks = (req, res) => listTasks(req, res);
exports.getMyTasks = (req, res) => listTasks(req, res, true);

exports.syncTasks = async (req, res) => {
  if (!req.propertyId) return res.status(400).json({ error: "Select a property before synchronizing housekeeping tasks" });
  try {
    res.json(await syncCleaningTasks(req.propertyId, req.user.id));
  } catch (err) {
    console.error("Sync housekeeping tasks error:", err);
    res.status(500).json({ error: "Failed to synchronize housekeeping tasks" });
  }
};

// Manual task creation (Admin / Manager / Staff)
exports.createTask = async (req, res) => {
  const { roomId, taskType, priority, notes, assignedTo } = req.body;

  if (!roomId) {
    return res.status(400).json({ error: "Room ID is required" });
  }

  try {
    const { task, room, created } = await createManualTask(buildPropertyFilter(req, { _id: roomId }), {
      taskType: taskType || "Daily Cleaning",
      priority: priority || "Medium",
      notes: notes || "",
      assignedTo: assignedTo || null,
      userId: req.user.id
    });

    const populated = await HousekeepingTask.findById(task._id)
      .populate("room", "roomNumber roomType floor status cleaningStatus")
      .populate("assignedTo", "name email role phone")
      .populate("createdBy", "name email")
      .populate({
        path: "reservation",
        select: "reservationNumber checkInDate checkOutDate actualCheckOutDate guest",
        populate: { path: "guest", select: "firstName lastName name phone" }
      });

    // Notify assigned staff
    if (created && assignedTo) {
      notificationService.createNotification({
        recipient: assignedTo,
        title: "New Housekeeping Task Assigned",
        message: `You have been assigned to ${taskType || "Daily Cleaning"} for Room ${room.roomNumber}. Priority: ${priority || "Medium"}.`,
        category: "housekeeping",
        priority: (priority || "normal").toLowerCase(),
        actionUrl: "/housekeeping",
        relatedEntity: { entityType: "HousekeepingTask", entityId: task._id }
      }).catch(() => {});
    }

    res.status(created ? 201 : 200).json(populated);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : "Failed to create housekeeping task" });
  }
};

// Assign staff to a task
exports.assignTask = async (req, res) => {
  const { id } = req.params;
  const { staffId } = req.body;

  if (!staffId) {
    return res.status(400).json({ error: "Staff ID is required" });
  }

  try {
    const updated = await assignTask(id, staffId, req.user.id, req.propertyId);

    // Notify newly assigned staff
    try {
      notificationService.createNotification({
        recipient: staffId,
        title: "Housekeeping Task Assigned",
        message: `You were assigned a housekeeping task for Room ${updated.room?.roomNumber || ""}.`,
        category: "housekeeping",
        priority: (updated.priority || "normal").toLowerCase(),
        actionUrl: "/housekeeping",
        relatedEntity: { entityType: "HousekeepingTask", entityId: updated._id }
      }).catch(() => {});
    } catch (e) {}

    res.json(updated);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : "Failed to assign task" });
  }
};

// Start task (Housekeeping staff)
exports.startTask = async (req, res) => {
  const { id } = req.params;

  try {
    const updated = await startTask(id, req.user.id, req.propertyId);
    res.json(updated);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : "Failed to start task" });
  }
};

// Complete task (Housekeeping staff)
exports.completeTask = async (req, res) => {
  const { id } = req.params;
  const { notes, lostItems } = req.body;

  try {
    const updated = await completeTask(id, req.user.id, { notes, lostItems, propertyId: req.propertyId });

    // Notify Front Desk / Supervisors
    try {
      notificationService.sendAudienceNotification({
        audience: "department",
        department: "Front Desk",
        title: "Room Cleaning Completed",
        message: `Housekeeping completed for Room ${updated.room?.roomNumber || ""}. Room is awaiting supervisor inspection.`,
        category: "housekeeping",
        priority: "normal",
        actionUrl: "/housekeeping",
        relatedEntity: { entityType: "HousekeepingTask", entityId: updated._id }
      }).catch(() => {});
    } catch (e) {}

    res.json(updated);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : "Failed to complete task" });
  }
};

// Supervisor inspect task (Approve or Reject)
exports.inspectTask = async (req, res) => {
  const { id } = req.params;
  const { approved, notes } = req.body;

  if (typeof approved !== "boolean") {
    return res.status(400).json({ error: "Approval decision ('approved': true/false) is required" });
  }

  try {
    const updated = await inspectTask(id, req.user.id, { approved, notes, propertyId: req.propertyId });
    res.json(updated);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : "Failed to inspect task" });
  }
};

// Get housekeeping staff list for assignment dropdown
exports.getStaff = async (req, res) => {
  try {
    const staff = await User.find({
      role: { $in: ["housekeeping", "staff", "manager", "admin"] }
    }).select("name email role phone");

    res.json(staff);
  } catch (err) {
    res.status(500).json({ error: "Failed to load staff list" });
  }
};
