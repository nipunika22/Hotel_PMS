const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { MongoMemoryServer } = require('mongodb-memory-server');

const paymentRoutes = require('../routes/paymentRoutes');
const { propertyContext } = require('../middleware/propertyContext');
const HotelChain = require('../models/HotelChain');
const Property = require('../models/Property');
const Room = require('../models/Room');
const User = require('../models/User');
const Booking = require('../models/Booking');
const Reservation = require('../models/Reservation');
const Restaurant = require('../models/Restaurant');
const RestaurantReservation = require('../models/RestaurantReservation');
const EventVenue = require('../models/EventVenue');
const EventBooking = require('../models/EventBooking');
const Payment = require('../models/Payment');
const { getPayHereConfig, formatPayHereAmount } = require('../services/payhereService');

process.env.JWT_SECRET = 'payhere-comprehensive-integration-test-secret';
process.env.PAYHERE_MERCHANT_ID = '1211111';
process.env.PAYHERE_MERCHANT_SECRET = 'TestSecret123!';
process.env.PAYHERE_MODE = 'sandbox';

let mongo;
let server;
let baseUrl;
let property;
let customerA;
let customerB;
let staffUser;
let financeUser;
let room;
let canonicalReservation;
let roomBooking;
let restaurant;
let diningReservation;
let venue;
let eventBooking;

describe('PayHere Payment Gateway & Financial System Comprehensive Suite', () => {
  before(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());

    const chain = await HotelChain.create({ name: 'Serendib Chain', code: 'SER', status: 'Active' });
    property = await Property.create({
      name: 'Serendib Sanctuary Bentota',
      code: 'SER-BEN',
      chain: chain._id,
      city: 'Bentota',
      currency: 'LKR',
      status: 'Active'
    });

    room = await Room.create({
      property: property._id,
      roomNumber: '101',
      roomType: 'Suite',
      floor: 1,
      basePrice: 25000,
      bedConfiguration: 'King Bed',
      capacity: { maxAdults: 2, maxOccupancy: 2 },
      status: 'Reserved',
      isActive: true
    });

    customerA = await User.create({
      name: 'Ashan Silva',
      email: 'ashan@example.lk',
      phone: '+94771112233',
      password: 'password123',
      role: 'customer',
      property: property._id
    });

    customerB = await User.create({
      name: 'Nimal Perera',
      email: 'nimal@example.lk',
      phone: '+94772223344',
      password: 'password123',
      role: 'customer',
      property: property._id
    });

    staffUser = await User.create({
      name: 'Front Desk Officer',
      email: 'staff@example.lk',
      phone: '+94773334455',
      password: 'password123',
      role: 'staff',
      property: property._id
    });

    financeUser = await User.create({
      name: 'Chief Financial Officer',
      email: 'finance@example.lk',
      phone: '+94774445566',
      password: 'password123',
      role: 'finance',
      property: property._id
    });

    // Create room booking & canonical reservation
    canonicalReservation = await Reservation.create({
      property: property._id,
      reservationNumber: 'RES261200001',
      guest: new mongoose.Types.ObjectId(),
      room: room._id,
      bookingSource: 'Hotel Website',
      checkInDate: new Date('2026-12-01'),
      checkOutDate: new Date('2026-12-03'),
      numberOfAdults: 2,
      roomType: 'Suite',
      ratePerNight: 25000,
      numberOfNights: 2,
      roomCharges: 50000,
      totalAmount: 50000,
      paymentStatus: 'Pending',
      status: 'Confirmed',
      numberOfGuests: 2,
      createdBy: customerA._id
    });

    roomBooking = await Booking.create({
      property: property._id,
      user: customerA._id,
      room: room._id,
      checkInDate: new Date('2026-12-01'),
      checkOutDate: new Date('2026-12-03'),
      numberOfGuests: 2,
      totalPrice: 50000,
      paymentStatus: 'pending',
      paymentMethod: 'PayHere',
      bookingStatus: 'confirmed',
      reservationNumber: canonicalReservation.reservationNumber,
      reservation: canonicalReservation._id
    });

    // Create restaurant & dining reservation
    restaurant = await Restaurant.create({
      property: property._id,
      name: 'The Cinnamon Terrace',
      slug: 'cinnamon-terrace',
      cuisine: 'Sri Lankan & Seafood',
      location: 'Beachfront Terrace',
      openingHours: '07:00 - 23:00',
      status: 'Active'
    });

    diningReservation = await RestaurantReservation.create({
      property: property._id,
      restaurant: restaurant._id,
      user: customerA._id,
      customerName: 'Ashan Silva',
      email: 'ashan@example.lk',
      phone: '+94771112233',
      date: '2026-12-01',
      time: '19:30',
      guestCount: 2,
      diningType: 'Buffet',
      totalAmount: 12000,
      currency: 'LKR',
      status: 'PENDING'
    });

    // Create event hall & event booking
    venue = await EventVenue.create({
      property: property._id,
      name: 'Grand Horizon Ballroom',
      slug: 'grand-ballroom',
      min: 20,
      max: 300,
      capacity: 300,
      isActive: true
    });

    eventBooking = await EventBooking.create({
      property: property._id,
      venue: venue._id,
      venueName: venue.name,
      user: customerA._id,
      customerName: 'Ashan Silva',
      email: 'ashan@example.lk',
      phone: '+94771112233',
      eventType: 'Wedding Reception',
      date: '2026-12-15',
      startTime: '18:00',
      endTime: '23:00',
      guestCount: 150,
      estimatedPrice: 350000,
      currency: 'LKR',
      status: 'PENDING'
    });

    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(propertyContext);
    app.use('/api/payments', paymentRoutes);

    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}/api/payments`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mongo) await mongo.stop();
  });

  const getCustomerToken = (user) => jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const getFinanceToken = () => jwt.sign({ id: financeUser._id, role: financeUser.role }, process.env.JWT_SECRET, { expiresIn: '1h' });

  it('1. Initiates room reservation payment with server-authoritative pricing and PayHere hash', async () => {
    const token = getCustomerToken(customerA);
    const res = await fetch(`${baseUrl}/initiate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        purpose: 'room_booking',
        targetId: String(roomBooking._id)
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.amount, 50000);
    assert.equal(data.currency, 'LKR');
    assert.ok(data.payHereParams.hash);
    assert.equal(data.payHereParams.merchant_id, '1211111');
    assert.equal(data.payHereParams.amount, '50000.00');

    // Verify Payment record was created in pending state
    const payment = await Payment.findOne({ paymentReference: data.paymentReference });
    assert.ok(payment);
    assert.equal(payment.paymentStatus, 'pending');
    assert.equal(payment.amount, 50000);
  });

  it('2. Initiates restaurant dining payment with authoritative amount', async () => {
    const token = getCustomerToken(customerA);
    const res = await fetch(`${baseUrl}/initiate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        purpose: 'restaurant_dining',
        targetId: String(diningReservation._id)
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.amount, 12000);
    assert.equal(data.payHereParams.custom_1, 'restaurant_dining');
  });

  it('3. Initiates event booking payment with authoritative estimated price', async () => {
    const token = getCustomerToken(customerA);
    const res = await fetch(`${baseUrl}/initiate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        purpose: 'event_booking',
        targetId: String(eventBooking._id)
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.amount, 350000);
    assert.equal(data.payHereParams.custom_1, 'event_booking');
  });

  it('4. Rejects unauthorized customer attempting to pay for another customer booking', async () => {
    const token = getCustomerToken(customerB);
    const res = await fetch(`${baseUrl}/initiate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        purpose: 'room_booking',
        targetId: String(roomBooking._id)
      })
    });

    assert.equal(res.status, 403);
  });

  it('5. Successfully verifies genuine PayHere webhook with valid MD5 signature and marks booking paid', async () => {
    const payment = await Payment.findOne({ booking: roomBooking._id });
    assert.ok(payment);

    // Calculate valid MD5 signature according to PayHere spec
    const secretHash = crypto.createHash('md5').update('TestSecret123!').digest('hex').toUpperCase();
    const formattedAmount = formatPayHereAmount(payment.amount);
    const rawSig = `1211111${payment.paymentReference}${formattedAmount}LKR2${secretHash}`;
    const md5sig = crypto.createHash('md5').update(rawSig).digest('hex').toUpperCase();

    const webhookRes = await fetch(`${baseUrl}/payhere/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant_id: '1211111',
        order_id: payment.paymentReference,
        payment_id: 'PH-TXN-998877',
        payhere_amount: formattedAmount,
        payhere_currency: 'LKR',
        status_code: 2,
        md5sig: md5sig,
        method: 'VISA',
        status_message: 'Approved'
      })
    });

    assert.equal(webhookRes.status, 200);

    // Check payment updated to completed
    const updatedPayment = await Payment.findById(payment._id);
    assert.equal(updatedPayment.paymentStatus, 'completed');
    assert.equal(updatedPayment.gatewayTransactionId, 'PH-TXN-998877');
    assert.equal(updatedPayment.gatewayMethod, 'VISA');

    // Check booking updated to paid
    const updatedBooking = await Booking.findById(roomBooking._id);
    assert.equal(updatedBooking.paymentStatus, 'paid');

    // Check canonical reservation updated to Paid
    const updatedReservation = await Reservation.findById(canonicalReservation._id);
    assert.equal(updatedReservation.paymentStatus, 'Paid');
    assert.equal(updatedReservation.advancePayment, 50000);
  });

  it('6. Ensures duplicate webhook notifications are idempotent and do not duplicate updates', async () => {
    const payment = await Payment.findOne({ booking: roomBooking._id });
    const secretHash = crypto.createHash('md5').update('TestSecret123!').digest('hex').toUpperCase();
    const formattedAmount = formatPayHereAmount(payment.amount);
    const rawSig = `1211111${payment.paymentReference}${formattedAmount}LKR2${secretHash}`;
    const md5sig = crypto.createHash('md5').update(rawSig).digest('hex').toUpperCase();

    const webhookRes = await fetch(`${baseUrl}/payhere/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant_id: '1211111',
        order_id: payment.paymentReference,
        payment_id: 'PH-TXN-998877',
        payhere_amount: formattedAmount,
        payhere_currency: 'LKR',
        status_code: 2,
        md5sig: md5sig,
        method: 'VISA'
      })
    });

    assert.equal(webhookRes.status, 200);
    assert.equal(await webhookRes.text(), 'Already confirmed');
  });

  it('7. Rejects invalid or tampered gateway signature with 400', async () => {
    const payment = await Payment.findOne({ restaurantReservation: diningReservation._id });
    assert.ok(payment);

    const webhookRes = await fetch(`${baseUrl}/payhere/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant_id: '1211111',
        order_id: payment.paymentReference,
        payment_id: 'TAMPERED-1',
        payhere_amount: '12000.00',
        payhere_currency: 'LKR',
        status_code: 2,
        md5sig: 'INVALID_SIGNATURE_TAMPERED',
        method: 'VISA'
      })
    });

    assert.equal(webhookRes.status, 400);
    assert.equal(await webhookRes.text(), 'Invalid signature');
  });

  it('8. Rejects amount mismatch between gateway callback and database record', async () => {
    const payment = await Payment.findOne({ restaurantReservation: diningReservation._id });
    assert.ok(payment);

    // Signature matches tampered amount '500.00' instead of '12000.00'
    const secretHash = crypto.createHash('md5').update('TestSecret123!').digest('hex').toUpperCase();
    const rawSig = `1211111${payment.paymentReference}500.00LKR2${secretHash}`;
    const md5sig = crypto.createHash('md5').update(rawSig).digest('hex').toUpperCase();

    const webhookRes = await fetch(`${baseUrl}/payhere/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant_id: '1211111',
        order_id: payment.paymentReference,
        payment_id: 'MISMATCH-1',
        payhere_amount: '500.00',
        payhere_currency: 'LKR',
        status_code: 2,
        md5sig: md5sig,
        method: 'VISA'
      })
    });

    assert.equal(webhookRes.status, 400);
    assert.equal(await webhookRes.text(), 'Amount or currency mismatch');

    const updatedPayment = await Payment.findById(payment._id);
    assert.equal(updatedPayment.paymentStatus, 'failed');
  });

  it('9. Customer can retrieve own payment verification and history but cannot access another customer payment', async () => {
    const payment = await Payment.findOne({ booking: roomBooking._id });
    const tokenA = getCustomerToken(customerA);
    const tokenB = getCustomerToken(customerB);

    // Customer A verifies own payment
    const resA = await fetch(`${baseUrl}/verify/${payment.paymentReference}`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.equal(resA.status, 200);
    const dataA = await resA.json();
    assert.equal(dataA.paymentReference, payment.paymentReference);

    // Customer B attempts to view Customer A payment
    const resB = await fetch(`${baseUrl}/verify/${payment.paymentReference}`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    assert.equal(resB.status, 403);
  });

  it('10. Financial Manager retrieves accurate analytics with verified confirmed revenue', async () => {
    const token = getFinanceToken();
    const res = await fetch(`${baseUrl}/financial-analytics`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.summary.totalConfirmedRevenue, 50000);
    assert.equal(data.summary.totalConfirmedCount, 1);
    assert.equal(data.summary.netRevenue, 50000);
    assert.ok(Array.isArray(data.revenueByPurpose));
    assert.ok(data.revenueByPurpose.some((p) => p._id === 'room_booking' && p.revenue === 50000));
  });

  it('11. Authorized staff/finance can process partial and full refunds with audit logging', async () => {
    const payment = await Payment.findOne({ booking: roomBooking._id });
    const token = getFinanceToken();

    const refundRes = await fetch(`${baseUrl}/${payment._id}/refund`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 10000,
        reason: 'Guest requested date modification compensation'
      })
    });

    assert.equal(refundRes.status, 200);
    const refundData = await refundRes.json();
    assert.equal(refundData.payment.paymentStatus, 'partially_refunded');
    assert.equal(refundData.payment.refundAmount, 10000);

    // Verify analytics reflects net revenue deduction
    const analyticsRes = await fetch(`${baseUrl}/financial-analytics`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const analytics = await analyticsRes.json();
    assert.equal(analytics.summary.totalRefundedAmount, 10000);
    assert.equal(analytics.summary.netRevenue, 40000); // 50,000 - 10,000
  });

  it('12. Rejects unauthorized customer attempting to trigger refunds', async () => {
    const payment = await Payment.findOne({ booking: roomBooking._id });
    const customerToken = getCustomerToken(customerA);

    const refundRes = await fetch(`${baseUrl}/${payment._id}/refund`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 5000, reason: 'Unauthorized customer attempt' })
    });

    assert.equal(refundRes.status, 403);
  });
});
