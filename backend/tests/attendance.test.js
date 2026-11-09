const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const routes = require('../routes/attendanceRoutes');
const authRoutes = require('../routes/authRoutes');
const User = require('../models/User');
const Property = require('../models/Property');
const HotelChain = require('../models/HotelChain');
const Attendance = require('../models/Attendance');
const AdminAuditLog = require('../models/AdminAuditLog');

process.env.JWT_SECRET = 'isolated-attendance-tests-only';
let mongo, server, baseUrl, staff, admin, departmentAdmin, property, otherProperty;
const token = (user) => jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '5m' });
async function request(path, { user, method = 'GET', body, query = '' } = {}) {
  return fetch(`${baseUrl}/api/attendance${path}${query}`, { method, headers: { ...(user ? { Authorization: `Bearer ${token(user)}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
async function login(email, password) {
  return fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
}

describe('Attendance API', () => {
  before(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    const chain = await HotelChain.create({ name: 'Attendance test', code: 'ATT', status: 'Active' });
    property = await Property.create({ name: 'Attendance property', code: 'ATT-1', chain: chain._id, timezone: 'Asia/Colombo' });
    otherProperty = await Property.create({ name: 'Other property', code: 'ATT-2', chain: chain._id });
    staff = await User.create({ name: 'Test Staff', email: 'attendance-staff@example.test', phone: '111', password: 'attendance-test-password', role: 'staff', staffId: 'ATT-STAFF-1', department: 'Housekeeping', jobTitle: 'Attendant', property: property._id });
    admin = await User.create({ name: 'Test Admin', email: 'attendance-admin@example.test', phone: '112', password: 'attendance-test-password', role: 'admin', property: property._id });
    departmentAdmin = await User.create({ name: 'Department Admin', email: 'attendance-dept-admin@example.test', phone: '114', password: 'attendance-test-password', role: 'admin', departmentAdmin: true, adminDepartments: ['rooms'], property: property._id });
    const app = express(); app.use(express.json()); app.use('/api/attendance', routes); app.use('/api/auth', authRoutes);
    server = app.listen(0); await new Promise((resolve) => server.once('listening', resolve)); baseUrl = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => { if (server) await new Promise((resolve) => server.close(resolve)); if (mongoose.connection.readyState) await mongoose.disconnect(); if (mongo) await mongo.stop(); });

  it('requires authentication and denies cross-property attendance selection', async () => {
    assert.equal((await request('/mine')).status, 401);
    const denied = await request('/mine', { user: staff, query: `?propertyId=${otherProperty._id}` });
    assert.equal(denied.status, 403);
  });

  it('keeps department administrators on self-service attendance only', async () => {
    assert.equal((await request('/mine', { user: departmentAdmin })).status, 200);
    assert.equal((await request('/', { user: departmentAdmin })).status, 403);
    assert.equal((await request('/staff', { user: departmentAdmin })).status, 403);
    assert.equal((await request('/summary', { user: departmentAdmin })).status, 403);
  });

  it('authenticates staff, limits self history to the logged-in user, and rejects deactivated staff', async () => {
    const secondStaff = await User.create({ name: 'Private Record Owner', email: 'attendance-private@example.test', phone: '115', password: 'attendance-test-password', role: 'staff', staffId: 'ATT-STAFF-2', property: property._id });
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    await Attendance.create({ staff: secondStaff._id, property: property._id, attendanceDate: today, status: 'Present' });
    const loggedIn = await login(staff.email, 'attendance-test-password');
    assert.equal(loggedIn.status, 200);
    assert.equal((await loggedIn.json()).role, 'staff');
    const privateHistory = await request('/mine', { user: staff, query: `?propertyId=${property._id}&staffId=ATT-STAFF-2` });
    assert.equal(privateHistory.status, 200);
    const privateBody = await privateHistory.json();
    assert.equal(privateBody.history.some((record) => String(record.staff) === String(secondStaff._id)), false);
    assert.equal(privateBody.history.every((record) => String(record.staff) === String(staff._id)), true);
    secondStaff.status = 'Inactive'; await secondStaff.save();
    assert.equal((await login(secondStaff.email, 'attendance-test-password')).status, 403);
    assert.equal(await Attendance.countDocuments({ staff: secondStaff._id }), 1, 'deactivation preserves historical attendance');
  });

  it('records server-timestamped check-in and check-out once per property day', async () => {
    const before = Date.now();
    const checkedIn = await request('/check-in', { user: staff, method: 'POST', body: { propertyId: String(property._id) } });
    assert.equal(checkedIn.status, 201);
    const record = (await checkedIn.json()).attendance;
    assert.ok(new Date(record.checkIn).getTime() >= before - 1000);
    assert.equal((await request('/check-in', { user: staff, method: 'POST', body: { propertyId: String(property._id) } })).status, 409);
    assert.equal((await request('/check-out', { user: staff, method: 'POST', body: { propertyId: String(property._id) } })).status, 200);
    assert.equal((await request('/check-out', { user: staff, method: 'POST', body: { propertyId: String(property._id) } })).status, 409);
    assert.equal(await Attendance.countDocuments({ staff: staff._id }), 1);
  });

  it('allows only one successful checkout when duplicate requests arrive concurrently', async () => {
    const concurrentStaff = await User.create({ name: 'Concurrent Checkout', email: 'attendance-concurrent@example.test', phone: '118', password: 'attendance-test-password', role: 'staff', property: property._id });
    assert.equal((await request('/check-in', { user: concurrentStaff, method: 'POST', body: { propertyId: String(property._id) } })).status, 201);
    const responses = await Promise.all([
      request('/check-out', { user: concurrentStaff, method: 'POST', body: { propertyId: String(property._id) } }),
      request('/check-out', { user: concurrentStaff, method: 'POST', body: { propertyId: String(property._id) } })
    ]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  });

  it('limits review to assigned properties and records reasoned corrections with audit', async () => {
    const own = await request('/', { user: admin, query: `?propertyId=${property._id}` });
    assert.equal(own.status, 200);
    const denied = await request('/', { user: admin, query: `?propertyId=${otherProperty._id}` });
    assert.equal(denied.status, 403);
    const record = await Attendance.findOne({ staff: staff._id });
    const correction = await request(`/${record._id}/correction`, { user: admin, method: 'PUT', body: { status: 'Late', reason: 'Manager confirmed a delayed arrival' }, query: `?propertyId=${property._id}` });
    assert.equal(correction.status, 200);
    assert.equal((await request(`/${record._id}/correction`, { user: admin, method: 'PUT', body: { status: 'Present' }, query: `?propertyId=${property._id}` })).status, 400);
    assert.equal((await Attendance.findById(record._id)).corrections.length, 1);
    assert.equal(await AdminAuditLog.countDocuments({ action: 'ATTENDANCE_CORRECTED' }), 1);
    const auditedRecord = await Attendance.findById(record._id).lean();
    assert.equal(String(auditedRecord.corrections[0].correctedBy), String(admin._id));
    assert.ok(auditedRecord.corrections[0].correctedAt);
    assert.equal(auditedRecord.corrections[0].reason, 'Manager confirmed a delayed arrival');
    const summary = await request('/summary', { user: admin, query: `?propertyId=${otherProperty._id}` });
    assert.equal(summary.status, 403);
  });

  it('offers only assigned active staff and allows reasoned leave records', async () => {
    const options = await request('/staff', { user: admin, query: `?propertyId=${property._id}` });
    assert.equal(options.status, 200);
    assert.equal((await options.json()).items.some((item) => String(item._id) === String(staff._id)), true);
    const absentStaff = await User.create({ name: 'Second Staff', email: 'attendance-second@example.test', phone: '113', password: 'attendance-test-password', role: 'housekeeping', property: property._id });
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const recorded = await request('/corrections', { user: admin, method: 'POST', body: { staffId: String(absentStaff._id), propertyId: String(property._id), attendanceDate: date, status: 'On Leave', reason: 'Approved leave recorded by manager' } });
    assert.equal(recorded.status, 201);
    assert.equal((await recorded.json()).attendance.status, 'On Leave');
    assert.equal(await AdminAuditLog.countDocuments({ action: 'ATTENDANCE_RECORDED' }), 1);
  });

  it('filters attendance by staff ID and calendar month and includes staff profile fields', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    assert.ok(await Attendance.findOne({ staff: staff._id, property: property._id, attendanceDate: today }));
    const month = today.slice(0, 7);
    const response = await request('/', { user: admin, query: `?staffId=ATT-STAFF-1&month=${month}&status=Late` });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.pagination.total, 1);
    assert.equal(body.items[0].staff.staffId, 'ATT-STAFF-1');
    assert.equal(body.items[0].staff.jobTitle, 'Attendant');
    const monthly = await request('/summary', { user: admin, query: `?propertyId=${property._id}&month=${month}` });
    assert.equal(monthly.status, 200);
    assert.equal((await monthly.json()).monthly.counts.Late, 1);
    assert.equal((await request('/', { user: admin, query: '?month=2026-13' })).status, 400);
  });

  it('rejects invalid date and status filters and checkout without a check-in', async () => {
    assert.equal((await request('/', { user: admin, query: '?from=2026-02-30' })).status, 400);
    assert.equal((await request('/', { user: admin, query: '?status=Unknown' })).status, 400);
    const noCheckInStaff = await User.create({ name: 'No Check In', email: 'attendance-no-checkin@example.test', phone: '116', password: 'attendance-test-password', role: 'staff', property: property._id });
    assert.equal((await request('/check-out', { user: noCheckInStaff, method: 'POST', body: { propertyId: String(property._id) } })).status, 409);
    const missingCheckoutStaff = await User.create({ name: 'Missing Checkout', email: 'attendance-missing-checkout@example.test', phone: '117', password: 'attendance-test-password', role: 'staff', property: property._id });
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    await Attendance.create({ staff: missingCheckoutStaff._id, property: property._id, attendanceDate: today, checkIn: new Date(), status: 'Present' });
    const summary = await request('/summary', { user: admin, query: `?propertyId=${property._id}` });
    assert.ok((await summary.json()).missingCheckouts >= 1);
  });
});
