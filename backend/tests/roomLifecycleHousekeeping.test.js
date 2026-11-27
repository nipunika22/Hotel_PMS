// backend/tests/roomLifecycleHousekeeping.test.js
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

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

function request(path, user, method = 'GET', data) {
  return fetch(`${baseUrl}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${createToken(user)}`
    },
    body: data === undefined ? undefined : JSON.stringify(data)
  });
}

describe('Room Availability Restoration & Housekeeping Lifecycle Test Suite', () => {
  before(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
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

    const repeat = await request(`/reservations/${reservation1._id}/check-out`, adminUser, 'PUT', {});
    assert.equal(repeat.status, 200);
    assert.equal((await repeat.json()).alreadyCheckedOut, true);
    assert.equal(await HousekeepingTask.countDocuments({ room: room._id, reservation: reservation1._id }), 1);

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

  it('6. Clean rooms await inspection and cannot be released by changing hygiene or operational status', async () => {
    const updatedRoom = await Room.findById(room._id);
    assert.equal(updatedRoom.status, 'Cleaning');
    assert.equal(updatedRoom.cleaningStatus, 'Clean');
    assert.ok(updatedRoom.lastCleanedAt);
    assert.equal(updatedRoom.currentReservation, null);

    const rooms = await (await request('/rooms', adminUser)).json();
    assert.equal(rooms.find(item => item._id === String(room._id)).activeCleaningTask.status, 'Completed');
    for (const suffix of ['', '?checkInDate=2026-12-05&checkOutDate=2026-12-08']) {
      const available = await (await request('/rooms/available' + suffix, customer)).json();
      assert.ok(!available.some(item => item._id === String(room._id)));
    }

    const book = await request('/bookings', customer, 'POST', {
      roomId: room._id, checkInDate: '2026-12-05', checkOutDate: '2026-12-08',
      numberOfGuests: 1, paymentMethod: 'Pay at Front Desk'
    });
    assert.equal(book.status, 409);
    const override = await request(`/rooms/${room._id}/status`, adminUser, 'PUT', {
      status: 'Available', cleaningStatus: 'Clean'
    });
    assert.equal(override.status, 409);
  });

  it('reuses a rejected task and requires an authorized, current inspection', async () => {
    const path = `/housekeeping/${housekeepingTask1._id}`;
    assert.equal((await request(path + '/inspect', cleanerAlice, 'PUT', {approved: true})).status, 403);
    assert.equal((await request(path + '/inspect', managerUser, 'PUT', {approved: 'false'})).status, 400);
    const rejected = await request(path + '/inspect', managerUser, 'PUT', {approved: false, notes: 'Replace linens'});
    assert.equal(rejected.status, 200);
    assert.equal((await rejected.json()).status, 'Needs Recleaning');
    assert.equal((await Room.findById(room._id)).cleaningStatus, 'Dirty');
    assert.equal(await HousekeepingTask.countDocuments({room: room._id}), 1);
    assert.equal((await request(path + '/inspect', managerUser, 'PUT', {approved: true})).status, 409);
    assert.equal((await request(path + '/start', cleanerAlice, 'PUT')).status, 200);
    assert.equal((await request(path + '/complete', cleanerAlice, 'PUT', {})).status, 200);
    const approved = await request(path + '/inspect', managerUser, 'PUT', {approved: true});
    assert.equal(approved.status, 200);
    assert.equal((await approved.json()).status, 'Inspected');
    assert.equal((await Room.findById(room._id)).status, 'Available');
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
      status: 'Available',
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

  it('9. Dirty legacy rooms get one task across simultaneous manual creation and checkout calls', async () => {
    await Room.findByIdAndUpdate(room._id, { status: 'Available', cleaningStatus: 'Dirty' });
    const create = () => request('/housekeeping', adminUser, 'POST', {roomId: room._id});
    const [first, second, checkoutTask] = await Promise.all([
      create(), create(), createCheckoutTask(room._id, null, adminUser._id)
    ]);
    assert.ok([200, 201].includes(first.status));
    assert.ok([200, 201].includes(second.status));
    assert.equal((await first.json())._id, String(checkoutTask._id));
    assert.equal((await second.json())._id, String(checkoutTask._id));
    assert.equal(await HousekeepingTask.countDocuments({room: room._id, status: 'Pending'}), 1);

    await HousekeepingTask.findByIdAndDelete(checkoutTask._id);
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

  it('keeps occupied rooms out of the cleaning and release workflow', async () => {
    const task = await HousekeepingTask.create({
      property: property._id, room: room._id, status: 'Completed', completedAt: new Date()
    });
    await Room.findByIdAndUpdate(room._id, {status: 'Occupied', cleaningStatus: 'Clean'});
    const approve = await request(`/housekeeping/${task._id}/inspect`, managerUser, 'PUT', {approved: true});
    assert.equal(approve.status, 409);
    const create = await request('/housekeeping', adminUser, 'POST', {roomId: room._id});
    assert.equal(create.status, 409);
    const direct = await request(`/rooms/${room._id}/status`, adminUser, 'PUT', {status: 'Available'});
    assert.equal(direct.status, 409);
    assert.equal((await HousekeepingTask.findById(task._id)).status, 'Completed');
    assert.equal((await Room.findById(room._id)).status, 'Occupied');
    const available = await (await request('/rooms/available?checkInDate=2026-12-05&checkOutDate=2026-12-08', customer)).json();
    assert.ok(!available.some(item => item._id === String(room._id)));

    await HousekeepingTask.findByIdAndDelete(task._id);
    await Room.findByIdAndUpdate(room._id, {status: 'Available'});
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

    // 7. Cleaner Alice starts and completes the task.
    assert.equal((await request(`/housekeeping/${hkTask._id}/start`, cleanerAlice, 'PUT')).status, 200);
    const completeRes = await fetch(`${baseUrl}/api/housekeeping/${hkTask._id}/complete`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${createToken(cleanerAlice)}`
      },
      body: JSON.stringify({ notes: 'Checkout cleaning complete' })
    });
    assert.strictEqual(completeRes.status, 200, 'Cleaning completion must succeed');

    // 8. Only a supervisor's approval restores availability.
    assert.equal((await Room.findById(room._id)).status, 'Cleaning');
    assert.equal((await request(`/housekeeping/${hkTask._id}/inspect`, managerUser, 'PUT', {approved: true})).status, 200);

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

  it('retains the future reservation and date conflicts through cleaning, cancellation and inspection', async () => {
    const original = (await Reservation.findById(reservation1._id)).toObject();
    const { _id, __v, ...reservationFields } = original;
    const future = await Reservation.create({
      ...reservationFields, reservationNumber: 'RES-HK-FUTURE',
      status: 'Confirmed', checkInDate: new Date('2027-02-10'), checkOutDate: new Date('2027-02-12')
    });
    const cancelled = await Reservation.create({
      ...reservationFields, reservationNumber: 'RES-HK-CANCEL',
      status: 'Confirmed', checkInDate: new Date('2027-02-14'), checkOutDate: new Date('2027-02-15')
    });
    await Room.findByIdAndUpdate(room._id, {status: 'Reserved', currentReservation: future._id});
    const created = await request('/housekeeping', adminUser, 'POST', {roomId: room._id});
    assert.equal(created.status, 201);
    const path = `/housekeeping/${(await created.json())._id}`;
    assert.equal((await request(path + '/start', cleanerAlice, 'PUT')).status, 200);
    assert.equal((await request(path + '/complete', cleanerAlice, 'PUT', {})).status, 200);
    assert.equal((await request(`/reservations/${future._id}/check-in`, adminUser, 'PUT', {})).status, 409);
    assert.equal((await request(`/reservations/${cancelled._id}/cancel`, adminUser, 'PUT', {})).status, 200);
    assert.equal((await Room.findById(room._id)).status, 'Cleaning');
    assert.equal((await request(path + '/inspect', adminUser, 'PUT', {approved: true})).status, 200);
    assert.equal(String((await Room.findById(room._id)).currentReservation), String(future._id));
    assert.equal((await Reservation.findById(future._id)).status, 'Confirmed');

    const overlapping = await request('/rooms/available?checkInDate=2027-02-10&checkOutDate=2027-02-12', customer);
    assert.ok(!(await overlapping.json()).some(item => item._id === String(room._id)));
    const otherDates = await request('/rooms/available?checkInDate=2027-02-12&checkOutDate=2027-02-14', customer);
    assert.ok((await otherDates.json()).some(item => item._id === String(room._id)));
    const conflictingBooking = await request('/bookings', customer, 'POST', {
      roomId: room._id, checkInDate: '2027-02-10', checkOutDate: '2027-02-12',
      numberOfGuests: 1, paymentMethod: 'Pay at Front Desk'
    });
    assert.equal(conflictingBooking.status, 409);
  });

  it('queues cleaning when a vacant room is marked dirty through room management', async () => {
    const marked = await request(`/rooms/${room._id}/status`, adminUser, 'PUT', {cleaningStatus: 'Dirty'});
    assert.equal(marked.status, 200);
    assert.equal((await marked.json()).status, 'Cleaning');
    const queued = await HousekeepingTask.findOne({room: room._id, status: 'Pending'});
    assert.ok(queued);
    const unsafe = await request(`/rooms/${room._id}/status`, adminUser, 'PUT', {cleaningStatus: 'Clean'});
    assert.equal(unsafe.status, 409);
    assert.equal((await Room.findById(room._id)).cleaningStatus, 'Dirty');
    await HousekeepingTask.findByIdAndDelete(queued._id);
  });

  it('blocks a room with a checked-in stay even when the room record says Available', async () => {
    const stay = await Reservation.findOne({reservationNumber: 'RES-HK-FUTURE'});
    await Reservation.findByIdAndUpdate(stay._id, {status: 'Checked-In'});
    await Room.findByIdAndUpdate(room._id, {status: 'Available', cleaningStatus: 'Clean'});
    for (const suffix of ['', '?checkInDate=2027-03-01&checkOutDate=2027-03-03']) {
      const available = await (await request('/rooms/available' + suffix, customer)).json();
      assert.ok(!available.some(item => item._id === String(room._id)));
    }
    await assert.rejects(assertAvailable({
      room: await Room.findById(room._id), roomId: room._id,
      checkInDate: '2027-03-01', checkOutDate: '2027-03-03'
    }), {statusCode: 409});
    const manual = await request('/housekeeping', adminUser, 'POST', {roomId: room._id});
    assert.equal(manual.status, 409);
    await Reservation.findByIdAndUpdate(stay._id, {status: 'Confirmed'});
  });

  it('queues post-maintenance cleaning and holds it for inspection', async () => {
    const { releaseMaintenanceRoom } = require('../services/maintenanceService');
    await Room.findByIdAndUpdate(room._id, {status: 'Maintenance', maintenanceNotes: 'Repairs complete'});
    const result = await releaseMaintenanceRoom(room._id, managerUser._id);
    const duplicate = await releaseMaintenanceRoom(room._id, managerUser._id);
    assert.equal(String(result.housekeepingTask._id), String(duplicate.housekeepingTask._id));
    assert.equal(result.housekeepingTask.taskType, 'Maintenance Cleaning');
    const path = `/housekeeping/${result.housekeepingTask._id}`;
    assert.equal((await request(path + '/start', cleanerAlice, 'PUT')).status, 200);
    assert.equal((await request(path + '/complete', cleanerAlice, 'PUT', {})).status, 200);
    assert.equal((await Room.findById(room._id)).status, 'Cleaning');
    assert.equal((await request(path + '/inspect', managerUser, 'PUT', {approved: true})).status, 200);
    assert.equal((await Room.findById(room._id)).status, 'Available');
  });


  it('lists persisted manual and legacy tasks by room property, status, priority and assignee', async () => {
    const legacyRoom = await Room.create({
      property: property._id, roomNumber: 'TASK-201', roomType: 'Deluxe', floor: 2,
      basePrice: 150, capacity: { maxAdults: 2, maxOccupancy: 2 },
      bedConfiguration: 'King Bed', cleaningStatus: 'Dirty'
    });
    const otherRoom = await Room.create({
      property: new mongoose.Types.ObjectId(), roomNumber: 'TASK-OTHER', roomType: 'Deluxe', floor: 2,
      basePrice: 150, capacity: { maxAdults: 2, maxOccupancy: 2 }, bedConfiguration: 'King Bed'
    });
    const foreignTask = await HousekeepingTask.create({ property: property._id, room: otherRoom._id });
    const manual = await request('/housekeeping', adminUser, 'POST', {roomId: legacyRoom._id, priority: 'Urgent'});
    assert.equal(manual.status, 201);
    const created = await manual.json();
    assert.equal(created.room.roomNumber, 'TASK-201');
    assert.ok(await HousekeepingTask.exists({_id: created._id, room: legacyRoom._id, property: property._id}));

    await HousekeepingTask.updateOne({_id: created._id}, {$unset: {property: 1}});
    const query = `/housekeeping?roomId=${legacyRoom._id}&status=Pending&priority=Urgent`;
    const pending = await (await request(query, cleanerAlice)).json();
    assert.equal(pending.length, 1);
    assert.equal(pending[0]._id, created._id);
    assert.equal(pending[0].room.roomType, 'Deluxe');
    assert.equal(pending[0].isCurrent, true);
    const adminTasks = await (await request('/housekeeping', adminUser)).json();
    assert.ok(!adminTasks.some(task => task._id === String(foreignTask._id)));
    assert.equal((await request('/housekeeping?roomId=invalid', adminUser)).status, 400);

    const route = '/housekeeping/' + created._id;
    assert.equal((await request(route + '/start', cleanerAlice, 'PUT')).status, 200);
    const progress = await (await request('/housekeeping?status=In%20Progress', cleanerAlice)).json();
    assert.ok(progress.some(task => task._id === created._id));
    assert.ok(!(await (await request('/housekeeping', cleanerBob)).json()).some(task => task._id === created._id));
    assert.equal((await request(route + '/complete', cleanerAlice, 'PUT', {})).status, 200);
    const awaiting = await (await request('/housekeeping?status=Pending%20Inspection', adminUser)).json();
    assert.ok(awaiting.some(task => task._id === created._id && task.displayStatus === 'Pending Inspection'));
    assert.equal((await request(route + '/inspect', managerUser, 'PUT', {approved: false})).status, 200);
    assert.ok((await (await request('/housekeeping?status=Needs%20Recleaning', adminUser)).json())
      .some(task => task._id === created._id && task.room.cleaningStatus === 'Dirty'));
    assert.equal((await request(route + '/start', cleanerAlice, 'PUT')).status, 200);
    assert.equal((await request(route + '/complete', cleanerAlice, 'PUT', {})).status, 200);
    assert.equal((await request(route + '/inspect', managerUser, 'PUT', {approved: true})).status, 200);
    const history = await (await request('/housekeeping/my?status=Inspected', cleanerAlice)).json();
    assert.ok(history.some(task => task._id === created._id && !task.isCurrent));
  });

  it('synchronizes legacy rooms idempotently and reports invalid and duplicate records', async () => {
    const fixture = {
      property: property._id, roomType: 'Deluxe', floor: 2, basePrice: 150,
      capacity: { maxAdults: 2, maxOccupancy: 2 }, bedConfiguration: 'King Bed', cleaningStatus: 'Dirty'
    };
    const vacant = await Room.create({...fixture, roomNumber: 'SYNC-1'});
    const occupied = await Room.create({...fixture, roomNumber: 'SYNC-2', status: 'Occupied'});
    const ongoing = await Room.create({...fixture, roomNumber: 'SYNC-3'});
    const original = await HousekeepingTask.create({
      room: ongoing._id, status: 'In Progress', assignedTo: cleanerAlice._id, startedAt: new Date()
    });
    await HousekeepingTask.create({room: ongoing._id, property: property._id, status: 'Pending'});
    const old = await HousekeepingTask.create({room: vacant._id, property: property._id, status: 'Completed'});
    const orphan = await HousekeepingTask.create({room: new mongoose.Types.ObjectId(), property: property._id, status: 'Pending'});
    const invalid = await HousekeepingTask.collection.insertOne({room: vacant._id, property: property._id, status: 'Unknown Legacy Status'});
    const sync = (user) => request('/housekeeping/sync', user, 'POST');

    assert.equal((await sync(cleanerAlice)).status, 403);
    const response = await sync(managerUser);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.created, 1);
    assert.ok(result.reused >= 1);
    assert.ok(result.skipped >= 1);
    assert.equal(result.duplicateTasks, 1);
    assert.ok(result.issues.duplicateRoomIds.includes(String(ongoing._id)));
    assert.ok(result.issues.invalidRoomTaskIds.includes(String(orphan._id)));
    assert.ok(result.issues.invalidStatusTaskIds.includes(String(invalid.insertedId)));

    const repeated = await (await sync(managerUser)).json();
    assert.equal(repeated.created, 0);
    assert.equal(await HousekeepingTask.countDocuments({room: vacant._id, status: 'Pending'}), 1);
    assert.equal(await HousekeepingTask.countDocuments({room: occupied._id}), 0);
    const preserved = await HousekeepingTask.findById(original._id);
    assert.equal(preserved.status, 'In Progress');
    assert.equal(+preserved.startedAt, +original.startedAt);
    assert.equal(String(preserved.property), String(property._id));
    assert.equal((await Room.findById(ongoing._id)).status, 'Cleaning');
    assert.equal((await HousekeepingTask.findById(old._id)).status, 'Completed');
    const completed = await (await request('/housekeeping?status=Completed', adminUser)).json();
    assert.ok(completed.some(task => task._id === String(old._id) && task.displayStatus === 'Completed'));
    const available = await (await request('/rooms/available', customer)).json();
    assert.ok(!available.some(candidate => candidate._id === String(vacant._id)));
  });

});
