const Reservation = require("../models/Reservation");
const Booking = require("../models/Booking");

const ACTIVE_RESERVATION_STATUSES = ["Draft", "Inquiry", "Confirmed", "Checked-In"];
const ACTIVE_BOOKING_STATUSES = ["confirmed", "checked-in"];

function parseStayDates(checkInDate, checkOutDate) {
  const checkIn = new Date(checkInDate);
  const checkOut = new Date(checkOutDate);

  if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime()) || checkIn >= checkOut) {
    const error = new Error("Check-out date must be after check-in date");
    error.statusCode = 400;
    throw error;
  }

  return { checkIn, checkOut, nights: Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24)) };
}

function stayConflict(statusField, checkedInStatus, activeStatuses, checkIn, checkOut) {
  if (!checkIn || !checkOut) return { [statusField]: checkedInStatus };
  return {
    $or: [
      { [statusField]: checkedInStatus },
      {
        [statusField]: { $in: activeStatuses },
        checkInDate: { $lt: checkOut },
        checkOutDate: { $gt: checkIn }
      }
    ]
  };
}

function reservationConflict(checkIn, checkOut) {
  return stayConflict("status", "Checked-In", ACTIVE_RESERVATION_STATUSES, checkIn, checkOut);
}

function legacyBookingConflict(checkIn, checkOut) {
  // Bookings with a canonical reservation are already covered by the reservation query.
  return {
    reservation: null,
    ...stayConflict("bookingStatus", "checked-in", ACTIVE_BOOKING_STATUSES, checkIn, checkOut)
  };
}

function findCheckedInLegacyBooking(roomId, session) {
  return Booking.exists({ room: roomId, ...legacyBookingConflict() }).session(session);
}

async function findConflict(roomId, checkIn, checkOut, excludeReservationId, session) {
  const reservationQuery = { room: roomId, ...reservationConflict(checkIn, checkOut) };
  if (excludeReservationId) reservationQuery._id = { $ne: excludeReservationId };

  const reservation = await Reservation.exists(reservationQuery).session(session);
  return reservation || Booking.exists({ room: roomId, ...legacyBookingConflict(checkIn, checkOut) }).session(session);
}

async function assertAvailable({ room, roomId, checkInDate, checkOutDate, excludeReservationId }, session = null) {
  const dates = parseStayDates(checkInDate, checkOutDate);
  if (!room || (room._id && room._id.toString() !== roomId.toString())) {
    const error = new Error("Room not found");
    error.statusCode = 404;
    throw error;
  }
  const UNAVAILABLE_STATUSES = ["Maintenance", "Out of Order", "Occupied", "Cleaning"];
  if (!room.isActive || UNAVAILABLE_STATUSES.includes(room.status) || ["Dirty", "Pickup"].includes(room.cleaningStatus)) {
    const error = new Error("Room is not available for booking");
    error.statusCode = 409;
    throw error;
  }

  const conflict = await findConflict(roomId, dates.checkIn, dates.checkOut, excludeReservationId, session);
  if (conflict) {
    const error = new Error("Room is not available for selected dates");
    error.statusCode = 409;
    throw error;
  }
  return dates;
}

async function getUnavailableRoomIds(checkIn, checkOut, propertyId = null) {
  const scope = propertyId ? { property: { $in: [propertyId, null] } } : {};
  const [reservationRooms, bookingRooms] = await Promise.all([
    Reservation.distinct("room", { ...scope, ...reservationConflict(checkIn, checkOut) }),
    Booking.distinct("room", { ...scope, ...legacyBookingConflict(checkIn, checkOut) })
  ]);
  return [...new Set([...reservationRooms, ...bookingRooms].filter(Boolean).map(String))];
}

module.exports = { ACTIVE_RESERVATION_STATUSES, parseStayDates, assertAvailable, getUnavailableRoomIds, findCheckedInLegacyBooking };
