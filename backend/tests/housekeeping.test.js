// backend/tests/housekeeping.test.js
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
const { createCheckoutTask } = require("../services/housekeepingService");

const BASE_URL = "http://localhost:5000/api";

test("Step 4: Housekeeping & Room Status Automation Suite", async (t) => {
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGO_URI);
  }

  // Create or find test users
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

  let managerUser = await User.findOne({ email: "hk_manager_test@hotel.com" });
  if (!managerUser) {
    managerUser = await User.create({
      name: "HK Manager",
      email: "hk_manager_test@hotel.com",
      password: "password123",
      phone: "2222222222",
      role: "manager"
    });
  }

  let housekeeper1 = await User.findOne({ email: "hk_worker1_test@hotel.com" });
  if (!housekeeper1) {
    housekeeper1 = await User.create({
      name: "Cleaner Alice",
      email: "hk_worker1_test@hotel.com",
      password: "password123",
      phone: "3333333333",
      role: "housekeeping"
    });
  }

  let housekeeper2 = await User.findOne({ email: "hk_worker2_test@hotel.com" });
  if (!housekeeper2) {
    housekeeper2 = await User.create({
      name: "Cleaner Bob",
      email: "hk_worker2_test@hotel.com",
      password: "password123",
      phone: "4444444444",
      role: "housekeeping"
    });
  }

  let customerUser = await User.findOne({ email: "customer@hotel.com" });
  if (!customerUser) {
    customerUser = await User.create({
      name: "Customer Tester",
      email: "customer@hotel.com",
      password: "password123",
      phone: "5555555555",
      role: "customer"
    });
  }

  const adminToken = jwt.sign({ id: adminUser._id, role: adminUser.role }, process.env.JWT_SECRET, { expiresIn: "1h" });
  const managerToken = jwt.sign({ id: managerUser._id, role: managerUser.role }, process.env.JWT_SECRET, { expiresIn: "1h" });
  const hk1Token = jwt.sign({ id: housekeeper1._id, role: housekeeper1.role }, process.env.JWT_SECRET, { expiresIn: "1h" });
  const hk2Token = jwt.sign({ id: housekeeper2._id, role: housekeeper2.role }, process.env.JWT_SECRET, { expiresIn: "1h" });
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

  // Setup dedicated test room
  let testRoom = await Room.findOne({ roomNumber: "998" });
  if (!testRoom) {
    testRoom = await Room.create({
      roomNumber: "998",
      roomType: "Deluxe",
      basePrice: 150,
      capacity: {
        maxAdults: 2,
        maxChildren: 1,
        maxOccupancy: 3
      },
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

  let testGuest = await Guest.findOne({ email: "hk_guest_test@hotel.com" });
  if (!testGuest) {
    testGuest = await Guest.create({
      firstName: "HK",
      lastName: "GuestTest",
      email: "hk_guest_test@hotel.com",
      phone: "9876543210",
      nationalIdType: "Passport",
      nationalIdNumber: "PASS-HK-12345",
      nationality: "American"
    });
  }

  let createdReservationId = null;
  let createdTaskId = null;

  // Cleanup old test tasks for testRoom
  await HousekeepingTask.deleteMany({ room: testRoom._id });

  // 1 & 2: Checkout creates housekeeping task and room is NOT immediately Available
  await t.test("1 & 2. Checkout creates/activates housekeeping task and does NOT make room immediately Available", async () => {
    // Create and check in a reservation on testRoom
    const checkInDate = new Date();
    checkInDate.setDate(checkInDate.getDate() - 2);
    const checkOutDate = new Date();
    checkOutDate.setDate(checkOutDate.getDate() - 1);

    const reservation = await Reservation.create({
      reservationNumber: `RES-HK-${Date.now()}`,
      guest: testGuest._id,
      room: testRoom._id,
      roomType: "Deluxe",
      bookingSource: "Walk-in",
      checkInDate,
      checkOutDate,
      numberOfAdults: 1,
      numberOfGuests: 1,
      numberOfNights: 1,
      ratePerNight: 150,
      roomCharges: 150,
      totalAmount: 150,
      advancePayment: 150, // Full payment so balanceDue is 0
      paymentStatus: "Paid",
      status: "Checked-In",
      createdBy: adminUser._id
    });
    createdReservationId = reservation._id;

    testRoom.status = "Occupied";
    testRoom.currentReservation = reservation._id;
    await testRoom.save();

    // Call checkout API
    const res = await api(`/reservations/${reservation._id}/check-out`, { method: "PUT" }, adminToken);
    assert.strictEqual(res.status, 200, `Checkout must succeed: ${JSON.stringify(res.data)}`);

    // Verify room status is Cleaning, NOT Available
    const updatedRoom = await Room.findById(testRoom._id);
    assert.strictEqual(updatedRoom.status, "Cleaning", "Room status must transition to 'Cleaning'");
    assert.strictEqual(updatedRoom.cleaningStatus, "Dirty", "Room cleaningStatus must transition to 'Dirty'");

    // Verify housekeeping task created
    const task = await HousekeepingTask.findOne({ room: testRoom._id, reservation: reservation._id });
    assert.ok(task, "HousekeepingTask must be created on checkout");
    assert.strictEqual(task.taskType, "Check-out Cleaning");
    assert.strictEqual(task.status, "Pending");
    assert.strictEqual(task.priority, "High");
    createdTaskId = task._id;
  });

  // 13. Idempotency: duplicate housekeeping task is not created for the same event
  await t.test("13. Duplicate housekeeping task is not created for the same checkout/room event", async () => {
    const taskSecondCall = await createCheckoutTask(testRoom._id, createdReservationId, adminUser._id);
    assert.strictEqual(taskSecondCall._id.toString(), createdTaskId.toString(), "Must return existing pending task, not create duplicate");

    const totalTasks = await HousekeepingTask.countDocuments({ room: testRoom._id });
    assert.strictEqual(totalTasks, 1, "Exactly 1 housekeeping task must exist for this room checkout");
  });

  // Task assignment
  await t.test("Task Assignment: Manager can assign task to Housekeeping staff", async () => {
    const res = await api(`/housekeeping/${createdTaskId}/assign`, {
      method: "PUT",
      body: JSON.stringify({ staffId: housekeeper1._id })
    }, managerToken);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.status, "Assigned");
    assert.strictEqual(res.data.assignedTo._id.toString(), housekeeper1._id.toString());
  });

  // 3. Housekeeping staff can see assigned tasks
  await t.test("3. Housekeeping staff can see assigned tasks", async () => {
    const res = await api("/housekeeping/my", { method: "GET" }, hk1Token);
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data), "Tasks must be an array");
    const myTask = res.data.find(t => t._id.toString() === createdTaskId.toString());
    assert.ok(myTask, "Assigned task must be in housekeeper's my tasks list");
  });

  // 6. Unauthorized user cannot modify housekeeping task
  await t.test("6. Unauthorized user cannot start/complete task assigned to another staff", async () => {
    // Worker 2 attempts to start Worker 1's task
    const resHk2 = await api(`/housekeeping/${createdTaskId}/start`, { method: "PUT" }, hk2Token);
    assert.strictEqual(resHk2.status, 403, "Other staff must receive 403 Forbidden");

    // Customer attempts to modify task
    const resCustomer = await api(`/housekeeping/${createdTaskId}/start`, { method: "PUT" }, customerToken);
    assert.strictEqual(resCustomer.status, 403, "Customer must receive 403 Forbidden");
  });

  // 4. Housekeeping staff can start a task
  await t.test("4. Housekeeping staff can start a task", async () => {
    const res = await api(`/housekeeping/${createdTaskId}/start`, { method: "PUT" }, hk1Token);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.status, "In Progress");
    assert.ok(res.data.startedAt, "startedAt must be populated");
  });

  // 5. Housekeeping staff can complete cleaning
  await t.test("5. Housekeeping staff can complete cleaning", async () => {
    const res = await api(`/housekeeping/${createdTaskId}/complete`, {
      method: "PUT",
      body: JSON.stringify({
        notes: "Linen changed, sanitized, minibar restocked",
        lostItems: [{
          itemDescription: "Blue sunglasses",
          location: "Nightstand drawer",
          foundBy: "Cleaner Alice"
        }]
      })
    }, hk1Token);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.status, "Completed");
    assert.ok(res.data.completedAt, "completedAt must be populated");
    assert.strictEqual(res.data.lostItems.length, 1);

    // Verify room is Clean, but still in Cleaning status (awaiting inspection)
    const room = await Room.findById(testRoom._id);
    assert.strictEqual(room.cleaningStatus, "Clean", "Room cleaningStatus is now Clean");
    assert.strictEqual(room.status, "Cleaning", "Room status must remain Cleaning until supervisor inspection");
  });

  // 7. Supervisor can inspect completed task
  await t.test("7. Supervisor can view completed task list for inspection", async () => {
    const res = await api("/housekeeping?status=Completed", { method: "GET" }, managerToken);
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data), "Tasks list must be an array");
    const completedTask = res.data.find(t => t._id.toString() === createdTaskId.toString());
    assert.ok(completedTask, "Completed task must be found in supervisor list");
  });

  // 9. Supervisor rejection sends room back for cleaning
  await t.test("9. Supervisor rejection sends room back for cleaning", async () => {
    const res = await api(`/housekeeping/${createdTaskId}/inspect`, {
      method: "PUT",
      body: JSON.stringify({
        approved: false,
        notes: "Bathroom mirror needs wiping"
      })
    }, managerToken);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.status, "Needs Recleaning");

    const room = await Room.findById(testRoom._id);
    assert.strictEqual(room.status, "Cleaning", "Room status remains Cleaning");
    assert.strictEqual(room.cleaningStatus, "Dirty", "Room cleaningStatus set back to Dirty");

    // Worker 1 restarts and recompletes
    const startRes = await api(`/housekeeping/${createdTaskId}/start`, { method: "PUT" }, hk1Token);
    assert.strictEqual(startRes.status, 200, "Worker 1 restart must succeed");

    const completeRes = await api(`/housekeeping/${createdTaskId}/complete`, {
      method: "PUT",
      body: JSON.stringify({ notes: "Mirror cleaned" })
    }, hk1Token);
    assert.strictEqual(completeRes.status, 200, "Worker 1 recomplete must succeed");
  });

  // 8. Supervisor approval makes room Available
  await t.test("8. Supervisor approval makes room Available", async () => {
    const res = await api(`/housekeeping/${createdTaskId}/inspect`, {
      method: "PUT",
      body: JSON.stringify({
        approved: true,
        notes: "Room inspection passed 100%"
      })
    }, managerToken);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.status, "Inspected");

    const room = await Room.findById(testRoom._id);
    assert.strictEqual(room.status, "Available", "Room status must become Available upon approval");
    assert.strictEqual(room.cleaningStatus, "Clean", "Room cleaningStatus must be Clean");
  });

  // 10, 11, 12: Room availability protection
  await t.test("10. Dirty/Cleaning rooms cannot be booked or reserved", async () => {
    // Put testRoom in Cleaning status
    testRoom.status = "Cleaning";
    testRoom.cleaningStatus = "Dirty";
    await testRoom.save();

    const futureIn = new Date("2026-12-01");
    const futureOut = new Date("2026-12-03");

    const res = await api("/reservations", {
      method: "POST",
      body: JSON.stringify({
        guestId: testGuest._id,
        roomId: testRoom._id,
        roomType: "Deluxe",
        bookingSource: "Walk-in",
        ratePerNight: 150,
        numberOfAdults: 1,
        checkInDate: futureIn,
        checkOutDate: futureOut,
        advancePayment: 300
      })
    }, adminToken);

    assert.strictEqual(res.status, 409, "Server must reject booking room in Cleaning/Dirty state with 409 Conflict");
  });

  await t.test("11. Maintenance rooms cannot be booked", async () => {
    testRoom.status = "Maintenance";
    await testRoom.save();

    const futureIn = new Date("2026-12-05");
    const futureOut = new Date("2026-12-07");

    const res = await api("/reservations", {
      method: "POST",
      body: JSON.stringify({
        guestId: testGuest._id,
        roomId: testRoom._id,
        roomType: "Deluxe",
        bookingSource: "Walk-in",
        ratePerNight: 150,
        numberOfAdults: 1,
        checkInDate: futureIn,
        checkOutDate: futureOut,
        advancePayment: 300
      })
    }, adminToken);

    assert.strictEqual(res.status, 409, "Server must reject booking Maintenance room with 409 Conflict");
  });

  await t.test("12. Out of Order rooms cannot be booked", async () => {
    testRoom.status = "Out of Order";
    await testRoom.save();

    const futureIn = new Date("2026-12-10");
    const futureOut = new Date("2026-12-12");

    const res = await api("/reservations", {
      method: "POST",
      body: JSON.stringify({
        guestId: testGuest._id,
        roomId: testRoom._id,
        roomType: "Deluxe",
        bookingSource: "Walk-in",
        ratePerNight: 150,
        numberOfAdults: 1,
        checkInDate: futureIn,
        checkOutDate: futureOut,
        advancePayment: 300
      })
    }, adminToken);

    assert.strictEqual(res.status, 409, "Server must reject booking Out of Order room with 409 Conflict");
  });

  // Cleanup
  testRoom.status = "Available";
  testRoom.cleaningStatus = "Clean";
  await testRoom.save();
  if (createdReservationId) {
    await Reservation.findByIdAndDelete(createdReservationId);
  }
  await HousekeepingTask.deleteMany({ room: testRoom._id });

  await mongoose.disconnect();
});
