// backend/services/maintenanceService.js
const MaintenanceTicket = require("../models/MaintenanceTicket");
const Room = require("../models/Room");
const User = require("../models/User");
const Reservation = require("../models/Reservation");
const HousekeepingTask = require("../models/HousekeepingTask");
const { withRoomLock } = require("../utils/transactionHelper");

const ALLOWED_TICKET_TRANSITIONS = {
  Reported: ["Assigned", "In Progress", "Closed"],
  Assigned: ["In Progress", "Reported", "Closed"],
  "In Progress": ["Resolved"],
  Resolved: ["Closed", "In Progress"],
  Closed: []
};

function assertTicketTransition(currentStatus, nextStatus) {
  const allowed = ALLOWED_TICKET_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(nextStatus)) {
    const error = new Error(`Invalid maintenance ticket transition from ${currentStatus} to ${nextStatus}`);
    error.statusCode = 409;
    throw error;
  }
}

/**
 * Generate a safe, collision-resistant ticket number (e.g. MNTYYMM00001)
 */
async function generateTicketNumber(session = null) {
  const now = new Date();
  const yearMonth = now.getFullYear().toString().slice(-2) + (now.getMonth() + 1).toString().padStart(2, "0");
  const prefix = `MNT${yearMonth}`;

  let latestQuery = MaintenanceTicket.findOne({ ticketNumber: new RegExp(`^${prefix}`) }, "ticketNumber")
    .sort({ ticketNumber: -1 });
  if (session) latestQuery = latestQuery.session(session);
  const latest = await latestQuery.lean();

  let seq = 1;
  if (latest && latest.ticketNumber) {
    const parsed = parseInt(latest.ticketNumber.replace(prefix, ""), 10);
    if (!Number.isNaN(parsed)) {
      seq = parsed + 1;
    }
  }

  let candidate = `${prefix}${seq.toString().padStart(5, "0")}`;
  let existsQuery = MaintenanceTicket.findOne({ ticketNumber: candidate }, "_id");
  if (session) existsQuery = existsQuery.session(session);
  while (await existsQuery.lean()) {
    seq++;
    candidate = `${prefix}${seq.toString().padStart(5, "0")}`;
    existsQuery = MaintenanceTicket.findOne({ ticketNumber: candidate }, "_id");
    if (session) existsQuery = existsQuery.session(session);
  }
  return candidate;
}

/**
 * Check if a room can be safely blocked for maintenance without corrupting an active or conflicting stay.
 */
async function assertRoomBlockable(roomId, session = null) {
  const targetRoomId = roomId._id || roomId;
  let roomQuery = Room.findById(targetRoomId);
  if (session) roomQuery = roomQuery.session(session);
  const room = await roomQuery;

  if (!room) {
    const err = new Error("Room not found");
    err.statusCode = 404;
    throw err;
  }

  // 1. Is the room currently Occupied?
  if (room.status === "Occupied" || room.currentReservation) {
    const err = new Error("Cannot block room for maintenance: Room is currently Occupied by an in-house guest");
    err.statusCode = 409;
    err.conflictType = "ROOM_OCCUPIED";
    throw err;
  }

  // 2. Does it have an active Checked-In reservation?
  let checkedInQuery = Reservation.findOne({
    room: targetRoomId,
    status: "Checked-In"
  });
  if (session) checkedInQuery = checkedInQuery.session(session);
  const checkedInStay = await checkedInQuery.lean();
  if (checkedInStay) {
    const err = new Error("Cannot block room for maintenance: An active Checked-In reservation exists for this room");
    err.statusCode = 409;
    err.conflictType = "ACTIVE_RESERVATION";
    err.reservation = checkedInStay;
    throw err;
  }

  // 3. Does it have a Confirmed reservation overlapping today / active stay window?
  const now = new Date();
  let conflictingQuery = Reservation.find({
    room: targetRoomId,
    status: "Confirmed",
    checkOutDate: { $gt: now }
  });
  if (session) conflictingQuery = conflictingQuery.session(session);
  const conflicting = await conflictingQuery.lean();

  if (conflicting.length > 0) {
    const err = new Error("Cannot block room for maintenance: Conflicting confirmed reservations exist for this room");
    err.statusCode = 409;
    err.conflictType = "CONFLICTING_RESERVATIONS";
    err.conflicts = conflicting.map(c => ({
      reservationNumber: c.reservationNumber,
      checkInDate: c.checkInDate,
      checkOutDate: c.checkOutDate,
      guest: c.guest
    }));
    throw err;
  }

  return room;
}

/**
 * Place a room into Maintenance or Out of Order with full safety checks and locking.
 */
async function blockRoomForMaintenance(roomId, reason, userId = null, ticketId = null, session = null) {
  const targetRoomId = roomId._id || roomId;

  return withRoomLock(targetRoomId, async () => {
    const room = await assertRoomBlockable(targetRoomId, session);

    room.status = "Maintenance";
    room.maintenanceNotes = reason || "Under maintenance";
    room.lastMaintenanceAt = new Date();
    await room.save({ session });

    if (ticketId) {
      await MaintenanceTicket.findByIdAndUpdate(ticketId, {
        $push: {
          auditLog: {
            action: "ROOM_BLOCKED",
            performedBy: userId || null,
            timestamp: new Date(),
            details: `Room ${room.roomNumber} blocked for maintenance: ${reason || "No notes"}`
          }
        }
      }, { session });
    }

    return room;
  });
}

/**
 * Release room from maintenance.
 * CRITICAL HANDOFF: Maintenance -> Cleaning (Dirty) -> Housekeeping Cleaning Task -> Inspection -> Available.
 */
async function releaseMaintenanceRoom(roomId, userId = null, ticketId = null, session = null) {
  const targetRoomId = roomId._id || roomId;

  return withRoomLock(targetRoomId, async () => {
    let roomQuery = Room.findById(targetRoomId);
    if (session) roomQuery = roomQuery.session(session);
    const room = await roomQuery;

    if (!room) {
      const err = new Error("Room not found");
      err.statusCode = 404;
      throw err;
    }

    // 1. Transition room to Cleaning / Dirty (NEVER directly to Available!)
    room.status = "Cleaning";
    room.cleaningStatus = "Dirty";
    room.maintenanceNotes = "";
    await room.save({ session });

    // 2. Create or reuse Maintenance Cleaning HousekeepingTask
    let existingTaskQuery = HousekeepingTask.findOne({
      room: targetRoomId,
      taskType: "Maintenance Cleaning",
      status: { $ne: "Inspected" }
    });
    if (session) existingTaskQuery = existingTaskQuery.session(session);
    let housekeepingTask = await existingTaskQuery;

    if (!housekeepingTask) {
      let propId = room.property;
      if (!propId) {
        const { getActivePropertyId } = require("../middleware/propertyContext");
        propId = await getActivePropertyId();
      }

      housekeepingTask = new HousekeepingTask({
        property: propId,
        room: targetRoomId,
        taskType: "Maintenance Cleaning",
        status: "Pending",
        priority: "High",
        notes: `Post-maintenance sanitization & cleaning${ticketId ? ` for ticket ${ticketId}` : ""}`,
        createdBy: userId || null,
        auditLog: [{
          action: "TASK_CREATED",
          performedBy: userId || null,
          timestamp: new Date(),
          details: "Automated maintenance cleaning task created on room release from maintenance"
        }]
      });
      await housekeepingTask.save({ session });
    }

    // 3. Log ROOM_RELEASED on ticket
    if (ticketId) {
      await MaintenanceTicket.findByIdAndUpdate(ticketId, {
        $push: {
          auditLog: {
            action: "ROOM_RELEASED",
            performedBy: userId || null,
            timestamp: new Date(),
            details: `Room ${room.roomNumber} released from maintenance; transitioned to Cleaning (Dirty) awaiting housekeeping inspection`
          }
        }
      }, { session });
    }

    return { room, housekeepingTask };
  });
}

/**
 * Create a new maintenance ticket.
 */
async function createTicket({
  roomId,
  reportedBy,
  issueCategory,
  description,
  priority,
  isBlocking = false,
  scheduledDate,
  estimatedCost = 0,
  assignedTechnician,
  propertyId = null
}, session = null) {
  if (!roomId || !description) {
    const err = new Error("Room ID and issue description are required");
    err.statusCode = 400;
    throw err;
  }

  const room = await Room.findById(roomId);
  if (!room) {
    const err = new Error("Room not found");
    err.statusCode = 404;
    throw err;
  }

  // If technician is provided, validate role
  if (assignedTechnician) {
    const tech = await User.findById(assignedTechnician);
    if (!tech || !["maintenance", "staff", "manager", "admin"].includes(tech.role)) {
      const err = new Error("Assigned user must have maintenance or staff role");
      err.statusCode = 400;
      throw err;
    }
  }

  // If this ticket is marked to block the room, verify safety and block immediately
  if (isBlocking) {
    await assertRoomBlockable(roomId, session);
  }

  const ticketNumber = await generateTicketNumber(session);
  const initialStatus = assignedTechnician ? "Assigned" : "Reported";

  let targetPropertyId = propertyId || room.property;
  if (!targetPropertyId) {
    const { getActivePropertyId } = require("../middleware/propertyContext");
    targetPropertyId = await getActivePropertyId();
  }

  const ticket = new MaintenanceTicket({
    property: targetPropertyId,
    ticketNumber,
    room: roomId,
    reportedBy,
    issueCategory: issueCategory || "Other",
    description,
    priority: priority || "Medium",
    status: initialStatus,
    assignedTechnician: assignedTechnician || null,
    estimatedCost: Number(estimatedCost) || 0,
    isBlocking: Boolean(isBlocking),
    scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
    auditLog: [{
      action: "TICKET_CREATED",
      performedBy: reportedBy,
      timestamp: new Date(),
      details: `Ticket created with priority ${priority || "Medium"}${assignedTechnician ? "; assigned on creation" : ""}`
    }]
  });

  await ticket.save({ session });

  if (isBlocking) {
    await blockRoomForMaintenance(roomId, `Maintenance Ticket ${ticketNumber}: ${description}`, reportedBy, ticket._id, session);
  }

  return ticket.populate([
    { path: "room", select: "roomNumber roomType floor status cleaningStatus" },
    { path: "reportedBy", select: "name email role" },
    { path: "assignedTechnician", select: "name email role phone" }
  ]);
}

/**
 * Assign/reassign technician to a maintenance ticket.
 */
async function assignTechnician(ticketId, technicianId, assignedByUserId) {
  const ticket = await MaintenanceTicket.findById(ticketId);
  if (!ticket) {
    const err = new Error("Maintenance ticket not found");
    err.statusCode = 404;
    throw err;
  }

  const technician = await User.findById(technicianId);
  if (!technician || !["maintenance", "staff", "manager", "admin"].includes(technician.role)) {
    const err = new Error("Assigned user must have a valid maintenance or staff role");
    err.statusCode = 400;
    throw err;
  }

  // Transition validation
  if (ticket.status === "Reported") {
    assertTicketTransition("Reported", "Assigned");
    ticket.status = "Assigned";
  }

  ticket.assignedTechnician = technicianId;
  ticket.auditLog.push({
    action: "TICKET_ASSIGNED",
    performedBy: assignedByUserId,
    timestamp: new Date(),
    details: `Assigned to ${technician.name} (${technician.email})`
  });

  await ticket.save();

  return ticket.populate([
    { path: "room", select: "roomNumber roomType floor status cleaningStatus" },
    { path: "reportedBy", select: "name email role" },
    { path: "assignedTechnician", select: "name email role phone" }
  ]);
}

/**
 * Technician starts work on an assigned ticket.
 */
async function startTicket(ticketId, technicianUserId) {
  const ticket = await MaintenanceTicket.findById(ticketId);
  if (!ticket) {
    const err = new Error("Maintenance ticket not found");
    err.statusCode = 404;
    throw err;
  }

  const currentUser = await User.findById(technicianUserId);
  const isManagerOrAdmin = ["admin", "manager"].includes(currentUser?.role);

  // If user is technician, verify assignment
  if (!isManagerOrAdmin && ticket.assignedTechnician && ticket.assignedTechnician.toString() !== technicianUserId.toString()) {
    const err = new Error("Not authorized to start a ticket assigned to another technician");
    err.statusCode = 403;
    throw err;
  }

  assertTicketTransition(ticket.status, "In Progress");

  ticket.status = "In Progress";
  ticket.startedAt = new Date();
  if (!ticket.assignedTechnician) {
    ticket.assignedTechnician = technicianUserId;
  }

  ticket.auditLog.push({
    action: "TICKET_STARTED",
    performedBy: technicianUserId,
    timestamp: new Date(),
    details: `Work started by ${currentUser?.name || "technician"}`
  });

  await ticket.save();

  return ticket.populate([
    { path: "room", select: "roomNumber roomType floor status cleaningStatus" },
    { path: "reportedBy", select: "name email role" },
    { path: "assignedTechnician", select: "name email role phone" }
  ]);
}

/**
 * Technician resolves a maintenance ticket.
 */
async function resolveTicket(ticketId, technicianUserId, { resolutionNotes, actualCost } = {}) {
  const ticket = await MaintenanceTicket.findById(ticketId);
  if (!ticket) {
    const err = new Error("Maintenance ticket not found");
    err.statusCode = 404;
    throw err;
  }

  const currentUser = await User.findById(technicianUserId);
  const isManagerOrAdmin = ["admin", "manager"].includes(currentUser?.role);

  if (!isManagerOrAdmin && ticket.assignedTechnician && ticket.assignedTechnician.toString() !== technicianUserId.toString()) {
    const err = new Error("Not authorized to resolve a ticket assigned to another technician");
    err.statusCode = 403;
    throw err;
  }

  assertTicketTransition(ticket.status, "Resolved");

  ticket.status = "Resolved";
  ticket.resolvedAt = new Date();
  if (resolutionNotes) ticket.resolutionNotes = resolutionNotes;
  if (actualCost !== undefined) ticket.actualCost = Number(actualCost) || 0;

  ticket.auditLog.push({
    action: "TICKET_RESOLVED",
    performedBy: technicianUserId,
    timestamp: new Date(),
    details: `Ticket resolved: ${resolutionNotes || "Work completed"}${actualCost ? ` (Cost: ₹${actualCost})` : ""}`
  });

  await ticket.save();

  return ticket.populate([
    { path: "room", select: "roomNumber roomType floor status cleaningStatus" },
    { path: "reportedBy", select: "name email role" },
    { path: "assignedTechnician", select: "name email role phone" }
  ]);
}

/**
 * Manager/Admin closes a resolved or reported ticket.
 * Triggers release of room to Cleaning (Dirty) so inspection workflow happens before Available.
 */
async function closeTicket(ticketId, supervisorUserId, { notes = "" } = {}) {
  const ticket = await MaintenanceTicket.findById(ticketId);
  if (!ticket) {
    const err = new Error("Maintenance ticket not found");
    err.statusCode = 404;
    throw err;
  }

  const supervisor = await User.findById(supervisorUserId);
  if (!supervisor || !["admin", "manager"].includes(supervisor.role)) {
    const err = new Error("Only managers or admins can close maintenance tickets");
    err.statusCode = 403;
    throw err;
  }

  assertTicketTransition(ticket.status, "Closed");

  ticket.status = "Closed";
  ticket.closedAt = new Date();

  ticket.auditLog.push({
    action: "TICKET_CLOSED",
    performedBy: supervisorUserId,
    timestamp: new Date(),
    details: `Ticket closed by ${supervisor.name}${notes ? `: ${notes}` : ""}`
  });

  await ticket.save();

  // If the room was blocked or is in Maintenance status, release it to Cleaning
  const room = await Room.findById(ticket.room);
  if (room && (room.status === "Maintenance" || room.status === "Out of Order" || ticket.isBlocking)) {
    await releaseMaintenanceRoom(ticket.room, supervisorUserId, ticket._id);
  }

  return ticket.populate([
    { path: "room", select: "roomNumber roomType floor status cleaningStatus" },
    { path: "reportedBy", select: "name email role" },
    { path: "assignedTechnician", select: "name email role phone" }
  ]);
}

/**
 * Query maintenance tickets with filters.
 */
async function getTickets(filter = {}) {
  const query = {};

  if (filter.property) query.property = filter.property;
  if (filter.status) query.status = filter.status;
  if (filter.roomId) query.room = filter.roomId;
  if (filter.priority) query.priority = filter.priority;
  if (filter.issueCategory) query.issueCategory = filter.issueCategory;
  if (filter.assignedTechnician) query.assignedTechnician = filter.assignedTechnician;

  return MaintenanceTicket.find(query)
    .populate("room", "roomNumber roomType floor status cleaningStatus")
    .populate("reportedBy", "name email role")
    .populate("assignedTechnician", "name email role phone")
    .sort({ createdAt: -1 });
}

/**
 * Get tickets assigned to a specific technician.
 */
async function getMyTickets(technicianUserId, propertyId = null) {
  const query = { assignedTechnician: technicianUserId };
  if (propertyId) query.property = propertyId;

  return MaintenanceTicket.find(query)
    .populate("room", "roomNumber roomType floor status cleaningStatus")
    .populate("reportedBy", "name email role")
    .populate("assignedTechnician", "name email role phone")
    .sort({ priority: -1, createdAt: -1 });
}

module.exports = {
  ALLOWED_TICKET_TRANSITIONS,
  assertTicketTransition,
  generateTicketNumber,
  assertRoomBlockable,
  blockRoomForMaintenance,
  releaseMaintenanceRoom,
  createTicket,
  assignTechnician,
  startTicket,
  resolveTicket,
  closeTicket,
  getTickets,
  getMyTickets
};
