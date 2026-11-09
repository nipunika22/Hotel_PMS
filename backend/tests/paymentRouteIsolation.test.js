const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const paymentRoutes = require('../routes/paymentRoutes');
const { propertyContext } = require('../middleware/propertyContext');
const HotelChain = require('../models/HotelChain');
const Property = require('../models/Property');
const Room = require('../models/Room');
const User = require('../models/User');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');

process.env.JWT_SECRET = 'isolated-payment-route-regression';
let mongo;
let server;
let baseUrl;
let customer;
let booking;

describe('payment API isolated regression', () => {
  before(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    const chain = await HotelChain.create({ name: 'Payment regression chain', code: 'PAY', status: 'Active' });
    const property = await Property.create({ name: 'Payment regression property', code: 'PAY-1', chain: chain._id, status: 'Active' });
    const room = await Room.create({ property: property._id, roomNumber: 'PAY-101', roomType: 'Deluxe', floor: 1, basePrice: 100, capacity: { maxAdults: 2, maxOccupancy: 2 }, bedConfiguration: 'King Bed', status: 'Available', isActive: true });
    customer = await User.create({ name: 'Payment Test Customer', email: 'payment-customer@example.test', phone: '123', password: 'payment-test-password', role: 'customer', property: property._id });
    booking = await Booking.create({ property: property._id, user: customer._id, room: room._id, checkInDate: new Date('2026-11-10'), checkOutDate: new Date('2026-11-12'), numberOfGuests: 2, totalPrice: 200, paymentStatus: 'pending', paymentMethod: 'Card' });
    const app = express();
    app.use(express.json());
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

  it('keeps the simulated payment record endpoint callable without an external payment provider', async () => {
    const token = jwt.sign({ id: customer._id }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: String(booking._id), amount: 200, paymentMethod: 'Card', transactionId: 'test-only-simulation' })
    });
    assert.equal(response.status, 201);
    const payment = await response.json();
    assert.equal(payment.booking._id, String(booking._id));
    assert.equal(await Payment.countDocuments({ booking: booking._id }), 1);
    assert.equal((await Booking.findById(booking._id)).paymentStatus, 'paid');
  });
});
