// backend/tests/maintenanceAndLostFound.test.js
const test = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const Room = require("../models/Room");
const User = require("../models/User");
const Guest = require("../models/Guest");
const Reservation = require("../models/Reservation");
const HousekeepingTask = require("../models/HousekeepingTask");
const MaintenanceTicket = require("../models/MaintenanceTicket");
const LostItem = require("../models/LostItem");
const { createCheckoutTask } = require("../services/housekeepingService");
const app = require("../server");

let BASE_URL = "http://localhost:5000/api";
let server = null;

test("Step 5: Maintenance & Lost and Found Comprehensive Suite", async (t) => {
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGO_URI);
  }

  // Start ephemeral server
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      BASE_URL = `http://127.0.0.1:${port}/api`;
      resolve();
    });
  });

  // Setup test users
  let adminUser = await User.findOne({ email: "admin@hotel.com" });
  if (!adminUser) {
    adminUser = await User.create({
      name: "Admin Tester",
      email: "admin@hotel.com",
      password: "password123",
      phone: "1111111111",
      role: "admin"
    });
  }

  let managerUser = await User.findOne({ email: "mnt_manager_test@hotel.com" });
  if (!managerUser) {
    managerUser = await User.create({
      name: "MNT Manager",
      email: "mnt_manager_test@hotel.com",
      password: "password123",
      phone: "2222222223",
      role: "manager"
    });
  }

  let tech1 = await User.findOne({ email: "tech1_test@hotel.com" });
  if (!tech1) {
    tech1 = await User.create({
      name: "Technician Dave",
      email: "tech1_test@hotel.com",
      password: "password123",
      phone: "3333333334",
      role: "maintenance"
    });
  }

  let tech2 = await User.findOne({ email: "tech2_test@hotel.com" });
  if (!tech2) {
    tech2 = await User.create({
      name: "Technician Frank",
      email: "tech2_test@hotel.com",
      password: "password123",
      phone: "4444444445",
      role: "maintenance"
    });
  }

  let housekeeper = await User.findOne({ email: "hk_worker_step5@hotel.com" });
  if (!housekeeper) {
    housekeeper = await User.create({
      name: "Housekeeper Sara",
      email: "hk_worker_step5@hotel.com",
      password: "password123",
      phone: "5555555556",
      role: "housekeeping"
    });
  }

  let customerUser = await User.findOne({ email: "customer@hotel.com" });
  if (!customerUser) {
    customerUser = await User.create({
      name: "Customer Tester",
      email: "customer@hotel.com",
      password: "password123",
      phone: "6666666667",
      role: "customer"
    });
  }

  let testGuest = await Guest.findOne({ email: "mnt_guest_test@hotel.com" });
  if (!testGuest) {
    testGuest = await Guest.create({
      firstName: "Maintenance",
      lastName: "GuestTest",
      email: "mnt_guest_test@hotel.com",
      phone: "9876543219",
      nationalIdType: "Passport",
      nationalIdNumber: "PASS-MNT-12345",
      nationality: "Canadian"
    });
  }

  const adminToken = jwt.sign({ id: adminUser._id, role: adminUser.role }, process.env.JWT_SECRET, { expiresIn: "1h" });
  const managerToken = jwt.sign({ id: managerUser._id, role: managerUser.role }, process.env.JWT_SECRET, { expiresIn: "1h" });
  const tech1Token = jwt.sign({ id: tech1._id, role: tech1.role }, process.env.JWT_SECRET, { expiresIn: "1h" });
  const tech2Token = jwt.sign({ id: tech2._id, role: tech2.role }, process.env.JWT_SECRET, { expiresIn: "1h" });
  const hkToken = jwt.sign({ id: housekeeper._id, role: housekeeper.role }, process.env.JWT_SECRET, { expiresIn: "1h" });
  const customerToken = jwt.sign({ id: customerUser._id, role: customerUser.role }, process.env.JWT_SECRET, { expiresIn: "1h" });

  async function api(endpoint, options = {}, token = null) {
    const headers = { "Content-Type": "application/json", ...options.headers };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });
    let data;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { status: res.status, data };
  }

  // Setup test room
  let testRoom = await Room.findOne({ roomNumber: "997" });
  if (!testRoom) {
    testRoom = await Room.create({
      roomNumber: "997",
      roomType: "Deluxe",
      basePrice: 200,
      capacity: { maxAdults: 2, maxChildren: 1, maxOccupancy: 3 },
      bedConfiguration: "King Bed",
      floor: 9,
      status: "Available",
      cleaningStatus: "Clean",
      isActive: true
    });
  } else {
    testRoom.status = "Available";
    testRoom.cleaningStatus = "Clean";
    testRoom.currentReservation = null;
    await testRoom.save();
  }

  // Cleanup old tickets and tasks for test room
  await MaintenanceTicket.deleteMany({ room: testRoom._id });
  await HousekeepingTask.deleteMany({ room: testRoom._id });
  await LostItem.deleteMany({ room: testRoom._id });

  let createdTicketId = null;

  // ==========================================
  // PART 1: MAINTENANCE MANAGEMENT
  // ==========================================

  await t.test("1 & 2. Create maintenance ticket starts in Reported status", async () => {
    const res = await api("/maintenance", {
      method: "POST",
      body: JSON.stringify({
        roomId: testRoom._id,
        issueCategory: "Plumbing",
        description: "Bathroom sink faucet leaking persistently",
        priority: "High",
        estimatedCost: 75
      })
    }, managerToken);

    assert.strictEqual(res.status, 201, `Create ticket failed: ${JSON.stringify(res.data)}`);
    assert.ok(res.data.ticketNumber, "Ticket number must be generated");
    assert.strictEqual(res.data.status, "Reported", "Ticket must start in 'Reported' status");
    assert.strictEqual(res.data.priority, "High");
    assert.strictEqual(res.data.estimatedCost, 75);
    assert.ok(res.data.auditLog && res.data.auditLog.length > 0, "Audit log must contain TICKET_CREATED");
    createdTicketId = res.data._id;
  });

  await t.test("3. Manager can assign ticket to technician", async () => {
    const res = await api(`/maintenance/${createdTicketId}/assign`, {
      method: "PUT",
      body: JSON.stringify({ technicianId: tech1._id })
    }, managerToken);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.status, "Assigned");
    assert.strictEqual(res.data.assignedTechnician._id.toString(), tech1._id.toString());
  });

  await t.test("4. Technician can view assigned tickets", async () => {
    const res = await api("/maintenance/my", { method: "GET" }, tech1Token);
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data), "Result must be an array");
    const found = res.data.find(t => t._id.toString() === createdTicketId.toString());
    assert.ok(found, "Assigned ticket must appear in technician's list");
  });

  await t.test("8. Unauthorized technician cannot start/resolve another technician's ticket", async () => {
    // Tech 2 attempts to start Tech 1's ticket
    const resTech2 = await api(`/maintenance/${createdTicketId}/start`, { method: "PUT" }, tech2Token);
    assert.strictEqual(resTech2.status, 403, "Other technician must receive 403 Forbidden");

    // Customer attempts to access
    const resCust = await api(`/maintenance/${createdTicketId}/start`, { method: "PUT" }, customerToken);
    assert.strictEqual(resCust.status, 403, "Customer must receive 403 Forbidden");
  });

  await t.test("5. Assigned technician starts work on ticket", async () => {
    const res = await api(`/maintenance/${createdTicketId}/start`, { method: "PUT" }, tech1Token);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.status, "In Progress");
    assert.ok(res.data.startedAt, "startedAt timestamp must be recorded");
  });

  await t.test("7. Invalid lifecycle transition is rejected", async () => {
    // Try to jump from In Progress directly to Closed (only Resolved tickets can be closed)
    const resInvalid = await api(`/maintenance/${createdTicketId}/close`, { method: "PUT" }, managerToken);
    assert.strictEqual(resInvalid.status, 409, "Illegal transition must return 409 Conflict");
  });

  await t.test("6. Assigned technician resolves ticket", async () => {
    const res = await api(`/maintenance/${createdTicketId}/resolve`, {
      method: "PUT",
      body: JSON.stringify({
        resolutionNotes: "Replaced faulty cartridge and sealed connections",
        actualCost: 60
      })
    }, tech1Token);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.status, "Resolved");
    assert.strictEqual(res.data.actualCost, 60);
    assert.ok(res.data.resolvedAt, "resolvedAt timestamp must be recorded");
  });

  // ==========================================
  // PART 2: ROOM BLOCKING & STEP 4 HANDOFF
  // ==========================================

  await t.test("9. Maintenance room cannot be booked", async () => {
    // Block testRoom for maintenance
    const blockRes = await api("/maintenance/block-room", {
      method: "PUT",
      body: JSON.stringify({
        roomId: testRoom._id,
        reason: "Plumbing repair in progress"
      })
    }, managerToken);
    assert.strictEqual(blockRes.status, 200);

    const room = await Room.findById(testRoom._id);
    assert.strictEqual(room.status, "Maintenance");

    // Attempt to book room
    const futureIn = new Date("2026-11-10");
    const futureOut = new Date("2026-11-12");

    const res = await api("/reservations", {
      method: "POST",
      body: JSON.stringify({
        guestId: testGuest._id,
        roomId: testRoom._id,
        roomType: "Deluxe",
        bookingSource: "Walk-in",
        ratePerNight: 200,
        numberOfAdults: 1,
        checkInDate: futureIn,
        checkOutDate: futureOut,
        advancePayment: 400
      })
    }, adminToken);

    assert.strictEqual(res.status, 409, "Server must reject booking room in Maintenance state with 409 Conflict");
  });

  await t.test("10. Occupied room cannot be silently blocked for maintenance", async () => {
    // Set room to Occupied
    testRoom.status = "Occupied";
    await testRoom.save();

    const res = await api("/maintenance/block-room", {
      method: "PUT",
      body: JSON.stringify({
        roomId: testRoom._id,
        reason: "Scheduled carpet replacement"
      })
    }, managerToken);

    assert.strictEqual(res.status, 409, "Blocking Occupied room must return 409 Conflict");
    assert.strictEqual(res.data.conflictType, "ROOM_OCCUPIED");
  });

  await t.test("11. Conflicting confirmed reservation prevents room blocking", async () => {
    testRoom.status = "Available";
    await testRoom.save();

    // Create a confirmed reservation in the near future
    const checkInDate = new Date();
    checkInDate.setDate(checkInDate.getDate() + 1);
    const checkOutDate = new Date();
    checkOutDate.setDate(checkOutDate.getDate() + 3);

    const confRes = await Reservation.create({
      reservationNumber: `RES-MNT-TEST-${Date.now()}`,
      guest: testGuest._id,
      room: testRoom._id,
      roomType: "Deluxe",
      bookingSource: "Walk-in",
      checkInDate,
      checkOutDate,
      numberOfAdults: 1,
      numberOfGuests: 1,
      numberOfNights: 2,
      ratePerNight: 200,
      roomCharges: 400,
      totalAmount: 400,
      status: "Confirmed",
      createdBy: adminUser._id
    });

    const res = await api("/maintenance/block-room", {
      method: "PUT",
      body: JSON.stringify({
        roomId: testRoom._id,
        reason: "Painting walls"
      })
    }, managerToken);

    assert.strictEqual(res.status, 409, "Conflicting reservation must block status change");
    assert.strictEqual(res.data.conflictType, "CONFLICTING_RESERVATIONS");

    // Clean up confirmed reservation
    await Reservation.findByIdAndDelete(confRes._id);
  });

  await t.test("12 & 13. Closing maintenance does NOT make room Available; creates Maintenance Cleaning task", async () => {
    // Put testRoom in Maintenance
    testRoom.status = "Maintenance";
    await testRoom.save();

    // Link createdTicket to testRoom
    await MaintenanceTicket.findByIdAndUpdate(createdTicketId, { isBlocking: true });

    // Manager closes resolved ticket
    const closeRes = await api(`/maintenance/${createdTicketId}/close`, {
      method: "PUT",
      body: JSON.stringify({ notes: "Work verified by maintenance supervisor" })
    }, managerToken);

    assert.strictEqual(closeRes.status, 200);
    assert.strictEqual(closeRes.data.status, "Closed");

    // 12. Verify room status is Cleaning (Dirty), NOT Available!
    const room = await Room.findById(testRoom._id);
    assert.strictEqual(room.status, "Cleaning", "Room must transition to 'Cleaning', NOT 'Available'");
    assert.strictEqual(room.cleaningStatus, "Dirty", "Room cleaningStatus must be 'Dirty'");

    // 13. Verify 'Maintenance Cleaning' HousekeepingTask was created
    const hkTask = await HousekeepingTask.findOne({ room: testRoom._id, taskType: "Maintenance Cleaning" });
    assert.ok(hkTask, "A 'Maintenance Cleaning' task must be automatically generated");
    assert.strictEqual(hkTask.status, "Pending");
    assert.strictEqual(hkTask.priority, "High");
  });

  await t.test("14. Step 4 inspection workflow is required before room becomes Available", async () => {
    const hkTask = await HousekeepingTask.findOne({ room: testRoom._id, taskType: "Maintenance Cleaning" });
    assert.ok(hkTask);

    // Housekeeper Sara starts cleaning
    const startRes = await api(`/housekeeping/${hkTask._id}/start`, { method: "PUT" }, hkToken);
    assert.strictEqual(startRes.status, 200);

    // Housekeeper Sara completes cleaning
    const completeRes = await api(`/housekeeping/${hkTask._id}/complete`, {
      method: "PUT",
      body: JSON.stringify({ notes: "Plumbing debris cleaned, room sanitized" })
    }, hkToken);
    assert.strictEqual(completeRes.status, 200);

    // Room must still be Cleaning (awaiting supervisor inspection!)
    let room = await Room.findById(testRoom._id);
    assert.strictEqual(room.cleaningStatus, "Clean");
    assert.strictEqual(room.status, "Cleaning", "Room must remain in Cleaning status until inspection");

    // Supervisor manager inspects and approves
    const inspectRes = await api(`/housekeeping/${hkTask._id}/inspect`, {
      method: "PUT",
      body: JSON.stringify({ approved: true, notes: "Room inspected and spotless" })
    }, managerToken);
    assert.strictEqual(inspectRes.status, 200);

    // Room is finally Available!
    room = await Room.findById(testRoom._id);
    assert.strictEqual(room.status, "Available", "Room status must now be 'Available' after inspection approval");
    assert.strictEqual(room.cleaningStatus, "Clean");
  });

  // ==========================================
  // PART 3: LOST & FOUND MANAGEMENT
  // ==========================================

  let createdLostItemId = null;

  await t.test("15. Create LostItem record", async () => {
    const res = await api("/lost-items", {
      method: "POST",
      body: JSON.stringify({
        itemDescription: "Apple Watch Series 8, black band",
        category: "Electronics",
        roomId: testRoom._id,
        location: "Under bed frame in Room 997",
        foundBy: "Cleaner Sara",
        storageLocation: "Safe Box B-12"
      })
    }, hkToken);

    assert.strictEqual(res.status, 201, `Create lost item failed: ${JSON.stringify(res.data)}`);
    assert.ok(res.data.itemNumber, "itemNumber must be generated");
    assert.strictEqual(res.data.status, "Found");
    assert.strictEqual(res.data.category, "Electronics");
    assert.ok(res.data.auditLog && res.data.auditLog.length > 0, "Audit log must contain ITEM_REPORTED");
    createdLostItemId = res.data._id;
  });

  await t.test("16. Search/filter LostItems", async () => {
    const res = await api("/lost-items?category=Electronics", { method: "GET" }, managerToken);
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data));
    const item = res.data.find(i => i._id.toString() === createdLostItemId.toString());
    assert.ok(item, "Created electronics item must be found in category filter");

    const searchRes = await api("/lost-items?search=Apple+Watch", { method: "GET" }, managerToken);
    assert.strictEqual(searchRes.status, 200);
    const searchFound = searchRes.data.find(i => i._id.toString() === createdLostItemId.toString());
    assert.ok(searchFound, "Search by description must return the item");
  });

  await t.test("17 & 18. Housekeeping task completion automatically & idempotently creates canonical LostItem", async () => {
    // Create checkout task
    const hkTask = await HousekeepingTask.create({
      room: testRoom._id,
      taskType: "Check-out Cleaning",
      status: "In Progress",
      priority: "Medium",
      assignedTo: housekeeper._id
    });

    // Complete task with an embedded lost item
    const completeRes = await api(`/housekeeping/${hkTask._id}/complete`, {
      method: "PUT",
      body: JSON.stringify({
        notes: "Routine checkout cleaning",
        lostItems: [{
          itemDescription: "Gold necklace with heart pendant",
          location: "Bathroom countertop",
          foundBy: "Cleaner Sara"
        }]
      })
    }, hkToken);

    assert.strictEqual(completeRes.status, 200);
    // 17. Verify embedded array preserved for backward compatibility
    assert.strictEqual(completeRes.data.lostItems.length, 1);

    // Verify canonical LostItem created
    const canonicalItem = await LostItem.findOne({
      sourceTask: hkTask._id,
      itemDescription: "Gold necklace with heart pendant"
    });
    assert.ok(canonicalItem, "Canonical LostItem record must be created");
    assert.strictEqual(canonicalItem.status, "Found");
    assert.strictEqual(canonicalItem.foundBy, "Cleaner Sara");

    // 18. Idempotency test: calling sync again does not duplicate
    const countBefore = await LostItem.countDocuments({ sourceTask: hkTask._id });
    const { syncFromHousekeepingTask } = require("../services/lostItemService");
    await syncFromHousekeepingTask(hkTask, housekeeper._id);
    const countAfter = await LostItem.countDocuments({ sourceTask: hkTask._id });
    assert.strictEqual(countBefore, countAfter, "Idempotent sync must not create duplicates");

    // Clean up task
    await HousekeepingTask.findByIdAndDelete(hkTask._id);
    await LostItem.findByIdAndDelete(canonicalItem._id);
  });

  await t.test("19 & 20. Claim item records claimant details and verification", async () => {
    const res = await api(`/lost-items/${createdLostItemId}/claim`, {
      method: "PUT",
      body: JSON.stringify({
        claimantName: "John Smith",
        claimantPhone: "555-888-9999",
        claimantEmail: "john.smith@gmail.com",
        handoverVerification: "Matched serial number and unlocked device with passcode",
        notes: "Returned to guest at front desk"
      })
    }, managerToken);

    assert.strictEqual(res.status, 200, `Claim failed: ${JSON.stringify(res.data)}`);
    assert.strictEqual(res.data.status, "Claimed");
    assert.strictEqual(res.data.claimantName, "John Smith");
    assert.strictEqual(res.data.claimantPhone, "555-888-9999");
    assert.ok(res.data.claimedAt, "claimedAt timestamp must be recorded");

    const auditEntry = res.data.auditLog.find(a => a.action === "ITEM_CLAIMED");
    assert.ok(auditEntry, "ITEM_CLAIMED audit record must be logged");
  });

  await t.test("21. Unauthorized user cannot claim or dispose items", async () => {
    // Create an item to test
    const testItem = await LostItem.create({
      itemNumber: `LOST-TEST-${Date.now()}`,
      itemDescription: "Forgotten book",
      location: "Lobby",
      foundBy: "Front Desk",
      status: "Found"
    });

    // Customer attempts to claim
    const resCustomerClaim = await api(`/lost-items/${testItem._id}/claim`, {
      method: "PUT",
      body: JSON.stringify({ claimantName: "Bad Actor", claimantPhone: "000" })
    }, customerToken);
    assert.strictEqual(resCustomerClaim.status, 403, "Customer claim must return 403");

    // Housekeeper attempts to dispose (only manager/admin authorized)
    const resHkDispose = await api(`/lost-items/${testItem._id}/dispose`, {
      method: "PUT",
      body: JSON.stringify({ disposalReason: "Damaged" })
    }, hkToken);
    assert.strictEqual(resHkDispose.status, 403, "Housekeeper disposal must return 403");

    // Clean up
    await LostItem.findByIdAndDelete(testItem._id);
  });

  await t.test("22 & 23. Disposal workflow requires reason and logs audit record", async () => {
    // Create an unclaimed disposable item
    const expiredItem = await LostItem.create({
      itemNumber: `LOST-EXP-${Date.now()}`,
      itemDescription: "Perishable food item in minibar",
      location: "Room 997",
      foundBy: "Sara",
      status: "Found"
    });

    const res = await api(`/lost-items/${expiredItem._id}/dispose`, {
      method: "PUT",
      body: JSON.stringify({
        disposalReason: "Perishable item exceeded 48h health limit",
        notes: "Disposed in organic waste per policy"
      })
    }, managerToken);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.status, "Disposed");
    assert.strictEqual(res.data.disposalReason, "Perishable item exceeded 48h health limit");
    assert.ok(res.data.disposedAt);

    const auditEntry = res.data.auditLog.find(a => a.action === "ITEM_DISPOSED");
    assert.ok(auditEntry, "ITEM_DISPOSED audit record must be logged");

    // Clean up
    await LostItem.findByIdAndDelete(expiredItem._id);
  });

  // Final cleanup
  if (createdTicketId) {
    await MaintenanceTicket.findByIdAndDelete(createdTicketId);
  }
  if (createdLostItemId) {
    await LostItem.findByIdAndDelete(createdLostItemId);
  }
  await HousekeepingTask.deleteMany({ room: testRoom._id });
  testRoom.status = "Available";
  testRoom.cleaningStatus = "Clean";
  await testRoom.save();

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }

  await mongoose.disconnect();
});
