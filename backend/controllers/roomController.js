// backend/controllers/roomController.js
const mongoose = require("mongoose");
const Room = require("../models/Room");
const Reservation = require("../models/Reservation");
const Booking = require("../models/Booking");
const HousekeepingTask = require("../models/HousekeepingTask");
const { CLEANING_QUEUE_STATUSES, assertVacant, queueCleaningTask, loadCurrentCleaningTasks } = require("../services/housekeepingService");
const { withRoomLock, runWithOptionalTransaction } = require("../utils/transactionHelper");
const { getUnavailableRoomIds, parseStayDates } = require("../services/availabilityService");
const { getActivePropertyId, buildPropertyFilter } = require("../middleware/propertyContext");

// Get all rooms
exports.getRooms = async (req, res) => {
  try {
    const filter = buildPropertyFilter(req, { isActive: true });
    const rooms = await Room.find(filter)
      .populate("currentReservation", "reservationNumber guest")
      .sort({ roomNumber: 1 })
      .lean();

    const current = await loadCurrentCleaningTasks(rooms, null, true);
    const enrichedRooms = rooms.map(room => ({
      ...room,
      activeCleaningTask: current.get(String(room._id)) || null
    }));

    res.json(enrichedRooms);
  } catch (err) {
    res.status(500).json({ error: "Failed to load rooms" });
  }
};

// Get rooms by status
exports.getRoomsByStatus = async (req, res) => {
  const { status } = req.query;

  if (!status) {
    return res.status(400).json({ error: "Status is required" });
  }

  try {
    const filter = buildPropertyFilter(req, { status, isActive: true });
    const rooms = await Room.find(filter)
      .populate("currentReservation")
      .sort({ roomNumber: 1 });
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ error: "Failed to load rooms" });
  }
};

// Get available rooms for date range (or browse all active available rooms)
exports.getAvailableRooms = async (req, res) => {
  const { checkInDate, checkOutDate, roomType } = req.query;

  try {
    const dates = checkInDate && checkOutDate ? parseStayDates(checkInDate, checkOutDate) : null;
    const unavailableRoomIds = await getUnavailableRoomIds(dates?.checkIn, dates?.checkOut, req.propertyId);

    // If no dates provided, return all active rooms currently available for guests.
    if (!dates) {
      const query = buildPropertyFilter(req, {
        _id: { $nin: unavailableRoomIds },
        status: "Available",
        cleaningStatus: { $nin: ["Dirty", "Pickup"] },
        isActive: true
      });
      if (roomType) {
        query.roomType = roomType;
      }

      const availableRooms = await Room.find(query)
        .select("-currentReservation -maintenanceNotes")
        .sort({ roomNumber: 1 });

      return res.json(availableRooms);
    }

    const query = buildPropertyFilter(req, {
      _id: { $nin: unavailableRoomIds },
      status: { $nin: ["Maintenance", "Out of Order", "Occupied", "Cleaning"] },
      cleaningStatus: { $nin: ["Dirty", "Pickup"] },
      isActive: true
    });

    if (roomType) {
      query.roomType = roomType;
    }

    const availableRooms = await Room.find(query)
      .select("-currentReservation -maintenanceNotes")
      .sort({ roomNumber: 1 });

    res.json(availableRooms);
  } catch (err) {
    console.error('Error in getAvailableRooms:', err);
    res.status(500).json({ error: "Failed to load available rooms" });
  }
};

// Get single room
exports.getRoom = async (req, res) => {
  const { id } = req.params;

  try {
    const isCustomer = req.user && (req.user.role || '').toLowerCase().trim() === 'customer';

    let roomQuery = Room.findOne(buildPropertyFilter(req, { _id: id }));
    if (!isCustomer) {
      roomQuery = roomQuery.populate("currentReservation");
    } else {
      roomQuery = roomQuery.select("-currentReservation -maintenanceNotes");
    }

    const room = await roomQuery.exec();

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    res.json(room);
  } catch (err) {
    res.status(500).json({ error: "Failed to load room" });
  }
};

// Add new room
exports.addRoom = async (req, res) => {
  const {
    roomNumber,
    roomType,
    floor,
    building,
    basePrice,
    weekendPrice,
    capacity,
    bedConfiguration,
    roomSize,
    view,
    amenities,
    features,
    description,
    images
  } = req.body;

  if (!roomNumber || !roomType || !floor || !basePrice || !capacity || !bedConfiguration) {
    return res.status(400).json({ error: "Required fields are missing" });
  }

  try {
    const targetPropertyId = req.propertyId || req.body.property || (await getActivePropertyId());

    const existingRoom = await Room.findOne({
      property: targetPropertyId,
      roomNumber
    });

    if (existingRoom) {
      return res.status(400).json({ error: "Room number already exists" });
    }

    const newRoom = new Room({
      property: targetPropertyId,
      roomNumber,
      roomType,
      floor,
      building: building || "Main",
      basePrice,
      weekendPrice: weekendPrice || basePrice,
      capacity,
      bedConfiguration,
      roomSize,
      view,
      amenities: amenities || [],
      features: features || {},
      description,
      images: images || []
    });

    await newRoom.save();
    res.status(201).json(newRoom);
  } catch (err) {
    res.status(500).json({ error: "Failed to add room" });
  }
};

// Update room
exports.updateRoom = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  try {
    const allowedFields = [
      "roomNumber", "roomType", "floor", "building", "basePrice", "weekendPrice",
      "capacity", "bedConfiguration", "roomSize", "view", "amenities", "features",
      "description", "images"
    ];
    const safeUpdates = Object.fromEntries(Object.entries(updates).filter(([key]) => allowedFields.includes(key)));
    const room = await Room.findOneAndUpdate(buildPropertyFilter(req, { _id: id }), safeUpdates, {
      new: true,
      runValidators: true
    });

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    res.json(room);
  } catch (err) {
    console.error("Update failed:", err.message);
    res.status(500).json({ error: "Failed to update room" });
  }
};

// Update room status
exports.updateRoomStatus = async (req, res) => {
  const { id } = req.params;
  const { status, cleaningStatus, maintenanceNotes } = req.body;

  if (!status && !cleaningStatus) {
    return res.status(400).json({ error: "Status or cleaning status is required" });
  }

  try {
    const room = await withRoomLock(id, () => runWithOptionalTransaction(async (session) => {
      const currentRoom = await Room.findOne(buildPropertyFilter(req, { _id: id })).session(session);
      if (!currentRoom) throw Object.assign(new Error("Room not found"), { statusCode: 404 });

      if (["Maintenance", "Out of Order"].includes(status)) {
        const { assertRoomBlockable } = require("../services/maintenanceService");
        await assertRoomBlockable(id);
      }

      const nextStatus = status || currentRoom.status;
      const mayRelease = ["Available", "Reserved"].includes(nextStatus);
      if (mayRelease && (status || ["Clean", "Inspected"].includes(cleaningStatus))) {
        await assertVacant(currentRoom, session);
        const task = await HousekeepingTask.exists({
          room: id, status: { $in: CLEANING_QUEUE_STATUSES }
        }).session(session);
        if (task || ["Cleaning", "Maintenance", "Out of Order"].includes(currentRoom.status) ||
            ["Dirty", "Pickup"].includes(currentRoom.cleaningStatus)) {
          throw Object.assign(new Error("Use Housekeeping to complete cleaning and approve the room."), { statusCode: 409 });
        }
      }

      const changesHygiene = cleaningStatus && cleaningStatus !== currentRoom.cleaningStatus;
      if (changesHygiene && (currentRoom.status === "Cleaning" ||
          (["Dirty", "Pickup"].includes(currentRoom.cleaningStatus) && ["Clean", "Inspected"].includes(cleaningStatus)))) {
        throw Object.assign(new Error("Update room hygiene through its housekeeping task."), { statusCode: 409 });
      }
      if (currentRoom.status === "Occupied" && status && status !== "Occupied") {
        await assertVacant(currentRoom, session);
      }
      if (status === "Cleaning" && ["Maintenance", "Out of Order"].includes(currentRoom.status)) {
        throw Object.assign(new Error("Release the room through Maintenance first."), { statusCode: 409 });
      }

      const needsCleaning = (status === "Cleaning" && currentRoom.status !== "Cleaning") ||
        (["Dirty", "Pickup"].includes(cleaningStatus) && ["Available", "Reserved", "Cleaning"].includes(nextStatus));
      if (needsCleaning) {
        await assertVacant(currentRoom, session);
        if (!currentRoom.isActive) throw Object.assign(new Error("Room is inactive."), { statusCode: 409 });
      }

      if (status) currentRoom.status = status;
      if (cleaningStatus) {
        currentRoom.cleaningStatus = cleaningStatus;
        if (cleaningStatus === "Clean") currentRoom.lastCleanedAt = new Date();
      }
      if (maintenanceNotes) currentRoom.maintenanceNotes = maintenanceNotes;
      if (status === "Maintenance") currentRoom.lastMaintenanceAt = new Date();

      if (needsCleaning) {
        currentRoom.status = "Cleaning";
        currentRoom.cleaningStatus = "Dirty";
        const { created } = await queueCleaningTask(currentRoom, {
          taskType: "Daily Cleaning", userId: req.user.id
        }, session);
        if (created) return currentRoom;
      }
      return currentRoom.save({ session });
    }));

    res.json(room);
  } catch (err) {
    res.status(err.statusCode || 500).json({
      error: err.statusCode ? err.message : "Failed to update room status",
      conflictType: err.conflictType,
      conflicts: err.conflicts
    });
  }
};

// Delete room
exports.deleteRoom = async (req, res) => {
  const { id } = req.params;

  try {
    const room = await Room.findOne(buildPropertyFilter(req, { _id: id }));

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    // Check for active reservations
    const activeReservation = await Reservation.findOne({
      room: id,
      status: { $nin: ["Cancelled", "Checked-Out"] }
    });

    if (activeReservation) {
      return res.status(400).json({ error: "Cannot delete room with active reservations" });
    }

    // Soft delete - mark as inactive
    room.isActive = false;
    await room.save();

    res.json({ message: "Room deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete room" });
  }
};

// Get room statistics
exports.getRoomStats = async (req, res) => {
  try {
    const baseFilter = buildPropertyFilter(req, { isActive: true });
    const totalRooms = await Room.countDocuments(baseFilter);
    const availableRooms = await Room.countDocuments(buildPropertyFilter(req, { status: "Available", isActive: true }));
    const occupiedRooms = await Room.countDocuments(buildPropertyFilter(req, { status: "Occupied", isActive: true }));
    const maintenanceRooms = await Room.countDocuments(buildPropertyFilter(req, { 
      status: { $in: ["Maintenance", "Out of Order"] }, 
      isActive: true 
    }));
    const cleaningRooms = await Room.countDocuments(buildPropertyFilter(req, { status: "Cleaning", isActive: true }));

    const occupancyRate = totalRooms > 0 ? ((occupiedRooms / totalRooms) * 100).toFixed(2) : 0;

    const roomTypeStats = await Room.aggregate([
      { $match: baseFilter },
      {
        $group: {
          _id: "$roomType",
          count: { $sum: 1 },
          occupied: {
            $sum: { $cond: [{ $eq: ["$status", "Occupied"] }, 1, 0] }
          }
        }
      }
    ]);

    res.json({
      totalRooms,
      availableRooms,
      occupiedRooms,
      maintenanceRooms,
      cleaningRooms,
      occupancyRate,
      roomTypeStats
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load room statistics" });
  }
};

// Get housekeeping tasks
exports.getHousekeepingTasks = async (req, res) => {
  try {
    // Dirty rooms - needs cleaning
    const dirty = await Room.find(buildPropertyFilter(req, {
      cleaningStatus: "Dirty",
      isActive: true
    })).sort({ roomNumber: 1 });

    // Pickup rooms - waiting for supplies/linen
    const pickup = await Room.find(buildPropertyFilter(req, {
      cleaningStatus: "Pickup",
      isActive: true
    })).sort({ roomNumber: 1 });

    // Clean rooms - needs inspection
    const inspection = await Room.find(buildPropertyFilter(req, {
      cleaningStatus: "Clean",
      status: "Cleaning",
      isActive: true
    })).sort({ roomNumber: 1 });

    // Clean rooms - needs inspection
    const inspected = await Room.find(buildPropertyFilter(req, {
      cleaningStatus: "Inspected",
      status: "Cleaning",
      isActive: true
    })).sort({ roomNumber: 1 });

    // Clean rooms - needs inspection
    const available = await Room.find(buildPropertyFilter(req, {
      cleaningStatus: "Clean",
      status: "Available",
      isActive: true
    })).sort({ roomNumber: 1 });

    console.log('Housekeeping tasks:', {
      dirty: dirty.length,
      pickup: pickup.length,
      inspection: inspection.length
    });

    res.json({
      dirty,
      pickup,
      inspection,
      inspected,
      available
    });
  } catch (err) {
    console.error('Housekeeping tasks error:', err);
    res.status(500).json({ error: "Failed to load housekeeping tasks" });
  }
};
