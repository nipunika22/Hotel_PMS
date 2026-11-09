// backend/tests/restaurant.test.js
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
process.env.USE_IN_MEMORY_DB = "true";
process.env.MONGOMS_DOWNLOAD_DIR = "D:\\mongodb-binaries";

const connectDB = require("../config/db");
const app = require("../server");
const HotelChain = require("../models/HotelChain");
const Property = require("../models/Property");
const User = require("../models/User");
const Guest = require("../models/Guest");
const Room = require("../models/Room");
const Reservation = require("../models/Reservation");
const GuestExpense = require("../models/GuestExpense");

const Restaurant = require("../models/Restaurant");
const RestaurantTable = require("../models/RestaurantTable");
const RestaurantMenuCategory = require("../models/RestaurantMenuCategory");
const RestaurantMenuItem = require("../models/RestaurantMenuItem");
const RestaurantBuffet = require("../models/RestaurantBuffet");
const RestaurantOffer = require("../models/RestaurantOffer");
const RestaurantReservation = require("../models/RestaurantReservation");

let server = null;
let BASE_URL = "";

let chainId = null;
let propAId = null;
let propBId = null;

let adminToken = null;
let propAStaffToken = null;
let propBStaffToken = null;
let customerToken = null;

let sampleHotelReservationId = null;

describe("RESTAURANT EXPERIENCE MODULE — Automated Comprehensive Test Suite", () => {
  before(async () => {
    // 1. Connect DB safely
    if (mongoose.connection.readyState !== 1) {
      await connectDB();
    }

    // 2. Start ephemeral test server
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        BASE_URL = `http://127.0.0.1:${port}/api`;
        resolve();
      });
    });

    // 3. Ensure HotelChain exists
    let chain = await HotelChain.findOne({ code: "GHHG" });
    if (!chain) {
      chain = await HotelChain.create({
        name: "Grand Horizon Hospitality Group",
        code: "GHHG",
        status: "Active"
      });
    }
    chainId = chain._id;

    // 4. Ensure Property A (SL-MAIN)
    let propA = await Property.findOne({ code: "SL-MAIN" });
    if (!propA) {
      propA = await Property.create({
        chain: chainId,
        name: "Serendib Sanctuary Colombo",
        code: "SL-MAIN",
        country: "Sri Lanka",
        countryCode: "LK",
        city: "Colombo",
        currency: "LKR",
        status: "Active"
      });
    }
    propAId = propA._id;

    // 5. Create Property B for cross-property tests
    let propB = await Property.findOne({ code: "REST-PROP-B" });
    if (!propB) {
      propB = await Property.create({
        chain: chainId,
        name: "Serendib Hill Sanctuary",
        code: "REST-PROP-B",
        country: "Sri Lanka",
        countryCode: "LK",
        city: "Kandy",
        currency: "LKR",
        status: "Active"
      });
    }
    propBId = propB._id;

    // 6. Create Tokens
    const adminUser = await User.create({
      name: "Chain Admin",
      email: `admin_${Date.now()}@hotel.com`,
      password: "Password123!",
      phone: "0771234561",
      role: "admin"
    });
    adminToken = jwt.sign({ id: adminUser._id }, process.env.JWT_SECRET, { expiresIn: "1d" });

    const staffA = await User.create({
      name: "Staff Property A",
      email: `staffa_${Date.now()}@hotel.com`,
      password: "Password123!",
      phone: "0771234562",
      role: "staff",
      property: propAId,
      allowedProperties: [propAId]
    });
    propAStaffToken = jwt.sign({ id: staffA._id }, process.env.JWT_SECRET, { expiresIn: "1d" });

    const staffB = await User.create({
      name: "Staff Property B",
      email: `staffb_${Date.now()}@hotel.com`,
      password: "Password123!",
      phone: "0771234563",
      role: "staff",
      property: propBId,
      allowedProperties: [propBId]
    });
    propBStaffToken = jwt.sign({ id: staffB._id }, process.env.JWT_SECRET, { expiresIn: "1d" });

    const customerUser = await User.create({
      name: "Test Dining Guest",
      email: `guest_${Date.now()}@customer.com`,
      password: "Password123!",
      phone: "0771234564",
      role: "customer"
    });
    customerToken = jwt.sign({ id: customerUser._id }, process.env.JWT_SECRET, { expiresIn: "1d" });

    // 7. Seed an active hotel room reservation in Property A to test Hotel Guest folio linking
    const testGuest = await Guest.create({
      property: propAId,
      firstName: "Arthur",
      lastName: "Pendelton",
      email: "arthur.pendelton@example.com",
      phone: "+94 77 987 6543",
      nationalIdType: "Passport",
      nationalIdNumber: "PASS987654",
      nationality: "British",
      guestType: "VIP"
    });

    const testRoom = await Room.create({
      property: propAId,
      roomNumber: `R-TEST-${Date.now().toString().slice(-4)}`,
      roomType: "Suite",
      floor: 3,
      basePrice: 200,
      capacity: { maxAdults: 2, maxChildren: 1, maxOccupancy: 3 },
      bedConfiguration: "King Bed",
      view: "Sea View",
      status: "Occupied"
    });

    const hotelRes = await Reservation.create({
      property: propAId,
      reservationNumber: `RES-TEST-${Date.now().toString().slice(-5)}`,
      guest: testGuest._id,
      room: testRoom._id,
      bookingSource: "Hotel Website",
      checkInDate: new Date(),
      checkOutDate: new Date(Date.now() + 3 * 86400000),
      numberOfAdults: 2,
      roomType: "Suite",
      ratePerNight: 200,
      numberOfNights: 3,
      roomCharges: 600,
      totalAmount: 600,
      status: "Checked-In",
      numberOfGuests: 2,
      createdBy: adminUser._id
    });
    sampleHotelReservationId = hotelRes._id;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // =========================================================================
  // TEST CASES
  // =========================================================================

  it("1. Restaurant belongs to property and seeded records exist for Property A", async () => {
    const azureTide = await Restaurant.findOne({ property: propAId, slug: "azure-tide" });
    assert.ok(azureTide, "Azure Tide Seafood Restaurant should exist in Property A");
    assert.strictEqual(azureTide.property.toString(), propAId.toString(), "Azure Tide property must match Property A");

    const spiceSilk = await Restaurant.findOne({ property: propAId, slug: "spice-and-silk" });
    assert.ok(spiceSilk, "Spice & Silk All-Day Dining should exist in Property A");
    assert.strictEqual(spiceSilk.property.toString(), propAId.toString(), "Spice & Silk property must match Property A");
  });

  it("2. Customer can view active restaurants via GET /api/restaurants", async () => {
    const res = await fetch(`${BASE_URL}/restaurants`, {
      headers: { "x-property-id": propAId.toString() }
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.length >= 2, "Should return at least Azure Tide and Spice & Silk");

    const slugs = body.data.map((r) => r.slug);
    assert.ok(slugs.includes("azure-tide"));
    assert.ok(slugs.includes("spice-and-silk"));
  });

  it("3. Customer can view restaurant detail and menu items via GET /api/restaurants/:slug", async () => {
    const res = await fetch(`${BASE_URL}/restaurants/azure-tide`, {
      headers: { "x-property-id": propAId.toString() }
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.slug, "azure-tide");
    assert.ok(Array.isArray(body.data.menuCategories), "Should include menu categories");
    assert.ok(body.data.menuCategories.length > 0, "Should have menu categories");

    const starterCat = body.data.menuCategories.find((c) => c.name.includes("STARTERS"));
    assert.ok(starterCat, "STARTERS category should be returned");
    assert.ok(Array.isArray(starterCat.items), "Category items should be populated");
    assert.ok(starterCat.items.length > 0, "STARTERS should have items");
  });

  it("4. Customer can view buffet sessions for Spice & Silk", async () => {
    const res = await fetch(`${BASE_URL}/restaurants/spice-and-silk`, {
      headers: { "x-property-id": propAId.toString() }
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(Array.isArray(body.data.buffets), "Buffets array must be present");
    assert.ok(body.data.buffets.length >= 3, "Should have Breakfast, Lunch, and Dinner buffets");

    const dinnerBuffet = body.data.buffets.find((b) => b.mealPeriod === "Dinner");
    assert.ok(dinnerBuffet, "International Dinner Buffet must exist");
    assert.ok(dinnerBuffet.adultPrice > 0, "Adult buffet price must be positive");
    assert.ok(dinnerBuffet.childPrice > 0, "Child buffet price must be positive");
  });

  it("5. Customer can view active restaurant offers and inclusions", async () => {
    const res = await fetch(`${BASE_URL}/restaurants/azure-tide/offers`, {
      headers: { "x-property-id": propAId.toString() }
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.length >= 1, "Should have at least 1 offer");

    const sunsetOffer = body.data.find((o) => o.slug === "seafood-sunset-experience");
    assert.ok(sunsetOffer, "Seafood Sunset Experience offer must exist");
    assert.ok(Array.isArray(sunsetOffer.inclusions) && sunsetOffer.inclusions.length > 0, "Inclusions checklist must exist");
  });

  it("6. External customer can reserve a table without hotel reservation", async () => {
    const azureTide = await Restaurant.findOne({ property: propAId, slug: "azure-tide" });
    const payload = {
      guestType: "Outside Guest",
      customerName: "Jane Doe",
      email: "jane.doe@example.com",
      phone: "+94 77 111 2233",
      date: "2026-10-15",
      time: "19:00",
      guestCount: 2,
      seatingPreference: "Window",
      diningType: "À la carte",
      occasion: "Anniversary",
      specialRequests: "Quiet table by the ocean window please"
    };

    const res = await fetch(`${BASE_URL}/restaurants/${azureTide._id}/reservations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-property-id": propAId.toString()
      },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(body.data.confirmationNumber.startsWith("RST-"), "Confirmation number must have RST- prefix");
    assert.strictEqual(body.data.customerName, "Jane Doe");
    assert.strictEqual(body.data.guestType, "Outside Guest");
    assert.strictEqual(body.data.status, "CONFIRMED");
  });

  it("7. Hotel guest can reserve a table with linked hotel reservation reference", async () => {
    const spiceSilk = await Restaurant.findOne({ property: propAId, slug: "spice-and-silk" });
    const payload = {
      guestType: "Hotel Guest",
      hotelReservationId: sampleHotelReservationId.toString(),
      customerName: "Arthur Pendelton",
      email: "arthur.pendelton@example.com",
      phone: "+94 77 987 6543",
      date: "2026-10-16",
      time: "20:00",
      guestCount: 4,
      seatingPreference: "Indoor",
      diningType: "Buffet",
      occasion: "Casual Dining"
    };

    const res = await fetch(`${BASE_URL}/restaurants/${spiceSilk._id}/reservations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-property-id": propAId.toString()
      },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.guestType, "Hotel Guest");
    assert.ok(body.data.hotelReservation, "Hotel reservation must be linked");
  });

  it("8. Invalid restaurant / property combination is rejected", async () => {
    const azureTidePropA = await Restaurant.findOne({ property: propAId, slug: "azure-tide" });
    const payload = {
      customerName: "Intruder Guest",
      email: "intruder@example.com",
      phone: "+94 77 000 0000",
      date: "2026-10-20",
      time: "19:00",
      guestCount: 2
    };

    // Attempt to access Property A's restaurant using Property B's context
    const res = await fetch(`${BASE_URL}/restaurants/${azureTidePropA._id}/reservations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-property-id": propBId.toString()
      },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(res.status, 404, "Must return 404 for cross-property restaurant reservation attempt");
  });

  it("9. Table capacity validation: rejects negative or zero guests", async () => {
    const azureTide = await Restaurant.findOne({ property: propAId, slug: "azure-tide" });
    const payload = {
      customerName: "Invalid Guest",
      email: "invalid@example.com",
      phone: "+94 77 123 4567",
      date: "2026-10-22",
      time: "19:00",
      guestCount: 0
    };

    const res = await fetch(`${BASE_URL}/restaurants/${azureTide._id}/reservations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-property-id": propAId.toString()
      },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes("guest count") || body.error.includes("guestCount"));
  });

  it("10. Reservation conflict prevention: prevents conflicting double booking on same table", async () => {
    const azureTide = await Restaurant.findOne({ property: propAId, slug: "azure-tide" });
    
    // Create Table for test with unique location
    const testTable = await RestaurantTable.create({
      property: propAId,
      restaurant: azureTide._id,
      tableNumber: "TEST-CONFLICT-01",
      capacity: 2,
      location: "Bar Counter",
      status: "AVAILABLE"
    });

    // Create First Reservation
    await RestaurantReservation.create({
      property: propAId,
      restaurant: azureTide._id,
      table: testTable._id,
      confirmationNumber: `RST-CONF-1-${Date.now()}`,
      customerName: "Party 1",
      email: "party1@example.com",
      phone: "+94 77 111 1111",
      date: "2026-10-25",
      time: "19:30",
      guestCount: 2,
      seatingPreference: "Bar Counter",
      status: "CONFIRMED"
    });

    // Check availability query for conflicting time window (+/- 90 mins)
    const availRes = await fetch(
      `${BASE_URL}/restaurants/${azureTide._id}/availability?date=2026-10-25&time=19:45&guestCount=2&seatingPreference=Bar Counter`,
      { headers: { "x-property-id": propAId.toString() } }
    );
    assert.strictEqual(availRes.status, 200);
    const availBody = await availRes.json();
    assert.strictEqual(availBody.availableTablesCount, 0, "No table should be free in Bar Counter at conflicting time");
  });

  it("11. Guest or staff can cancel a reservation", async () => {
    const azureTide = await Restaurant.findOne({ property: propAId, slug: "azure-tide" });
    const reservation = await RestaurantReservation.create({
      property: propAId,
      restaurant: azureTide._id,
      confirmationNumber: `RST-CANCEL-TEST-${Date.now()}`,
      customerName: "Cancel Guest",
      email: "cancel@example.com",
      phone: "+94 77 999 8888",
      date: "2026-10-28",
      time: "18:30",
      guestCount: 2,
      status: "CONFIRMED"
    });

    const res = await fetch(`${BASE_URL}/restaurants/reservations/${reservation.confirmationNumber}/cancel`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-property-id": propAId.toString()
      },
      body: JSON.stringify({ reason: "Change of travel plans" })
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.data.status, "CANCELLED");
    assert.strictEqual(body.data.cancellationReason, "Change of travel plans");
  });

  it("12. Admin / Staff can access dashboard statistics via /api/restaurants/admin/dashboard-stats", async () => {
    const res = await fetch(`${BASE_URL}/restaurants/admin/dashboard-stats`, {
      headers: {
        Authorization: `Bearer ${propAStaffToken}`,
        "x-property-id": propAId.toString()
      }
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(typeof body.data.todayReservationsCount === "number");
    assert.ok(typeof body.data.todayCovers === "number");
    assert.ok(typeof body.data.availableTables === "number");
    assert.ok(typeof body.data.upcomingBuffets === "number");
    assert.ok(typeof body.data.activeOffers === "number");
  });

  it("13. Unauthorized customer cannot perform admin operations", async () => {
    const payload = {
      name: "Rogue Bistro",
      cuisine: "Fast Food",
      location: "Basement",
      openingHours: "24/7"
    };

    const res = await fetch(`${BASE_URL}/restaurants/admin/restaurants`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken}`,
        "x-property-id": propAId.toString()
      },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(res.status, 403, "Customer role must be forbidden from admin restaurant endpoints");
  });

  it("14. Admin can create, update, and manage a restaurant", async () => {
    // Create
    const createRes = await fetch(`${BASE_URL}/restaurants/admin/restaurants`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
        "x-property-id": propAId.toString()
      },
      body: JSON.stringify({
        name: "Sunset Beach Bar & Grill",
        cuisine: "Tropical Bar & Embers",
        restaurantType: "Bar & Grill",
        location: "Lagoon Deck",
        openingHours: "16:00 – 00:00"
      })
    });

    assert.strictEqual(createRes.status, 201);
    const created = await createRes.json();
    const createdId = created.data._id;
    assert.strictEqual(created.data.slug, "sunset-beach-bar-grill");

    // Update
    const updateRes = await fetch(`${BASE_URL}/restaurants/admin/restaurants/${createdId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
        "x-property-id": propAId.toString()
      },
      body: JSON.stringify({
        tagline: "Sunset sips and wood-fired skewers"
      })
    });
    assert.strictEqual(updateRes.status, 200);
    const updated = await updateRes.json();
    assert.strictEqual(updated.data.tagline, "Sunset sips and wood-fired skewers");

    // Clean up
    await Restaurant.findByIdAndDelete(createdId);
  });

  it("15. Property Isolation: Restaurant data does not leak between Property A and Property B", async () => {
    // Seed one restaurant in Property B
    const propBRestaurant = await Restaurant.create({
      property: propBId,
      name: "Highland Spice Tea Lounge",
      slug: "highland-spice",
      cuisine: "Ceylon Tea & Pastries",
      location: "Misty Mountain Verandah",
      openingHours: "07:00 – 19:00"
    });

    // Query Property A
    const resA = await fetch(`${BASE_URL}/restaurants`, {
      headers: { "x-property-id": propAId.toString() }
    });
    const bodyA = await resA.json();
    const propASlugs = bodyA.data.map((r) => r.slug);
    assert.ok(!propASlugs.includes("highland-spice"), "Property B restaurant MUST NOT appear in Property A list");

    // Query Property B
    const resB = await fetch(`${BASE_URL}/restaurants`, {
      headers: { "x-property-id": propBId.toString() }
    });
    const bodyB = await resB.json();
    const propBSlugs = bodyB.data.map((r) => r.slug);
    assert.ok(propBSlugs.includes("highland-spice"), "Property B restaurant MUST appear in Property B list");
    assert.ok(!propBSlugs.includes("azure-tide"), "Property A restaurant MUST NOT appear in Property B list");
  });

  it("16. Folio integration: Staff can charge restaurant dining bill to staying hotel guest folio", async () => {
    const azureTide = await Restaurant.findOne({ property: propAId, slug: "azure-tide" });

    // Create a hotel guest dining reservation
    const hotelReservation = await RestaurantReservation.create({
      property: propAId,
      restaurant: azureTide._id,
      guestType: "Hotel Guest",
      hotelReservation: sampleHotelReservationId,
      roomNumber: "Ocean Suite 301",
      confirmationNumber: `RST-FOLIO-TEST-${Date.now()}`,
      customerName: "Arthur Pendelton",
      email: "arthur.pendelton@example.com",
      phone: "+94 77 987 6543",
      date: "2026-10-18",
      time: "20:00",
      guestCount: 2,
      status: "SEATED"
    });

    // Staff posts dining bill to room/folio
    const chargeRes = await fetch(`${BASE_URL}/restaurants/admin/reservations/${hotelReservation._id}/charge-folio`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${propAStaffToken}`,
        "x-property-id": propAId.toString()
      },
      body: JSON.stringify({
        amount: 32500,
        description: "Dinner at Azure Tide - Lobster & Champagne Tasting"
      })
    });

    assert.strictEqual(chargeRes.status, 200);
    const chargeBody = await chargeRes.json();
    assert.strictEqual(chargeBody.success, true);
    assert.strictEqual(chargeBody.data.reservation.billedToFolio, true);
    assert.strictEqual(chargeBody.data.reservation.totalAmount, 32500);

    // Verify GuestExpense was created in database
    const expense = await GuestExpense.findOne({
      _id: chargeBody.data.folioExpense._id,
      property: propAId
    });
    assert.ok(expense, "GuestExpense must be created in folio");
    assert.strictEqual(expense.category, "Restaurant");
    assert.strictEqual(expense.amount, 32500);
    assert.strictEqual(expense.paymentStatus, "Added to Bill");
    assert.strictEqual(expense.reservation.toString(), sampleHotelReservationId.toString());
  });

  it("17. Non-staying outside customer cannot charge to room folio", async () => {
    const azureTide = await Restaurant.findOne({ property: propAId, slug: "azure-tide" });

    const outsideReservation = await RestaurantReservation.create({
      property: propAId,
      restaurant: azureTide._id,
      guestType: "Outside Guest",
      confirmationNumber: `RST-OUTSIDE-TEST-${Date.now()}`,
      customerName: "Outside Visitor",
      email: "visitor@example.com",
      phone: "+94 77 444 3333",
      date: "2026-10-19",
      time: "19:00",
      guestCount: 2,
      status: "SEATED"
    });

    const chargeRes = await fetch(`${BASE_URL}/restaurants/admin/reservations/${outsideReservation._id}/charge-folio`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${propAStaffToken}`,
        "x-property-id": propAId.toString()
      },
      body: JSON.stringify({ amount: 15000 })
    });

    assert.strictEqual(chargeRes.status, 400, "Should reject folio charge for outside customer without hotel stay");
  });

  it("18. Customer books restaurant table and views it in /api/restaurants/my-reservations", async () => {
    const azureTide = await Restaurant.findOne({ property: propAId, slug: "azure-tide" });

    // Customer books a table
    const bookRes = await fetch(`${BASE_URL}/restaurants/${azureTide._id}/reservations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken}`,
        "x-property-id": propAId.toString()
      },
      body: JSON.stringify({
        customerName: "Alice Customer",
        email: "customer@example.com",
        phone: "+94 77 111 2233",
        date: "2026-10-25",
        time: "20:00",
        guestCount: 2,
        seatingPreference: "Window",
        occasion: "Romantic Dinner"
      })
    });

    assert.strictEqual(bookRes.status, 201, "Should successfully book table");
    const bookData = await bookRes.json();
    assert.strictEqual(bookData.success, true);
    assert.ok(bookData.data.confirmationNumber, "Must have confirmation number");
    assert.strictEqual(bookData.data.customerName, "Alice Customer");

    // Fetch customer's reservations
    const myRes = await fetch(`${BASE_URL}/restaurants/my-reservations`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${customerToken}`,
        "x-property-id": propAId.toString()
      }
    });

    assert.strictEqual(myRes.status, 200, "Should successfully get customer reservations");
    const myData = await myRes.json();
    assert.strictEqual(myData.success, true);
    assert.ok(Array.isArray(myData.data), "Should return array of reservations");
    const found = myData.data.find((r) => r.confirmationNumber === bookData.data.confirmationNumber);
    assert.ok(found, "The booked table reservation must be in customer's reservations list");
    assert.strictEqual(found.status, "CONFIRMED");
    assert.strictEqual(found.restaurant.name, azureTide.name);
  });

  it("19. Customer can cancel their table reservation and status updates to CANCELLED", async () => {
    const azureTide = await Restaurant.findOne({ property: propAId, slug: "azure-tide" });

    // Customer books a table to cancel
    const bookRes = await fetch(`${BASE_URL}/restaurants/${azureTide._id}/reservations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken}`,
        "x-property-id": propAId.toString()
      },
      body: JSON.stringify({
        customerName: "Alice Customer",
        email: "customer@example.com",
        phone: "+94 77 111 2233",
        date: "2026-10-26",
        time: "19:30",
        guestCount: 4,
        seatingPreference: "Ocean Terrace"
      })
    });

    assert.strictEqual(bookRes.status, 201);
    const bookData = await bookRes.json();
    const ref = bookData.data.confirmationNumber;

    // Cancel reservation
    const cancelRes = await fetch(`${BASE_URL}/restaurants/reservations/${ref}/cancel`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken}`
      },
      body: JSON.stringify({ reason: "Change of travel plans" })
    });

    assert.strictEqual(cancelRes.status, 200, "Should cancel reservation");
    const cancelData = await cancelRes.json();
    assert.strictEqual(cancelData.success, true);
    assert.strictEqual(cancelData.data.status, "CANCELLED");

    // Verify it shows up as CANCELLED in my-reservations
    const myRes = await fetch(`${BASE_URL}/restaurants/my-reservations`, {
      headers: {
        Authorization: `Bearer ${customerToken}`
      }
    });

    const myData = await myRes.json();
    const cancelledEntry = myData.data.find((r) => r.confirmationNumber === ref);
    assert.ok(cancelledEntry, "Cancelled reservation should still be in user's reservation history");
    assert.strictEqual(cancelledEntry.status, "CANCELLED");
  });
});

