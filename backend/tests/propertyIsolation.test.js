// backend/tests/propertyIsolation.test.js
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
const Room = require("../models/Room");
const User = require("../models/User");
const Guest = require("../models/Guest");
const Reservation = require("../models/Reservation");
const Booking = require("../models/Booking");
const HousekeepingTask = require("../models/HousekeepingTask");
const MaintenanceTicket = require("../models/MaintenanceTicket");
const LostItem = require("../models/LostItem");
const Invoice = require("../models/Invoice");
const Payment = require("../models/Payment");
const GuestExpense = require("../models/GuestExpense");

const { createCheckoutTask, inspectTask } = require("../services/housekeepingService");
const { createTicket, closeTicket, blockRoomForMaintenance } = require("../services/maintenanceService");
const { assertAvailable } = require("../services/availabilityService");

let server = null;
let BASE_URL = "";

// IDs for testing
let chainId = null;
let propAId = null;
let propBId = null; // Test-only second property

let propAStaffToken = null;
let propBStaffToken = null;
let adminToken = null;
let adminUserId = null;
let customerToken = null;
let customerUser = null;

describe("PHASE 1: Hotel Chain & Property Isolation Comprehensive Test Suite", () => {
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

    // 3. Ensure primary HotelChain exists
    let chain = await HotelChain.findOne({ code: "GHHG" });
    if (!chain) {
      chain = await HotelChain.create({
        name: "Grand Horizon Hospitality Group",
        code: "GHHG",
        status: "Active"
      });
    }
    chainId = chain._id;

    // 4. Ensure Property A (Sri Lanka Main Property) exists
    let propA = await Property.findOne({ code: "SL-MAIN" });
    if (!propA) {
      propA = await Property.create({
        chain: chainId,
        name: "Sri Lanka Main Property",
        code: "SL-MAIN",
        country: "Sri Lanka",
        countryCode: "LK",
        city: "Colombo",
        currency: "LKR",
        status: "Active"
      });
    }
    propAId = propA._id;

    // 5. Create TEST-ONLY Property B (Property B is cleaned up after tests)
    let propB = await Property.findOne({ code: "TEST-PROP-B" });
    if (!propB) {
      propB = await Property.create({
        chain: chainId,
        name: "Test Property B",
        code: "TEST-PROP-B",
        country: "Sri Lanka",
        countryCode: "LK",
        city: "Kandy",
        currency: "LKR",
        status: "Active"
      });
    }
    propBId = propB._id;

    // 6. Create test users with property assignments
    const adminUser = await User.create({
      name: "Chain Admin",
      email: `chain_admin_${Date.now()}@hotel.com`,
      password: "Password123!",
      phone: "0771234561",
      role: "admin"
    });
    adminUserId = adminUser._id;
    adminToken = jwt.sign({ id: adminUser._id }, process.env.JWT_SECRET, { expiresIn: "1d" });

    const staffA = await User.create({
      name: "Staff Property A",
      email: `staff_a_${Date.now()}@hotel.com`,
      password: "Password123!",
      phone: "0771234562",
      role: "staff",
      property: propAId,
      allowedProperties: [propAId]
    });
    propAStaffToken = jwt.sign({ id: staffA._id }, process.env.JWT_SECRET, { expiresIn: "1d" });

    const staffB = await User.create({
      name: "Staff Property B",
      email: `staff_b_${Date.now()}@hotel.com`,
      password: "Password123!",
      phone: "0771234563",
      role: "staff",
      property: propBId,
      allowedProperties: [propBId]
    });
    propBStaffToken = jwt.sign({ id: staffB._id }, process.env.JWT_SECRET, { expiresIn: "1d" });

    customerUser = await User.create({
      name: "Test Customer",
      email: `customer_${Date.now()}@guest.com`,
      password: "Password123!",
      phone: "0771234564",
      role: "customer"
    });
    customerToken = jwt.sign({ id: customerUser._id }, process.env.JWT_SECRET, { expiresIn: "1d" });
  });

  after(async () => {
    // Clean up test-only Property B and its scoped data
    if (propBId) {
      await Room.deleteMany({ property: propBId });
      await Reservation.deleteMany({ property: propBId });
      await Booking.deleteMany({ property: propBId });
      await HousekeepingTask.deleteMany({ property: propBId });
      await MaintenanceTicket.deleteMany({ property: propBId });
      await LostItem.deleteMany({ property: propBId });
      await Invoice.deleteMany({ property: propBId });
      await Payment.deleteMany({ property: propBId });
      await Property.deleteOne({ _id: propBId });
    }

    // Clean up test users
    await User.deleteMany({
      email: { $regex: /^(chain_admin_|staff_a_|staff_b_|customer_)/ }
    });

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // 1 & 2 & 3: Hotel Chain and Active Property Foundations
  it("1. HotelChain and Property models exist with correct hierarchy", async () => {
    const chain = await HotelChain.findById(chainId);
    assert.ok(chain, "HotelChain should exist");
    assert.strictEqual(chain.code, "GHHG");

    const prop = await Property.findById(propAId);
    assert.ok(prop, "Property A should exist");
    assert.strictEqual(prop.code, "SL-MAIN");
    assert.strictEqual(prop.chain.toString(), chainId.toString());
  });

  it("2. Exactly one active Sri Lankan property exists by default in production baseline", async () => {
    const realProps = await Property.find({ code: "SL-MAIN", status: "Active" });
    assert.strictEqual(realProps.length, 1, "Exactly one production SL-MAIN property must exist");
  });

  // 4 & 5: Compound Room Uniqueness & Scoping
  it("3. Compound Room Uniqueness: same room number allowed across different properties", async () => {
    // Delete any existing room 999 in both properties
    await Room.deleteMany({ roomNumber: "999" });

    // Create Room 999 in Property A
    const roomA = await Room.create({
      property: propAId,
      roomNumber: "999",
      roomType: "Deluxe",
      floor: 9,
      basePrice: 120,
      capacity: { maxAdults: 2, maxOccupancy: 2 },
      bedConfiguration: "King Bed",
      status: "Available"
    });
    assert.ok(roomA._id, "Room 999 in Property A should be created");

    // Create Room 999 in Property B (Same room number in another property!)
    const roomB = await Room.create({
      property: propBId,
      roomNumber: "999",
      roomType: "Suite",
      floor: 9,
      basePrice: 200,
      capacity: { maxAdults: 2, maxOccupancy: 2 },
      bedConfiguration: "King Bed",
      status: "Available"
    });
    assert.ok(roomB._id, "Room 999 in Property B should co-exist with Room 999 in Property A");

    // Attempt to create duplicate Room 999 in Property A -> must fail!
    let duplicateFailed = false;
    try {
      await Room.create({
        property: propAId,
        roomNumber: "999",
        roomType: "Single",
        floor: 9,
        basePrice: 100,
        capacity: { maxAdults: 1, maxOccupancy: 1 },
        bedConfiguration: "Single Bed",
        status: "Available"
      });
    } catch (err) {
      duplicateFailed = true;
      assert.match(err.message, /duplicate key|E11000/);
    }
    assert.strictEqual(duplicateFailed, true, "Duplicate room number within SAME property must fail");
  });

  // 6 & 7: Operational Data Property Scoping
  it("4. Room property scoping: Staff A only sees Property A rooms via API", async () => {
    const res = await fetch(`${BASE_URL}/rooms`, {
      headers: {
        Authorization: `Bearer ${propAStaffToken}`,
        "x-property-id": propAId.toString()
      }
    });
    assert.strictEqual(res.status, 200);
    const rooms = await res.json();
    assert.ok(Array.isArray(rooms));

    // Ensure all returned rooms belong to Property A
    for (const r of rooms) {
      if (r.property) {
        assert.strictEqual(r.property.toString(), propAId.toString());
      }
    }
  });

  // 8 & 9: Reservation Property Scoping
  it("5. Reservation property scoping and isolation", async () => {
    const roomA = await Room.findOne({ property: propAId, status: "Available" });
    const guest = await Guest.create({
      firstName: "Jane",
      lastName: "Doe",
      email: `jane_${Date.now()}@example.com`,
      phone: "0771234567",
      nationality: "Resident",
      nationalIdType: "National ID",
      nationalIdNumber: `NIC-${Date.now()}`
    });

    // Create reservation in Property A
    const resA = await Reservation.create({
      property: propAId,
      reservationNumber: `RES-${Date.now()}-A`,
      guest: guest._id,
      room: roomA._id,
      roomType: roomA.roomType,
      checkInDate: new Date("2027-01-10"),
      checkOutDate: new Date("2027-01-12"),
      ratePerNight: 100,
      numberOfNights: 2,
      roomCharges: 200,
      totalAmount: 200,
      numberOfAdults: 1,
      numberOfGuests: 1,
      bookingSource: "Walk-in",
      createdBy: adminUserId,
      status: "Confirmed"
    });
    assert.ok(resA._id);

    // Query reservations with Staff A (Property A context)
    const listResA = await fetch(`${BASE_URL}/reservations`, {
      headers: {
        Authorization: `Bearer ${propAStaffToken}`,
        "x-property-id": propAId.toString()
      }
    });
    assert.strictEqual(listResA.status, 200);
    const listA = await listResA.json();
    const foundInA = listA.some((r) => r._id.toString() === resA._id.toString());
    assert.strictEqual(foundInA, true, "Reservation should appear in Property A list");

    // Query reservations with Staff B (Property B context) -> Res A must NOT appear!
    const listResB = await fetch(`${BASE_URL}/reservations`, {
      headers: {
        Authorization: `Bearer ${propBStaffToken}`,
        "x-property-id": propBId.toString()
      }
    });
    assert.strictEqual(listResB.status, 200);
    const listB = await listResB.json();
    const foundInB = listB.some((r) => r._id.toString() === resA._id.toString());
    assert.strictEqual(foundInB, false, "Property A reservation MUST NOT appear in Property B list");
  });

  // 10: Cross-Property Access Rejection
  it("6. Cross-property security: Staff A cannot access Property B via header/query override", async () => {
    // Staff A is assigned to Property A. If Staff A requests x-property-id of Property B:
    const res = await fetch(`${BASE_URL}/rooms`, {
      headers: {
        Authorization: `Bearer ${propAStaffToken}`,
        "x-property-id": propBId.toString()
      }
    });
    // Server must reject unauthorized staff property switching with 403 Forbidden!
    assert.strictEqual(res.status, 403, "Staff assigned to Property A must be blocked from Property B (403)");
  });

  // 11: Housekeeping Task Property Scoping
  it("7. Housekeeping task property scoping and isolation", async () => {
    const roomA = await Room.findOne({ property: propAId });
    const roomB = await Room.findOne({ property: propBId });

    const taskA = await HousekeepingTask.create({
      property: propAId,
      room: roomA._id,
      taskType: "Daily Cleaning",
      priority: "Medium",
      status: "Pending"
    });

    const taskB = await HousekeepingTask.create({
      property: propBId,
      room: roomB._id,
      taskType: "Daily Cleaning",
      priority: "Medium",
      status: "Pending"
    });

    // Staff A views tasks
    const res = await fetch(`${BASE_URL}/housekeeping`, {
      headers: {
        Authorization: `Bearer ${propAStaffToken}`,
        "x-property-id": propAId.toString()
      }
    });
    assert.strictEqual(res.status, 200);
    const tasks = await res.json();
    const hasTaskA = tasks.some((t) => t._id.toString() === taskA._id.toString());
    const hasTaskB = tasks.some((t) => t._id.toString() === taskB._id.toString());

    assert.strictEqual(hasTaskA, true, "Staff A should see Task A");
    assert.strictEqual(hasTaskB, false, "Staff A MUST NOT see Task B from another property");
  });

  // 12: Maintenance Ticket Property Scoping
  it("8. Maintenance ticket property scoping and isolation", async () => {
    const roomA = await Room.findOne({ property: propAId });
    const roomB = await Room.findOne({ property: propBId });

    const ticketA = await MaintenanceTicket.create({
      property: propAId,
      ticketNumber: `MNT-${Date.now()}-A`,
      room: roomA._id,
      reportedBy: adminUserId,
      issueCategory: "Plumbing",
      description: "Sink leak in Prop A",
      priority: "High",
      status: "Reported"
    });

    const ticketB = await MaintenanceTicket.create({
      property: propBId,
      ticketNumber: `MNT-${Date.now()}-B`,
      room: roomB._id,
      reportedBy: adminUserId,
      issueCategory: "Electrical",
      description: "Light flickering in Prop B",
      priority: "Low",
      status: "Reported"
    });

    const res = await fetch(`${BASE_URL}/maintenance`, {
      headers: {
        Authorization: `Bearer ${propAStaffToken}`,
        "x-property-id": propAId.toString()
      }
    });
    assert.strictEqual(res.status, 200);
    const tickets = await res.json();
    const hasA = tickets.some((t) => t._id.toString() === ticketA._id.toString());
    const hasB = tickets.some((t) => t._id.toString() === ticketB._id.toString());

    assert.strictEqual(hasA, true, "Staff A should see Ticket A");
    assert.strictEqual(hasB, false, "Staff A MUST NOT see Ticket B from Property B");
  });

  // 13: LostItem Property Scoping
  it("9. Lost & Found property scoping and isolation", async () => {
    const itemA = await LostItem.create({
      property: propAId,
      itemNumber: `LOST-${Date.now()}-A`,
      itemDescription: "Blue Umbrella",
      category: "Other",
      location: "Lobby Prop A",
      foundBy: "Front Desk Staff A",
      status: "Found"
    });

    const itemB = await LostItem.create({
      property: propBId,
      itemNumber: `LOST-${Date.now()}-B`,
      itemDescription: "Gold Watch",
      category: "Jewelry",
      location: "Pool Prop B",
      foundBy: "Lifeguard Staff B",
      status: "Found"
    });

    const res = await fetch(`${BASE_URL}/lost-items`, {
      headers: {
        Authorization: `Bearer ${propAStaffToken}`,
        "x-property-id": propAId.toString()
      }
    });
    assert.strictEqual(res.status, 200);
    const items = await res.json();
    const hasA = items.some((i) => i._id.toString() === itemA._id.toString());
    const hasB = items.some((i) => i._id.toString() === itemB._id.toString());

    assert.strictEqual(hasA, true, "Staff A should see Lost Item A");
    assert.strictEqual(hasB, false, "Staff A MUST NOT see Lost Item B from Property B");
  });

  // 14: Invoices Property Scoping
  it("10. Invoice property scoping and isolation", async () => {
    const resA = await Reservation.findOne({ property: propAId });
    const invA = await Invoice.create({
      property: propAId,
      invoiceNumber: `INV-${Date.now()}-A`,
      reservation: resA._id,
      guest: resA.guest,
      checkInDate: resA.checkInDate,
      checkOutDate: resA.checkOutDate,
      numberOfNights: 1,
      roomCharges: 100,
      subtotal: 100,
      totalAmount: 100,
      balanceDue: 100,
      paymentStatus: "Unpaid",
      generatedBy: adminUserId
    });

    const invB = await Invoice.create({
      property: propBId,
      invoiceNumber: `INV-${Date.now()}-B`,
      reservation: resA._id,
      guest: resA.guest,
      checkInDate: resA.checkInDate,
      checkOutDate: resA.checkOutDate,
      numberOfNights: 1,
      roomCharges: 300,
      subtotal: 300,
      totalAmount: 300,
      balanceDue: 300,
      paymentStatus: "Unpaid",
      generatedBy: adminUserId
    });

    const res = await fetch(`${BASE_URL}/invoices`, {
      headers: {
        Authorization: `Bearer ${propAStaffToken}`,
        "x-property-id": propAId.toString()
      }
    });
    assert.strictEqual(res.status, 200);
    const invoices = await res.json();
    const hasA = invoices.some((i) => i._id.toString() === invA._id.toString());
    const hasB = invoices.some((i) => i._id.toString() === invB._id.toString());

    assert.strictEqual(hasA, true, "Staff A should see Invoice A");
    assert.strictEqual(hasB, false, "Staff A MUST NOT see Invoice B from Property B");
  });

  // 15: Customer Ownership Access Intact
  it("11. Customer ownership access works regardless of staff property scopes", async () => {
    const roomA = await Room.findOne({ property: propAId });

    // Create booking for customer
    const booking = await Booking.create({
      property: propAId,
      user: customerUser._id,
      room: roomA._id,
      checkInDate: new Date("2027-02-01"),
      checkOutDate: new Date("2027-02-03"),
      numberOfGuests: 2,
      totalPrice: 200,
      paymentMethod: "Card",
      paymentStatus: "pending",
      bookingStatus: "confirmed"
    });

    const res = await fetch(`${BASE_URL}/bookings/my-bookings`, {
      headers: {
        Authorization: `Bearer ${customerToken}`
      }
    });
    assert.strictEqual(res.status, 200);
    const customerBookings = await res.json();
    assert.ok(Array.isArray(customerBookings));
    const found = customerBookings.some((b) => b._id.toString() === booking._id.toString());
    assert.strictEqual(found, true, "Customer can see their own bookings");
  });

  // 16: Existing Canonical Reservation Concurrency Protection Intact
  it("12. Step 3 Canonical Reservation double-booking protection remains intact", async () => {
    const roomA = await Room.findOne({ property: propAId, status: "Available" });
    const checkIn = new Date("2027-03-01");
    const checkOut = new Date("2027-03-05");

    // Room is available
    await assertAvailable({
      room: roomA,
      roomId: roomA._id,
      checkInDate: checkIn,
      checkOutDate: checkOut
    });

    const testGuest = (await Guest.findOne()) || (await Guest.create({
      firstName: "Guest",
      lastName: "Tester",
      email: `tester_${Date.now()}@example.com`,
      phone: "0771234567",
      nationality: "Resident",
      nationalIdType: "National ID",
      nationalIdNumber: `NIC-${Date.now()}`
    }));

    // Create confirmed reservation for these dates
    const resDoc = await Reservation.create({
      property: propAId,
      reservationNumber: `RES-${Date.now()}-CONF`,
      guest: testGuest._id,
      createdBy: adminUserId,
      bookingSource: "Walk-in",
      numberOfAdults: 2,
      numberOfGuests: 2,
      room: roomA._id,
      roomType: roomA.roomType,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      ratePerNight: 100,
      numberOfNights: 4,
      roomCharges: 400,
      totalAmount: 400,
      status: "Confirmed"
    });

    // Attempt overlapping stay -> must throw 409
    let conflictBlocked = false;
    try {
      await assertAvailable({
        room: roomA,
        roomId: roomA._id,
        checkInDate: new Date("2027-03-02"),
        checkOutDate: new Date("2027-03-04")
      });
    } catch (err) {
      conflictBlocked = true;
      assert.strictEqual(err.statusCode, 409);
    }
    assert.strictEqual(conflictBlocked, true, "Double-booking must be blocked with 409 Conflict");
  });

  // 17: Step 4 Housekeeping Workflow Intact
  it("13. Step 4 Housekeeping checkout handoff and supervisor inspection workflow remains intact", async () => {
    const roomA = await Room.findOne({ property: propAId, roomNumber: "101" });
    await HousekeepingTask.deleteMany({ room: roomA._id });
    roomA.status = "Occupied";
    await roomA.save();

    // 1. Checkout triggers createCheckoutTask
    const task = await createCheckoutTask(roomA._id);
    assert.ok(task, "Housekeeping task should be created");
    assert.strictEqual(task.status, "Pending");
    assert.strictEqual(task.property.toString(), propAId.toString(), "Task receives property");

    // Room should be Cleaning / Dirty
    const updatedRoom = await Room.findById(roomA._id);
    assert.strictEqual(updatedRoom.status, "Cleaning");
    assert.strictEqual(updatedRoom.cleaningStatus, "Dirty");
  });

  // 18: Step 5 Maintenance Workflow Intact
  it("14. Step 5 Maintenance room blocking & housekeeping handoff remains intact", async () => {
    const roomA = await Room.findOne({ property: propAId, status: "Available" });
    await Reservation.deleteMany({ room: roomA._id });

    // Block room for maintenance
    await blockRoomForMaintenance(roomA._id, "AC Repair");
    const blockedRoom = await Room.findById(roomA._id);
    assert.strictEqual(blockedRoom.status, "Maintenance");

    // Creating maintenance ticket
    const ticket = await createTicket({
      roomId: roomA._id,
      reportedBy: adminUserId,
      description: "Air conditioner failure",
      priority: "High",
      isBlocking: false
    });
    assert.ok(ticket, "Maintenance ticket created");
    assert.strictEqual(ticket.property.toString(), propAId.toString(), "Ticket receives property");

    // Resolving and closing ticket hands room to Housekeeping (Cleaning / Dirty)
    const admin = await User.findOne({ role: "admin" });
    await closeTicket(ticket._id, admin._id);
    const releasedRoom = await Room.findById(roomA._id);
    assert.strictEqual(releasedRoom.status, "Cleaning", "Room must transition to Cleaning, not Available");
    assert.strictEqual(releasedRoom.cleaningStatus, "Dirty");

    const housekeepingTask = await HousekeepingTask.findOne({ room: roomA._id, taskType: "Maintenance Cleaning" });
    assert.ok(housekeepingTask, "Maintenance Cleaning task created for housekeeping inspection");
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (connectDB.stopDB) {
      await connectDB.stopDB();
    }
  });
});
