const mongoose = require("mongoose");
const RestaurantReservation = require("../models/RestaurantReservation");
const RestaurantTable = require("../models/RestaurantTable");

function conflict(message) {
  throw Object.assign(new Error(message), { statusCode: 409 });
}

async function seatReservation({ property, restaurant, reservationId, userId }) {
  return mongoose.connection.transaction(async session => {
    const reservation = await RestaurantReservation.findOne({
      _id: reservationId, property, restaurant,
      status: { $in: ["PENDING", "CONFIRMED"] }, arrivalStatus: "ARRIVED"
    }).session(session);
    if (!reservation) {
      const exists = await RestaurantReservation.exists({ _id: reservationId, property, restaurant }).session(session);
      if (!exists) throw Object.assign(new Error("Dining reservation not found"), { statusCode: 404 });
      conflict("Only an arrived, active reservation can be seated");
    }
    if (!reservation.table) conflict("This reservation has no assigned table");

    const table = await RestaurantTable.findOne({
      _id: reservation.table, property, restaurant, active: true,
      status: { $in: ["AVAILABLE", "RESERVED"] }
    }).session(session);
    if (!table) conflict("The assigned table is unavailable or belongs to another restaurant");

    const occupied = await RestaurantReservation.exists({
      _id: { $ne: reservation._id }, property, restaurant, table: table._id,
      status: "SEATED"
    }).session(session);
    if (occupied) conflict("The assigned table is occupied by another seated guest");

    const tableUpdate = await RestaurantTable.updateOne({
      _id: table._id, property, restaurant, active: true,
      status: { $in: ["AVAILABLE", "RESERVED"] }
    }, { $set: { status: "OCCUPIED" } }, { session });
    if (tableUpdate.modifiedCount !== 1) conflict("The assigned table was just occupied; refresh and retry");

    reservation.status = "SEATED";
    reservation.seatedAt = new Date();
    reservation.seatedBy = userId;
    await reservation.save({ session });
    return reservation;
  });
}

async function completeReservation({ property, reservationId }) {
  return mongoose.connection.transaction(async session => {
    const reservation = await RestaurantReservation.findOne({ _id: reservationId, property }).session(session);
    if (!reservation) return null;
    if (reservation.status !== "SEATED") return reservation;
    if (reservation.table) {
      const released = await RestaurantTable.updateOne({
        _id: reservation.table, property, restaurant: reservation.restaurant, status: "OCCUPIED"
      }, { $set: { status: "CLEANING" } }, { session });
      if (released.modifiedCount !== 1) conflict("The assigned table state changed; refresh before completing this reservation");
    }
    reservation.status = "COMPLETED";
    await reservation.save({ session });
    return reservation;
  });
}

module.exports = { seatReservation, completeReservation };
