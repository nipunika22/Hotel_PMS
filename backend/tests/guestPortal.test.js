// backend/tests/guestPortal.test.js
const test = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");
require("dotenv").config();

const User = require("../models/User");
const Room = require("../models/Room");
const Reservation = require("../models/Reservation");
const Booking = require("../models/Booking");
const Guest = require("../models/Guest");

const BASE_URL = "http://localhost:5000/api";

test("Customer Guest Portal & Booking Flow Verification", async (t) => {
  await mongoose.connect(process.env.MONGO_URI);

  let customerToken = "";
  let adminToken = "";
  let testRoomId = "";
  let createdBookingId = "";

  // Helper to make API requests
  async function api(path, options = {}) {
    const url = `${BASE_URL}${path}`;
    const headers = { "Content-Type": "application/json", ...options.headers };
    const res = await fetch(url, { ...options, headers });
    let data;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { status: res.status, data };
  }

  // 1. Authenticate Customer
  await t.test("1. Login as customer", async () => {
    const res = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "customer@hotel.com", password: "password123" })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.role, "customer");
    customerToken = res.data.token;
    assert.ok(customerToken, "Customer token received");
  });

  // 2. Authenticate Admin
  await t.test("2. Login as admin", async () => {
    const res = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "admin@hotel.com", password: "admin123" })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.role, "admin");
    adminToken = res.data.token;
  });

  // 3. Customer can browse all available rooms without required query params
  await t.test("3. Customer browses available rooms", async () => {
    const res = await api("/rooms/available");
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data), "Available rooms should be an array");
    assert.ok(res.data.length > 0, "Should have at least 1 available room");
    // Pick the first available room for booking test
    testRoomId = res.data[0]._id;
    assert.ok(testRoomId, "Found room to test");
  });

  // 4. Customer can check availability for specific dates
  await t.test("4. Customer checks availability for specific future dates", async () => {
    const res = await api("/rooms/available?checkInDate=2026-11-01&checkOutDate=2026-11-04");
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data));
  });

  // 5. Customer can view sanitized room details
  await t.test("5. Customer views room details", async () => {
    const res = await api(`/rooms/${testRoomId}`, {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data._id, testRoomId);
    assert.strictEqual(res.data.currentReservation, undefined, "Customer must not see currentReservation internal reference");
    assert.strictEqual(res.data.maintenanceNotes, undefined, "Customer must not see maintenanceNotes");
  });

  // 6. Customer creates a booking
  await t.test("6. Customer completes a room reservation", async () => {
    const res = await api("/bookings", {
      method: "POST",
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        roomId: testRoomId,
        checkInDate: "2026-11-10",
        checkOutDate: "2026-11-12",
        numberOfGuests: 2,
        specialRequests: "Quiet room please",
        paymentMethod: "Cash"
      })
    });
    assert.strictEqual(res.status, 201, "Booking created successfully");
    assert.ok(res.data._id);
    assert.ok(res.data.reservationNumber, "Reservation number must be present");
    assert.strictEqual(res.data.bookingStatus, "confirmed");
    createdBookingId = res.data._id;

    // Verify canonical Reservation was created in DB
    const canonicalRes = await Reservation.findOne({ reservationNumber: res.data.reservationNumber });
    assert.ok(canonicalRes, "Canonical Reservation record must exist");
    assert.strictEqual(canonicalRes.bookingSource, "Hotel Website");
    assert.strictEqual(canonicalRes.status, "Confirmed");
  });

  // The backend must reject a second overlapping request even when the client saw the room as available.
  await t.test("6a. Overlapping customer reservation is rejected", async () => {
    const res = await api("/bookings", {
      method: "POST",
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        roomId: testRoomId,
        checkInDate: "2026-11-11",
        checkOutDate: "2026-11-13",
        numberOfGuests: 1
      })
    });
    assert.strictEqual(res.status, 409, JSON.stringify(res.data));
  });

  // Simultaneous concurrent requests for same room: exactly one must succeed, the other rejected with HTTP 409
  await t.test("6b. Concurrent booking race condition protection", async () => {
    let res1, res2;
    try {
      const concurrentRequests = [
        api("/bookings", {
          method: "POST",
          headers: { Authorization: `Bearer ${customerToken}` },
          body: JSON.stringify({
            roomId: testRoomId,
            checkInDate: "2026-11-20",
            checkOutDate: "2026-11-22",
            numberOfGuests: 1
          })
        }),
        api("/bookings", {
          method: "POST",
          headers: { Authorization: `Bearer ${customerToken}` },
          body: JSON.stringify({
            roomId: testRoomId,
            checkInDate: "2026-11-20",
            checkOutDate: "2026-11-22",
            numberOfGuests: 1
          })
        })
      ];

      [res1, res2] = await Promise.all(concurrentRequests);
      const statuses = [res1.status, res2.status].sort();
      assert.deepStrictEqual(statuses, [201, 409], "Exactly one concurrent booking succeeds and the other is rejected with 409");
    } finally {
      const successfulBooking = res1?.status === 201 ? res1.data : res2?.status === 201 ? res2.data : null;
      if (successfulBooking && successfulBooking._id) {
        await api(`/bookings/${successfulBooking._id}/cancel`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${customerToken}` }
        });
      }
    }
  });

  // 7. Customer views their own reservations in My Bookings
  await t.test("7. Customer views their reservations in My Bookings", async () => {
    const res = await api("/bookings/my-bookings", {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data));
    const found = res.data.find(b => b._id === createdBookingId);
    assert.ok(found, "Newly created booking must appear in customer bookings");
  });

  // 8. Customer cancels their reservation
  await t.test("8. Customer cancels their reservation", async () => {
    const res = await api(`/bookings/${createdBookingId}/cancel`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.booking.bookingStatus, "cancelled");

    // Verify canonical Reservation was updated to Cancelled
    const canonicalRes = await Reservation.findById(res.data.booking.reservation);
    assert.ok(canonicalRes);
    assert.strictEqual(canonicalRes.status, "Cancelled");

    // Verify Room status was restored to Available
    const room = await Room.findById(testRoomId);
    assert.strictEqual(room.status, "Available");
  });

  // 9. Customer cannot access internal management routes
  await t.test("9. Customer denied from internal management APIs", async () => {
    const resRooms = await api("/rooms", {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    assert.strictEqual(resRooms.status, 403, "Customer must not access GET /api/rooms");

    const resReservations = await api("/reservations", {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    assert.strictEqual(resReservations.status, 403, "Customer must not access GET /api/reservations");
  });

  await mongoose.disconnect();
});
