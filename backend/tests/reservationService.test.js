const test = require("node:test");
const assert = require("node:assert/strict");
const { parseStayDates } = require("../services/availabilityService");
const { ALLOWED_TRANSITIONS, assertTransition, calculateCharges } = require("../services/reservationService");

test("availability uses half-open stays so checkout date can be reused", () => {
  const dates = parseStayDates("2026-10-15", "2026-10-18");
  assert.equal(dates.nights, 3);
  assert.ok(dates.checkIn < dates.checkOut);
});

test("server-side pricing calculates the final amount", () => {
  assert.deepEqual(calculateCharges({ ratePerNight: 100, nights: 3, taxAmount: 15, discountAmount: 5 }), {
    roomCharges: 300,
    totalAmount: 310
  });
});

test("reservation lifecycle accepts only supported transitions", () => {
  assert.deepEqual(ALLOWED_TRANSITIONS.Confirmed, ["Checked-In", "Cancelled", "No-Show"]);
  assert.doesNotThrow(() => assertTransition("Confirmed", "Checked-In"));
  assert.doesNotThrow(() => assertTransition("Checked-In", "Checked-Out"));
  assert.throws(() => assertTransition("Checked-Out", "Confirmed"), { statusCode: 409 });
  assert.throws(() => assertTransition("Cancelled", "Checked-In"), { statusCode: 409 });
});