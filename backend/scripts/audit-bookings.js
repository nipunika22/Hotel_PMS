// backend/scripts/audit-bookings.js
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const Reservation = require("../models/Reservation");
const User = require("../models/User");
const Room = require("../models/Room");
const Guest = require("../models/Guest");

async function audit() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB for audit.");

    const totalBookings = await Booking.countDocuments();
    const linkedBookings = await Booking.find({ reservation: { $exists: true, $ne: null } }).lean();
    const unlinkedBookings = await Booking.find({
      $or: [{ reservation: { $exists: false } }, { reservation: null }]
    }).populate("user").populate("room").lean();

    console.log(`\n=== BOOKING AUDIT SUMMARY ===`);
    console.log(`Total Booking records: ${totalBookings}`);
    console.log(`Linked Booking records: ${linkedBookings.length}`);
    console.log(`Unlinked Booking records: ${unlinkedBookings.length}`);

    // Verify linked bookings actually point to existing reservations
    let danglingBookings = 0;
    for (const b of linkedBookings) {
      const resExists = await Reservation.findById(b.reservation).lean();
      if (!resExists) {
        danglingBookings++;
        console.warn(`Booking ${b._id} references non-existent Reservation ${b.reservation}`);
      }
    }
    console.log(`Bookings referencing non-existent Reservations: ${danglingBookings}`);

    console.log(`\n=== UNLINKED BOOKINGS DETAILS ===`);
    let migratable = 0;
    let nonMigratable = 0;

    for (const b of unlinkedBookings) {
      const issues = [];
      if (!b.user) issues.push("Missing user");
      if (!b.room) issues.push("Missing room");
      if (!b.checkInDate || !b.checkOutDate) issues.push("Missing dates");
      if (b.checkInDate && b.checkOutDate && new Date(b.checkInDate) >= new Date(b.checkOutDate)) {
        issues.push("Invalid date range (checkIn >= checkOut)");
      }

      const isSafe = issues.length === 0;
      if (isSafe) migratable++;
      else nonMigratable++;

      console.log(`- Booking ID: ${b._id}`);
      console.log(`  User: ${b.user ? (b.user.name || b.user.email) : "MISSING"} (${b.user?._id})`);
      console.log(`  Room: ${b.room ? (b.room.roomNumber + ' - ' + b.room.roomType) : "MISSING"} (${b.room?._id})`);
      console.log(`  Dates: ${b.checkInDate?.toISOString?.() || b.checkInDate} -> ${b.checkOutDate?.toISOString?.() || b.checkOutDate}`);
      console.log(`  Status: ${b.bookingStatus}, Payment: ${b.paymentStatus}, Total: ${b.totalPrice}`);
      console.log(`  Migratable: ${isSafe ? "YES" : "NO - " + issues.join(", ")}`);
    }

    console.log(`\nMigratable: ${migratable}`);
    console.log(`Non-Migratable: ${nonMigratable}`);
    console.log(`==============================\n`);

  } catch (err) {
    console.error("Audit error:", err);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  }
}

audit();
