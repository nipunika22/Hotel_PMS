const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../server');
const HotelChain = require('../models/HotelChain');
const Property = require('../models/Property');
const Room = require('../models/Room');

let mongo;
let server;
let baseUrl;
let room;

describe('public availability route regression', () => {
  before(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    const chain = await HotelChain.create({ name: 'Public regression chain', code: 'PUB', status: 'Active' });
    const property = await Property.create({ name: 'Public regression property', code: 'PUB-1', chain: chain._id, status: 'Active' });
    room = await Room.create({
      property: property._id,
      roomNumber: 'PUB-101',
      roomType: 'Deluxe',
      floor: 1,
      basePrice: 200,
      capacity: { maxAdults: 2, maxOccupancy: 2 },
      bedConfiguration: 'King Bed',
      status: 'Available',
      isActive: true
    });
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  });
  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mongo) await mongo.stop();
  });

  it('keeps public room availability accessible without staff authentication', async () => {
    const response = await fetch(`${baseUrl}/rooms/available?checkInDate=2026-11-02&checkOutDate=2026-11-04&roomType=Deluxe`);
    assert.equal(response.status, 200);
    const rooms = await response.json();
    assert.ok(rooms.some((item) => item._id === String(room._id)));
  });

  it('keeps public event discovery accessible without staff authentication', async () => {
    const response = await fetch(`${baseUrl}/events`);
    assert.equal(response.status, 200);
  });
});
