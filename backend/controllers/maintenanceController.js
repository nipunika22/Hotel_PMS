// backend/controllers/maintenanceController.js
const MaintenanceTicket = require("../models/MaintenanceTicket");
const User = require("../models/User");
const {
  createTicket,
  assignTechnician,
  startTicket,
  resolveTicket,
  closeTicket,
  getTickets,
  getMyTickets,
  blockRoomForMaintenance,
  releaseMaintenanceRoom
} = require("../services/maintenanceService");
const notificationService = require("../services/notificationService");

// Get all maintenance tickets (Admin, Manager, Staff, Housekeeping, Maintenance)
exports.getTickets = async (req, res) => {
  try {
    const filter = { ...req.query };
    if (req.propertyId) filter.property = req.propertyId;
    const tickets = await getTickets(filter);
    res.json(tickets);
  } catch (err) {
    console.error("Get tickets error:", err);
    res.status(500).json({ error: "Failed to load maintenance tickets" });
  }
};

// Get technician's assigned tickets
exports.getMyTickets = async (req, res) => {
  try {
    const tickets = await getMyTickets(req.user.id, req.propertyId);
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: "Failed to load your assigned tickets" });
  }
};

// Get single ticket by ID
exports.getTicket = async (req, res) => {
  try {
    const ticket = await MaintenanceTicket.findById(req.params.id)
      .populate("room", "roomNumber roomType floor status cleaningStatus")
      .populate("reportedBy", "name email role phone")
      .populate("assignedTechnician", "name email role phone")
      .populate("auditLog.performedBy", "name email role");

    if (!ticket) {
      return res.status(404).json({ error: "Maintenance ticket not found" });
    }

    if (
      req.propertyId &&
      ticket.property &&
      ticket.property.toString() !== req.propertyId.toString() &&
      req.user &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ error: "Access denied to maintenance ticket in another property" });
    }

    res.json(ticket);
  } catch (err) {
    res.status(500).json({ error: "Failed to load maintenance ticket" });
  }
};

// Create maintenance ticket (Admin, Manager, Staff, Housekeeping)
exports.createTicket = async (req, res) => {
  try {
    const ticket = await createTicket({
      ...req.body,
      reportedBy: req.user.id,
      propertyId: req.propertyId
    });

    // Notify maintenance department
    try {
      notificationService.sendAudienceNotification({
        audience: "department",
        department: "Maintenance",
        title: "New Maintenance Ticket Created",
        message: `Maintenance Ticket: ${ticket.title} (Priority: ${ticket.priority || "Medium"}).`,
        category: "maintenance",
        priority: (ticket.priority || "normal").toLowerCase(),
        actionUrl: "/maintenance",
        relatedEntity: { entityType: "MaintenanceTicket", entityId: ticket._id }
      }).catch(() => {});
    } catch (e) {}

    res.status(201).json(ticket);
  } catch (err) {
    console.error("Create ticket error:", err);
    res.status(err.statusCode || 500).json({
      error: err.statusCode ? err.message : "Failed to create maintenance ticket",
      conflictType: err.conflictType,
      conflicts: err.conflicts
    });
  }
};

// Assign technician to ticket (Manager, Admin)
exports.assignTechnician = async (req, res) => {
  const { id } = req.params;
  const { technicianId } = req.body;

  if (!technicianId) {
    return res.status(400).json({ error: "Technician ID is required" });
  }

  try {
    const updated = await assignTechnician(id, technicianId, req.user.id);

    // Notify technician
    try {
      notificationService.createNotification({
        recipient: technicianId,
        title: "Maintenance Ticket Assigned",
        message: `You were assigned to ticket: ${updated.title || "Maintenance task"}.`,
        category: "maintenance",
        priority: (updated.priority || "normal").toLowerCase(),
        actionUrl: "/maintenance",
        relatedEntity: { entityType: "MaintenanceTicket", entityId: updated._id }
      }).catch(() => {});
    } catch (e) {}

    res.json(updated);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : "Failed to assign technician" });
  }
};

// Start work on ticket (Technician, Manager, Admin)
exports.startTicket = async (req, res) => {
  const { id } = req.params;

  try {
    const updated = await startTicket(id, req.user.id);
    res.json(updated);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : "Failed to start ticket" });
  }
};

// Resolve ticket (Technician, Manager, Admin)
exports.resolveTicket = async (req, res) => {
  const { id } = req.params;
  const { resolutionNotes, actualCost } = req.body;

  try {
    const updated = await resolveTicket(id, req.user.id, { resolutionNotes, actualCost });
    res.json(updated);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : "Failed to resolve ticket" });
  }
};

// Close ticket (Manager, Admin)
exports.closeTicket = async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;

  try {
    const updated = await closeTicket(id, req.user.id, { notes });
    res.json(updated);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : "Failed to close ticket" });
  }
};

// Manually block room for maintenance with safeguards (Manager, Admin)
exports.blockRoom = async (req, res) => {
  const { roomId, reason, ticketId } = req.body;

  if (!roomId) {
    return res.status(400).json({ error: "Room ID is required" });
  }

  try {
    const room = await blockRoomForMaintenance(roomId, reason, req.user.id, ticketId);
    res.json({ message: "Room blocked for maintenance successfully", room });
  } catch (err) {
    res.status(err.statusCode || 500).json({
      error: err.statusCode ? err.message : "Failed to block room for maintenance",
      conflictType: err.conflictType,
      conflicts: err.conflicts
    });
  }
};

// Manually release room from maintenance (Manager, Admin)
// CRITICAL: Room transitions to Cleaning / Dirty -> Maintenance Cleaning Task
exports.releaseRoom = async (req, res) => {
  const { roomId, ticketId } = req.body;

  if (!roomId) {
    return res.status(400).json({ error: "Room ID is required" });
  }

  try {
    const result = await releaseMaintenanceRoom(roomId, req.user.id, ticketId);
    res.json({
      message: "Room released from maintenance; transitioned to Cleaning (Dirty) awaiting housekeeping inspection",
      room: result.room,
      housekeepingTask: result.housekeepingTask
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : "Failed to release room from maintenance" });
  }
};

// Get available technicians for assignment dropdown
exports.getTechnicians = async (req, res) => {
  try {
    const technicians = await User.find({
      role: { $in: ["maintenance", "staff", "manager", "admin"] }
    }).select("name email role phone");

    res.json(technicians);
  } catch (err) {
    res.status(500).json({ error: "Failed to load technician list" });
  }
};
