const Reservation = require("../models/Reservation");
const { parseStayDates, assertAvailable } = require("./availabilityService");

const ALLOWED_TRANSITIONS = {
  Draft: ["Confirmed", "Cancelled"],
  Inquiry: ["Confirmed", "Cancelled"],
  Confirmed: ["Checked-In", "Cancelled", "No-Show"],
  "Checked-In": ["Checked-Out"],
  "Checked-Out": [],
  Cancelled: [],
  "No-Show": []
};

function calculateCharges({ ratePerNight, nights, numberOfRooms = 1, taxAmount = 0, discountAmount = 0 }) {
  const rate = Number(ratePerNight);
  if (!Number.isFinite(rate) || rate < 0) {
    const error = new Error("A valid nightly rate is required");
    error.statusCode = 400;
    throw error;
  }
  const roomCharges = rate * nights * numberOfRooms;
  return { roomCharges, totalAmount: roomCharges + Number(taxAmount || 0) - Number(discountAmount || 0) };
}

async function generateReservationNumber(session = null) {
  const now = new Date();
  const yearMonth = now.getFullYear().toString().slice(-2) + (now.getMonth() + 1).toString().padStart(2, "0");
  const prefix = `RES${yearMonth}`;

  let latestQuery = Reservation.findOne({ reservationNumber: new RegExp(`^${prefix}`) }, "reservationNumber")
    .sort({ reservationNumber: -1 });
  if (session) latestQuery = latestQuery.session(session);
  const latest = await latestQuery.lean();

  let seq = 1;
  if (latest && latest.reservationNumber) {
    const parsed = parseInt(latest.reservationNumber.replace(prefix, ""), 10);
    if (!Number.isNaN(parsed)) {
      seq = parsed + 1;
    }
  }

  let candidate = `${prefix}${seq.toString().padStart(5, "0")}`;
  let existsQuery = Reservation.findOne({ reservationNumber: candidate }, "_id");
  if (session) existsQuery = existsQuery.session(session);
  while (await existsQuery.lean()) {
    seq++;
    candidate = `${prefix}${seq.toString().padStart(5, "0")}`;
    existsQuery = Reservation.findOne({ reservationNumber: candidate }, "_id");
    if (session) existsQuery = existsQuery.session(session);
  }
  return candidate;
}

async function createReservation(data, options = {}) {
  const session = options.session || null;
  const dates = parseStayDates(data.checkInDate, data.checkOutDate);
  const charges = calculateCharges({ ...data, nights: dates.nights });
  let propertyId = data.property;
  if (!propertyId) {
    if (data.room) {
      const Room = require("../models/Room");
      const r = await Room.findById(data.room).select("property").lean();
      if (r && r.property) propertyId = r.property;
    }
    if (!propertyId) {
      const { getActivePropertyId } = require("../middleware/propertyContext");
      propertyId = await getActivePropertyId();
    }
  }

  const reservationNumber = data.reservationNumber || (await generateReservationNumber(session));

  const reservation = new Reservation({
    ...data,
    property: propertyId,
    reservationNumber,
    checkInDate: dates.checkIn,
    checkOutDate: dates.checkOut,
    numberOfNights: dates.nights,
    ...charges,
    numberOfGuests: data.numberOfGuests || Number(data.numberOfAdults || 0) + Number(data.numberOfChildren || 0),
    status: data.status || "Confirmed"
  });
  await reservation.save({ session });
  return reservation;
}

function assertTransition(currentStatus, nextStatus) {
  if (!ALLOWED_TRANSITIONS[currentStatus] || !ALLOWED_TRANSITIONS[currentStatus].includes(nextStatus)) {
    const error = new Error(`Invalid reservation transition from ${currentStatus} to ${nextStatus}`);
    error.statusCode = 409;
    throw error;
  }
}

module.exports = {
  ALLOWED_TRANSITIONS,
  calculateCharges,
  generateReservationNumber,
  createReservation,
  assertTransition,
  assertAvailable
};