// backend/tests/events.test.js
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
const EventVenue = require("../models/EventVenue");
const Event = require("../models/Event");
const EventBooking = require("../models/EventBooking");

let server = null;
let BASE_URL = "";

let chainId = null;
let propAId = null;
let propBId = null;

let adminToken = null;
let propAStaffToken = null;
let propBStaffToken = null;
let customerToken = null;
let customer2Token = null;

let testVenuePropA = null;
let testVenuePropB = null;
let publishedEventPropA = null;
let draftEventPropA = null;

describe("EVENT MANAGEMENT MODULE — Automated Comprehensive Test Suite", () => {
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

    // 4. Create Property A (Colombo) and Property B (Galle)
    let propA = await Property.findOne({ code: "SL-TEST-A" });
    if (!propA) {
      propA = await Property.create({
        chain: chainId,
        name: "Serendib Sanctuary Colombo",
        code: "SL-TEST-A",
        city: "Colombo",
        status: "Active"
      });
    }
    propAId = propA._id;

    let propB = await Property.findOne({ code: "SL-TEST-B" });
    if (!propB) {
      propB = await Property.create({
        chain: chainId,
        name: "Serendib Haven Galle",
        code: "SL-TEST-B",
        city: "Galle",
        status: "Active"
      });
    }
    propBId = propB._id;

    // 5. Create test users & generate tokens
    let adminUser = await User.findOne({ email: "event_admin@hotel.com" });
    if (!adminUser) {
      adminUser = await User.create({
        name: "Event Admin",
        email: "event_admin@hotel.com",
        password: "Password123!",
        phone: "+94 77 111 2233",
        role: "admin",
        property: propAId,
        allowedProperties: [propAId, propBId]
      });
    }
    adminToken = jwt.sign({ id: adminUser._id }, process.env.JWT_SECRET || "your-secret-key", { expiresIn: "1d" });

    let propAStaff = await User.findOne({ email: "staff_a@hotel.com" });
    if (!propAStaff) {
      propAStaff = await User.create({
        name: "Colombo Event Staff",
        email: "staff_a@hotel.com",
        password: "Password123!",
        phone: "+94 77 222 3344",
        role: "staff",
        property: propAId,
        allowedProperties: [propAId]
      });
    }
    propAStaffToken = jwt.sign({ id: propAStaff._id }, process.env.JWT_SECRET || "your-secret-key", { expiresIn: "1d" });

    let propBStaff = await User.findOne({ email: "staff_b@hotel.com" });
    if (!propBStaff) {
      propBStaff = await User.create({
        name: "Galle Event Staff",
        email: "staff_b@hotel.com",
        password: "Password123!",
        phone: "+94 77 333 4455",
        role: "staff",
        property: propBId,
        allowedProperties: [propBId]
      });
    }
    propBStaffToken = jwt.sign({ id: propBStaff._id }, process.env.JWT_SECRET || "your-secret-key", { expiresIn: "1d" });

    let customer = await User.findOne({ email: "event_cust@example.com" });
    if (!customer) {
      customer = await User.create({
        name: "Amara Silva",
        email: "event_cust@example.com",
        password: "Password123!",
        phone: "+94 77 123 4567",
        role: "customer"
      });
    }
    customerToken = jwt.sign({ id: customer._id }, process.env.JWT_SECRET || "your-secret-key", { expiresIn: "1d" });

    let customer2 = await User.findOne({ email: "event_cust2@example.com" });
    if (!customer2) {
      customer2 = await User.create({
        name: "Kasun Perera",
        email: "event_cust2@example.com",
        password: "Password123!",
        phone: "+94 77 987 6543",
        role: "customer"
      });
    }
    customer2Token = jwt.sign({ id: customer2._id }, process.env.JWT_SECRET || "your-secret-key", { expiresIn: "1d" });

    // 6. Create sample venues for Prop A and Prop B
    testVenuePropA = await EventVenue.create({
      property: propAId,
      name: "Grand Lotus Ballroom",
      slug: "grand-lotus-ballroom",
      type: "Indoor",
      area: 500,
      min: 50,
      max: 400,
      categories: ["weddings", "corporate"],
      seating: ["Banquet", "Theatre"],
      facilities: ["AC", "Stage", "Sound"],
      packages: [
        { name: "Royal Wedding", event: "Weddings", price: 600000, currency: "LKR" }
      ],
      isActive: true
    });

    testVenuePropB = await EventVenue.create({
      property: propBId,
      name: "Ocean Breeze Pavilion",
      slug: "ocean-breeze-pavilion",
      type: "Outdoor",
      area: 300,
      min: 20,
      max: 200,
      categories: ["weddings", "private-celebrations"],
      isActive: true
    });

    // 7. Create sample published and draft events for Prop A
    publishedEventPropA = await Event.create({
      property: propAId,
      title: "Colombo Symphony Gala 2026",
      slug: "colombo-symphony-gala-2026",
      eventType: "banquet",
      shortDescription: "An enchanting evening of classical symphony and fine dining.",
      description: "Annual classical gala held at Grand Lotus Ballroom.",
      startDate: "2026-11-20",
      endDate: "2026-11-20",
      startTime: "19:00",
      endTime: "23:00",
      venue: testVenuePropA._id,
      minCapacity: 50,
      maxCapacity: 350,
      expectedGuestCount: 200,
      status: "PUBLISHED",
      featured: true,
      basePrice: 20000,
      currency: "LKR"
    });

    draftEventPropA = await Event.create({
      property: propAId,
      title: "Secret Unreleased Tasting Seminar",
      slug: "secret-tasting-seminar",
      eventType: "corporate",
      startDate: "2026-12-05",
      status: "DRAFT",
      featured: false
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (typeof connectDB.stopDB === "function") {
      await connectDB.stopDB();
    }
  });

  // =========================================================================
  // 1. PUBLIC EVENT DISCOVERY & VISIBILITY
  // =========================================================================

  it("1. Public event listing: returns published events and hides draft events", async () => {
    const res = await fetch(`${BASE_URL}/events?propertyId=${propAId}`);
    assert.strictEqual(res.status, 200);
    const events = await res.json();
    assert.ok(Array.isArray(events));

    // Published event must be visible
    const hasPublished = events.some((e) => e.slug === "colombo-symphony-gala-2026");
    assert.strictEqual(hasPublished, true);

    // Draft event must NOT be visible to public
    const hasDraft = events.some((e) => e.slug === "secret-tasting-seminar");
    assert.strictEqual(hasDraft, false);
  });

  it("2. Published event details: loads correctly via GET /api/events/:slug", async () => {
    const res = await fetch(`${BASE_URL}/events/colombo-symphony-gala-2026?propertyId=${propAId}`);
    assert.strictEqual(res.status, 200);
    const event = await res.json();
    assert.strictEqual(event.title, "Colombo Symphony Gala 2026");
    assert.strictEqual(event.status, "PUBLISHED");
    assert.ok(event.venue);
  });

  it("3. Draft event by slug returns 404 for public customer", async () => {
    const res = await fetch(`${BASE_URL}/events/secret-tasting-seminar?propertyId=${propAId}`);
    assert.strictEqual(res.status, 404);
  });

  it("4. Public venues listing: discovers active venues for property", async () => {
    const res = await fetch(`${BASE_URL}/events/venues?propertyId=${propAId}`);
    assert.strictEqual(res.status, 200);
    const venues = await res.json();
    assert.ok(Array.isArray(venues));
    const lotus = venues.find((v) => v.slug === "grand-lotus-ballroom");
    assert.ok(lotus);
    assert.strictEqual(lotus.max, 400);
  });

  it("5. Single venue details by slug: GET /api/events/venues/:slug", async () => {
    const res = await fetch(`${BASE_URL}/events/venues/grand-lotus-ballroom?propertyId=${propAId}`);
    assert.strictEqual(res.status, 200);
    const venue = await res.json();
    assert.strictEqual(venue.name, "Grand Lotus Ballroom");
  });

  // =========================================================================
  // 2. CUSTOMER EVENT BOOKING / ENQUIRY CREATION & VALIDATION
  // =========================================================================

  let createdBookingRef = "";
  let createdBookingId = "";

  it("6. Customer booking/enquiry creation: validates inputs and returns EVT reference", async () => {
    const payload = {
      name: "Amara Silva",
      email: "event_cust@example.com",
      phone: "+94 77 123 4567",
      category: "weddings",
      venue: testVenuePropA._id.toString(),
      date: "2026-11-25",
      start: "18:00",
      end: "22:00",
      guests: 150,
      seating: "Banquet",
      package: "Royal Wedding",
      notes: "Vegetarian options required for 30 guests"
    };

    const res = await fetch(`${BASE_URL}/events/bookings?propertyId=${propAId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken}`
      },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.ok(data.booking);
    assert.ok(data.booking.confirmationNumber.startsWith("EVT-"));
    assert.strictEqual(data.booking.status, "PENDING");
    assert.strictEqual(data.booking.guestCount, 150);
    assert.strictEqual(data.booking.estimatedPrice, 600000);

    createdBookingRef = data.booking.confirmationNumber;
    createdBookingId = data.booking._id;
  });

  it("7. Validation check: Past date rejected", async () => {
    const payload = {
      name: "Amara Silva",
      email: "event_cust@example.com",
      phone: "+94 77 123 4567",
      category: "corporate",
      date: "2020-01-01", // Past date!
      start: "10:00",
      end: "14:00",
      guests: 50
    };

    const res = await fetch(`${BASE_URL}/events/bookings?propertyId=${propAId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes("future"));
  });

  it("8. Validation check: End time before start time rejected", async () => {
    const payload = {
      name: "Amara Silva",
      email: "event_cust@example.com",
      phone: "+94 77 123 4567",
      category: "corporate",
      date: "2026-11-25",
      start: "18:00",
      end: "16:00", // Invalid!
      guests: 50
    };

    const res = await fetch(`${BASE_URL}/events/bookings?propertyId=${propAId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(res.status, 400);
  });

  it("9. Venue capacity validation: Guest count exceeding maximum rejected", async () => {
    const payload = {
      name: "Amara Silva",
      email: "event_cust@example.com",
      phone: "+94 77 123 4567",
      category: "weddings",
      venue: testVenuePropA._id.toString(),
      date: "2026-11-25",
      start: "18:00",
      end: "22:00",
      guests: 500 // Max is 400!
    };

    const res = await fetch(`${BASE_URL}/events/bookings?propertyId=${propAId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes("exceeds venue maximum"));
  });

  it("10. Public booking lookup by reference: GET /api/events/bookings/:ref", async () => {
    const res = await fetch(`${BASE_URL}/events/bookings/${createdBookingRef}?propertyId=${propAId}`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.confirmationNumber, createdBookingRef);
    assert.strictEqual(data.customerName, "Amara Silva");
  });

  // =========================================================================
  // 3. CUSTOMER DATA PRIVACY & ACCESS BOUNDARIES
  // =========================================================================

  it("11. Customer portal: Customer can see their own bookings via /my-bookings", async () => {
    const res = await fetch(`${BASE_URL}/events/my-bookings?propertyId=${propAId}`, {
      headers: { Authorization: `Bearer ${customerToken}` }
    });

    assert.strictEqual(res.status, 200);
    const bookings = await res.json();
    assert.ok(Array.isArray(bookings));
    assert.ok(bookings.some((b) => b.confirmationNumber === createdBookingRef));
  });

  it("12. Customer privacy boundary: Customer 2 cannot access Customer 1's bookings", async () => {
    const res = await fetch(`${BASE_URL}/events/my-bookings?propertyId=${propAId}`, {
      headers: { Authorization: `Bearer ${customer2Token}` }
    });

    assert.strictEqual(res.status, 200);
    const bookings = await res.json();
    // Customer 2 must not see Customer 1's booking
    const hasCust1 = bookings.some((b) => b.confirmationNumber === createdBookingRef);
    assert.strictEqual(hasCust1, false);
  });

  // =========================================================================
  // 4. ADMIN MANAGEMENT & STAFF LIFECYCLE
  // =========================================================================

  it("13. Unauthorized customer cannot access admin dashboard stats (403)", async () => {
    const res = await fetch(`${BASE_URL}/events/admin/dashboard-stats?propertyId=${propAId}`, {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    assert.strictEqual(res.status, 403);
  });

  it("14. Authorized staff can access admin dashboard stats", async () => {
    const res = await fetch(`${BASE_URL}/events/admin/dashboard-stats?propertyId=${propAId}`, {
      headers: { Authorization: `Bearer ${propAStaffToken}` }
    });
    assert.strictEqual(res.status, 200);
    const stats = await res.json();
    assert.ok(stats.totalEvents >= 2);
    assert.ok(stats.totalVenues >= 1);
    assert.ok(stats.pendingBookings >= 1);
  });

  it("15. Staff can view all events including drafts", async () => {
    const res = await fetch(`${BASE_URL}/events/admin/events?propertyId=${propAId}`, {
      headers: { Authorization: `Bearer ${propAStaffToken}` }
    });
    assert.strictEqual(res.status, 200);
    const events = await res.json();
    assert.ok(events.some((e) => e.slug === "secret-tasting-seminar"));
  });

  it("16. Staff can toggle event publish status", async () => {
    const res = await fetch(`${BASE_URL}/events/admin/events/${draftEventPropA._id}/publish?propertyId=${propAId}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${propAStaffToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.event.status, "PUBLISHED");

    // Toggle back to DRAFT
    await fetch(`${BASE_URL}/events/admin/events/${draftEventPropA._id}/publish?propertyId=${propAId}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${propAStaffToken}` }
    });
  });

  // =========================================================================
  // 5. CONFLICT PREVENTION & OVERLAPPING BOOKING REJECTION
  // =========================================================================

  it("17. Staff approves booking -> becomes CONFIRMED", async () => {
    const res = await fetch(`${BASE_URL}/events/admin/bookings/${createdBookingId}/status?propertyId=${propAId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${propAStaffToken}`
      },
      body: JSON.stringify({ status: "CONFIRMED", notes: "Deposit received, date locked in." })
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.booking.status, "CONFIRMED");
    assert.ok(data.booking.confirmedAt);
  });

  it("18. Conflict prevention: Second booking overlapping confirmed time window is rejected upon confirmation (409)", async () => {
    // Booking 1 is confirmed for 2026-11-25, 18:00 - 22:00 at Grand Lotus Ballroom.
    // Booking 2 requests 2026-11-25, 19:00 - 21:00 at the same venue.
    const payload = {
      name: "Kasun Perera",
      email: "event_cust2@example.com",
      phone: "+94 77 987 6543",
      category: "corporate",
      venue: testVenuePropA._id.toString(),
      date: "2026-11-25",
      start: "19:00",
      end: "21:00",
      guests: 80
    };

    // Customer can submit pending enquiry
    const createRes = await fetch(`${BASE_URL}/events/bookings?propertyId=${propAId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    assert.strictEqual(createRes.status, 201);
    const secondBooking = (await createRes.json()).booking;

    // When staff tries to CONFIRM this overlapping booking, system MUST reject with 409 Conflict!
    const confirmRes = await fetch(`${BASE_URL}/events/admin/bookings/${secondBooking._id}/status?propertyId=${propAId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${propAStaffToken}`
      },
      body: JSON.stringify({ status: "CONFIRMED" })
    });

    assert.strictEqual(confirmRes.status, 409);
    const confirmData = await confirmRes.json();
    assert.ok(confirmData.error.includes("Conflicting confirmed booking"));
  });

  // =========================================================================
  // 6. PROPERTY ISOLATION & MULTI-TENANT BOUNDARIES
  // =========================================================================

  it("19. Property Isolation: Staff at Property A cannot access or modify Property B events", async () => {
    // Create an event under Property B
    const propBEvent = await Event.create({
      property: propBId,
      title: "Galle Fort Literary Reception",
      slug: "galle-fort-reception",
      startDate: "2026-12-10",
      status: "PUBLISHED"
    });

    // Staff A requests Property B's event with Property A context -> 404 Not Found
    const res = await fetch(`${BASE_URL}/events/admin/events/${propBEvent._id}?propertyId=${propAId}`, {
      headers: { Authorization: `Bearer ${propAStaffToken}` }
    });
    assert.strictEqual(res.status, 404);
  });

  it("20. Property Isolation: Venues from Property B do not appear under Property A queries", async () => {
    const res = await fetch(`${BASE_URL}/events/venues?propertyId=${propAId}`);
    assert.strictEqual(res.status, 200);
    const venues = await res.json();
    const hasOceanBreeze = venues.some((v) => v.slug === "ocean-breeze-pavilion");
    assert.strictEqual(hasOceanBreeze, false);
  });

  it("21. Inactive venue cannot receive new confirmed bookings", async () => {
    // Create an inactive venue
    const inactiveVenue = await EventVenue.create({
      property: propAId,
      name: "Old Heritage Wing (Decommissioned)",
      slug: "old-heritage-wing",
      type: "Indoor",
      min: 10,
      max: 100,
      isActive: false
    });

    // Create a pending booking referencing this inactive venue
    const pendingBooking = await EventBooking.create({
      property: propAId,
      confirmationNumber: "EVT-TEST-INACTIVE",
      venue: inactiveVenue._id,
      customerName: "Inactive Venue Tester",
      email: "tester@hotel.com",
      phone: "+94 77 123 4567",
      eventType: "corporate",
      date: "2026-12-25",
      startTime: "10:00",
      endTime: "14:00",
      guestCount: 20,
      status: "PENDING"
    });

    // Staff tries to confirm booking on inactive venue -> MUST reject (400)
    const res = await fetch(`${BASE_URL}/events/admin/bookings/${pendingBooking._id}/status?propertyId=${propAId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${propAStaffToken}`
      },
      body: JSON.stringify({ status: "CONFIRMED" })
    });

    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes("inactive"));
  });

  it("22. Status transition rules: Completed and Cancelled bookings cannot transition to arbitrary states", async () => {
    const booking = await EventBooking.create({
      property: propAId,
      confirmationNumber: "EVT-TEST-COMPLETED",
      customerName: "Finished Event",
      email: "done@hotel.com",
      phone: "+94 77 000 0000",
      eventType: "weddings",
      date: "2026-10-01",
      startTime: "10:00",
      endTime: "14:00",
      guestCount: 50,
      status: "COMPLETED"
    });

    const res = await fetch(`${BASE_URL}/events/admin/bookings/${booking._id}/status?propertyId=${propAId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${propAStaffToken}`
      },
      body: JSON.stringify({ status: "PENDING" })
    });

    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes("Completed bookings cannot change status"));
  });

  // =========================================================================
  // 7. COMPREHENSIVE ADMIN OPERATIONS, CRUD & ARCHIVING VERIFICATION
  // =========================================================================

  let staffCreatedEventId = null;

  it("23. Staff can create and edit an event", async () => {
    // 1. Create event
    const createPayload = {
      title: "Ceylon Culinary Masterclass 2026",
      eventType: "corporate",
      startDate: "2026-12-15",
      endDate: "2026-12-15",
      startTime: "10:00",
      endTime: "16:00",
      minCapacity: 15,
      maxCapacity: 60,
      expectedGuestCount: 40,
      pricingModel: "Per Person",
      basePrice: 15000,
      currency: "LKR",
      venue: testVenuePropA._id.toString(),
      shortDescription: "Exclusive gourmet workshop with master chefs",
      description: "Full day fine-dining masterclass and interactive kitchen experience."
    };

    const createRes = await fetch(`${BASE_URL}/events/admin/events?propertyId=${propAId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${propAStaffToken}`
      },
      body: JSON.stringify(createPayload)
    });

    assert.strictEqual(createRes.status, 201);
    const createData = await createRes.json();
    assert.ok(createData.event);
    assert.strictEqual(createData.event.title, "Ceylon Culinary Masterclass 2026");
    staffCreatedEventId = createData.event._id;

    // 2. Edit event
    const updateRes = await fetch(`${BASE_URL}/events/admin/events/${staffCreatedEventId}?propertyId=${propAId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${propAStaffToken}`
      },
      body: JSON.stringify({
        title: "Ceylon Masterclass & Wine Pairing 2026",
        basePrice: 18000
      })
    });

    assert.strictEqual(updateRes.status, 200);
    const updateData = await updateRes.json();
    assert.strictEqual(updateData.event.title, "Ceylon Masterclass & Wine Pairing 2026");
    assert.strictEqual(updateData.event.basePrice, 18000);
  });

  let staffCreatedVenueId = null;

  it("24. Staff can create, update, and manage venues (Venue CRUD)", async () => {
    // 1. Create venue
    const venuePayload = {
      name: "Starlight Rooftop Terrace",
      type: "Outdoor",
      area: 250,
      min: 20,
      max: 120,
      location: "Colombo Rooftop Level 12",
      description: "Panoramic open-air terrace overlooking the city skyline",
      facilities: ["Panoramic View", "Bar", "Lounge Seating"],
      seating: ["Cocktail", "Reception"],
      isActive: true
    };

    const createRes = await fetch(`${BASE_URL}/events/admin/venues?propertyId=${propAId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${propAStaffToken}`
      },
      body: JSON.stringify(venuePayload)
    });

    assert.strictEqual(createRes.status, 201);
    const createData = await createRes.json();
    assert.ok(createData.venue);
    assert.strictEqual(createData.venue.name, "Starlight Rooftop Terrace");
    staffCreatedVenueId = createData.venue._id;

    // 2. Update venue
    const updateRes = await fetch(`${BASE_URL}/events/admin/venues/${staffCreatedVenueId}?propertyId=${propAId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${propAStaffToken}`
      },
      body: JSON.stringify({
        max: 150,
        description: "Updated luxury open-air terrace"
      })
    });

    assert.strictEqual(updateRes.status, 200);
    const updateData = await updateRes.json();
    assert.strictEqual(updateData.venue.max, 150);

    // 3. Deactivate/delete venue without bookings
    const deleteRes = await fetch(`${BASE_URL}/events/admin/venues/${staffCreatedVenueId}?propertyId=${propAId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(deleteRes.status, 200);
  });

  it("25. Staff can view and filter customer booking requests", async () => {
    const res = await fetch(`${BASE_URL}/events/admin/bookings?propertyId=${propAId}`, {
      headers: { Authorization: `Bearer ${propAStaffToken}` }
    });

    assert.strictEqual(res.status, 200);
    const list = await res.json();
    assert.ok(Array.isArray(list));
    assert.ok(list.length >= 1);
    assert.ok(list.some((b) => b.customerName === "Amara Silva"));
  });

  it("26. Historical bookings survive event archiving", async () => {
    // 1. Create a dedicated event
    const archEvent = await Event.create({
      property: propAId,
      title: "Historic Vintage Automobile Gala",
      slug: "historic-automobile-gala",
      startDate: "2026-11-30",
      status: "PUBLISHED"
    });

    // 2. Create a booking referencing this event
    const linkedBooking = await EventBooking.create({
      property: propAId,
      confirmationNumber: "EVT-ARCHIVE-TEST-01",
      event: archEvent._id,
      customerName: "Preserved Booking Customer",
      email: "preserved@example.com",
      phone: "+94 77 999 8888",
      eventType: "corporate",
      date: "2026-11-30",
      startTime: "11:00",
      endTime: "15:00",
      guestCount: 50,
      status: "CONFIRMED"
    });

    // 3. Staff deletes/archives event referencing bookings
    const delRes = await fetch(`${BASE_URL}/events/admin/events/${archEvent._id}?propertyId=${propAId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    assert.strictEqual(delRes.status, 200);
    const delData = await delRes.json();
    assert.ok(delData.message.includes("archived"));

    // Verify event is safely archived, NOT destroyed
    const reloadedEvent = await Event.findById(archEvent._id);
    assert.ok(reloadedEvent);
    assert.strictEqual(reloadedEvent.status, "ARCHIVED");

    // Verify the historical booking still exists intact
    const reloadedBooking = await EventBooking.findById(linkedBooking._id);
    assert.ok(reloadedBooking);
    assert.strictEqual(reloadedBooking.confirmationNumber, "EVT-ARCHIVE-TEST-01");
    assert.strictEqual(reloadedBooking.status, "CONFIRMED");
    assert.strictEqual(reloadedBooking.event.toString(), archEvent._id.toString());
  });

  it("27. Dashboard statistics reflect actual database records", async () => {
    const res = await fetch(`${BASE_URL}/events/admin/dashboard-stats?propertyId=${propAId}`, {
      headers: { Authorization: `Bearer ${propAStaffToken}` }
    });

    assert.strictEqual(res.status, 200);
    const stats = await res.json();

    const expectedTotal = await Event.countDocuments({ property: propAId });
    const expectedVenues = await EventVenue.countDocuments({ property: propAId, isActive: true });
    const expectedPending = await EventBooking.countDocuments({ property: propAId, status: "PENDING" });
    const expectedConfirmed = await EventBooking.countDocuments({ property: propAId, status: "CONFIRMED" });

    assert.strictEqual(stats.totalEvents, expectedTotal);
    assert.strictEqual(stats.totalVenues, expectedVenues);
    assert.strictEqual(stats.pendingBookings, expectedPending);
    assert.strictEqual(stats.confirmedBookings, expectedConfirmed);
  });
});

