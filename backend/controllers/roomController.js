// backend/controllers/roomController.js
const mongoose = require("mongoose");
const Room = require("../models/Room");
const Reservation = require("../models/Reservation");
const Booking = require("../models/Booking");
const { getAvailableRoomIds, parseStayDates } = require("../services/availabilityService");
const { getActivePropertyId, buildPropertyFilter } = require("../middleware/propertyContext");

// Get all rooms
exports.getRooms = async (req, res) => {
  try {
    const filter = buildPropertyFilter(req, { isActive: true });
    const rooms = await Room.find(filter)
      .populate("currentReservation", "reservationNumber guest")
      .sort({ roomNumber: 1 });
    res.json(rooms);
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
    // If no dates provided, return all active rooms currently available for guests
    if (!checkInDate || !checkOutDate) {
      const query = buildPropertyFilter(req, {
        status: "Available",
        cleaningStatus: { $ne: "Dirty" },
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

    const { checkIn, checkOut } = parseStayDates(checkInDate, checkOutDate);
    const allBookedRoomIds = await getAvailableRoomIds(checkIn, checkOut, req.propertyId);

    const query = buildPropertyFilter(req, {
      _id: { $nin: allBookedRoomIds },
      status: { $nin: ["Maintenance", "Out of Order", "Occupied", "Cleaning"] },
      cleaningStatus: { $ne: "Dirty" },
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
    if (status === "Maintenance" || status === "Out of Order") {
      const { assertRoomBlockable } = require("../services/maintenanceService");
      await assertRoomBlockable(id);
    }

    const updates = {};
    
    if (status) updates.status = status;
    if (cleaningStatus) {
      updates.cleaningStatus = cleaningStatus;
      if (cleaningStatus === "Clean") {
        updates.lastCleanedAt = new Date();
      }
    }
    if (maintenanceNotes) updates.maintenanceNotes = maintenanceNotes;
    if (status === "Maintenance") updates.lastMaintenanceAt = new Date();

    const room = await Room.findOneAndUpdate(buildPropertyFilter(req, { _id: id }), updates, {
      new: true,
      runValidators: true
    });

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

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
