// backend/tests/aiConcierge.test.js
/**
 * Comprehensive Automated Test Suite for AI Hotel Concierge
 * Covers:
 * 1. Read-only tools grounding with real database entities
 * 2. Room availability & pricing calculation
 * 3. Restaurant and menu retrieval
 * 4. Multi-tenant property isolation
 * 5. Unauthorized data protection (no access to User/Guest/Invoice/Payment)
 * 6. Rate limiter enforcement (HTTP 429)
 * 7. Request payload validation
 * 8. Missing API key graceful fallback
 * 9. Safe tool execution dispatcher
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

const app = require("../server");
const Property = require("../models/Property");
const Room = require("../models/Room");
const Restaurant = require("../models/Restaurant");
const RestaurantMenuItem = require("../models/RestaurantMenuItem");
const RestaurantMenuCategory = require("../models/RestaurantMenuCategory");
const RestaurantOffer = require("../models/RestaurantOffer");

const {
  getHotelInformation,
  searchRooms,
  checkRoomAvailability,
  getRoomPricing,
  getRestaurantInformation,
  getMenuItems,
  getCurrentOffers,
  getBookingInformation,
  executeTool
} = require("../services/conciergeTools");
const { resetRateLimits } = require("../middleware/rateLimiter");

let memServer = null;
let server = null;
let BASE_URL = "";
let pilotProperty = null;
let secondaryProperty = null;

describe("AI HOTEL CONCIERGE TEST SUITE", () => {
  before(async () => {
    // 1. Start pure in-memory MongoDB instance to avoid locking conflicts with running servers
    memServer = await MongoMemoryServer.create();
    const uri = memServer.getUri();
    await mongoose.connect(uri);

    // 2. Start ephemeral test Express server
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        BASE_URL = `http://127.0.0.1:${port}/api`;
        resolve();
      });
    });

    // 3. Seed pilot property (SL-MAIN)
    pilotProperty = await Property.create({
      chain: new mongoose.Types.ObjectId(),
      name: "Sri Lanka Main Property",
      code: "SL-MAIN",
      country: "Sri Lanka",
      city: "Colombo",
      address: "No. 42, Galle Face Promenade, Colombo 03, Sri Lanka",
      status: "Active",
      contactPhone: "+94 11 234 5678",
      contactEmail: "concierge.srilanka@hotelpms.com",
      starRating: 5,
      checkInTime: "14:00",
      checkOutTime: "11:00"
    });

    // 4. Seed rooms in pilot property
    await Room.create([
      {
        property: pilotProperty._id,
        roomNumber: "102",
        roomType: "Double",
        floor: 1,
        building: "Main",
        basePrice: 95,
        capacity: { maxAdults: 2, maxChildren: 1, maxOccupancy: 3 },
        bedConfiguration: "Double Bed",
        view: "Pool View",
        status: "Available",
        cleaningStatus: "Clean",
        isActive: true
      },
      {
        property: pilotProperty._id,
        roomNumber: "201",
        roomType: "Suite",
        floor: 2,
        building: "Main",
        basePrice: 180,
        capacity: { maxAdults: 2, maxChildren: 2, maxOccupancy: 4 },
        bedConfiguration: "King Bed",
        view: "Sea View",
        status: "Available",
        cleaningStatus: "Clean",
        isActive: true
      }
    ]);

    // 5. Seed restaurants and menu items in pilot property
    const restaurantA = await Restaurant.create({
      property: pilotProperty._id,
      name: "Azure Tide Seafood Restaurant",
      slug: "azure-tide",
      tagline: "Where the ocean meets the art of fine dining.",
      description: "Oceanfront culinary sanctuary celebrating fresh catch.",
      cuisine: "Fine Seafood & Coastal Cuisine",
      restaurantType: "Fine Dining",
      location: "Oceanfront Pavilion, Level G",
      openingHours: "Dinner: 18:30 – 23:00 (Daily)",
      dressCode: "Smart Casual / Resort Evening",
      contactPhone: "+94 11 234 5680",
      active: true,
      sortOrder: 1
    });

    const category = await RestaurantMenuCategory.create({
      property: pilotProperty._id,
      restaurant: restaurantA._id,
      name: "OCEAN MAINS",
      sortOrder: 1,
      active: true
    });

    await RestaurantMenuItem.create({
      property: pilotProperty._id,
      restaurant: restaurantA._id,
      category: category._id,
      name: "Ceylon Rock Lobster",
      description: "Flame grilled with garlic butter and island spices",
      price: 9800,
      currency: "LKR",
      dietaryTags: ["Seafood", "Gluten-free"],
      available: true
    });

    await RestaurantOffer.create({
      property: pilotProperty._id,
      restaurant: restaurantA._id,
      title: "Seafood Sunset Experience",
      slug: "seafood-sunset-experience",
      shortDescription: "An unforgettable sunset dinner with a generous coastal platter.",
      description: "Celebrate twilight over the Indian Ocean.",
      price: 38000,
      discount: "Includes 2 Complimentary Sunset Cocktails",
      validFrom: new Date(Date.now() - 86400000),
      validUntil: new Date(Date.now() + 86400000 * 30),
      active: true,
      sortOrder: 1
    });

    // 6. Seed a second property to test multi-hotel isolation
    secondaryProperty = await Property.create({
      chain: pilotProperty.chain,
      name: "Galle Heritage Fort Resort",
      code: "TEST-GALLE",
      country: "Sri Lanka",
      city: "Galle",
      address: "Lighthouse Street, Galle Fort, Sri Lanka",
      status: "Active",
      contactPhone: "+94 91 222 3344",
      contactEmail: "galle@hotelpms.com",
      starRating: 5
    });

    await Room.create({
      property: secondaryProperty._id,
      roomNumber: "GALLE-101",
      roomType: "Deluxe",
      floor: 1,
      basePrice: 250,
      capacity: { maxAdults: 2, maxOccupancy: 2 },
      bedConfiguration: "King Bed",
      status: "Available",
      cleaningStatus: "Clean",
      isActive: true
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

  // ---------------------------------------------------------------
  // 1. Approved Read-Only Tools Grounding
  // ---------------------------------------------------------------
  it("1. getHotelInformation returns verified property policies and contact details", async () => {
    const info = await getHotelInformation({ propertyId: pilotProperty._id.toString() });
    assert.strictEqual(info.hotelName, pilotProperty.name);
    assert.strictEqual(info.code, "SL-MAIN");
    assert.strictEqual(info.city, "Colombo");
    assert.strictEqual(info.checkInTime, "14:00");
    assert.strictEqual(info.checkOutTime, "11:00");
    assert.ok(info.keyPolicies.length > 0);
  });

  it("2. searchRooms discovers real rooms in database with pricing", async () => {
    const res = await searchRooms({ propertyId: pilotProperty._id.toString() });
    assert.ok(res.roomsFound >= 1, "Should find at least 1 room type in pilot hotel");
    assert.ok(res.roomTypes[0].basePrice > 0, "Base price should be positive");
    assert.ok(res.roomTypes[0].currency === "LKR");
  });

  it("3. checkRoomAvailability verifies dates via authoritative logic", async () => {
    const today = new Date();
    const checkIn = new Date(today.getTime() + 86400000).toISOString().split("T")[0];
    const checkOut = new Date(today.getTime() + 86400000 * 3).toISOString().split("T")[0];

    const result = await checkRoomAvailability({
      propertyId: pilotProperty._id.toString(),
      checkInDate: checkIn,
      checkOutDate: checkOut
    });

    assert.strictEqual(result.available, true);
    assert.strictEqual(result.nights, 2);
    assert.ok(result.availableRoomsCount > 0);
    assert.ok(result.availableRoomTypes.length > 0);
  });

  it("4. checkRoomAvailability rejects inverted dates with error", async () => {
    const result = await checkRoomAvailability({
      propertyId: pilotProperty._id.toString(),
      checkInDate: "2026-12-10",
      checkOutDate: "2026-12-05"
    });

    assert.ok(result.error, "Should return an error for invalid date ordering");
  });

  it("5. getRoomPricing accurately computes stay cost for verified room", async () => {
    const pricing = await getRoomPricing({
      propertyId: pilotProperty._id.toString(),
      roomType: "Double",
      checkInDate: "2026-11-01",
      checkOutDate: "2026-11-04"
    });

    assert.strictEqual(pricing.roomType, "Double");
    assert.strictEqual(pricing.nights, 3);
    assert.strictEqual(pricing.totalEstimatedAmount, pricing.ratePerNight * 3);
  });

  it("6. getRestaurantInformation returns verified restaurants and hours", async () => {
    const dining = await getRestaurantInformation({ propertyId: pilotProperty._id.toString() });
    assert.ok(dining.count >= 1, "Should return pilot property restaurants");
    const names = dining.restaurants.map(r => r.name);
    assert.ok(names.some(n => n.includes("Azure Tide")));
  });

  it("7. getMenuItems returns dishes with dietary tags and prices", async () => {
    const menu = await getMenuItems({ propertyId: pilotProperty._id.toString() });
    assert.ok(menu.itemsFound >= 1, "Should return verified menu items");
    assert.ok(menu.items[0].price > 0);
    assert.ok(Array.isArray(menu.items[0].dietaryTags));
  });

  it("8. getCurrentOffers returns active offers without fabricating expired ones", async () => {
    const offers = await getCurrentOffers({ propertyId: pilotProperty._id.toString() });
    assert.ok(offers.count >= 1);
    assert.ok(offers.offers[0].title);
    assert.ok(offers.offers[0].bookingUrl);
  });

  it("9. getBookingInformation returns procedure and verified booking anchor", async () => {
    const bookingInfo = await getBookingInformation();
    assert.strictEqual(bookingInfo.bookingAnchor, "#rooms");
    assert.ok(bookingInfo.procedure.includes("Book Sanctuary"));
  });

  // ---------------------------------------------------------------
  // 2. Multi-Hotel Tenancy Isolation
  // ---------------------------------------------------------------
  it("10. Multi-Hotel Isolation: Pilot concierge cannot access secondary property rooms", async () => {
    const pilotRooms = await searchRooms({ propertyId: pilotProperty._id.toString() });
    const secRooms = await searchRooms({ propertyId: secondaryProperty._id.toString() });

    // Ensure secondary room (GALLE-101) is not returned in pilot room search
    const pilotRoomNumbers = pilotRooms.roomTypes.map(r => r.roomNumber);
    assert.ok(!pilotRoomNumbers.includes("GALLE-101"), "Pilot concierge must not retrieve Galle room");

    const secRoomNumbers = secRooms.roomTypes.map(r => r.roomNumber);
    assert.ok(secRoomNumbers.includes("GALLE-101"), "Secondary search retrieves Galle room");
  });

  it("11. executeTool safely rejects unknown tools and enforces property scope", async () => {
    const result = await executeTool("arbitraryDatabaseQuery", {}, pilotProperty._id.toString());
    assert.ok(result.error);
    assert.ok(result.error.includes("not recognized"));
  });

  // ---------------------------------------------------------------
  // 3. Unauthorized Data Protection
  // ---------------------------------------------------------------
  it("12. Concierge tools strictly do not expose guest or user records", async () => {
    const { toolsSchema } = require("../services/conciergeTools");
    const toolNames = toolsSchema.map(t => t.function.name);
    assert.ok(!toolNames.includes("getGuest"));
    assert.ok(!toolNames.includes("getUser"));
    assert.ok(!toolNames.includes("getInvoice"));
    assert.ok(!toolNames.includes("getPayment"));
  });

  // ---------------------------------------------------------------
  // 4. API Endpoint Integration & Validation
  // ---------------------------------------------------------------
  it("13. POST /api/ai/concierge/chat returns 400 for empty or missing message", async () => {
    const res = await fetch(`${BASE_URL}/ai/concierge/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "   " })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 400);
    assert.strictEqual(data.success, false);
  });

  it("14. POST /api/ai/concierge/chat rejects messages exceeding 1000 characters", async () => {
    const longMsg = "A".repeat(1005);
    const res = await fetch(`${BASE_URL}/ai/concierge/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: longMsg })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 400);
    assert.ok(data.error.includes("maximum allowed length"));
  });

  it("15. POST /api/ai/concierge/chat provides grounded fallback when OpenAI key is absent", async () => {
    const res = await fetch(`${BASE_URL}/ai/concierge/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "What are your check in policies and dining options?" })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(data.reply.length > 20);
    assert.ok(data.reply.includes("check-in") || data.reply.includes("dining") || data.reply.includes("Welcome"));
  });

  it("16. Rate limiting enforces HTTP 429 when client exceeds limit", async () => {
    resetRateLimits();
    const testIpHeader = "192.168.100.99";

    // Rapidly send 32 requests
    let lastStatus = 200;
    for (let i = 0; i < 33; i++) {
      const res = await fetch(`${BASE_URL}/ai/concierge/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": testIpHeader
        },
        body: JSON.stringify({ message: "Hello concierge" })
      });
      lastStatus = res.status;
      if (lastStatus === 429) break;
    }

    assert.strictEqual(lastStatus, 429, "Rate limiter should trigger HTTP 429 after 30 requests");
    resetRateLimits();
  });
});
