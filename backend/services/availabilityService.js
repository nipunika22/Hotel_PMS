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

async function findConflict(roomId, checkIn, checkOut, excludeReservationId, session = null) {
  const reservationQuery = {
    room: roomId,
    status: { $in: ACTIVE_RESERVATION_STATUSES },
    checkInDate: { $lt: checkOut },
    checkOutDate: { $gt: checkIn }
  };
  if (excludeReservationId) reservationQuery._id = { $ne: excludeReservationId };

  let resQuery = Reservation.findOne(reservationQuery);
  if (session) resQuery = resQuery.session(session);
  const reservation = await resQuery.lean();
  if (reservation) return reservation;

  // Booking is a temporary compatibility record. Only records without a canonical
  // reservation are considered, preventing customer bookings from being double-counted.
  let bookQuery = Booking.findOne({
    room: roomId,
    reservation: { $exists: false },
    bookingStatus: { $in: ACTIVE_BOOKING_STATUSES },
    checkInDate: { $lt: checkOut },
    checkOutDate: { $gt: checkIn }
  });
  if (session) bookQuery = bookQuery.session(session);
  return bookQuery.lean();
}

async function assertAvailable({ room, roomId, checkInDate, checkOutDate, excludeReservationId }, session = null) {
  const dates = parseStayDates(checkInDate, checkOutDate);
  if (!room || (room._id && room._id.toString() !== roomId.toString())) {
    const error = new Error("Room not found");
    error.statusCode = 404;
    throw error;
  }
  const UNAVAILABLE_STATUSES = ["Maintenance", "Out of Order", "Cleaning"];
  if (!room.isActive || UNAVAILABLE_STATUSES.includes(room.status) || room.cleaningStatus === "Dirty") {
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

async function getAvailableRoomIds(checkInDate, checkOutDate, propertyId = null) {
  const dates = parseStayDates(checkInDate, checkOutDate);
  const resQuery = {
    status: { $in: ACTIVE_RESERVATION_STATUSES },
    checkInDate: { $lt: dates.checkOut },
    checkOutDate: { $gt: dates.checkIn }
  };
  const bookQuery = {
    reservation: { $exists: false },
    bookingStatus: { $in: ACTIVE_BOOKING_STATUSES },
    checkInDate: { $lt: dates.checkOut },
    checkOutDate: { $gt: dates.checkIn }
  };
  if (propertyId) {
    resQuery.property = propertyId;
    bookQuery.property = propertyId;
  }
  const [reservations, bookings] = await Promise.all([
    Reservation.find(resQuery).select("room").lean(),
    Booking.find(bookQuery).select("room").lean()
  ]);
  return [...new Set([...reservations, ...bookings].filter(item => item.room).map(item => item.room.toString()))];
}

module.exports = { ACTIVE_RESERVATION_STATUSES, parseStayDates, assertAvailable, getAvailableRoomIds };