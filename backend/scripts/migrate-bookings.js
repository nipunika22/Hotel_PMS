// backend/scripts/migrate-bookings.js
/**
 * Idempotent migration script for legacy Booking records.
 * 
 * Usage:
 *   node scripts/migrate-bookings.js          # Dry-run mode (preview changes)
 *   node scripts/migrate-bookings.js --commit # Apply changes to database
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const Reservation = require("../models/Reservation");
const User = require("../models/User");
const Room = require("../models/Room");
const Guest = require("../models/Guest");
const { parseStayDates } = require("../services/availabilityService");
const { createReservation } = require("../services/reservationService");

const isCommit = process.argv.includes("--commit");

async function migrate() {
  console.log(`\n======================================================`);
  console.log(`LEGACY BOOKING MIGRATION (${isCommit ? "LIVE RUN - WRITING" : "DRY RUN - PREVIEW ONLY"})`);
  console.log(`======================================================\n`);

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB database.");

    // Find all bookings that lack a valid linked reservation
    const allBookings = await Booking.find({}).lean();
    console.log(`Total Booking documents found: ${allBookings.length}`);

    const unlinkedOrOrphaned = [];
    for (const booking of allBookings) {
      if (!booking.reservation) {
        unlinkedOrOrphaned.push(booking);
      } else {
        const resExists = await Reservation.findById(booking.reservation).lean();
        if (!resExists) {
          unlinkedOrOrphaned.push({ ...booking, reason: "Dangling reservation reference" });
        }
      }
    }

    console.log(`Bookings needing canonical link or migration: ${unlinkedOrOrphaned.length}\n`);

    if (unlinkedOrOrphaned.length === 0) {
      console.log("All Booking records already have valid canonical Reservations linked.");
      console.log("No migration actions required. Safe and idempotent.\n");
      return;
    }

    let processedCount = 0;
    let createdCount = 0;
    let relinkedCount = 0;
    let skippedCount = 0;

    for (const booking of unlinkedOrOrphaned) {
      console.log(`Processing Booking [${booking._id}]:`);

      // 1. Check if user exists
      const user = await User.findById(booking.user).lean();
      if (!user) {
        console.warn(`  [SKIP] Referenced user ${booking.user} does not exist. Cannot safely infer guest profile.`);
        skippedCount++;
        continue;
      }

      // 2. Check if room exists
      const room = await Room.findById(booking.room).lean();
      if (!room) {
        console.warn(`  [SKIP] Referenced room ${booking.room} does not exist. Cannot safely determine room type or pricing.`);
        skippedCount++;
        continue;
      }

      // 3. Check dates
      let stayDates;
      try {
        stayDates = parseStayDates(booking.checkInDate, booking.checkOutDate);
      } catch (err) {
        console.warn(`  [SKIP] Invalid stay dates for booking ${booking._id}: ${err.message}`);
        skippedCount++;
        continue;
      }

      // 4. Idempotency Check: Check if a Reservation already exists for this booking ID or exact stay
      let existingReservation = await Reservation.findOne({
        $or: [
          { bookingReference: booking._id.toString() },
          {
            room: room._id,
            checkInDate: stayDates.checkIn,
            checkOutDate: stayDates.checkOut,
            createdBy: user._id
          }
        ]
      });

      if (existingReservation) {
        console.log(`  [LINK] Found existing canonical Reservation ${existingReservation.reservationNumber} (${existingReservation._id})`);
        if (isCommit) {
          await Booking.findByIdAndUpdate(booking._id, {
            reservation: existingReservation._id,
            reservationNumber: existingReservation.reservationNumber
          });
        }
        relinkedCount++;
        processedCount++;
        continue;
      }

      // 5. Find or create Guest profile
      let guest = await Guest.findOne({ email: user.email });
      if (!guest && isCommit) {
        const nameParts = (user.name || "Valued Guest").trim().split(" ");
        const firstName = nameParts[0] || "Valued";
        const lastName = nameParts.slice(1).join(" ") || "Guest";
        guest = await Guest.create({
          firstName,
          lastName,
          email: user.email,
          phone: user.phone || "Not provided",
          nationalIdType: "Other",
          nationalIdNumber: `GUEST-${user._id.toString().slice(-6).toUpperCase()}`,
          nationality: "Resident",
          address: { street: user.address || "" }
        });
        console.log(`  [GUEST] Created operational Guest profile: ${guest._id}`);
      }

      // Map statuses
      const statusMap = {
        "confirmed": "Confirmed",
        "checked-in": "Checked-In",
        "checked-out": "Checked-Out",
        "cancelled": "Cancelled"
      };
      const canonicalStatus = statusMap[booking.bookingStatus] || "Confirmed";

      const paymentMap = {
        "paid": "Paid",
        "pending": "Pending",
        "cancelled": "Pending",
        "refunded": "Refunded"
      };
      const canonicalPaymentStatus = paymentMap[booking.paymentStatus] || "Pending";

      const ratePerNight = Number(room.basePrice || room.price || (booking.totalPrice / (stayDates.nights || 1)));
      const totalPrice = Number(booking.totalPrice) || (ratePerNight * stayDates.nights);

      const reservationData = {
        guest: guest ? guest._id : new mongoose.Types.ObjectId(),
        room: room._id,
        bookingSource: "Hotel Website",
        bookingReference: booking._id.toString(),
        checkInDate: stayDates.checkIn,
        checkOutDate: stayDates.checkOut,
        numberOfAdults: Number(booking.numberOfGuests) || 1,
        numberOfChildren: 0,
        roomType: room.roomType,
        numberOfRooms: 1,
        ratePerNight,
        numberOfNights: stayDates.nights,
        roomCharges: totalPrice,
        totalAmount: totalPrice,
        paymentStatus: canonicalPaymentStatus,
        status: canonicalStatus,
        specialRequests: booking.specialRequests || "",
        numberOfGuests: Number(booking.numberOfGuests) || 1,
        createdBy: user._id
      };

      if (isCommit) {
        const newReservation = await createReservation(reservationData);
        await Booking.findByIdAndUpdate(booking._id, {
          reservation: newReservation._id,
          reservationNumber: newReservation.reservationNumber
        });
        console.log(`  [CREATED] Created Reservation ${newReservation.reservationNumber} and linked to Booking ${booking._id}`);
      } else {
        console.log(`  [PREVIEW] Would create Reservation for Room ${room.roomNumber} (${stayDates.nights} nights, ${totalPrice}) and link to Booking ${booking._id}`);
      }

      createdCount++;
      processedCount++;
    }

    console.log(`\n=== MIGRATION SUMMARY ===`);
    console.log(`Processed: ${processedCount}`);
    console.log(`Newly Created & Linked: ${createdCount}`);
    console.log(`Relinked to Existing: ${relinkedCount}`);
    console.log(`Skipped / Corrupted: ${skippedCount}`);
    console.log(`Mode: ${isCommit ? "Committed to DB" : "Dry-run (no DB changes made)"}`);
    console.log(`=========================\n`);

  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  }
}

migrate();
