// backend/tests/roomLifecycleHousekeeping.test.js
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const roomRoutes = require('../routes/roomRoutes');
const housekeepingRoutes = require('../routes/housekeepingRoutes');
const reservationRoutes = require('../routes/reservationRoutes');
const bookingRoutes = require('../routes/bookingRoutes');
const { propertyContext } = require('../middleware/propertyContext');

const HotelChain = require('../models/HotelChain');
const Property = require('../models/Property');
const Room = require('../models/Room');
const User = require('../models/User');
const Guest = require('../models/Guest');
const Booking = require('../models/Booking');
const Reservation = require('../models/Reservation');
const HousekeepingTask = require('../models/HousekeepingTask');
const { createCheckoutTask } = require('../services/housekeepingService');
const { assertAvailable } = require('../services/availabilityService');

process.env.JWT_SECRET = 'room-lifecycle-housekeeping-test-secret';

let mongo;
let server;
let baseUrl;
let property;
let room;
let customer;
let cleanerAlice;
let cleanerBob;
let managerUser;
let adminUser;

function createToken(userObj) {
  return jwt.sign(
    {
      id: userObj._id.toString(),
      role: userObj.role,
      name: userObj.name,
      departmentPermissions: userObj.departmentPermissions || ['rooms', 'reservations', 'front_desk']
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('Room Availability Restoration & Housekeeping Lifecycle Test Suite', () => {
  before(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());

    const chain = await HotelChain.create({ name: 'Serendib Chain', code: 'SER', status: 'Active' });
    property = await Property.create({
      name: 'Serendib Grand Colombo',
      code: 'SER-COL',
      chain: chain._id,
      status: 'Active',
      address: 'Colombo, Sri Lanka'
    });

    adminUser = await User.create({
      name: 'Admin User',
      email: 'admin_hk@hotel.com',
      password: 'password123',
      phone: '0770000001',
      role: 'admin',
      property: property._id
    });

    managerUser = await User.create({
      name: 'HK Manager',
      email: 'manager_hk@hotel.com',
      password: 'password123',
      phone: '0770000002',
      role: 'manager',
      property: property._id
    });

    cleanerAlice = await User.create({
      name: 'Cleaner Alice',
      email: 'alice_cleaner@hotel.com',
      password: 'password123',
      phone: '0770000003',
      role: 'housekeeping',
      property: property._id
    });

    cleanerBob = await User.create({
      name: 'Cleaner Bob',
      email: 'bob_cleaner@hotel.com',
      password: 'password123',
      phone: '0770000004',
      role: 'housekeeping',
      property: property._id
    });

    customer = await User.create({
      name: 'Valued Customer',
      email: 'customer_hk@hotel.com',
      password: 'password123',
      phone: '0770000005',
      role: 'customer',
      property: property._id
    });

    room = await Room.create({
      property: property._id,
      roomNumber: '101',
      roomType: 'Deluxe',
      floor: 1,
      basePrice: 150,
      capacity: { maxAdults: 2, maxChildren: 1, maxOccupancy: 3 },
      bedConfiguration: 'King Bed',
      status: 'Available',
      cleaningStatus: 'Clean',
      isActive: true
    });

    const app = express();
    app.use(express.json());
    app.use(propertyContext);
    app.use('/api/rooms', roomRoutes);
    app.use('/api/housekeeping', housekeepingRoutes);
    app.use('/api/reservations', reservationRoutes);
    app.use('/api/bookings', bookingRoutes);

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();
    if (mongo) await mongo.stop();
  });

  let guest1;
  let reservation1;
  let housekeepingTask1;

  it('1. Guest checkout creates a cleaning task and sets room to Cleaning & Dirty', async () => {
    guest1 = await Guest.create({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      phone: '0771234567',
      nationality: 'Resident',
      nationalIdType: 'National ID',
      nationalIdNumber: 'NIC-10101',
      property: property._id
    });

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    reservation1 = await Reservation.create({
      property: property._id,
      reservationNumber: 'RES-HK-101',
      guest: guest1._id,
      room: room._id,
      roomType: room.roomType,
      bookingSource: 'Walk-in',
      checkInDate: yesterday,
      checkOutDate: now,
      numberOfAdults: 1,
      numberOfGuests: 1,
      numberOfNights: 1,
      ratePerNight: 150,
      roomCharges: 150,
      totalAmount: 150,
      advancePayment: 150,
      paymentStatus: 'Paid',
      status: 'Checked-In',
      createdBy: adminUser._id
    });

    room.status = 'Occupied';
    room.currentReservation = reservation1._id;
    await room.save();

    // Perform checkout via API
    const res = await fetch(`${baseUrl}/api/reservations/${reservation1._id}/check-out`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${createToken(adminUser)}`
      },
      body: JSON.stringify({ actualCheckOutDate: new Date() })
    });

    assert.strictEqual(res.status, 200);

    // Verify room state
    const updatedRoom = await Room.findById(room._id);
    assert.strictEqual(updatedRoom.status, 'Cleaning');
    assert.strictEqual(updatedRoom.cleaningStatus, 'Dirty');
    assert.strictEqual(updatedRoom.currentReservation, null);

    // Verify housekeeping task
    const task = await HousekeepingTask.findOne({ room: room._id, reservation: reservation1._id });
    assert.ok(task, 'Housekeeping task must be automatically created upon checkout');
    assert.strictEqual(task.taskType, 'Check-out Cleaning');
    assert.strictEqual(task.status, 'Pending');
    assert.strictEqual(task.priority, 'High');

    housekeepingTask1 = task;
  });

  it('2. Room becomes unavailable after checkout (both API query and assertAvailable)', async () => {
    // Check available rooms API without dates
    const resNoDates = await fetch(`${baseUrl}/api/rooms/available`, {
      headers: { Authorization: `Bearer ${createToken(customer)}` }
    });
    assert.strictEqual(resNoDates.status, 200);
    const availableRoomsNoDates = await resNoDates.json();
    const found1 = availableRoomsNoDates.find((r) => r._id.toString() === room._id.toString());
    assert.strictEqual(found1, undefined, 'Room in Cleaning status must not appear in available rooms without dates');

    // Check available rooms API with dates
    const resDates = await fetch(
      `${baseUrl}/api/rooms/available?checkInDate=2026-12-01&checkOutDate=2026-12-03`,
      { headers: { Authorization: `Bearer ${createToken(customer)}` } }
    );
    assert.strictEqual(resDates.status, 200);
    const availableRoomsDates = await resDates.json();
    const found2 = availableRoomsDates.find((r) => r._id.toString() === room._id.toString());
    assert.strictEqual(found2, undefined, 'Room in Cleaning status must not appear in available rooms for date range');

    // Assert backend availability check fails
    const currentRoomDoc = await Room.findById(room._id);
    await assert.rejects(
      async () => {
        await assertAvailable({
          room: currentRoomDoc,
          roomId: room._id,
          checkInDate: new Date('2026-12-01'),
          checkOutDate: new Date('2026-12-03')
        });
      },
      (err) => err.statusCode === 409
    );
  });

  it('3. Starting cleaning updates the task to In Progress and records staff and timestamp', async () => {
    // Assign task to Cleaner Alice
    const assignRes = await fetch(`${baseUrl}/api/housekeeping/${housekeepingTask1._id}/assign`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${createToken(managerUser)}`
      },
      body: JSON.stringify({ staffId: cleanerAlice._id })
    });
    assert.strictEqual(assignRes.status, 200);

    // Cleaner Alice starts cleaning
    const startRes = await fetch(`${baseUrl}/api/housekeeping/${housekeepingTask1._id}/start`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${createToken(cleanerAlice)}`
      }
    });

    assert.strictEqual(startRes.status, 200);
    const startedTask = await startRes.json();
    assert.strictEqual(startedTask.status, 'In Progress');
    assert.ok(startedTask.startedAt, 'startedAt timestamp must be recorded');
    assert.strictEqual(startedTask.assignedTo._id.toString(), cleanerAlice._id.toString());

    // Room must remain in Cleaning / Dirty
    const roomState = await Room.findById(room._id);
    assert.strictEqual(roomState.status, 'Cleaning');
    assert.strictEqual(roomState.cleaningStatus, 'Dirty');
  });

  it('4. Room remains unavailable during cleaning', async () => {
    const res = await fetch(`${baseUrl}/api/rooms/available`, {
      headers: { Authorization: `Bearer ${createToken(customer)}` }
    });
    const rooms = await res.json();
    const found = rooms.find((r) => r._id.toString() === room._id.toString());
    assert.strictEqual(found, undefined, 'Room must remain unavailable while cleaning is in progress');
  });

  it('5. Completing cleaning updates the task to Completed', async () => {
    const completeRes = await fetch(`${baseUrl}/api/housekeeping/${housekeepingTask1._id}/complete`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${createToken(cleanerAlice)}`
      },
      body: JSON.stringify({
        notes: 'Room thoroughly sanitized, fresh linens provided, bathroom restocked',
        lostItems: []
      })
    });

    assert.strictEqual(completeRes.status, 200);
    const completedTask = await completeRes.json();
    assert.strictEqual(completedTask.status, 'Completed');
    assert.ok(completedTask.completedAt, 'completedAt timestamp must be recorded');
    assert.strictEqual(completedTask.notes, 'Room thoroughly sanitized, fresh linens provided, bathroom restocked');
  });

  it('6. Room becomes Available and Clean after successful cleaning completion', async () => {
    const updatedRoom = await Room.findById(room._id);
    assert.strictEqual(updatedRoom.status, 'Available', 'Room status must be restored to Available');
    assert.strictEqual(updatedRoom.cleaningStatus, 'Clean', 'Room cleaningStatus must be Clean');
    assert.ok(updatedRoom.lastCleanedAt, 'lastCleanedAt timestamp must be populated');
    assert.strictEqual(updatedRoom.currentReservation, null, 'currentReservation must be cleared');
  });

  it('7. Customer availability API returns the cleaned room when no date conflict exists', async () => {
    // 1. Browsing without dates returns room
    const resNoDates = await fetch(`${baseUrl}/api/rooms/available`, {
      headers: { Authorization: `Bearer ${createToken(customer)}` }
    });
    assert.strictEqual(resNoDates.status, 200);
    const availableRooms = await resNoDates.json();
    const found = availableRooms.find((r) => r._id.toString() === room._id.toString());
    assert.ok(found, 'Cleaned room must appear in available rooms without dates');
    assert.strictEqual(found.status, 'Available');
    assert.strictEqual(found.cleaningStatus, 'Clean');

    // 2. Querying with dates returns room
    const resDates = await fetch(
      `${baseUrl}/api/rooms/available?checkInDate=2026-12-05&checkOutDate=2026-12-08`,
      { headers: { Authorization: `Bearer ${createToken(customer)}` } }
    );
    assert.strictEqual(resDates.status, 200);
    const dateRooms = await resDates.json();
    const dateFound = dateRooms.find((r) => r._id.toString() === room._id.toString());
    assert.ok(dateFound, 'Cleaned room must appear in available rooms for requested dates');

    // 3. assertAvailable succeeds without throwing
    const roomDoc = await Room.findById(room._id);
    await assert.doesNotReject(async () => {
      await assertAvailable({
        room: roomDoc,
        roomId: room._id,
        checkInDate: new Date('2026-12-05'),
        checkOutDate: new Date('2026-12-08')
      });
    });
  });

  it('8. Customer cannot book a room while it is being cleaned', async () => {
    // Set room back to Cleaning status
    await Room.findByIdAndUpdate(room._id, {
      status: 'Cleaning',
      cleaningStatus: 'Dirty'
    });

    const bookRes = await fetch(`${baseUrl}/api/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${createToken(customer)}`
      },
      body: JSON.stringify({
        roomId: room._id,
        checkInDate: '2026-12-10',
        checkOutDate: '2026-12-12',
        numberOfGuests: 1,
        paymentMethod: 'Pay at Front Desk'
      })
    });

    assert.strictEqual(bookRes.status, 409, 'Booking a room in Cleaning / Dirty state must be rejected with 409');
    const bookErr = await bookRes.json();
    assert.ok(bookErr.error || bookErr.message);

    // Restore room to Available for subsequent tests
    await Room.findByIdAndUpdate(room._id, {
      status: 'Available',
      cleaningStatus: 'Clean'
    });
  });

  it('9. Duplicate cleaning tasks are prevented', async () => {
    // Create new checkout task
    const task1 = await createCheckoutTask(room._id, null, adminUser._id);
    assert.ok(task1);

    // Second call for same room while task1 is active
    const task2 = await createCheckoutTask(room._id, null, adminUser._id);
    assert.strictEqual(task1._id.toString(), task2._id.toString(), 'Must return existing task, not create duplicate');

    // Cleanup active task
    await HousekeepingTask.findByIdAndDelete(task1._id);
    await Room.findByIdAndUpdate(room._id, { status: 'Available', cleaningStatus: 'Clean' });
  });

  it('10. Unauthorized users cannot complete cleaning', async () => {
    // Create a new task
    const testTask = await HousekeepingTask.create({
      property: property._id,
      room: room._id,
      taskType: 'Check-out Cleaning',
      status: 'In Progress',
      assignedTo: cleanerAlice._id,
      createdBy: adminUser._id
    });

    // 1. Customer attempts to complete
    const customerAttempt = await fetch(`${baseUrl}/api/housekeeping/${testTask._id}/complete`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${createToken(customer)}`
      },
      body: JSON.stringify({ notes: 'Customer hacking complete' })
    });
    assert.strictEqual(customerAttempt.status, 403, 'Customer must receive 403 Forbidden');

    // 2. Different housekeeper (Bob) attempts to complete Alice\'s assigned task
    const bobAttempt = await fetch(`${baseUrl}/api/housekeeping/${testTask._id}/complete`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${createToken(cleanerBob)}`
      },
      body: JSON.stringify({ notes: 'Bob completing Alice\'s task' })
    });
    assert.strictEqual(bobAttempt.status, 403, 'Another housekeeper must receive 403 Forbidden');

    // Cleanup
    await HousekeepingTask.findByIdAndDelete(testTask._id);
  });

  it('11. Failed cleaning completion does not incorrectly mark the room Available', async () => {
    // Setup a room in Cleaning
    await Room.findByIdAndUpdate(room._id, {
      status: 'Cleaning',
      cleaningStatus: 'Dirty'
    });

    // Task that is already Completed
    const alreadyCompletedTask = await HousekeepingTask.create({
      property: property._id,
      room: room._id,
      taskType: 'Check-out Cleaning',
      status: 'Completed',
      assignedTo: cleanerAlice._id,
      completedAt: new Date(),
      createdBy: adminUser._id
    });

    // Attempting to complete an already completed task must fail (409 Conflict)
    const failRes = await fetch(`${baseUrl}/api/housekeeping/${alreadyCompletedTask._id}/complete`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${createToken(cleanerAlice)}`
      },
      body: JSON.stringify({ notes: 'Invalid re-complete' })
    });
    assert.strictEqual(failRes.status, 409, 'Completing already completed task must throw 409');

    // Verify room is still in its current status, NOT modified by failed attempt
    const roomCheck = await Room.findById(room._id);
    assert.strictEqual(roomCheck.status, 'Cleaning');
    assert.strictEqual(roomCheck.cleaningStatus, 'Dirty');

    // Cleanup
    await HousekeepingTask.findByIdAndDelete(alreadyCompletedTask._id);
    await Room.findByIdAndUpdate(room._id, { status: 'Available', cleaningStatus: 'Clean' });
  });

  it('12. Existing booking, reservation, check-in, checkout, and housekeeping workflow continues working', async () => {
    // 1. Customer creates a booking for the available room
    const checkInDate = '2027-01-10';
    const checkOutDate = '2027-01-12';

    const bookRes = await fetch(`${baseUrl}/api/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${createToken(customer)}`
      },
      body: JSON.stringify({
        roomId: room._id,
        checkInDate,
        checkOutDate,
        numberOfGuests: 2,
        paymentMethod: 'Pay at Front Desk'
      })
    });
    assert.strictEqual(bookRes.status, 201, 'Customer booking must succeed');
    const bookingData = await bookRes.json();
    assert.ok(bookingData._id);

    // 2. Room becomes Reserved
    const reservedRoom = await Room.findById(room._id);
    assert.strictEqual(reservedRoom.status, 'Reserved');

    // 3. Guest checks in via Front Desk
    const resId = bookingData.reservation._id || bookingData.reservation;
    const checkInRes = await fetch(`${baseUrl}/api/reservations/${resId}/check-in`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${createToken(adminUser)}`
      },
      body: JSON.stringify({ actualCheckInDate: new Date() })
    });
    assert.strictEqual(checkInRes.status, 200, 'Check-in must succeed');

    // 4. Room is now Occupied
    const occupiedRoom = await Room.findById(room._id);
    assert.strictEqual(occupiedRoom.status, 'Occupied');

    // 4b. Front Desk records guest payment before checkout
    const paymentService = require('../services/paymentService');
    const reservationDoc = await Reservation.findById(resId);
    await paymentService.recordPayment({
      reservationId: resId,
      amount: reservationDoc.totalAmount,
      paymentMethod: 'Cash',
      recordedBy: adminUser._id
    });

    // 5. Guest checks out
    const checkOutRes = await fetch(`${baseUrl}/api/reservations/${resId}/check-out`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${createToken(adminUser)}`
      },
      body: JSON.stringify({ actualCheckOutDate: new Date() })
    });
    assert.strictEqual(checkOutRes.status, 200, 'Check-out must succeed');

    // 6. Room is in Cleaning, Housekeeping task is created
    const cleaningRoom = await Room.findById(room._id);
    assert.strictEqual(cleaningRoom.status, 'Cleaning');
    assert.strictEqual(cleaningRoom.cleaningStatus, 'Dirty');

    const hkTask = await HousekeepingTask.findOne({ room: room._id, status: 'Pending' });
    assert.ok(hkTask, 'Checkout cleaning task must exist');

    // 7. Cleaner Alice completes the task
    const completeRes = await fetch(`${baseUrl}/api/housekeeping/${hkTask._id}/complete`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${createToken(cleanerAlice)}`
      },
      body: JSON.stringify({ notes: 'Checkout cleaning complete' })
    });
    assert.strictEqual(completeRes.status, 200, 'Cleaning completion must succeed');

    // 8. Room status is restored to Available!
    const restoredRoom = await Room.findById(room._id);
    assert.strictEqual(restoredRoom.status, 'Available');
    assert.strictEqual(restoredRoom.cleaningStatus, 'Clean');

    // 9. Customer availability endpoint confirms room is available for new guest bookings!
    const availRes = await fetch(`${baseUrl}/api/rooms/available`, {
      headers: { Authorization: `Bearer ${createToken(customer)}` }
    });
    assert.strictEqual(availRes.status, 200);
    const availableRooms = await availRes.json();
    const finalFound = availableRooms.find((r) => r._id.toString() === room._id.toString());
    assert.ok(finalFound, 'Room must be fully bookable again on the customer-facing booking page');
  });
});
