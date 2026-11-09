// backend/controllers/housekeepingController.js
const HousekeepingTask = require("../models/HousekeepingTask");
const Room = require("../models/Room");
const User = require("../models/User");
const {
  assignTask,
  startTask,
  completeTask,
  inspectTask
} = require("../services/housekeepingService");
const { buildPropertyFilter, getActivePropertyId } = require("../middleware/propertyContext");
const notificationService = require("../services/notificationService");

// Get all housekeeping tasks (Admin / Manager / Staff view, or filtered for Housekeeper)
exports.getTasks = async (req, res) => {
  try {
    const { status, roomId, priority } = req.query;
    const query = {};

    // If housekeeping role, filter by assigned to current user unless manager/admin/staff
    if (req.user.role === "housekeeping") {
      query.$or = [
        { assignedTo: req.user.id },
        { assignedTo: null, status: "Pending" }
      ];
    }

    if (status) query.status = status;
    if (roomId) query.room = roomId;
    if (priority) query.priority = priority;

    const scopedQuery = buildPropertyFilter(req, query);
    const tasks = await HousekeepingTask.find(scopedQuery)
      .populate("room", "roomNumber roomType floor status cleaningStatus")
      .populate("assignedTo", "name email role phone")
      .populate("inspectedBy", "name email role")
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 });

    res.json(tasks);
  } catch (err) {
    console.error("Get housekeeping tasks error:", err);
    res.status(500).json({ error: "Failed to load housekeeping tasks" });
  }
};

// Get current housekeeper's assigned tasks
exports.getMyTasks = async (req, res) => {
  try {
    const scopedQuery = buildPropertyFilter(req, { assignedTo: req.user.id });
    const tasks = await HousekeepingTask.find(scopedQuery)
      .populate("room", "roomNumber roomType floor status cleaningStatus")
      .populate("assignedTo", "name email role phone")
      .populate("inspectedBy", "name email role")
      .sort({ priority: -1, createdAt: -1 });

    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: "Failed to load your assigned tasks" });
  }
};

// Manual task creation (Admin / Manager / Staff)
exports.createTask = async (req, res) => {
  const { roomId, taskType, priority, notes, assignedTo } = req.body;

  if (!roomId) {
    return res.status(400).json({ error: "Room ID is required" });
  }

  try {
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    const targetPropertyId = room.property || req.propertyId || (await getActivePropertyId());

    const task = new HousekeepingTask({
      property: targetPropertyId,
      room: roomId,
      taskType: taskType || "Daily Cleaning",
      priority: priority || "Medium",
      notes: notes || "",
      assignedTo: assignedTo || null,
      status: assignedTo ? "Assigned" : "Pending",
      createdBy: req.user.id,
      auditLog: [{
        action: "TASK_CREATED",
        performedBy: req.user.id,
        timestamp: new Date(),
        details: `Manual task created: ${taskType || "Daily Cleaning"}`
      }]
    });

    await task.save();

    // Set room cleaningStatus to Dirty and status to Cleaning if not Occupied
    if (room.status !== "Occupied" && room.status !== "Maintenance" && room.status !== "Out of Order") {
      room.status = "Cleaning";
    }
    room.cleaningStatus = "Dirty";
    await room.save();

    const populated = await HousekeepingTask.findById(task._id)
      .populate("room", "roomNumber roomType floor status cleaningStatus")
      .populate("assignedTo", "name email role phone")
      .populate("createdBy", "name email");

    // Notify assigned staff
    if (assignedTo) {
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

    res.status(201).json(populated);
  } catch (err) {
    console.error("Create task error:", err);
    res.status(500).json({ error: "Failed to create housekeeping task" });
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
    const updated = await assignTask(id, staffId, req.user.id);

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
    const updated = await startTask(id, req.user.id);
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
    const updated = await completeTask(id, req.user.id, { notes, lostItems });

    // Notify Front Desk / Supervisors
    try {
      notificationService.sendAudienceNotification({
        audience: "department",
        department: "Front Desk",
        title: "Room Cleaning Completed",
        message: `Housekeeping completed for Room ${updated.room?.roomNumber || ""}. Ready for inspection.`,
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

  if (approved === undefined) {
    return res.status(400).json({ error: "Approval decision ('approved': true/false) is required" });
  }

  try {
    const updated = await inspectTask(id, req.user.id, { approved: Boolean(approved), notes });
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
