// backend/tests/step3Verification.test.js
const test = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const Room = require("../models/Room");
const Reservation = require("../models/Reservation");
const Booking = require("../models/Booking");
const Guest = require("../models/Guest");
const connectDB = require("../config/db");

const BASE_URL = "http://localhost:5000/api";

test("Step 3 End-to-End PMS & Portal Verification Suite", async (t) => {
  await connectDB();

  let customerToken = "";
  let adminToken = "";
  let testRoom = null;
  let customerBooking = null;
  let staffReservation = null;

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

  // 1. Customer login
  await t.test("1. Customer login", async () => {
    const res = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "customer@hotel.com", password: "password123" })
    });
    assert.strictEqual(res.status, 200, "Customer login must return 200");
    assert.strictEqual(res.data.role, "customer", "Role must be customer");
    assert.ok(res.data.token, "JWT token must be present");
    customerToken = res.data.token;
  });

  // 2. Customer hotel portal / Available rooms
  await t.test("2. Customer hotel portal & room listing", async () => {
    const res = await api("/rooms/available");
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data), "Available rooms must be an array");
    assert.ok(res.data.length > 0, "At least one room must be available");
    // Pick Room 201 or last room so it does not collide with guestPortal test room (Room 101)
    testRoom = res.data.find(r => r.roomNumber === "201") || res.data[res.data.length - 1];
    assert.ok(testRoom.roomNumber);
    assert.ok(testRoom.basePrice || testRoom.price);
  });

  // 3. Room availability query for specific stay dates
  await t.test("3. Room availability with date filters", async () => {
    const res = await api("/rooms/available?checkInDate=2026-12-10&checkOutDate=2026-12-12");
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data));
  });

  // 4. Customer reservation
  await t.test("4. Customer completes reservation", async () => {
    const res = await api("/bookings", {
      method: "POST",
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        roomId: testRoom._id,
        checkInDate: "2026-12-15",
        checkOutDate: "2026-12-17",
        numberOfGuests: 2,
        specialRequests: "High floor",
        paymentMethod: "Cash"
      })
    });
    assert.strictEqual(res.status, 201, "Booking should be created");
    assert.ok(res.data._id);
    assert.ok(res.data.reservationNumber);
    assert.strictEqual(res.data.bookingStatus, "confirmed");
    customerBooking = res.data;

    // Check database canonical record
    const canonical = await Reservation.findById(customerBooking.reservation);
    assert.ok(canonical, "Linked canonical reservation exists");
    assert.strictEqual(canonical.status, "Confirmed");
    assert.strictEqual(canonical.bookingSource, "Hotel Website");
  });

  // 5. My Reservations
  await t.test("5. View My Reservations", async () => {
    const res = await api("/bookings/my-bookings", {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data));
    const found = res.data.find(b => b._id === customerBooking._id);
    assert.ok(found, "Newly booked reservation must appear in My Bookings");
    assert.strictEqual(found.reservationNumber, customerBooking.reservationNumber);
  });

  // 6. Double booking rejection
  await t.test("6. Double booking rejection for overlapping stay", async () => {
    const res = await api("/bookings", {
      method: "POST",
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        roomId: testRoom._id,
        checkInDate: "2026-12-16",
        checkOutDate: "2026-12-18",
        numberOfGuests: 1
      })
    });
    assert.strictEqual(res.status, 409, "Must return HTTP 409 conflict");
    assert.ok(res.data.error.includes("not available"));
  });

  // 7. Customer cancellation
  await t.test("7. Customer self-service cancellation", async () => {
    const res = await api(`/bookings/${customerBooking._id}/cancel`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.booking.bookingStatus, "cancelled");

    const canonical = await Reservation.findById(customerBooking.reservation);
    assert.strictEqual(canonical.status, "Cancelled");
  });

  // 8. Customer denied from staff reservation APIs
  await t.test("8. Customer cannot access staff reservation APIs", async () => {
    const res1 = await api("/reservations", {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    assert.strictEqual(res1.status, 403, "GET /api/reservations must be forbidden to customer");

    const res2 = await api("/reservations", {
      method: "POST",
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ guestId: "invalid" })
    });
    assert.strictEqual(res2.status, 403, "POST /api/reservations must be forbidden to customer");

    const res3 = await api(`/reservations/${customerBooking.reservation}/check-in`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    assert.strictEqual(res3.status, 403, "Check-in endpoint must be forbidden to customer");
  });

  // 9. Staff Login
  await t.test("9. Admin / Staff login", async () => {
    const res = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "admin@hotel.com", password: "admin123" })
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.role, "admin");
    adminToken = res.data.token;
  });

  // 10. Staff creates reservation
  let createdGuest = null;
  await t.test("10. Staff reservation creation", async () => {
    // Find or create test guest
    createdGuest = await Guest.findOne({ email: "teststaffguest@hotel.com" });
    if (!createdGuest) {
      createdGuest = await Guest.create({
        firstName: "StaffTest",
        lastName: "Guest",
        email: "teststaffguest@hotel.com",
        phone: "+91 9999988888",
        nationalIdType: "Passport",
        nationalIdNumber: "P12345678",
        nationality: "Resident"
      });
    }

    const rate = Number(testRoom.basePrice || testRoom.price || 100);
    const totalAmount = rate * 3; // 3 nights

    const res = await api("/reservations", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        guestId: createdGuest._id,
        roomId: testRoom._id,
        bookingSource: "Walk-in",
        checkInDate: "2026-12-25",
        checkOutDate: "2026-12-28",
        numberOfAdults: 2,
        numberOfChildren: 0,
        roomType: testRoom.roomType,
        numberOfRooms: 1,
        ratePerNight: rate,
        advancePayment: totalAmount // Fully paid so checkout balanceDue is 0
      })
    });

    assert.strictEqual(res.status, 201, "Staff reservation created successfully");
    assert.ok(res.data._id);
    assert.strictEqual(res.data.status, "Confirmed");
    staffReservation = res.data;
  });

  // 11. Check-in
  await t.test("11. Staff check-in", async () => {
    const res = await api(`/reservations/${staffReservation._id}/check-in`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ actualCheckInDate: new Date() })
    });
    assert.strictEqual(res.status, 200, "Check-in should succeed");
    assert.strictEqual(res.data.status, "Checked-In");

    // Room should now be Occupied
    const room = await Room.findById(testRoom._id);
    assert.strictEqual(room.status, "Occupied");
  });

  // 12. Check-out
  await t.test("12. Staff check-out with invoice auto-generation", async () => {
    const res = await api(`/reservations/${staffReservation._id}/check-out`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ actualCheckOutDate: new Date() })
    });
    assert.strictEqual(res.status, 200, "Check-out should succeed");
    assert.strictEqual(res.data.reservation.status, "Checked-Out");

    // Room status should now be Cleaning
    const room = await Room.findById(testRoom._id);
    assert.strictEqual(room.status, "Cleaning");

    // Reset room back to Available for cleanliness
    await Room.findByIdAndUpdate(testRoom._id, { status: "Available", cleaningStatus: "Clean", currentReservation: null });
  });

  // 13. No-Show flow
  await t.test("13. No-Show terminal state transition", async () => {
    const noShowRes = await api("/reservations", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        guestId: createdGuest._id,
        roomId: testRoom._id,
        bookingSource: "Walk-in",
        checkInDate: "2026-12-30",
        checkOutDate: "2026-12-31",
        numberOfAdults: 1,
        numberOfChildren: 0,
        roomType: testRoom.roomType,
        numberOfRooms: 1,
        ratePerNight: Number(testRoom.basePrice || testRoom.price || 100)
      })
    });
    assert.strictEqual(noShowRes.status, 201);
    const resId = noShowRes.data._id;

    // Mark as No-Show
    const markRes = await api(`/reservations/${resId}/no-show`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(markRes.status, 200);
    assert.strictEqual(markRes.data.status, "No-Show");

    // Room released
    const room = await Room.findById(testRoom._id);
    assert.strictEqual(room.status, "Available");
  });

  // Cleanup test reservations
  await Reservation.deleteMany({ _id: { $in: [customerBooking?.reservation, staffReservation?._id] } });
  await Booking.deleteMany({ _id: customerBooking?._id });

  await mongoose.disconnect();
});
