// backend/controllers/reservationController.js
const mongoose = require("mongoose");
const Reservation = require("../models/Reservation");
const Guest = require("../models/Guest");
const Room = require("../models/Room");
const TravelAgent = require("../models/TravelAgent");
const { assertAvailable } = require("../services/availabilityService");
const { calculateCharges, assertTransition, generateReservationNumber } = require("../services/reservationService");
const { withRoomLock, runWithOptionalTransaction } = require("../utils/transactionHelper");
const { createCheckoutTask } = require("../services/housekeepingService");
const { buildPropertyFilter, getActivePropertyId } = require("../middleware/propertyContext");
const notificationService = require("../services/notificationService");

// Get all reservations
exports.getReservations = async (req, res) => {
  try {
    const filter = buildPropertyFilter(req, {});
    const reservations = await Reservation.find(filter)
      .populate("guest", "firstName lastName phone email")
      .populate("room", "roomNumber roomType")
      .populate("travelAgent", "companyName agentCode")
      .sort({ createdAt: -1 });
    res.json(reservations);
  } catch (err) {
    res.status(500).json({ error: "Failed to load reservations" });
  }
};

// Get reservations by status
exports.getReservationsByStatus = async (req, res) => {
  const { status } = req.query;

  if (!status) {
    return res.status(400).json({ error: "Status is required" });
  }

  try {
    const filter = buildPropertyFilter(req, { status });
    const reservations = await Reservation.find(filter)
      .populate("guest", "firstName lastName phone email")
      .populate("room", "roomNumber roomType")
      .populate("travelAgent", "companyName")
      .sort({ checkInDate: 1 });

    res.json(reservations);
  } catch (err) {
    res.status(500).json({ error: "Failed to load reservations" });
  }
};

// Get reservations by date range
exports.getReservationsByDateRange = async (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: "Start date and end date are required" });
  }

  try {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const filter = buildPropertyFilter(req, {
      $or: [
        { checkInDate: { $gte: start, $lte: end } },
        { checkOutDate: { $gte: start, $lte: end } },
        { 
          checkInDate: { $lte: start },
          checkOutDate: { $gte: end }
        }
      ]
    });

    const reservations = await Reservation.find(filter)
      .populate("guest", "firstName lastName phone")
      .populate("room", "roomNumber roomType")
      .sort({ checkInDate: 1 });

    res.json(reservations);
  } catch (err) {
    res.status(500).json({ error: "Failed to load reservations" });
  }
};

// Get single reservation
exports.getReservation = async (req, res) => {
  const { id } = req.params;

  try {
    const reservation = await Reservation.findOne(buildPropertyFilter(req, { _id: id }))
      .populate("guest")
      .populate("room")
      .populate("travelAgent")
      .populate("additionalGuests")
      .populate("createdBy", "name email");

    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found" });
    }

    res.json(reservation);
  } catch (err) {
    res.status(500).json({ error: "Failed to load reservation" });
  }
};

// Create new reservation
exports.createReservation = async (req, res) => {
  const {
    guestId,
    roomId,
    bookingSource,
    travelAgentId,
    bookingReference,
    checkInDate,
    checkOutDate,
    numberOfAdults,
    numberOfChildren,
    roomType,
    numberOfRooms,
    ratePerNight,
    taxAmount,
    discountAmount,
    discountReason,
    advancePayment,
    mealPlan,
    specialRequests,
    purpose,
    additionalGuestIds
  } = req.body;

  if (!guestId || !checkInDate || !checkOutDate || !numberOfAdults || !roomType || !ratePerNight) {
    return res.status(400).json({ error: "Required fields are missing" });
  }

  try {
    const executeCreation = async () => {
      return runWithOptionalTransaction(async (session) => {
        let guestQuery = Guest.findOne(buildPropertyFilter(req, { _id: guestId }));
        if (session) guestQuery = guestQuery.session(session);
        const guest = await guestQuery;
        if (!guest) {
          const err = new Error("Guest not found");
          err.statusCode = 404;
          throw err;
        }

        // If room is assigned, check availability
        let assignedRoom = null;
        if (roomId) {
          let roomQuery = Room.findOne(buildPropertyFilter(req, { _id: roomId }));
          if (session) roomQuery = roomQuery.session(session);
          assignedRoom = await roomQuery;
          if (!assignedRoom) {
            const err = new Error("Room not found");
            err.statusCode = 404;
            throw err;
          }

          await assertAvailable({ room: assignedRoom, roomId, checkInDate, checkOutDate }, session);
        }

        // Validate travel agent if booking source is Travel Agent
        if (bookingSource === "Travel Agent") {
          if (!travelAgentId) {
            const err = new Error("Travel agent is required for this booking source");
            err.statusCode = 400;
            throw err;
          }
          let agentQuery = TravelAgent.findById(travelAgentId);
          if (session) agentQuery = agentQuery.session(session);
          const agent = await agentQuery;
          if (!agent) {
            const err = new Error("Travel agent not found");
            err.statusCode = 404;
            throw err;
          }
        }

        // Calculate number of nights
        const checkIn = new Date(checkInDate);
        const checkOut = new Date(checkOutDate);
        const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));

        if (nights < 1) {
          const err = new Error("Check-out date must be after check-in date");
          err.statusCode = 400;
          throw err;
        }

        // Generate reservation number
        const reservationNumber = await generateReservationNumber(session);

        // Calculate charges on the server; client-supplied totals are never trusted.
        const roomCharges = ratePerNight * nights * (numberOfRooms || 1);
        const totalAmount = roomCharges + (taxAmount || 0) - (discountAmount || 0);

        let targetPropertyId = req.propertyId || (assignedRoom && assignedRoom.property);
        if (!targetPropertyId) {
          targetPropertyId = await getActivePropertyId();
        }

        const newReservation = new Reservation({
          property: targetPropertyId,
          reservationNumber,
          guest: guestId,
          room: roomId || null,
          bookingSource,
          travelAgent: travelAgentId || null,
          bookingReference,
          checkInDate: checkIn,
          checkOutDate: checkOut,
          numberOfAdults,
          numberOfChildren: numberOfChildren || 0,
          roomType,
          numberOfRooms: numberOfRooms || 1,
          ratePerNight,
          numberOfNights: nights,
          roomCharges,
          taxAmount: taxAmount || 0,
          discountAmount: discountAmount || 0,
          discountReason,
          totalAmount,
          advancePayment: advancePayment || 0,
          mealPlan: mealPlan || "None",
          specialRequests,
          purpose,
          numberOfGuests: numberOfAdults + (numberOfChildren || 0),
          additionalGuests: additionalGuestIds || [],
          paymentStatus: advancePayment > 0 ? "Partial" : "Pending",
          createdBy: req.user.id
        });

        await newReservation.save({ session });

        // Update room status if room is assigned
        if (roomId) {
          let updateRoomQuery = Room.findByIdAndUpdate(roomId, { 
            status: "Reserved",
            currentReservation: newReservation._id
          });
          if (session) updateRoomQuery = updateRoomQuery.session(session);
          await updateRoomQuery;
        }

        // Update guest statistics
        guest.totalStays += 1;
        await guest.save({ session });

        // Update travel agent statistics
        if (travelAgentId) {
          let updateAgentQuery = TravelAgent.findByIdAndUpdate(travelAgentId, {
            $inc: { totalBookings: 1, totalRevenue: totalAmount }
          });
          if (session) updateAgentQuery = updateAgentQuery.session(session);
          await updateAgentQuery;
        }

        return newReservation._id;
      });
    };

    const reservationId = roomId ? await withRoomLock(roomId, executeCreation) : await executeCreation();

    const reservation = await Reservation.findOne(buildPropertyFilter(req, { _id: reservationId }))
      .populate("guest")
      .populate("room")
      .populate("travelAgent");

    // Operational notifications
    try {
      if (reservation?.guest?.user) {
        notificationService.createNotification({
          recipient: reservation.guest.user,
          title: "Reservation Confirmed",
          message: `Your reservation #${reservation.reservationNumber} for ${reservation.room ? "Room " + reservation.room.roomNumber : "your stay"} has been confirmed.`,
          category: "reservation",
          priority: "normal",
          actionUrl: `/reservations/${reservation._id}`,
          relatedEntity: { entityType: "Reservation", entityId: reservation._id }
        }).catch(err => console.error("Notification trigger error:", err));
      }
      notificationService.sendAudienceNotification({
        audience: "department",
        department: "Front Desk",
        title: "New Reservation Created",
        message: `Reservation #${reservation.reservationNumber} created for guest ${guest.firstName} ${guest.lastName}.`,
        category: "reservation",
        priority: "normal",
        actionUrl: `/reservations/${reservation._id}`,
        relatedEntity: { entityType: "Reservation", entityId: reservation._id }
      }).catch(err => console.error("Notification trigger error:", err));
    } catch (e) {}

    res.status(201).json(reservation);
  } catch (err) {
    console.error("Create reservation error:", err);
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : "Failed to create reservation" });
  }
};

// Update reservation
exports.updateReservation = async (req, res) => {
  const { id } = req.params;
    const allowedFields = [
      "guest", "room", "bookingSource", "travelAgent", "bookingReference",
      "checkInDate", "checkOutDate", "numberOfAdults", "numberOfChildren",
      "roomType", "numberOfRooms", "ratePerNight", "taxAmount", "discountAmount",
      "discountReason", "mealPlan", "specialRequests", "purpose", "status"
    ];
    const updates = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowedFields.includes(key)));

  try {
    const reservation = await Reservation.findOne(buildPropertyFilter(req, { _id: id }));

    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found" });
    }

    if (updates.room) {
      const room = await Room.findOne(buildPropertyFilter(req, { _id: updates.room }));
      if (!room) return res.status(400).json({ error: "Select a room in the assigned property" });
    }
    if (updates.guest) {
      const guest = await Guest.findOne(buildPropertyFilter(req, { _id: updates.guest }));
      if (!guest) return res.status(400).json({ error: "Select a guest in the assigned property" });
    }

    if (updates.status) {
      assertTransition(reservation.status, updates.status);
    }

    // If dates are updated, recalculate charges
    if (updates.checkInDate || updates.checkOutDate || updates.ratePerNight || updates.numberOfRooms) {
      const checkIn = new Date(updates.checkInDate || reservation.checkInDate);
      const checkOut = new Date(updates.checkOutDate || reservation.checkOutDate);
      const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
      const rate = updates.ratePerNight || reservation.ratePerNight;
      const rooms = updates.numberOfRooms || reservation.numberOfRooms;
      
      updates.numberOfNights = nights;
      updates.roomCharges = rate * nights * rooms;
      updates.totalAmount = updates.roomCharges + (updates.taxAmount || reservation.taxAmount) - (updates.discountAmount || reservation.discountAmount);
    }

    const updatedReservation = await Reservation.findOneAndUpdate(buildPropertyFilter(req, { _id: id }), updates, {
      new: true,
      runValidators: true
    })
      .populate("guest")
      .populate("room")
      .populate("travelAgent");

    res.json(updatedReservation);
  } catch (err) {
    console.error("Update failed:", err.message);
    res.status(500).json({ error: "Failed to update reservation" });
  }
};

// Check-in guest
exports.checkIn = async (req, res) => {
  const { id } = req.params;
  const { roomId, actualCheckInDate } = req.body;

  try {
    const reservation = await Reservation.findOne(buildPropertyFilter(req, { _id: id }));

    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found" });
    }

    if (reservation.status === "Checked-In") {
      return res.status(400).json({ error: "Guest is already checked in" });
    }
    assertTransition(reservation.status, "Checked-In");

    // Assign room if not already assigned
    if (!reservation.room && roomId) {
      const room = await Room.findOne(buildPropertyFilter(req, { _id: roomId }));
      if (!room) {
        return res.status(404).json({ error: "Room not found" });
      }

      if (room.status !== "Available" && room.status !== "Reserved") {
        return res.status(400).json({ error: "Room is not available" });
      }

      reservation.room = roomId;
    }

    if (!reservation.room) {
      return res.status(400).json({ error: "Please assign a room before check-in" });
    }

    reservation.status = "Checked-In";
    reservation.actualCheckInDate = actualCheckInDate || new Date();
    await reservation.save();

    // Update room status
    await Room.findOneAndUpdate(buildPropertyFilter(req, { _id: reservation.room }), {
      status: "Occupied",
      currentReservation: reservation._id,
      cleaningStatus: "Dirty"
    });

    const updatedReservation = await Reservation.findOne(buildPropertyFilter(req, { _id: id }))
      .populate("guest")
      .populate("room")
      .populate("travelAgent");

    // Notify guest on check-in
    try {
      if (updatedReservation?.guest?.user) {
        notificationService.createNotification({
          recipient: updatedReservation.guest.user,
          title: "Welcome to Serendib Sanctuary",
          message: `You are now checked in to Room ${updatedReservation.room?.roomNumber || ""}. Have a wonderful stay!`,
          category: "reservation",
          priority: "normal",
          actionUrl: `/reservations/${updatedReservation._id}`,
          relatedEntity: { entityType: "Reservation", entityId: updatedReservation._id }
        }).catch(() => {});
      }
    } catch (e) {}

    res.json(updatedReservation);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : "Failed to check in guest" });
  }
};

// Check-out guest
exports.checkOut = async (req, res) => {
  const { id } = req.params;
  const { actualCheckOutDate } = req.body;

  try {
    const reservation = await Reservation.findOne(buildPropertyFilter(req, { _id: id }))
      .populate("guest")
      .populate("room")
      .populate("travelAgent");

    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found" });
    }

    if (reservation.status !== "Checked-In") {
      return res.status(400).json({ error: "Guest is not checked in" });
    }
    assertTransition(reservation.status, "Checked-Out");

    // Check if invoice exists and is fully paid
    const Invoice = require("../models/Invoice");
    let invoice = await Invoice.findOne({ reservation: id });
    
    if (!invoice) {
      // Auto-generate invoice
      const GuestExpense = require("../models/GuestExpense");
      const expenses = await GuestExpense.find({ reservation: id });
      
      const totalExtraExpenses = expenses.reduce((sum, exp) => sum + exp.totalAmount, 0);
      const subtotal = reservation.roomCharges + totalExtraExpenses;
      const taxAmount = reservation.taxAmount;
      const totalAmount = subtotal + taxAmount - (reservation.discountAmount || 0);

      // Generate invoice number
      const now = new Date();
      const yearMonth = now.getFullYear().toString().slice(-2) + (now.getMonth() + 1).toString().padStart(2, '0');
      const count = await Invoice.countDocuments({
        invoiceNumber: new RegExp(`^INV${yearMonth}`)
      });
      const invoiceNumber = `INV${yearMonth}${(count + 1).toString().padStart(5, '0')}`;

      invoice = new Invoice({
        invoiceNumber,
        reservation: reservation._id,
        guest: reservation.guest._id,
        travelAgent: reservation.travelAgent?._id,
        invoiceDate: new Date(),
        checkInDate: reservation.checkInDate,
        checkOutDate: reservation.actualCheckOutDate || new Date(),
        numberOfNights: reservation.numberOfNights,
        roomCharges: reservation.roomCharges,
        extraExpenses: expenses.map(exp => ({
          date: exp.expenseDate,
          category: exp.category,
          description: exp.description,
          amount: exp.totalAmount
        })),
        totalExtraExpenses,
        subtotal,
        taxPercentage: (taxAmount / subtotal) * 100 || 0,
        taxAmount,
        discountAmount: reservation.discountAmount || 0,
        discountReason: reservation.discountReason,
        totalAmount,
        advancePaid: reservation.advancePayment || 0,
        totalPaid: reservation.advancePayment || 0,
        balanceDue: totalAmount - (reservation.advancePayment || 0),
        paymentStatus: (reservation.advancePayment || 0) >= totalAmount ? 'Paid' : 
                      (reservation.advancePayment || 0) > 0 ? 'Partial' : 'Unpaid',
        billingAddress: reservation.guest.address,
        generatedBy: req.user.id
      });

      await invoice.save();
    }

    // Check if invoice is fully paid
    if (invoice.balanceDue > 0) {
      return res.status(400).json({ 
        error: "Cannot check out. Outstanding balance of ₹" + invoice.balanceDue.toLocaleString() + " must be paid first.",
        invoiceId: invoice._id,
        balanceDue: invoice.balanceDue
      });
    }

    // If paid, proceed with checkout
    reservation.status = "Checked-Out";
    reservation.actualCheckOutDate = actualCheckOutDate || new Date();
    await reservation.save();

    // Update room status and automatically trigger housekeeping workflow
    if (reservation.room) {
      const targetRoomId = reservation.room._id || reservation.room;
      await Room.findOneAndUpdate(buildPropertyFilter(req, { _id: targetRoomId }), {
        status: "Cleaning",
        currentReservation: null,
        cleaningStatus: "Dirty"
      });
      await createCheckoutTask(targetRoomId, reservation._id, req.user.id);
    }

    const updatedReservation = await Reservation.findOne(buildPropertyFilter(req, { _id: id }))
      .populate("guest")
      .populate("room")
      .populate("travelAgent");

    // Notify guest on check-out
    try {
      if (updatedReservation?.guest?.user) {
        notificationService.createNotification({
          recipient: updatedReservation.guest.user,
          title: "Check-Out Complete",
          message: `Thank you for staying with Serendib Sanctuary. Your check-out for reservation #${updatedReservation.reservationNumber} is complete.`,
          category: "reservation",
          priority: "normal",
          actionUrl: `/reservations/${updatedReservation._id}`,
          relatedEntity: { entityType: "Reservation", entityId: updatedReservation._id }
        }).catch(() => {});
      }
    } catch (e) {}

    res.json({ 
      reservation: updatedReservation,
      invoice: invoice
    });
  } catch (err) {
    console.error("Checkout error:", err);
    res.status(500).json({ error: "Failed to check out guest" });
  }
};

// Cancel reservation
exports.cancelReservation = async (req, res) => {
  const { id } = req.params;
  const { cancellationReason, cancellationCharges } = req.body;

  try {
    const reservation = await Reservation.findOne(buildPropertyFilter(req, { _id: id }));

    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found" });
    }

    assertTransition(reservation.status, "Cancelled");

    reservation.status = "Cancelled";
    reservation.cancellationDate = new Date();
    reservation.cancellationReason = cancellationReason;
    reservation.cancellationCharges = cancellationCharges || 0;
    await reservation.save();

    // Update room status if room was assigned
    if (reservation.room) {
      await Room.findOneAndUpdate(buildPropertyFilter(req, { _id: reservation.room }), {
        status: "Available",
        currentReservation: null
      });
    }

    const updatedReservation = await Reservation.findOne(buildPropertyFilter(req, { _id: id }))
      .populate("guest")
      .populate("room")
      .populate("travelAgent");

    res.json({ message: "Reservation cancelled successfully", reservation: updatedReservation });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : "Failed to cancel reservation" });
  }
};

// Mark a confirmed reservation as a terminal no-show.
exports.markNoShow = async (req, res) => {
  try {
    const reservation = await Reservation.findOne(buildPropertyFilter(req, { _id: req.params.id }));
    if (!reservation) return res.status(404).json({ error: "Reservation not found" });
    assertTransition(reservation.status, "No-Show");
    reservation.status = "No-Show";
    reservation.cancellationDate = new Date();
    await reservation.save();
    if (reservation.room) {
      await Room.findOneAndUpdate(buildPropertyFilter(req, { _id: reservation.room }), { status: "Available", currentReservation: null });
    }
    res.json(reservation);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : "Failed to mark reservation as no-show" });
  }
};

// Delete reservation
exports.deleteReservation = async (req, res) => {
  const { id } = req.params;

  try {
    const reservation = await Reservation.findOne(buildPropertyFilter(req, { _id: id }));
    if (!reservation) return res.status(404).json({ error: "Reservation not found" });
    return res.status(409).json({ error: "Reservations are retained for booking and payment history. Use cancellation to close this reservation." });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete reservation" });
  }
};

// Get dashboard statistics
exports.getDashboardStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const checkingInToday = await Reservation.countDocuments({
      checkInDate: { $gte: today, $lt: tomorrow },
      status: "Confirmed"
    });

    const checkingOutToday = await Reservation.countDocuments({
      checkOutDate: { $gte: today, $lt: tomorrow },
      status: "Checked-In"
    });

    const currentOccupancy = await Reservation.countDocuments({
      status: "Checked-In"
    });

    const confirmedReservations = await Reservation.countDocuments({
      status: "Confirmed"
    });

    const revenueToday = await Reservation.aggregate([
      {
        $match: {
          createdAt: { $gte: today, $lt: tomorrow }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$totalAmount" }
        }
      }
    ]);

    res.json({
      checkingInToday,
      checkingOutToday,
      currentOccupancy,
      confirmedReservations,
      revenueToday: revenueToday[0]?.total || 0
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load dashboard statistics" });
  }
};
