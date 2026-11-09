// backend/scripts/reset-test-data.js
const mongoose = require("mongoose");
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

async function reset() {
  await mongoose.connect(process.env.MONGO_URI);
  const Room = require("../models/Room");
  const Reservation = require("../models/Reservation");
  const Booking = require("../models/Booking");

  await Room.updateMany(
    { status: { $in: ["Reserved", "Occupied", "Cleaning"] } },
    { status: "Available", currentReservation: null }
  );

  await Reservation.deleteMany({ checkInDate: { $gte: new Date("2026-11-01") } });
  await Booking.deleteMany({ checkInDate: { $gte: new Date("2026-11-01") } });

  console.log("Reset room statuses and cleaned test reservations successfully.");
  await mongoose.disconnect();
}

reset();
