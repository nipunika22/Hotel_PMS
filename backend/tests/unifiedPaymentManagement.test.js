// backend/tests/unifiedPaymentManagement.test.js
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const paymentRoutes = require('../routes/paymentRoutes');
const reservationRoutes = require('../routes/reservationRoutes');
const invoiceRoutes = require('../routes/invoiceRoutes');
const bookingRoutes = require('../routes/bookingRoutes');
const { propertyContext } = require('../middleware/propertyContext');

const HotelChain = require('../models/HotelChain');
const Property = require('../models/Property');
const Room = require('../models/Room');
const User = require('../models/User');
const Guest = require('../models/Guest');
const Booking = require('../models/Booking');
const Reservation = require('../models/Reservation');
const Payment = require('../models/Payment');
const Invoice = require('../models/Invoice');
const paymentService = require('../services/paymentService');

process.env.JWT_SECRET = 'unified-payment-management-test-secret';

let mongo;
let server;
let baseUrl;
let property;
let room;
let customer;
let otherCustomer;
let staffUser;
let adminUser;

function createToken(userObj) {
  return jwt.sign(
    {
      id: userObj._id.toString(),
      role: userObj.role,
      name: userObj.name,
      departmentPermissions: userObj.departmentPermissions || ['reservations', 'front_desk', 'finance']
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('Unified Payment Management & Financial Reconciliation Test Suite', () => {
  before(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());

    const chain = await HotelChain.create({ name: 'Serendib Chain', code: 'SER', status: 'Active' });
    property = await Property.create({
      name: 'Serendib Grand Colombo',
      code: 'SER-COL',
      chain: chain._id,
      city: 'Colombo',
      currency: 'LKR',
      status: 'Active'
    });

    room = await Room.create({
      property: property._id,
      roomNumber: '101',
      roomType: 'Deluxe',
      floor: 1,
      basePrice: 15000,
      capacity: { maxAdults: 2, maxOccupancy: 2 },
      bedConfiguration: 'King Bed',
      status: 'Available',
      isActive: true
    });

    customer = await User.create({
      name: 'Sunil Perera',
      email: 'sunil@example.com',
      phone: '0771234567',
      password: 'password123',
      role: 'customer',
      property: property._id
    });

    otherCustomer = await User.create({
      name: 'Nimal Silva',
      email: 'nimal@example.com',
      phone: '0777654321',
      password: 'password123',
      role: 'customer',
      property: property._id
    });

    staffUser = await User.create({
      name: 'Front Desk Officer',
      email: 'reception@serendib.com',
      phone: '0112345678',
      password: 'password123',
      role: 'staff',
      property: property._id,
      departmentPermissions: ['reservations', 'front_desk']
    });

    adminUser = await User.create({
      name: 'General Manager',
      email: 'gm@serendib.com',
      phone: '0112345679',
      password: 'password123',
      role: 'admin',
      property: property._id,
      departmentPermissions: ['reservations', 'front_desk', 'finance']
    });

    const app = express();
    app.use(express.json());
    app.use(propertyContext);
    app.use('/api/payments', paymentRoutes);
    app.use('/api/reservations', reservationRoutes);
    app.use('/api/invoices', invoiceRoutes);
    app.use('/api/bookings', bookingRoutes);

    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}/api`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mongo) await mongo.stop();
  });

  // -------------------------------------------------------------------------
  // Scenario 1: Guest front-desk booking
  // -------------------------------------------------------------------------
  it('Scenario 1: Guest front-desk booking initializes with Pending payment and does not generate premature revenue', async () => {
    const token = createToken(customer);
    const bookingRes = await fetch(`${baseUrl}/bookings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId: room._id.toString(),
        checkInDate: '2026-12-01',
        checkOutDate: '2026-12-04',
        numberOfGuests: 2,
        paymentMethod: 'Cash',
        specialRequests: 'Late arrival'
      })
    });

    assert.equal(bookingRes.status, 201);
    const bookingDoc = await bookingRes.json();
    assert.ok(bookingDoc._id);

    const reloadedBooking = await Booking.findById(bookingDoc._id);
    assert.equal(reloadedBooking.paymentStatus, 'pending');
    assert.equal(reloadedBooking.paymentMethod, 'Cash');

    const reservationDoc = await Reservation.findById(reloadedBooking.reservation);
    assert.ok(reservationDoc);
    assert.equal(reservationDoc.paymentStatus, 'Pending');
    assert.equal(reservationDoc.paymentMethod, 'Cash');
    assert.equal(reservationDoc.advancePayment, 0);

    // Verify no completed Payment records exist
    const completedPaymentCount = await Payment.countDocuments({
      reservation: reservationDoc._id,
      paymentStatus: 'completed'
    });
    assert.equal(completedPaymentCount, 0);

    // Verify Financial Analytics collected revenue does NOT count this booking
    const adminToken = createToken(adminUser);
    const analyticsRes = await fetch(`${baseUrl}/payments/financial-analytics`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(analyticsRes.status, 200);
    const analyticsData = await analyticsRes.json();
    assert.equal(analyticsData.summary.totalConfirmedRevenue, 0);
  });

  // -------------------------------------------------------------------------
  // Scenario 2: Full cash payment recorded by staff
  // -------------------------------------------------------------------------
  it('Scenario 2: Staff records full cash payment, updating Payment, Reservation, Booking, and Financials', async () => {
    const guest = await Guest.create({
      firstName: 'Kamal',
      lastName: 'Gunaratne',
      email: 'kamal@example.test',
      phone: '0779876543',
      property: property._id,
      nationalIdType: 'National ID',
      nationalIdNumber: 'NIC-11111',
      nationality: 'Sri Lankan'
    });

    const resv = await Reservation.create({
      property: property._id,
      guest: guest._id,
      room: room._id,
      bookingSource: 'Walk-in',
      checkInDate: new Date('2026-12-10'),
      checkOutDate: new Date('2026-12-12'),
      numberOfAdults: 2,
      numberOfChildren: 0,
      numberOfGuests: 2,
      roomType: 'Deluxe',
      ratePerNight: 15000,
      numberOfNights: 2,
      roomCharges: 30000,
      taxAmount: 0,
      discountAmount: 0,
      totalAmount: 30000,
      advancePayment: 0,
      paymentStatus: 'Pending',
      paymentMethod: 'Cash',
      status: 'Confirmed',
      createdBy: staffUser._id
    });

    const staffToken = createToken(staffUser);
    const payRes = await fetch(`${baseUrl}/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reservationId: resv._id.toString(),
        amount: 30000,
        paymentMethod: 'Cash',
        notes: 'Full payment received at front desk'
      })
    });

    assert.equal(payRes.status, 201);
    const payData = await payRes.json();
    assert.equal(payData.amount, 30000);
    assert.equal(payData.paymentStatus, 'completed');
    assert.equal(payData.paymentMethod, 'Cash');

    // Verify auditLog captured the logged in staff member
    assert.ok(payData.auditLog && payData.auditLog.length > 0);
    assert.equal(payData.auditLog[0].action, 'MANUAL_PAYMENT_RECORDED');

    // Verify Reservation is now Paid with advancePayment = 30000
    const updatedResv = await Reservation.findById(resv._id);
    assert.equal(updatedResv.paymentStatus, 'Paid');
    assert.equal(updatedResv.advancePayment, 30000);

    // Verify Financial Analytics now reports 30,000 collected
    const adminToken = createToken(adminUser);
    const analyticsRes = await fetch(`${baseUrl}/payments/financial-analytics`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const analyticsData = await analyticsRes.json();
    assert.equal(analyticsData.summary.totalConfirmedRevenue, 30000);
    assert.equal(analyticsData.summary.cashCollections, 30000);
  });

  // -------------------------------------------------------------------------
  // Scenario 3 & 4: Partial payment then remaining payment
  // -------------------------------------------------------------------------
  it('Scenarios 3 & 4: Partial payment transitions to Partial, second payment transitions to Paid', async () => {
    const guest = await Guest.create({
      firstName: 'Rohan',
      lastName: 'Fernando',
      email: 'rohan@example.test',
      phone: '0712223334',
      property: property._id,
      nationalIdType: 'National ID',
      nationalIdNumber: 'NIC-22222',
      nationality: 'Sri Lankan'
    });

    // Total 45,000 LKR
    const resv = await Reservation.create({
      property: property._id,
      guest: guest._id,
      room: room._id,
      bookingSource: 'Walk-in',
      checkInDate: new Date('2026-12-15'),
      checkOutDate: new Date('2026-12-18'),
      numberOfAdults: 2,
      numberOfChildren: 0,
      numberOfGuests: 2,
      roomType: 'Deluxe',
      ratePerNight: 15000,
      numberOfNights: 3,
      roomCharges: 45000,
      totalAmount: 45000,
      advancePayment: 0,
      paymentStatus: 'Pending',
      paymentMethod: 'Unspecified',
      status: 'Confirmed',
      createdBy: staffUser._id
    });

    const staffToken = createToken(staffUser);

    // Scenario 3: Pay 20,000 (Partial)
    const part1Res = await fetch(`${baseUrl}/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reservationId: resv._id.toString(),
        amount: 20000,
        paymentMethod: 'Card',
        transactionReference: 'POS-TX-9901'
      })
    });
    assert.equal(part1Res.status, 201);

    const resvAfterPart1 = await Reservation.findById(resv._id);
    assert.equal(resvAfterPart1.paymentStatus, 'Partial');
    assert.equal(resvAfterPart1.advancePayment, 20000);
    assert.equal(resvAfterPart1.paymentMethod, 'Card');

    // Scenario 4: Attempt overpayment (e.g. 30,000 when only 25,000 remaining) -> should fail
    const overpayRes = await fetch(`${baseUrl}/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reservationId: resv._id.toString(),
        amount: 30000,
        paymentMethod: 'Cash'
      })
    });
    assert.equal(overpayRes.status, 400);

    // Pay exact remaining: 25,000
    const part2Res = await fetch(`${baseUrl}/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reservationId: resv._id.toString(),
        amount: 25000,
        paymentMethod: 'Cash'
      })
    });
    assert.equal(part2Res.status, 201);

    const resvAfterPart2 = await Reservation.findById(resv._id);
    assert.equal(resvAfterPart2.paymentStatus, 'Paid');
    assert.equal(resvAfterPart2.advancePayment, 45000);

    // Subsequent payment attempt on fully paid reservation must be rejected
    const extraPayRes = await fetch(`${baseUrl}/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reservationId: resv._id.toString(),
        amount: 1000,
        paymentMethod: 'Cash'
      })
    });
    assert.equal(extraPayRes.status, 400);
  });

  // -------------------------------------------------------------------------
  // Scenario 5: Duplicate / Idempotency protection
  // -------------------------------------------------------------------------
  it('Scenario 5: Idempotent replay returns existing transaction without creating duplicate records', async () => {
    const guest = await Guest.create({
      firstName: 'Anura',
      lastName: 'Kumara',
      email: 'anura@example.test',
      phone: '0773334445',
      property: property._id,
      nationalIdType: 'Passport',
      nationalIdNumber: 'P-987654',
      nationality: 'Sri Lankan'
    });

    const resv = await Reservation.create({
      property: property._id,
      guest: guest._id,
      room: room._id,
      bookingSource: 'Walk-in',
      checkInDate: new Date('2026-12-20'),
      checkOutDate: new Date('2026-12-21'),
      numberOfAdults: 1,
      numberOfChildren: 0,
      numberOfGuests: 1,
      roomType: 'Deluxe',
      ratePerNight: 15000,
      numberOfNights: 1,
      roomCharges: 15000,
      totalAmount: 15000,
      advancePayment: 0,
      paymentStatus: 'Pending',
      status: 'Confirmed',
      createdBy: staffUser._id
    });

    const staffToken = createToken(staffUser);
    const key = 'IDEMP-TEST-KEY-001';

    // First request
    const res1 = await fetch(`${baseUrl}/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reservationId: resv._id.toString(),
        amount: 15000,
        paymentMethod: 'Bank Transfer',
        idempotencyKey: key
      })
    });
    assert.equal(res1.status, 201);
    const payment1 = await res1.json();

    // Replay with identical idempotencyKey
    const res2 = await fetch(`${baseUrl}/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reservationId: resv._id.toString(),
        amount: 15000,
        paymentMethod: 'Bank Transfer',
        idempotencyKey: key
      })
    });
    assert.equal(res2.status, 201);
    const payment2 = await res2.json();

    assert.equal(payment1._id, payment2._id);
    const totalCount = await Payment.countDocuments({ reservation: resv._id });
    assert.equal(totalCount, 1);
  });

  // -------------------------------------------------------------------------
  // Scenario 6: Invoice Synchronization
  // -------------------------------------------------------------------------
  it('Scenario 6: Recording payment on an invoice synchronizes Payment ledger, Reservation, and Invoice', async () => {
    const guest = await Guest.create({
      firstName: 'Mahela',
      lastName: 'Jayawardene',
      email: 'mahela@example.test',
      phone: '0775556667',
      property: property._id,
      nationalIdType: 'National ID',
      nationalIdNumber: 'NIC-33333',
      nationality: 'Sri Lankan'
    });

    const resv = await Reservation.create({
      property: property._id,
      guest: guest._id,
      room: room._id,
      bookingSource: 'Walk-in',
      checkInDate: new Date('2026-12-22'),
      checkOutDate: new Date('2026-12-24'),
      numberOfAdults: 2,
      numberOfChildren: 0,
      numberOfGuests: 2,
      roomType: 'Deluxe',
      ratePerNight: 15000,
      numberOfNights: 2,
      roomCharges: 30000,
      totalAmount: 30000,
      advancePayment: 0,
      paymentStatus: 'Pending',
      status: 'Checked-In',
      createdBy: staffUser._id
    });

    const invoice = await Invoice.create({
      property: property._id,
      invoiceNumber: 'INV-TEST-001',
      reservation: resv._id,
      guest: guest._id,
      checkInDate: resv.checkInDate,
      checkOutDate: resv.checkOutDate,
      numberOfNights: 2,
      roomCharges: 30000,
      subtotal: 30000,
      totalAmount: 30000,
      advancePaid: 0,
      balanceDue: 30000,
      totalPaid: 0,
      paymentStatus: 'Unpaid',
      generatedBy: staffUser._id
    });

    const staffToken = createToken(staffUser);
    const addPayRes = await fetch(`${baseUrl}/invoices/${invoice._id}/payment`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${staffToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 30000,
        paymentMethod: 'Card',
        transactionId: 'POS-INV-55',
        notes: 'Settled via POS machine'
      })
    });

    assert.equal(addPayRes.status, 200);
    const updatedInvoice = await addPayRes.json();
    assert.equal(updatedInvoice.totalPaid, 30000);
    assert.equal(updatedInvoice.balanceDue, 0);
    assert.equal(updatedInvoice.paymentStatus, 'Paid');

    // Check that a corresponding Payment document was created!
    const createdPayment = await Payment.findOne({ invoice: invoice._id });
    assert.ok(createdPayment);
    assert.equal(createdPayment.amount, 30000);
    assert.equal(createdPayment.paymentMethod, 'Card');
    assert.equal(createdPayment.paymentStatus, 'completed');

    // Check that Reservation was synchronized!
    const updatedResv = await Reservation.findById(resv._id);
    assert.equal(updatedResv.paymentStatus, 'Paid');
    assert.equal(updatedResv.advancePayment, 30000);
  });

  it('records multiple balance payments against invoice total and preserves its original payment history', async () => {
    const guest = await Guest.create({
      firstName: 'Nadeesha',
      lastName: 'Perera',
      email: 'nadeesha@example.test',
      phone: '0774445556',
      property: property._id,
      nationalIdType: 'National ID',
      nationalIdNumber: 'NIC-55555',
      nationality: 'Sri Lankan'
    });
    const resv = await Reservation.create({
      property: property._id,
      guest: guest._id,
      room: room._id,
      bookingSource: 'Walk-in',
      checkInDate: new Date('2026-12-25'),
      checkOutDate: new Date('2026-12-27'),
      numberOfAdults: 2,
      numberOfChildren: 0,
      numberOfGuests: 2,
      roomType: 'Deluxe',
      ratePerNight: 15000,
      numberOfNights: 2,
      roomCharges: 30000,
      totalAmount: 30000,
      advancePayment: 30000,
      paymentStatus: 'Partial',
      status: 'Checked-In',
      createdBy: staffUser._id
    });
    const booking = await Booking.create({
      property: property._id,
      user: customer._id,
      room: room._id,
      checkInDate: resv.checkInDate,
      checkOutDate: resv.checkOutDate,
      numberOfGuests: 2,
      totalPrice: 30000,
      paymentStatus: 'pending',
      bookingStatus: 'checked-in',
      reservation: resv._id
    });
    const initialPaymentDate = new Date('2026-12-24T10:00:00Z');
    const invoice = await Invoice.create({
      property: property._id,
      invoiceNumber: 'INV-TEST-BALANCE-001',
      reservation: resv._id,
      guest: guest._id,
      checkInDate: resv.checkInDate,
      checkOutDate: resv.checkOutDate,
      numberOfNights: 2,
      roomCharges: 30000,
      totalExtraExpenses: 20000,
      subtotal: 50000,
      totalAmount: 50000,
      advancePaid: 30000,
      totalPaid: 30000,
      balanceDue: 20000,
      paymentStatus: 'Partial',
      payments: [{
        paymentDate: initialPaymentDate,
        amount: 30000,
        paymentMethod: 'Cash',
        transactionId: 'INITIAL-ADVANCE-001',
        notes: 'Original advance'
      }],
      generatedBy: staffUser._id
    });

    const staffToken = createToken(staffUser);
    const record = (amount, idempotencyKey) => fetch(`${baseUrl}/invoices/${invoice._id}/payment`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${staffToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, paymentMethod: 'Bank Transfer', idempotencyKey })
    });

    const first = await record(7000, 'BALANCE-PAYMENT-001');
    assert.equal(first.status, 200);
    const partialInvoice = await first.json();
    assert.equal(partialInvoice.totalPaid, 37000);
    assert.equal(partialInvoice.balanceDue, 13000);
    assert.equal(partialInvoice.paymentStatus, 'Partial');
    assert.equal(partialInvoice.payments.length, 2);

    const replay = await record(7000, 'BALANCE-PAYMENT-001');
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).payments.length, 2);
    assert.equal(await Payment.countDocuments({ invoice: invoice._id }), 1);

    const final = await record(13000, 'BALANCE-PAYMENT-002');
    assert.equal(final.status, 200);
    const settledInvoice = await final.json();
    assert.equal(settledInvoice.totalPaid, 50000);
    assert.equal(settledInvoice.balanceDue, 0);
    assert.equal(settledInvoice.paymentStatus, 'Paid');
    assert.equal(settledInvoice.payments.length, 3);
    assert.equal(settledInvoice.payments[0].transactionId, 'INITIAL-ADVANCE-001');

    const paymentRecords = await Payment.find({ invoice: invoice._id }).sort({ amount: 1 });
    assert.deepEqual(paymentRecords.map((payment) => payment.amount), [7000, 13000]);
    assert.ok(paymentRecords.every((payment) =>
      payment.paymentStatus === 'completed' &&
      payment.auditLog.some((entry) => entry.performedBy.toString() === staffUser._id.toString())
    ));

    const updatedReservation = await Reservation.findById(resv._id);
    assert.equal(updatedReservation.advancePayment, 50000);
    assert.equal(updatedReservation.paymentStatus, 'Paid');
    const updatedBooking = await Booking.findById(booking._id);
    assert.equal(updatedBooking.paymentStatus, 'paid');
  });

  it('prevents concurrent invoice payments from exceeding the outstanding balance', async () => {
    const guest = await Guest.create({
      firstName: 'Chamari',
      lastName: 'Silva',
      email: 'chamari@example.test',
      phone: '0777778888',
      property: property._id,
      nationalIdType: 'National ID',
      nationalIdNumber: 'NIC-66666',
      nationality: 'Sri Lankan'
    });
    const resv = await Reservation.create({
      property: property._id,
      guest: guest._id,
      room: room._id,
      bookingSource: 'Walk-in',
      checkInDate: new Date('2026-12-28'),
      checkOutDate: new Date('2026-12-29'),
      numberOfAdults: 1,
      numberOfChildren: 0,
      numberOfGuests: 1,
      roomType: 'Deluxe',
      ratePerNight: 20000,
      numberOfNights: 1,
      roomCharges: 20000,
      totalAmount: 20000,
      advancePayment: 0,
      paymentStatus: 'Pending',
      status: 'Checked-In',
      createdBy: staffUser._id
    });
    const invoice = await Invoice.create({
      property: property._id,
      invoiceNumber: 'INV-TEST-CONCURRENT-001',
      reservation: resv._id,
      guest: guest._id,
      checkInDate: resv.checkInDate,
      checkOutDate: resv.checkOutDate,
      numberOfNights: 1,
      roomCharges: 20000,
      subtotal: 20000,
      totalAmount: 20000,
      advancePaid: 0,
      totalPaid: 0,
      balanceDue: 20000,
      paymentStatus: 'Unpaid',
      generatedBy: staffUser._id
    });
    const staffToken = createToken(staffUser);
    const sendConcurrentPayment = (key) => fetch(`${baseUrl}/invoices/${invoice._id}/payment`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${staffToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 15000, paymentMethod: 'Cash', idempotencyKey: key })
    });

    const responses = await Promise.all([
      sendConcurrentPayment('CONCURRENT-PAYMENT-001'),
      sendConcurrentPayment('CONCURRENT-PAYMENT-002')
    ]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 400]);
    const finalInvoice = await Invoice.findById(invoice._id);
    assert.equal(finalInvoice.totalPaid, 15000);
    assert.equal(finalInvoice.balanceDue, 5000);
    assert.equal(await Payment.countDocuments({ invoice: invoice._id }), 1);
  });

  // -------------------------------------------------------------------------
  // Scenario 7: PayHere integration regression
  // -------------------------------------------------------------------------
  it('Scenario 7: Pending online PayHere initiation does not count as received revenue', async () => {
    const pendingPayment = await Payment.create({
      property: property._id,
      user: customer._id,
      purpose: 'room_booking',
      amount: 50000,
      currency: 'LKR',
      paymentMethod: 'PayHere',
      paymentStatus: 'pending',
      gateway: 'PayHere',
      paymentReference: 'PAY-REGRESSION-PH01'
    });

    const adminToken = createToken(adminUser);
    const analyticsRes = await fetch(`${baseUrl}/payments/financial-analytics`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const analytics = await analyticsRes.json();

    // Verify pending is logged under pendingCount/pendingAmount but NOT in totalConfirmedRevenue
    assert.equal(analytics.summary.pendingCount >= 1, true);
    assert.equal(analytics.summary.pendingAmount >= 50000, true);

    // Clean up
    await Payment.findByIdAndDelete(pendingPayment._id);
  });

  // -------------------------------------------------------------------------
  // Scenario 8: Checkout enforcement
  // -------------------------------------------------------------------------
  it('Scenario 8: Prevents checkout when balance is outstanding, succeeds once balance is settled', async () => {
    const guest = await Guest.create({
      firstName: 'Sanath',
      lastName: 'Jayasuriya',
      email: 'sanath@example.test',
      phone: '0778889990',
      property: property._id,
      nationalIdType: 'National ID',
      nationalIdNumber: 'NIC-44444',
      nationality: 'Sri Lankan'
    });

    const resv = await Reservation.create({
      property: property._id,
      guest: guest._id,
      room: room._id,
      bookingSource: 'Walk-in',
      checkInDate: new Date('2026-12-01'),
      checkOutDate: new Date('2026-12-03'),
      numberOfAdults: 2,
      numberOfChildren: 0,
      numberOfGuests: 2,
      roomType: 'Deluxe',
      ratePerNight: 15000,
      numberOfNights: 2,
      roomCharges: 30000,
      totalAmount: 30000,
      advancePayment: 0,
      paymentStatus: 'Pending',
      status: 'Checked-In',
      createdBy: staffUser._id
    });

    const staffToken = createToken(staffUser);

    // Attempt checkout while unpaid -> MUST be blocked with HTTP 400
    const checkoutBlockedRes = await fetch(`${baseUrl}/reservations/${resv._id}/check-out`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${staffToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ actualCheckOutDate: new Date() })
    });
    assert.equal(checkoutBlockedRes.status, 400);
    const { invoiceId, balanceDue } = await checkoutBlockedRes.json();
    assert.equal(balanceDue, 30000);
    const invoice = await Invoice.findById(invoiceId);
    assert.equal(String(invoice.property), String(property._id));

    // Simulate invoices generated by the old checkout code and retry without creating another one.
    await Invoice.updateOne({ _id: invoiceId }, { $unset: { property: 1 } });
    const retry = await fetch(`${baseUrl}/reservations/${resv._id}/check-out`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${staffToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(retry.status, 400);
    assert.equal((await retry.json()).invoiceId, invoiceId);
    assert.equal(await Invoice.countDocuments({ reservation: resv._id }), 1);

    const legacyCopy = invoice.toObject();
    delete legacyCopy._id;
    delete legacyCopy.property;
    const duplicate = await Invoice.create({ ...legacyCopy, invoiceNumber: 'INV-LEGACY-COPY' });
    const payRes = await fetch(`${baseUrl}/invoices/${duplicate._id}/payment`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${staffToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 30000, paymentMethod: 'Cash' })
    });
    assert.equal(payRes.status, 200);
    const replay = await fetch(`${baseUrl}/invoices/${invoiceId}/payment`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${staffToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 1000, paymentMethod: 'Cash' })
    });
    assert.equal(replay.status, 400);

    // Attempt checkout again -> MUST succeed!
    const checkoutSuccessRes = await fetch(`${baseUrl}/reservations/${resv._id}/check-out`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${staffToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ actualCheckOutDate: new Date() })
    });
    assert.equal(checkoutSuccessRes.status, 200);

    const checkedOutResv = await Reservation.findById(resv._id);
    assert.equal(checkedOutResv.status, 'Checked-Out');
    const remainingStay = await Reservation.findOne({room: room._id, status: 'Checked-In'});
    assert.ok(remainingStay);
    const occupiedRoom = await Room.findById(room._id);
    assert.equal(occupiedRoom.status, 'Occupied');
    assert.equal(String(occupiedRoom.currentReservation), String(remainingStay._id));
  });

  // -------------------------------------------------------------------------
  // Scenario 9: Authorization & Identity capture
  // -------------------------------------------------------------------------
  it('Scenario 9: Enforces least-privilege RBAC and captures authenticated staff ID in auditLog', async () => {
    const guest = await Guest.create({
      firstName: 'Lasith',
      lastName: 'Malinga',
      email: 'malinga@example.test',
      phone: '0770001112',
      property: property._id,
      nationalIdType: 'National ID',
      nationalIdNumber: 'NIC-55555',
      nationality: 'Sri Lankan'
    });

    const resv = await Reservation.create({
      property: property._id,
      guest: guest._id,
      room: room._id,
      bookingSource: 'Walk-in',
      checkInDate: new Date('2026-12-05'),
      checkOutDate: new Date('2026-12-06'),
      numberOfAdults: 1,
      numberOfChildren: 0,
      numberOfGuests: 1,
      roomType: 'Deluxe',
      ratePerNight: 15000,
      numberOfNights: 1,
      roomCharges: 15000,
      totalAmount: 15000,
      advancePayment: 0,
      paymentStatus: 'Pending',
      status: 'Confirmed',
      createdBy: staffUser._id
    });

    // Customer B tries to record payment for someone else's reservation -> 403 Forbidden
    const otherCustToken = createToken(otherCustomer);
    const unauthorizedRes = await fetch(`${baseUrl}/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${otherCustToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reservationId: resv._id.toString(),
        amount: 15000,
        paymentMethod: 'Cash'
      })
    });
    assert.equal(unauthorizedRes.status, 403);

    // Authorized staff records payment -> 201 Created
    const staffToken = createToken(staffUser);
    const authorizedRes = await fetch(`${baseUrl}/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reservationId: resv._id.toString(),
        amount: 15000,
        paymentMethod: 'Cash'
      })
    });
    assert.equal(authorizedRes.status, 201);
    const payDoc = await authorizedRes.json();
    assert.equal(payDoc.auditLog[0].performedBy._id, staffUser._id.toString());
  });

  // -------------------------------------------------------------------------
  // Scenario 10: Operations Dashboard & Analytics Reconciliation
  // -------------------------------------------------------------------------
  it('Scenario 10: Operations Dashboard calculates revenue strictly from confirmed Payments, not created reservations', async () => {
    // Create an unpaid reservation created today
    const guest = await Guest.create({
      firstName: 'Test',
      lastName: 'Unpaid',
      email: 'unpaid@example.test',
      phone: '0770000000',
      property: property._id,
      nationalIdType: 'Other',
      nationalIdNumber: 'GST-999',
      nationality: 'Sri Lankan'
    });

    const unpaidResv = await Reservation.create({
      property: property._id,
      guest: guest._id,
      room: room._id,
      bookingSource: 'Walk-in',
      checkInDate: new Date(),
      checkOutDate: new Date(Date.now() + 86400000),
      numberOfAdults: 1,
      numberOfChildren: 0,
      numberOfGuests: 1,
      roomType: 'Deluxe',
      ratePerNight: 20000,
      numberOfNights: 1,
      roomCharges: 20000,
      totalAmount: 20000,
      advancePayment: 0,
      paymentStatus: 'Pending',
      status: 'Confirmed',
      createdBy: staffUser._id,
      createdAt: new Date()
    });

    // Query Operations Dashboard stats
    const staffToken = createToken(staffUser);
    const statsRes = await fetch(`${baseUrl}/reservations/dashboard-stats`, {
      headers: { Authorization: `Bearer ${staffToken}` }
    });
    assert.equal(statsRes.status, 200);
    const stats = await statsRes.json();

    // Verify unpaidResv totalAmount (20,000) is NOT counted in revenueToday!
    // revenueToday only counts completed Payments confirmed today
    const totalPaymentsToday = await Payment.aggregate([
      {
        $match: {
          paymentStatus: { $in: ['completed', 'partially_refunded', 'refunded'] }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);
    const expectedRevenue = totalPaymentsToday[0]?.total || 0;
    assert.equal(stats.revenueToday, expectedRevenue);
  });
});
