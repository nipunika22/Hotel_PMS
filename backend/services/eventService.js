// backend/services/eventService.js
const EventVenue = require("../models/EventVenue");
const Event = require("../models/Event");
const EventBooking = require("../models/EventBooking");
const { runWithOptionalTransaction } = require("../utils/transactionHelper");

// In-memory mutex for serializing concurrent booking / confirmation operations per venue
const venueLocks = new Map();

/**
 * Acquire in-memory lock for a venue to serialize concurrent booking/confirmation checks
 */
async function withVenueLock(venueId, fn) {
  if (!venueId) return fn();
  const key = venueId.toString();

  while (venueLocks.has(key)) {
    try {
      await venueLocks.get(key);
    } catch (e) {
      // previous lock error should not block next
    }
  }

  let release;
  const lockPromise = new Promise((resolve) => {
    release = resolve;
  });
  venueLocks.set(key, lockPromise);

  try {
    return await fn();
  } finally {
    venueLocks.delete(key);
    release();
  }
}

/**
 * Check if requested time window conflicts with existing confirmed bookings
 * Overlap condition: (existing.startTime < newEndTime) && (existing.endTime > newStartTime)
 */
async function checkVenueConflict({ propertyId, venueId, date, startTime, endTime, excludeBookingId = null }) {
  if (!venueId || !date || !startTime || !endTime) {
    return { hasConflict: false };
  }

  const query = {
    property: propertyId,
    venue: venueId,
    date: date,
    status: "CONFIRMED"
  };

  if (excludeBookingId) {
    query._id = { $ne: excludeBookingId };
  }

  const existingConfirmed = await EventBooking.find(query);

  const conflictingBooking = existingConfirmed.find((booking) => {
    return booking.startTime < endTime && booking.endTime > startTime;
  });

  if (conflictingBooking) {
    return {
      hasConflict: true,
      conflictingBooking: {
        id: conflictingBooking._id,
        confirmationNumber: conflictingBooking.confirmationNumber,
        date: conflictingBooking.date,
        startTime: conflictingBooking.startTime,
        endTime: conflictingBooking.endTime,
        customerName: conflictingBooking.customerName
      }
    };
  }

  return { hasConflict: false };
}

/**
 * Validates date is today or in future
 */
function isDateInFutureOrToday(dateStr) {
  if (!dateStr) return false;
  const target = new Date(`${dateStr}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return target >= today;
}

/**
 * Safe notification dispatcher (email or log)
 * Never throws or interrupts business workflows if email is not configured
 */
async function sendEventNotification({ type, booking, recipientEmail, details }) {
  try {
    console.log(`[EVENT_NOTIFICATION] Type: ${type} | Ref: ${booking?.confirmationNumber || "N/A"} | To: ${recipientEmail || booking?.email}`);
    // If SMTP is configured in environment, nodemailer can be used here.
    // If not configured, gracefully logs and succeeds.
    return { sent: true, mode: "logged" };
  } catch (err) {
    console.warn(`[EVENT_NOTIFICATION_NOTICE] Could not dispatch notification: ${err.message}`);
    return { sent: false, error: err.message };
  }
}

module.exports = {
  withVenueLock,
  checkVenueConflict,
  isDateInFutureOrToday,
  sendEventNotification
};
