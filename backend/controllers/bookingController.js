// backend/controllers/bookingController.js
const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const Room = require("../models/Room");
const Reservation = require("../models/Reservation");
const Guest = require("../models/Guest");
const User = require("../models/User");
const { assertAvailable } = require("../services/availabilityService");
const { createReservation } = require("../services/reservationService");
const { withRoomLock, runWithOptionalTransaction } = require("../utils/transactionHelper");
const { buildPropertyFilter, getActivePropertyId } = require("../middleware/propertyContext");
const notificationService = require("../services/notificationService");

// Get all bookings (Admin / Staff)
exports.getBookings = async (req, res) => {
  try {
    const filter = buildPropertyFilter(req, {});
    const bookings = await Booking.find(filter)
      .populate("user", "name email phone")
      .populate("room", "roomNumber roomType basePrice weekendPrice images capacity bedConfiguration view description amenities")
      .populate("reservation", "reservationNumber status")
      .sort({ createdAt: -1 });
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: "Failed to load bookings" });
  }
};

// Get current user's bookings (Customer / Self-service)
exports.getMyBookings = async (req, res) => {
  try {
    const bookings = await Booking.find({ user: req.user.id })
      .populate("room", "roomNumber roomType basePrice weekendPrice images capacity bedConfiguration view description amenities")
      .populate("reservation", "reservationNumber status")
      .sort({ createdAt: -1 });
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: "Failed to load your bookings" });
  }
};

// Get bookings by date (Admin / Staff)
exports.getBookingsByDate = async (req, res) => {
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ error: "Date is required" });
  }

  try {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const filter = buildPropertyFilter(req, {
      checkInDate: { $gte: start, $lte: end }
    });

    const bookings = await Booking.find(filter)
      .populate("user", "name email phone")
      .populate("room", "roomNumber roomType basePrice")
      .sort({ checkInDate: 1 });

    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: "Failed to load bookings for date" });
  }
};

// Get single booking
exports.getBooking = async (req, res) => {
  const { id } = req.params;

  try {
    const booking = await Booking.findById(id)
      .populate("user", "name email phone")
      .populate("room", "roomNumber roomType basePrice weekendPrice images capacity bedConfiguration view description amenities")
      .populate("reservation");

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    // Check if user is authorized to view this booking
    if (req.user.role !== "admin" && req.user.role !== "staff" && booking.user._id.toString() !== req.user.id) {
      return res.status(403).json({ error: "Not authorized to view this booking" });
    }

    res.json(booking);
  } catch (err) {
    res.status(500).json({ error: "Failed to load booking" });
  }
};

// Create new booking (Customer self-service reservation)
exports.createBooking = async (req, res) => {
  const { roomId, checkInDate, checkOutDate, numberOfGuests, specialRequests, paymentMethod } = req.body;

  if (!roomId || !checkInDate || !checkOutDate || !numberOfGuests) {
    return res.status(400).json({ error: "All required fields must be provided" });
  }

  try {
    const createdBookingId = await withRoomLock(roomId, async () => {
      return runWithOptionalTransaction(async (session) => {
        let roomQuery = Room.findById(roomId);
        if (session) roomQuery = roomQuery.session(session);
        const room = await roomQuery;

        if (!room) {
          const err = new Error("Room not found");
          err.statusCode = 404;
          throw err;
        }

        const checkIn = new Date(checkInDate);
        const checkOut = new Date(checkOutDate);
        checkIn.setHours(14, 0, 0, 0); // Standard 2:00 PM check-in
        checkOut.setHours(11, 0, 0, 0); // Standard 11:00 AM check-out

        if (checkIn >= checkOut) {
          const err = new Error("Check-out date must be after check-in date");
          err.statusCode = 400;
          throw err;
        }

        // Calculate number of nights
        const diffTime = checkOut.getTime() - checkIn.getTime();
        const days = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

        await assertAvailable({ room, roomId, checkInDate: checkIn, checkOutDate: checkOut }, session);

        // Secure server-side pricing calculation (Customer cannot manipulate price)
        const ratePerNight = Number(room.basePrice || room.price || 0);
        const totalPrice = days * ratePerNight;

        // Fetch user details for guest mapping
        let userQuery = User.findById(req.user.id);
        if (session) userQuery = userQuery.session(session);
        const currentUser = await userQuery;

        const userEmail = currentUser?.email || req.user.email;
        const userName = currentUser?.name || req.user.name || "Valued Guest";
        const userPhone = currentUser?.phone || req.user.phone || "Not provided";
        const userAddress = currentUser?.address || "";

        // Find or create Guest profile to link with canonical Reservation
        let guest = null;
        if (currentUser?.guest) {
          let gq = Guest.findById(currentUser.guest);
          if (session) gq = gq.session(session);
          guest = await gq;
        }

        if (!guest) {
          let guestQuery = Guest.findOne({ 
            $or: [
              { user: currentUser?._id || req.user.id },
              { email: (userEmail || "").toLowerCase().trim() }
            ]
          });
          if (session) guestQuery = guestQuery.session(session);
          guest = await guestQuery;
        }

        if (!guest) {
          const nameParts = userName.trim().split(" ");
          const firstName = nameParts[0] || "Valued";
          const lastName = nameParts.slice(1).join(" ") || "Guest";
          const guestDocs = await Guest.create([{
            firstName,
            lastName,
            email: (userEmail || "").toLowerCase().trim(),
            phone: userPhone,
            user: currentUser?._id || req.user.id,
            property: room.property || req.propertyId || null,
            nationalIdType: "Other",
            nationalIdNumber: `GST-${req.user.id.slice(-6).toUpperCase()}`,
            nationality: "Resident",
            address: { street: userAddress }
          }], { session });
          guest = guestDocs[0];
        } else if (!guest.user && currentUser) {
          guest.user = currentUser._id;
          await guest.save({ session });
        }

        if (currentUser && (!currentUser.guest || currentUser.guest.toString() !== guest._id.toString())) {
          currentUser.guest = guest._id;
          await currentUser.save({ session });
        }

        const propertyId = room.property || req.propertyId || (await getActivePropertyId());

        // Create canonical operational Reservation through the shared service.
        const canonicalReservation = await createReservation({
          property: propertyId,
          guest: guest._id,
          room: roomId,
          bookingSource: "Hotel Website",
          checkInDate: checkIn,
          checkOutDate: checkOut,
          numberOfAdults: Number(numberOfGuests) || 1,
          numberOfChildren: 0,
          roomType: room.roomType,
          numberOfRooms: 1,
          ratePerNight,
          numberOfNights: days,
          roomCharges: totalPrice,
          totalAmount: totalPrice,
          paymentStatus: "Pending",
          status: "Confirmed",
          specialRequests: specialRequests || "",
          numberOfGuests: Number(numberOfGuests) || 1,
          createdBy: req.user.id
        }, { session });

        // Create Customer Booking record
        const newBooking = new Booking({
          property: propertyId,
          user: req.user.id,
          room: roomId,
          checkInDate: checkIn,
          checkOutDate: checkOut,
          numberOfGuests: Number(numberOfGuests) || 1,
          totalPrice,
          specialRequests: specialRequests || "",
          paymentMethod: paymentMethod || "Cash",
          paymentStatus: "pending",
          bookingStatus: "confirmed",
          reservationNumber: canonicalReservation.reservationNumber,
          reservation: canonicalReservation._id
        });

        await newBooking.save({ session });

        // Update room status
        let updateRoomQuery = Room.findByIdAndUpdate(roomId, {
          status: "Reserved",
          currentReservation: canonicalReservation._id
        });
        if (session) updateRoomQuery = updateRoomQuery.session(session);
        await updateRoomQuery;

        return newBooking._id;
      });
    });

    const populatedBooking = await Booking.findById(createdBookingId)
      .populate("user", "name email phone")
      .populate("room", "roomNumber roomType basePrice weekendPrice images capacity bedConfiguration view description amenities")
      .populate("reservation");

    // Automatically trigger notifications for customer & front desk
    try {
      if (req.user && req.user._id) {
        notificationService.createNotification({
          recipient: req.user._id,
          title: "Reservation Received",
          message: `Your reservation #${populatedBooking.bookingReference || populatedBooking._id} for ${populatedBooking.room?.roomType || "Room"} has been received.`,
          category: "reservation",
          priority: "normal",
          actionUrl: "/my-bookings",
          relatedEntity: { entityType: "Reservation", entityId: populatedBooking.reservation?._id || null }
        }).catch(err => console.error("Notification creation error:", err));
      }
      notificationService.sendAudienceNotification({
        audience: "department",
        department: "Front Desk",
        title: "New Online Booking Received",
        message: `Guest ${populatedBooking.user?.name || req.body.customerName || "Online Guest"} reserved ${populatedBooking.room?.roomType || "Room"}. Ref #${populatedBooking.bookingReference || populatedBooking._id}.`,
        category: "reservation",
        priority: "normal",
        actionUrl: "/reservations",
        relatedEntity: { entityType: "Reservation", entityId: populatedBooking.reservation?._id || null }
      }).catch(err => console.error("Notification send error:", err));
    } catch (notifErr) {
      console.error("Booking notification hook error:", notifErr);
    }

    res.status(201).json(populatedBooking);
  } catch (err) {
    console.error("Create booking error:", err);
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : "Failed to create reservation" });
  }
};

// Update booking
exports.updateBooking = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  try {
    const booking = await Booking.findById(id);

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    // Check authorization
    if (req.user.role !== "admin" && req.user.role !== "staff" && booking.user.toString() !== req.user.id) {
      return res.status(403).json({ error: "Not authorized to update this booking" });
    }

    // If updating dates, recalculate server-side price safely
    if (updates.checkInDate || updates.checkOutDate) {
      const checkIn = new Date(updates.checkInDate || booking.checkInDate);
      const checkOut = new Date(updates.checkOutDate || booking.checkOutDate);

      if (checkIn >= checkOut) {
        return res.status(400).json({ error: "Check-out date must be after check-in date" });
      }

      const room = await Room.findById(booking.room);
      const days = Math.max(1, Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24)));
      const rate = Number(room.basePrice || room.price || 0);
      updates.totalPrice = days * rate;

      // Also update linked canonical reservation if present
      if (booking.reservation) {
        await Reservation.findByIdAndUpdate(booking.reservation, {
          checkInDate: checkIn,
          checkOutDate: checkOut,
          numberOfNights: days,
          roomCharges: updates.totalPrice,
          totalAmount: updates.totalPrice
        });
      }
    }

    const updatedBooking = await Booking.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true
    })
      .populate("user", "name email phone")
      .populate("room", "roomNumber roomType basePrice weekendPrice images capacity bedConfiguration view description amenities")
      .populate("reservation");

    res.json(updatedBooking);
  } catch (err) {
    res.status(500).json({ error: "Failed to update booking" });
  }
};

// Cancel booking (Guest self-service cancellation or Admin)
exports.cancelBooking = async (req, res) => {
  const { id } = req.params;

  try {
    const booking = await Booking.findById(id);

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    // Check authorization
    if (req.user.role !== "admin" && booking.user.toString() !== req.user.id) {
      return res.status(403).json({ error: "Not authorized to cancel this booking" });
    }

    if (booking.bookingStatus === "cancelled") {
      return res.status(400).json({ error: "Booking is already cancelled" });
    }

    if (booking.bookingStatus === "checked-out") {
      return res.status(400).json({ error: "Cannot cancel completed stay" });
    }

    booking.bookingStatus = "cancelled";
    booking.paymentStatus = "cancelled";
    await booking.save();

    // Cancel linked canonical reservation if present
    if (booking.reservation) {
      await Reservation.findByIdAndUpdate(booking.reservation, {
        status: "Cancelled",
        cancellationDate: new Date(),
        cancellationReason: "Cancelled by guest via Guest Portal"
      });
    }

    // Revert room status back to Available
    if (booking.room) {
      await Room.findByIdAndUpdate(booking.room, {
        status: "Available",
        currentReservation: null
      });
    }

    const updated = await Booking.findById(id)
      .populate("room", "roomNumber roomType basePrice weekendPrice images capacity bedConfiguration view description amenities")
      .populate("reservation");

    res.json({ message: "Reservation cancelled successfully", booking: updated });
  } catch (err) {
    console.error("Cancel booking error:", err);
    res.status(500).json({ error: "Failed to cancel booking" });
  }
};

// Delete booking (Admin only)
exports.deleteBooking = async (req, res) => {
  const { id } = req.params;

  try {
    const booking = await Booking.findById(id);

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    await Booking.findByIdAndDelete(id);
    res.json({ message: "Booking deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete booking" });
  }
};