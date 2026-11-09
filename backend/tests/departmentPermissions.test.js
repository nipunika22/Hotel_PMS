const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
const requireDepartmentPermission = require('../middleware/requireDepartmentPermission');
const { protect } = require('../middleware/auth');
const { propertyContext } = require('../middleware/propertyContext');
const User = require('../models/User');
const Property = require('../models/Property');
const HotelChain = require('../models/HotelChain');
const Room = require('../models/Room');
const Guest = require('../models/Guest');
const authRoutes = require('../routes/authRoutes');

process.env.JWT_SECRET = 'isolated-department-route-tests';
let mongo;
let apiServer;
let apiBase;
let assignedProperty;
let otherProperty;
const users = {};

async function check(user, permission) {
  const app = express();
  app.get('/', (req, res, next) => { req.user = user; next(); }, requireDepartmentPermission(permission), (req, res) => res.sendStatus(204));
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try { return await fetch(`http://127.0.0.1:${server.address().port}/`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

describe('department permission middleware', () => {
  it('denies department administrators without the required department grant', async () => {
    const response = await check({ role: 'admin', departmentAdmin: true, adminDepartments: ['rooms'], adminPermissions: [] }, 'events');
    assert.equal(response.status, 403);
  });

  it('allows explicit department/offer grants and keeps Super Admin and legacy admin compatible', async () => {
    assert.equal((await check({ role: 'admin', departmentAdmin: true, adminDepartments: ['rooms'] }, 'rooms')).status, 204);
    assert.equal((await check({ role: 'admin', departmentAdmin: true, adminDepartments: ['rooms'], adminPermissions: ['offers.dining'] }, ['dining', 'offers.dining'])).status, 204);
    assert.equal((await check({ role: 'super_admin' }, 'events')).status, 204);
    assert.equal((await check({ role: 'admin' }, 'events')).status, 204);
  });
});

describe('department permissions on operational API routes', () => {
  before(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    const chain = await HotelChain.create({ name: 'Department test chain', code: 'DPT', status: 'Active' });
    assignedProperty = await Property.create({ name: 'Assigned property', code: 'DPT-1', chain: chain._id, status: 'Active' });
    otherProperty = await Property.create({ name: 'Other property', code: 'DPT-2', chain: chain._id, status: 'Active' });
    for (const department of ['rooms', 'reservations', 'dining', 'events']) {
      users[department] = await User.create({ name: `${department} administrator`, email: `${department}@department.test`, phone: '123', password: 'department-test-password', role: 'admin', departmentAdmin: true, adminDepartments: [department], property: assignedProperty._id });
    }
    users.global = await User.create({ name: 'Global administrator', email: 'global@department.test', phone: '124', password: 'department-test-password', role: 'admin', property: assignedProperty._id });
    users.staff = await User.create({ name: 'Assigned staff', email: 'assigned-staff@department.test', phone: '125', password: 'department-test-password', role: 'staff', property: assignedProperty._id });
    users.finance = await User.create({ name: 'Assigned finance', email: 'assigned-finance@department.test', phone: '128', password: 'department-test-password', role: 'finance', property: assignedProperty._id });
    users.unassignedStaff = await User.create({ name: 'Unassigned staff', email: 'unassigned-staff@department.test', phone: '126', password: 'department-test-password', role: 'staff' });
    users.multiPropertyStaff = await User.create({ name: 'Multi-property staff', email: 'multi-property-staff@department.test', phone: '127', password: 'department-test-password', role: 'staff', allowedProperties: [assignedProperty._id, otherProperty._id] });
    users.superAdmin = await User.create({ name: 'Portfolio Super Admin', email: 'portfolio-super-admin@department.test', phone: '129', password: 'department-test-password', role: 'super_admin' });
    const app = express();
    app.use(express.json());
    app.use(propertyContext);
    app.use('/api/auth', authRoutes);
    app.use('/api/rooms', require('../routes/roomRoutes'));
    app.use('/api/guests', require('../routes/guestRoutes'));
    app.use('/api/reservations', require('../routes/reservationRoutes'));
    app.use('/api/restaurants', require('../routes/restaurantRoutes'));
    app.use('/api/events', require('../routes/eventRoutes'));
    apiServer = app.listen(0);
    await new Promise((resolve) => apiServer.once('listening', resolve));
    apiBase = `http://127.0.0.1:${apiServer.address().port}/api`;
  });
  after(async () => {
    if (apiServer) await new Promise((resolve) => apiServer.close(resolve));
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mongo) await mongo.stop();
  });

  it('enforces each department grant at the real API routes and preserves global Admin access', async () => {
    const endpoints = {
      rooms: '/rooms',
      reservations: '/reservations',
      dining: '/restaurants/admin/offers',
      events: '/events/admin/events'
    };
    for (const [department, endpoint] of Object.entries(endpoints)) {
      const tokenFor = (user) => jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '5m' });
      for (const [required, path] of Object.entries(endpoints)) {
        const response = await fetch(`${apiBase}${path}`, { headers: { Authorization: `Bearer ${tokenFor(users[department])}` } });
        assert.equal(response.status === 403, required !== department, `${department} grant on ${path}`);
      }
      const global = await fetch(`${apiBase}${endpoint}`, { headers: { Authorization: `Bearer ${tokenFor(users.global)}` } });
      assert.notEqual(global.status, 403, `legacy global admin on ${endpoint}`);
      const wrongPropertyResponse = await fetch(`${apiBase}${endpoint}?propertyId=${otherProperty._id}`, { headers: { Authorization: `Bearer ${tokenFor(users[department])}` } });
      assert.equal(wrongPropertyResponse.status, 403, `${department} administrator cannot select another property on ${endpoint}`);
    }
  });

  it('rejects an assigned department administrator selecting a different property', async () => {
    const token = jwt.sign({ id: users.rooms._id }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const response = await fetch(`${apiBase}/rooms?propertyId=${otherProperty._id}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status, 403);
  });

  it('blocks Department Admin account enumeration while preserving legacy global Admin user management', async () => {
    const tokenFor = (user) => jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const departmentAdminResponse = await fetch(`${apiBase}/auth/users`, { headers: { Authorization: `Bearer ${tokenFor(users.rooms)}` } });
    assert.equal(departmentAdminResponse.status, 403);
    const legacyAdminResponse = await fetch(`${apiBase}/auth/users`, { headers: { Authorization: `Bearer ${tokenFor(users.global)}` } });
    assert.equal(legacyAdminResponse.status, 200);
  });

  it('allows Super Admin to access a department API at another property', async () => {
    const room = await Room.create({ property: otherProperty._id, roomNumber: 'SA-501', roomType: 'Suite', floor: 5, basePrice: 300, capacity: { maxAdults: 2, maxOccupancy: 2 }, bedConfiguration: 'King Bed' });
    const token = jwt.sign({ id: users.superAdmin._id }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const response = await fetch(`${apiBase}/rooms/${room._id}`, { headers: { Authorization: `Bearer ${token}`, 'x-property-id': String(otherProperty._id) } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).roomNumber, 'SA-501');
  });

  it('enforces reservation department and property scope for guest profile IDs', async () => {
    const guest = await Guest.create({ firstName: 'Private', lastName: 'Guest', phone: '321', property: otherProperty._id });
    const tokenFor = (user) => jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const reservationsToken = tokenFor(users.reservations);
    const outsider = await fetch(`${apiBase}/guests/${guest._id}`, { headers: { Authorization: `Bearer ${reservationsToken}` } });
    assert.equal(outsider.status, 403);
    const wrongDepartment = await fetch(`${apiBase}/guests/${guest._id}`, { headers: { Authorization: `Bearer ${tokenFor(users.rooms)}` } });
    assert.equal(wrongDepartment.status, 403);
    const search = await fetch(`${apiBase}/guests/search?query=Private`, { headers: { Authorization: `Bearer ${reservationsToken}` } });
    assert.deepEqual(await search.json(), []);
  });

  it('denies individual room record access to authenticated roles outside Rooms authorization', async () => {
    const token = jwt.sign({ id: users.finance._id }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const response = await fetch(`${apiBase}/rooms/${new mongoose.Types.ObjectId()}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status, 403);
  });

  it('scopes room detail and mutations to the selected property', async () => {
    const room = await Room.create({ property: otherProperty._id, roomNumber: 'X-401', roomType: 'Deluxe', floor: 4, basePrice: 100, capacity: { maxAdults: 2, maxOccupancy: 2 }, bedConfiguration: 'King Bed' });
    const token = jwt.sign({ id: users.rooms._id }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const detail = await fetch(`${apiBase}/rooms/${room._id}`, { headers });
    assert.equal(detail.status, 404);
    const update = await fetch(`${apiBase}/rooms/${room._id}`, { method: 'PUT', headers, body: JSON.stringify({ roomNumber: 'HIJACK', property: assignedProperty._id }) });
    assert.equal(update.status, 404);
    const unchanged = await Room.findById(room._id);
    assert.equal(unchanged.roomNumber, 'X-401');
    assert.equal(String(unchanged.property), String(otherProperty._id));
  });

  it('requires explicit property assignments for non-admin staff and requires selection for multi-property accounts', async () => {
    const tokenFor = (user) => jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const unassigned = await fetch(`${apiBase}/rooms?propertyId=${assignedProperty._id}`, { headers: { Authorization: `Bearer ${tokenFor(users.unassignedStaff)}` } });
    assert.equal(unassigned.status, 403);
    const assigned = await fetch(`${apiBase}/rooms`, { headers: { Authorization: `Bearer ${tokenFor(users.staff)}` } });
    assert.notEqual(assigned.status, 403);
    const unspecifiedMulti = await fetch(`${apiBase}/rooms`, { headers: { Authorization: `Bearer ${tokenFor(users.multiPropertyStaff)}` } });
    assert.equal(unspecifiedMulti.status, 400);
    const selectedMulti = await fetch(`${apiBase}/rooms?propertyId=${otherProperty._id}`, { headers: { Authorization: `Bearer ${tokenFor(users.multiPropertyStaff)}` } });
    assert.notEqual(selectedMulti.status, 403);
  });
});
