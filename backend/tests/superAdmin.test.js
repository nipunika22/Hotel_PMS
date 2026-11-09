const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const superAdminRoutes = require("../routes/superAdminRoutes");
const authRoutes = require("../routes/authRoutes");
const User = require("../models/User");
const HotelChain = require("../models/HotelChain");
const Property = require("../models/Property");
const AdminAuditLog = require("../models/AdminAuditLog");
const Room = require("../models/Room");
const Reservation = require("../models/Reservation");
const Guest = require("../models/Guest");
const Attendance = require("../models/Attendance");
const { protect } = require("../middleware/auth");
const requireDepartmentPermission = require("../middleware/requireDepartmentPermission");

process.env.JWT_SECRET = "isolated-super-admin-test-secret";

let mongo;
let server;
let baseUrl;
let superAdmin;
let ordinaryAdmin;

const tokenFor = (user) => jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "5m" });

async function request(path, { method = "GET", user, body, query = "" } = {}) {
  return fetch(`${baseUrl}/api/super-admin${path}${query}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(user ? { Authorization: `Bearer ${tokenFor(user)}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

async function protectedAccountRequest(user) {
  return fetch(`${baseUrl}/api/protected-account-check`, {
    headers: { Authorization: `Bearer ${tokenFor(user)}` }
  });
}

describe("Super Admin API", () => {
  before(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    superAdmin = await User.create({ name: "Portfolio Admin", email: "portfolio@example.test", phone: "100", password: "test-password-123", role: "super_admin" });
    ordinaryAdmin = await User.create({ name: "Property Admin", email: "property-admin@example.test", phone: "101", password: "test-password-123", role: "admin" });
    const app = express();
    app.use(express.json());
    app.get("/api/protected-account-check", protect, (req, res) => res.json({ status: req.user.status }));
    app.get("/api/protected-dining-check", protect, requireDepartmentPermission("dining"), (req, res) => res.sendStatus(204));
    app.get("/api/protected-rooms-check", protect, requireDepartmentPermission("rooms"), (req, res) => res.sendStatus(204));
    app.use("/api/super-admin", superAdminRoutes);
    app.use("/api/auth", authRoutes);
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    if (mongo) await mongo.stop();
  });

  it("requires authentication and the dedicated super_admin role", async () => {
    const anonymous = await request("/dashboard");
    assert.equal(anonymous.status, 401);
    const admin = await request("/dashboard", { user: ordinaryAdmin });
    assert.equal(admin.status, 403);
    const customer = await User.create({ name: "Customer Account", email: "customer-access@example.test", phone: "105", password: "test-password-123", role: "customer" });
    const customerResponse = await request("/dashboard", { user: customer });
    assert.equal(customerResponse.status, 403);
  });

  it("rejects an inactive Super Admin even when its JWT is still valid", async () => {
    const inactive = await User.create({ name: "Suspended Portfolio Admin", email: "suspended@example.test", phone: "104", password: "test-password-123", role: "super_admin", status: "Suspended" });
    const response = await request("/dashboard", { user: inactive });
    assert.equal(response.status, 403);
  });

  it("returns live database counts and explicitly withholds unreconciled revenue", async () => {
    const response = await request("/dashboard", { user: superAdmin });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.summary.properties, 0);
    assert.equal(body.summary.reservations, 0);
    assert.equal(body.summary.registeredUsers, await User.countDocuments({ role: { $ne: "super_admin" } }));
    assert.equal(body.summary.revenue.available, false);
    assert.match(body.summary.revenue.reason, /reconciliation/i);
  });

  it("preserves customer registration and login behavior", async () => {
    const email = "customer-regression@example.test";
    const registration = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Customer Regression", email, password: "customer-test-password", phone: "105", role: "super_admin" })
    });
    assert.equal(registration.status, 201);
    const registered = await registration.json();
    assert.equal(registered.role, "customer");
    assert.ok(registered.guestId);

    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "customer-test-password" })
    });
    assert.equal(login.status, 200);
    const loggedIn = await login.json();
    assert.equal(loggedIn.role, "customer");
    assert.ok(loggedIn.token);
  });

  it("creates a property only for a valid existing chain and writes an audit record", async () => {
    const chain = await HotelChain.create({ name: "Test Chain", code: "TST", status: "Active" });
    const response = await request("/properties", {
      method: "POST",
      user: superAdmin,
      body: { name: "Test Property", code: "TST-ONE", chain: String(chain._id), city: "Colombo", currency: "LKR" }
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.property.name, "Test Property");
    assert.equal(body.auditLogged, true);
    assert.equal(await AdminAuditLog.countDocuments({ action: "PROPERTY_CREATED" }), 1);
    const scopedOverview = await request("/dashboard", { user: superAdmin, query: `?propertyId=${body.property._id}` });
    assert.equal(scopedOverview.status, 200);
    const scopedBody = await scopedOverview.json();
    assert.equal(scopedBody.summary.properties, 1);
    assert.equal(scopedBody.propertySummaries.length, 1);
    const report = await request("/reports", { user: superAdmin, query: `?propertyId=${body.property._id}&from=2026-10-01&to=2026-10-31` });
    assert.equal(report.status, 200);
    const reportBody = await report.json();
    assert.equal(reportBody.propertiesByStatus[0].count, 1);

    await Room.create([
      { property: body.property._id, roomNumber: "QA-101", roomType: "Single", floor: 1, basePrice: 100, capacity: { maxAdults: 1, maxOccupancy: 1 }, bedConfiguration: "Single Bed", status: "Available" },
      { property: body.property._id, roomNumber: "QA-102", roomType: "Double", floor: 1, basePrice: 150, capacity: { maxAdults: 2, maxOccupancy: 2 }, bedConfiguration: "Double Bed", status: "Maintenance" }
    ]);
    const guest = await Guest.create({ firstName: "Chart", lastName: "Guest", phone: "5550100", property: body.property._id });
    const todayUtc = new Date();
    todayUtc.setUTCHours(12, 0, 0, 0);
    const dateAtOffset = (days) => new Date(todayUtc.getTime() + days * 86400000);
    const from7 = dateAtOffset(-6);
    const from30 = dateAtOffset(-29);
    const monthStart = new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), 1, 12));
    const previousMonthEnd = new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), 0, 12));
    const testPropertyId = new mongoose.Types.ObjectId(body.property._id);
    const trendRows = [
      { date: dateAtOffset(-1), status: "Cancelled" },
      { date: dateAtOffset(-15), status: "Confirmed" },
      { date: monthStart, status: "Checked-Out" },
      { date: previousMonthEnd, status: "No-Show" }
    ];
    await Reservation.collection.insertMany(trendRows.map(({ date, status }, index) => ({
      property: testPropertyId, reservationNumber: `QA-TREND-${index}`, guest: guest._id, bookingSource: "Hotel Website",
      checkInDate: dateAtOffset(1), checkOutDate: dateAtOffset(2), numberOfAdults: 1, roomType: "Single", numberOfRooms: 1,
      ratePerNight: 100, numberOfNights: 1, roomCharges: 100, totalAmount: 100, numberOfGuests: 1, status,
      paymentStatus: "Pending", createdBy: superAdmin._id, createdAt: date, updatedAt: date
    })));
    const attendanceStaff = await User.create({ name: "Attendance Check-in", email: "attendance-checkin@example.test", phone: "501", password: "attendance-test-password", role: "staff", property: testPropertyId });
    const leaveStaff = await User.create({ name: "Attendance Leave", email: "attendance-leave@example.test", phone: "502", password: "attendance-test-password", role: "staff", property: testPropertyId });
    const localDateParts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
    const propertyLocalToday = `${localDateParts.year}-${localDateParts.month}-${localDateParts.day}`;
    await Attendance.create([
      { staff: attendanceStaff._id, property: testPropertyId, attendanceDate: propertyLocalToday, checkIn: new Date(), status: "Present" },
      { staff: leaveStaff._id, property: testPropertyId, attendanceDate: propertyLocalToday, status: "On Leave" }
    ]);
    const dashboardWithRooms = await request("/dashboard", { user: superAdmin, query: `?propertyId=${body.property._id}` });
    const roomSummary = (await dashboardWithRooms.json()).summary;
    assert.equal(roomSummary.rooms, 2);
    assert.deepEqual(roomSummary.roomStatusDistribution, [{ _id: "Available", count: 1 }, { _id: "Maintenance", count: 1 }]);
    assert.equal(roomSummary.reservations, 4);
    assert.equal(roomSummary.reservationsByStatus.Cancelled, 1);
    assert.equal(roomSummary.checkedInToday, 1);
    assert.equal(roomSummary.todayAttendance.Present, 1);
    assert.equal(roomSummary.todayAttendance["On Leave"], 1);
    const dateKey = (date) => date.toISOString().slice(0, 10);
    const expectedTrendCount = (from, to) => trendRows.filter(({ date }) => date >= new Date(`${dateKey(from)}T00:00:00.000Z`) && date < new Date(`${dateKey(to)}T00:00:00.000Z`).getTime() + 86400000).length;
    const sevenDayReport = await request("/reports", { user: superAdmin, query: `?propertyId=${body.property._id}&from=${dateKey(from7)}&to=${dateKey(todayUtc)}` });
    assert.equal((await sevenDayReport.json()).reservationTrends.reduce((sum, row) => sum + row.count, 0), expectedTrendCount(from7, todayUtc));
    const thirtyDayReport = await request("/reports", { user: superAdmin, query: `?propertyId=${body.property._id}&from=${dateKey(from30)}&to=${dateKey(todayUtc)}` });
    assert.equal((await thirtyDayReport.json()).reservationTrends.reduce((sum, row) => sum + row.count, 0), expectedTrendCount(from30, todayUtc));
    const monthReport = await request("/reports", { user: superAdmin, query: `?propertyId=${body.property._id}&from=${dateKey(monthStart)}&to=${dateKey(todayUtc)}` });
    assert.equal((await monthReport.json()).reservationTrends.reduce((sum, row) => sum + row.count, 0), expectedTrendCount(monthStart, todayUtc));
  });

  it("rejects invalid property IDs and unsupported property fields", async () => {
    const invalidFilter = await request("/dashboard", { user: superAdmin, query: "?propertyId=invalid" });
    assert.equal(invalidFilter.status, 400);
    const invalidStatus = await request("/properties", { user: superAdmin, query: "?status=deleted" });
    assert.equal(invalidStatus.status, 400);
  });

  it("creates staff without exposing passwords and never permits staff creation as super_admin", async () => {
    const chain = await HotelChain.findOne({ code: "TST" });
    const property = await Property.findOne({ code: "TST-ONE" });
    const created = await request("/staff", {
      method: "POST",
      user: superAdmin,
      body: { name: "New Staff", email: "new-staff@example.test", password: "another-test-password", phone: "102", role: "staff", property: String(property._id) }
    });
    assert.equal(created.status, 201);
    const createdBody = await created.json();
    assert.equal(createdBody.user.password, undefined);
    assert.match(createdBody.user.staffId, /^STF-/);
    const profile = await request(`/staff/${createdBody.user._id}?month=2026-10`, { user: superAdmin });
    assert.equal(profile.status, 200);
    const profileBody = await profile.json();
    assert.equal(profileBody.staff.staffId, createdBody.user.staffId);
    assert.ok(Array.isArray(profileBody.attendance));
    assert.equal(profileBody.staff.password, undefined);
    const deactivate = await request(`/staff/${createdBody.user._id}`, { method: "PUT", user: superAdmin, body: { status: "Inactive" } });
    assert.equal(deactivate.status, 200);
    const inactiveLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "new-staff@example.test", password: "another-test-password" })
    });
    assert.equal(inactiveLogin.status, 403);
    const activate = await request(`/staff/${createdBody.user._id}`, { method: "PUT", user: superAdmin, body: { status: "Active" } });
    assert.equal(activate.status, 200);
    const activeLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "new-staff@example.test", password: "another-test-password" })
    });
    assert.equal(activeLogin.status, 200);
    await assert.rejects(
      User.create({ name: "Duplicate Staff ID", email: "duplicate-staff-id@example.test", password: "another-test-password", phone: "103", role: "staff", staffId: createdBody.user.staffId }),
      (error) => error.code === 11000
    );
    const denied = await request("/staff", {
      method: "POST",
      user: superAdmin,
      body: { name: "Escalation", email: "escalation@example.test", password: "another-test-password", phone: "103", role: "super_admin" }
    });
    assert.equal(denied.status, 400);
    const list = await request("/staff", { user: superAdmin });
    const listBody = await list.json();
    assert.equal(listBody.items.some((item) => Object.hasOwn(item, "password")), false);
    assert.equal(await User.exists({ email: "escalation@example.test" }), null);
    assert.ok(chain);
  });

  it("creates admins with a fixed role, prevents role changes, and manages account status safely", async () => {
    const property = await Property.findOne({ code: "TST-ONE" });
    const invalidAdminId = await request("/admins/not-an-object-id", { method: "PUT", user: superAdmin, body: { status: "Active" } });
    assert.equal(invalidAdminId.status, 400);
    const chain = await HotelChain.findOne({ code: "TST" });
    const secondProperty = await Property.create({ name: "Second Test Property", code: "TST-TWO", chain: chain._id });
    const created = await request("/admins", { method: "POST", user: superAdmin, body: { name: "Managed Admin", email: "managed-admin@example.test", password: "another-test-password", phone: "201", property: String(property._id), allowedProperties: [String(secondProperty._id)], status: "Active", role: "super_admin", adminDepartments: ["rooms", "reservations"], department: "Management", jobTitle: "Operations Lead" } });
    assert.equal(created.status, 201);
    const body = await created.json();
    assert.equal(body.user.role, "admin");
    assert.deepEqual(body.user.adminDepartments, ["rooms", "reservations"]);
    assert.equal(body.user.departmentAdmin, true);
    assert.deepEqual(body.user.allowedProperties, [String(secondProperty._id)]);
    assert.equal(body.user.jobTitle, "Operations Lead");
    assert.match(body.user.staffId, /^STF-/);
    assert.equal(body.user.password, undefined);
    const listed = await request("/admins", { user: superAdmin });
    assert.equal((await listed.json()).items.some((row) => row._id === body.user._id), true);
    const roomFiltered = await request("/admins", { user: superAdmin, query: "?departmentAccess=rooms" });
    assert.equal((await roomFiltered.json()).items.some((row) => row._id === body.user._id), true);
    const invalidDepartment = await request("/admins", { user: superAdmin, query: "?departmentAccess=finance" });
    assert.equal(invalidDepartment.status, 400);
    const escalation = await request(`/admins/${body.user._id}`, { method: "PUT", user: superAdmin, body: { role: "super_admin" } });
    assert.equal(escalation.status, 400);
    const inactive = await request(`/admins/${body.user._id}`, { method: "PUT", user: superAdmin, body: { status: "Inactive" } });
    assert.equal(inactive.status, 200);
    assert.equal((await User.findById(body.user._id)).status, "Inactive");
    const grantUpdate = await request(`/admins/${body.user._id}`, { method: "PUT", user: superAdmin, body: { adminDepartments: ["dining"], adminPermissions: ["offers.dining"], property: String(secondProperty._id), allowedProperties: [String(property._id)] } });
    assert.equal(grantUpdate.status, 200);
    const updatedAdmin = await User.findById(body.user._id);
    assert.deepEqual(updatedAdmin.adminDepartments, ["dining"]);
    assert.equal(String(updatedAdmin.property), String(secondProperty._id));
    assert.deepEqual(updatedAdmin.allowedProperties.map(String), [String(property._id)]);
    const diningFiltered = await request("/admins", { user: superAdmin, query: "?departmentAccess=dining" });
    assert.equal((await diningFiltered.json()).items.some((row) => row._id === body.user._id), true);
    const roomsFilteredAfterUpdate = await request("/admins", { user: superAdmin, query: "?departmentAccess=rooms" });
    assert.equal((await roomsFilteredAfterUpdate.json()).items.some((row) => row._id === body.user._id), false);
    const combinedFilter = await request("/admins", { user: superAdmin, query: `?departmentAccess=dining&propertyId=${secondProperty._id}&search=managed-admin` });
    assert.equal((await combinedFilter.json()).items.some((row) => row._id === body.user._id), true);
    const wrongPropertyFilter = await request("/admins", { user: superAdmin, query: `?departmentAccess=dining&propertyId=${property._id}` });
    assert.equal((await wrongPropertyFilter.json()).items.some((row) => row._id === body.user._id), true);
    const dashboard = await request("/dashboard", { user: superAdmin, query: `?propertyId=${property._id}` });
    const dashboardBody = await dashboard.json();
    assert.equal(dashboard.status, 200);
    assert.equal(dashboardBody.summary.departmentAdmins.total, 1);
    assert.equal(dashboardBody.summary.departmentAdmins.active, 0);
    assert.equal(dashboardBody.summary.departmentAdmins.inactive, 1);
    assert.deepEqual(dashboardBody.summary.departmentAdmins.distribution, [{ department: "dining", count: 1 }]);
    const inactiveApi = await protectedAccountRequest({ _id: body.user._id });
    assert.equal(inactiveApi.status, 403);
    const inactiveDepartmentApi = await fetch(`${baseUrl}/api/protected-dining-check`, { headers: { Authorization: `Bearer ${tokenFor({ _id: body.user._id })}` } });
    assert.equal(inactiveDepartmentApi.status, 403);
    const reactivate = await request(`/admins/${body.user._id}`, { method: "PUT", user: superAdmin, body: { status: "Active" } });
    assert.equal(reactivate.status, 200);
    const activeApi = await protectedAccountRequest({ _id: body.user._id });
    assert.equal(activeApi.status, 200);
    const authorizedDepartmentApi = await fetch(`${baseUrl}/api/protected-dining-check`, { headers: { Authorization: `Bearer ${tokenFor({ _id: body.user._id })}` } });
    assert.equal(authorizedDepartmentApi.status, 204);
    const unauthorizedDepartmentApi = await fetch(`${baseUrl}/api/protected-rooms-check`, { headers: { Authorization: `Bearer ${tokenFor({ _id: body.user._id })}` } });
    assert.equal(unauthorizedDepartmentApi.status, 403);
    const activeDashboard = await request("/dashboard", { user: superAdmin, query: `?propertyId=${property._id}` });
    assert.equal((await activeDashboard.json()).summary.departmentAdmins.active, 1);
    const roleConfig = await request("/roles", { user: superAdmin });
    const roleConfigBody = await roleConfig.json();
    assert.deepEqual(roleConfigBody.departments, ["rooms", "reservations", "dining", "events"]);
    assert.ok(roleConfigBody.permissions.includes("offers.dining"));
    const customer = await User.create({ name: "Manageable Customer", email: "managed-customer@example.test", phone: "202", password: "customer-password", role: "customer" });
    const roleChange = await request(`/users/${customer._id}`, { method: "PUT", user: superAdmin, body: { role: "admin" } });
    assert.equal(roleChange.status, 400);
    const reset = await request(`/users/${customer._id}/password`, { method: "PUT", user: superAdmin, body: { newPassword: "long-managed-password-123" } });
    assert.equal(reset.status, 200);
    const refreshed = await User.findById(customer._id);
    assert.equal(await refreshed.comparePassword("long-managed-password-123"), true);
  });
});
