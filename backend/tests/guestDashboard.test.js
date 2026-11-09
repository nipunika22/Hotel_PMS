// backend/tests/guestDashboard.test.js
/**
 * Automated Test Suite for Premium Guest Experience & Dashboard
 * Covers:
 * 1. Customer registration, login, and profile name availability
 * 2. Authorized customer bookings retrieval (getMyBookings)
 * 3. Empty state data verification (empty array for guests without bookings)
 * 4. Guest data ownership enforcement (cannot view other guests' bookings)
 * 5. Real dining and offers endpoint access
 * 6. RBAC enforcement: customer cannot access staff PMS endpoints
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

const app = require("../server");
const Property = require("../models/Property");
const Room = require("../models/Room");
const Restaurant = require("../models/Restaurant");
const RestaurantOffer = require("../models/RestaurantOffer");
const User = require("../models/User");
const Booking = require("../models/Booking");

let memServer = null;
let server = null;
let BASE_URL = "";

let testProperty = null;
let testRoom = null;
let customerAToken = "";
let customerAUser = null;
let customerBToken = "";
let customerBUser = null;
let customerABooking = null;

describe("PREMIUM GUEST EXPERIENCE & DASHBOARD TEST SUITE", () => {
  before(async () => {
    memServer = await MongoMemoryServer.create();
    await mongoose.connect(memServer.getUri());

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        BASE_URL = `http://127.0.0.1:${port}/api`;
        resolve();
      });
    });

    // 1. Seed pilot property
    testProperty = await Property.create({
      chain: new mongoose.Types.ObjectId(),
      name: "Sri Lanka Main Property",
      code: "SL-MAIN",
      country: "Sri Lanka",
      city: "Colombo",
      status: "Active"
    });

    // 2. Seed a test room
    testRoom = await Room.create({
      property: testProperty._id,
      roomNumber: "305",
      roomType: "Deluxe",
      floor: 3,
      basePrice: 150,
      capacity: { maxAdults: 2, maxOccupancy: 2 },
      bedConfiguration: "King Bed",
      status: "Available",
      cleaningStatus: "Clean",
      isActive: true
    });

    // 3. Seed restaurants and offers
    const rest = await Restaurant.create({
      property: testProperty._id,
      name: "Azure Tide Seafood Restaurant",
      slug: "azure-tide",
      cuisine: "Fine Seafood & Coastal Cuisine",
      restaurantType: "Fine Dining",
      location: "Level G",
      openingHours: "18:30 – 23:00",
      active: true
    });

    await RestaurantOffer.create({
      property: testProperty._id,
      restaurant: rest._id,
      title: "Seafood Sunset Experience",
      slug: "seafood-sunset-experience",
      shortDescription: "Sunset coastal dinner platter",
      description: "Celebrate twilight over the Indian Ocean with our celebrated coastal seafood platter.",
      discount: "Includes 2 Complimentary Sunset Cocktails",
      validFrom: new Date(Date.now() - 86400000),
      validUntil: new Date(Date.now() + 86400000 * 30),
      active: true
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (memServer) {
      await memServer.stop();
    }
  });

  it("1. Customer Registration returns real guest name and JWT token", async () => {
    const res = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Ananya Wickramasinghe",
        email: "ananya@serendib.com",
        phone: "+94 77 123 4567",
        password: "password123"
      })
    });
    const data = await res.json();
    assert.ok(res.status === 200 || res.status === 201, "Registration should return 200 or 201");
    assert.strictEqual(data.role, "customer");
    assert.strictEqual(data.name, "Ananya Wickramasinghe");
    assert.ok(data.token, "JWT token must be provided");
    customerAToken = data.token;
    customerAUser = data;
  });

  it("2. Customer Login verifies credentials and returns user details for personalized greeting", async () => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "ananya@serendib.com",
        password: "password123"
      })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.role, "customer");
    assert.strictEqual(data.name, "Ananya Wickramasinghe");
    assert.strictEqual(data.name.split(" ")[0], "Ananya", "First name extractable for Ayubowan welcome");
    assert.ok(data.token);
  });

  it("3. New guest with zero bookings receives empty array (triggering intended empty state)", async () => {
    const res = await fetch(`${BASE_URL}/bookings/my-bookings`, {
      headers: { Authorization: `Bearer ${customerAToken}` }
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(data));
    assert.strictEqual(data.length, 0, "Guest with no bookings has empty list");
  });

  it("4. Authenticated guest creates a reservation and retrieves it accurately in My Stays", async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
    const threeDays = new Date(Date.now() + 86400000 * 3).toISOString().split("T")[0];

    const createRes = await fetch(`${BASE_URL}/bookings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerAToken}`
      },
      body: JSON.stringify({
        roomId: testRoom._id.toString(),
        checkInDate: tomorrow,
        checkOutDate: threeDays,
        numberOfGuests: 2,
        paymentMethod: "Cash"
      })
    });
    const booking = await createRes.json();
    assert.strictEqual(createRes.status, 201);
    assert.strictEqual(booking.bookingStatus, "confirmed");
    customerABooking = booking;

    // Verify it appears in getMyBookings
    const getRes = await fetch(`${BASE_URL}/bookings/my-bookings`, {
      headers: { Authorization: `Bearer ${customerAToken}` }
    });
    const list = await getRes.json();
    assert.strictEqual(getRes.status, 200);
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].room.roomType, "Deluxe");
    assert.strictEqual(list[0].room.roomNumber, "305");
  });

  it("5. Guest Data Isolation: Customer B cannot view Customer A's booking", async () => {
    // Register Customer B
    const regRes = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Rohan Silva",
        email: "rohan@serendib.com",
        phone: "+94 77 987 6543",
        password: "password123"
      })
    });
    const regData = await regRes.json();
    customerBToken = regData.token;

    // Customer B requests their own bookings -> should be empty
    const bBookingsRes = await fetch(`${BASE_URL}/bookings/my-bookings`, {
      headers: { Authorization: `Bearer ${customerBToken}` }
    });
    const bBookings = await bBookingsRes.json();
    assert.strictEqual(bBookings.length, 0, "Customer B cannot see Customer A's bookings");

    // Customer B attempts to directly access Customer A's booking by ID
    const directRes = await fetch(`${BASE_URL}/bookings/${customerABooking._id}`, {
      headers: { Authorization: `Bearer ${customerBToken}` }
    });
    assert.strictEqual(directRes.status, 403, "Direct access to another guest's booking must return 403 Forbidden");
  });

  it("6. Real dining and offers data endpoints are accessible to guests", async () => {
    const restRes = await fetch(`${BASE_URL}/restaurants`);
    const restData = await restRes.json();
    assert.strictEqual(restRes.status, 200);
    assert.ok(restData.success);
    assert.ok(restData.data.length >= 1);
    assert.strictEqual(restData.data[0].name, "Azure Tide Seafood Restaurant");

    const offerRes = await fetch(`${BASE_URL}/restaurants/${restData.data[0]._id}/offers`);
    const offerData = await offerRes.json();
    assert.strictEqual(offerRes.status, 200);
    assert.ok(offerData.success);
    assert.ok(offerData.data.length >= 1);
    assert.strictEqual(offerData.data[0].title, "Seafood Sunset Experience");
  });

  it("7. Customer RBAC: Authenticated customer cannot access internal staff PMS endpoints", async () => {
    const adminRes = await fetch(`${BASE_URL}/reservations/dashboard-stats`, {
      headers: { Authorization: `Bearer ${customerAToken}` }
    });
    assert.strictEqual(adminRes.status, 403, "Customer token cannot access staff PMS dashboard stats");
  });
});
