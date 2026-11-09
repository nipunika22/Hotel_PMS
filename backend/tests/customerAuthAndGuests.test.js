// backend/tests/customerAuthAndGuests.test.js
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const path = require("path");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
process.env.USE_IN_MEMORY_DB = "true";
process.env.MONGOMS_DOWNLOAD_DIR = "D:\\mongodb-binaries";

const connectDB = require("../config/db");
const app = require("../server");
const User = require("../models/User");
const Guest = require("../models/Guest");
const Property = require("../models/Property");
const HotelChain = require("../models/HotelChain");
const Room = require("../models/Room");
const Reservation = require("../models/Reservation");
const Booking = require("../models/Booking");

let server = null;
let BASE_URL = "";

const TEST_RUN_ID = Date.now();
const testEmail = `cust_${TEST_RUN_ID}@example.com`;
const testPassword = "MySecurePass123!";
let customerToken = null;
let customerUserId = null;
let customerGuestId = null;

let adminToken = null;
let pilotProperty = null;

describe("CUSTOMER AUTH PERSISTENCE & ADMIN GUEST MANAGEMENT TEST SUITE", () => {
  before(async () => {
    if (mongoose.connection.readyState !== 1) {
      await connectDB();
    }

    pilotProperty = await Property.findOne({ code: "SL-MAIN" });
    if (!pilotProperty) {
      pilotProperty = await Property.create({
        name: "Sri Lanka Main Property",
        code: "SL-MAIN",
        country: "Sri Lanka",
        city: "Colombo",
        status: "Active"
      });
    }

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        BASE_URL = `http://127.0.0.1:${port}/api`;
        resolve();
      });
    });

    // Obtain admin token
    const adminLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@hotel.com", password: "admin123" })
    });
    const adminData = await adminLoginRes.json();
    adminToken = adminData.token;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // 1 & 2: Registration & MongoDB Persistence
  it("1. Register a new customer with mixed-case and spaces in email", async () => {
    const res = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Janith Silva",
        email: `  ${testEmail.toUpperCase()}  `,
        password: testPassword,
        phone: "+94 77 123 4567",
        address: "45 Galle Road, Colombo"
      })
    });

    assert.strictEqual(res.status, 201, "Registration should return 201 Created");
    const data = await res.json();
    assert.ok(data.token, "Response must include JWT token");
    assert.strictEqual(data.role, "customer", "Public registration must assign role=customer");
    assert.strictEqual(data.email, testEmail.toLowerCase(), "Email must be normalized to lowercase");
    assert.ok(data.guestId, "Response must include linked guestId");

    customerToken = data.token;
    customerUserId = data._id;
    customerGuestId = data.guestId;
  });

  it("2. Verify customer account is permanently saved in MongoDB", async () => {
    const savedUser = await User.findById(customerUserId);
    assert.ok(savedUser, "User record must exist in MongoDB");
    assert.strictEqual(savedUser.email, testEmail.toLowerCase());
    assert.strictEqual(savedUser.role, "customer");
    assert.strictEqual(savedUser.status, "Active");
    assert.ok(savedUser.guest, "User must have guest ObjectId reference");
  });

  // 3: Password Hashing Verification
  it("3. Verify stored password is securely hashed with bcrypt and not plaintext", async () => {
    const savedUser = await User.findById(customerUserId);
    assert.notStrictEqual(savedUser.password, testPassword, "Password in database must never be plaintext");
    assert.ok(savedUser.password.startsWith("$2"), "Password must be a valid bcrypt hash starting with $2");
    
    const isMatch = await bcrypt.compare(testPassword, savedUser.password);
    assert.strictEqual(isMatch, true, "Bcrypt hash must match candidate password");
  });

  // 4: Login with correct credentials
  it("4. Log in using registered credentials (with mixed case input)", async () => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testEmail.toUpperCase(),
        password: testPassword
      })
    });

    assert.strictEqual(res.status, 200, "Login must succeed with status 200");
    const data = await res.json();
    assert.ok(data.token, "Login must return authentication token");
    assert.strictEqual(data.email, testEmail.toLowerCase());
    assert.strictEqual(data.role, "customer");
    assert.strictEqual(data.password, undefined, "Password must not be returned in login response");
  });

  // 5: Logout
  it("5. Log out terminates the active session acknowledgment", async () => {
    const res = await fetch(`${BASE_URL}/auth/logout`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${customerToken}`
      }
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
  });

  // 6: Log in again with same credentials
  it("6. Log in again with the same credentials after logout", async () => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `  ${testEmail}  `,
        password: testPassword
      })
    });

    assert.strictEqual(res.status, 200, "Subsequent login must succeed");
    const data = await res.json();
    assert.ok(data.token);
    assert.strictEqual(data._id.toString(), customerUserId.toString(), "Customer ID must be stable");
    customerToken = data.token;
  });

  // 7: Refresh profile verification
  it("7. Authenticated customer profile is restored from backend on refresh (GET /api/auth/profile)", async () => {
    const res = await fetch(`${BASE_URL}/auth/profile`, {
      headers: { "Authorization": `Bearer ${customerToken}` }
    });

    assert.strictEqual(res.status, 200);
    const userProfile = await res.json();
    assert.strictEqual(userProfile._id.toString(), customerUserId.toString());
    assert.strictEqual(userProfile.email, testEmail.toLowerCase());
    assert.strictEqual(userProfile.role, "customer");
    assert.strictEqual(userProfile.password, undefined, "Sensitive fields must be excluded");
  });

  // 8: Incorrect password
  it("8. Attempt login with an incorrect password and verify it fails safely (401)", async () => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testEmail,
        password: "WrongPassword999!"
      })
    });

    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.ok(data.error.includes("Invalid credentials"));
  });

  // 9: Duplicate registration prevention
  it("9. Attempt duplicate registration and verify it is cleanly rejected (400)", async () => {
    const res = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Duplicate User",
        email: testEmail.toUpperCase(),
        password: "AnotherPassword123!",
        phone: "0770000000"
      })
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error, "Must return meaningful error message");
  });

  // 10: Access own profile and booking history
  it("10. Customer can access their own booking history via /api/bookings/my-bookings", async () => {
    const res = await fetch(`${BASE_URL}/bookings/my-bookings`, {
      headers: { "Authorization": `Bearer ${customerToken}` }
    });

    assert.strictEqual(res.status, 200);
    const bookings = await res.json();
    assert.ok(Array.isArray(bookings));
  });

  // 11 & 12: RBAC & Customer restriction from admin routes
  it("11 & 12. Customer is strictly forbidden from accessing admin guest endpoints (/api/guests)", async () => {
    const res = await fetch(`${BASE_URL}/guests`, {
      headers: { "Authorization": `Bearer ${customerToken}` }
    });

    assert.strictEqual(res.status, 403, "Customer access to admin guests must return 403 Forbidden");
  });

  // 13: Admin sees registered guests
  it("13. Authorized admin can view registered customer in the guest directory", async () => {
    const res = await fetch(`${BASE_URL}/guests?search=${testEmail}`, {
      headers: { "Authorization": `Bearer ${adminToken}` }
    });

    assert.strictEqual(res.status, 200);
    const guests = await res.json();
    assert.ok(Array.isArray(guests), "Admin guest endpoint must return guest array");
    const foundGuest = guests.find(g => g.email === testEmail.toLowerCase());
    assert.ok(foundGuest, "Registered customer must appear in admin guest list");
    assert.strictEqual(foundGuest.hasAccount, true, "Guest must be marked as having an account");
    assert.strictEqual(foundGuest.accountStatus, "Active");
  });

  // 14: View single guest full dossier
  it("14. Admin can retrieve a guest's full database details including activity", async () => {
    const res = await fetch(`${BASE_URL}/guests/${customerGuestId}`, {
      headers: { "Authorization": `Bearer ${adminToken}` }
    });

    assert.strictEqual(res.status, 200);
    const dossier = await res.json();
    assert.strictEqual(dossier._id.toString(), customerGuestId.toString());
    assert.strictEqual(dossier.email, testEmail.toLowerCase());
    assert.ok(Array.isArray(dossier.reservations), "Must include reservations array");
    assert.ok(Array.isArray(dossier.restaurantReservations), "Must include restaurant reservations array");
    assert.ok(Array.isArray(dossier.eventBookings), "Must include event bookings array");
    assert.ok(Array.isArray(dossier.invoices), "Must include invoices array");
    assert.strictEqual(dossier.user?.password, undefined, "User password must never be exposed");
  });

  // 15: Edit permitted guest info and verify persistence
  it("15. Admin can update permitted guest information and changes persist in MongoDB", async () => {
    const res = await fetch(`${BASE_URL}/guests/${customerGuestId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        guestType: "VIP",
        notes: "Prefers high-floor ocean view rooms",
        phone: "+94 77 999 8888"
      })
    });

    assert.strictEqual(res.status, 200);
    const updated = await res.json();
    assert.strictEqual(updated.guestType, "VIP");
    assert.strictEqual(updated.phone, "+94 77 999 8888");

    // Verify in MongoDB
    const reloadedGuest = await Guest.findById(customerGuestId);
    assert.strictEqual(reloadedGuest.guestType, "VIP");
    assert.strictEqual(reloadedGuest.notes, "Prefers high-floor ocean view rooms");
    assert.strictEqual(reloadedGuest.phone, "+94 77 999 8888");
  });

  // 16: Account status toggle and synchronization
  it("16. Admin can deactivate and activate customer account with status synchronization", async () => {
    // Deactivate
    const deactRes = await fetch(`${BASE_URL}/guests/${customerGuestId}/status`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({ status: "Inactive" })
    });
    assert.strictEqual(deactRes.status, 200);

    // Verify customer login is blocked when account is Inactive
    const loginAttempt = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: testPassword })
    });
    assert.strictEqual(loginAttempt.status, 403, "Inactive account login must be blocked with 403");

    // Reactivate
    const actRes = await fetch(`${BASE_URL}/guests/${customerGuestId}/status`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({ status: "Active" })
    });
    assert.strictEqual(actRes.status, 200);

    // Verify customer can log in again
    const reactivatedLogin = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: testPassword })
    });
    assert.strictEqual(reactivatedLogin.status, 200, "Reactivated account must be able to log in");
  });

  // 17: Booking creation links cleanly to existing Guest without duplicates
  it("17. Booking creation preserves existing Guest profile without creating duplicate records", async () => {
    const existingGuestCount = await Guest.countDocuments({ email: testEmail.toLowerCase() });
    assert.strictEqual(existingGuestCount, 1, "Should only have 1 Guest record before booking");

    // Create room for booking
    let room = await Room.findOne({ status: "Available" });
    if (!room) {
      room = await Room.create({
        property: pilotProperty._id,
        roomNumber: "305",
        roomType: "Deluxe",
        basePrice: 150,
        status: "Available"
      });
    }

    const checkInDate = new Date();
    checkInDate.setDate(checkInDate.getDate() + 30);
    const checkOutDate = new Date();
    checkOutDate.setDate(checkOutDate.getDate() + 32);

    const bookingRes = await fetch(`${BASE_URL}/bookings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${customerToken}`
      },
      body: JSON.stringify({
        roomId: room._id,
        checkInDate: checkInDate.toISOString(),
        checkOutDate: checkOutDate.toISOString(),
        numberOfGuests: 2
      })
    });

    assert.strictEqual(bookingRes.status, 201, "Customer self-service booking should succeed");

    // Verify no duplicate Guest record was created
    const postGuestCount = await Guest.countDocuments({ email: testEmail.toLowerCase() });
    assert.strictEqual(postGuestCount, 1, "Guest count must remain exactly 1 (no duplicate guest records)");

    // Verify customer's booking appears in /my-bookings
    const myBookingsRes = await fetch(`${BASE_URL}/bookings/my-bookings`, {
      headers: { "Authorization": `Bearer ${customerToken}` }
    });
    assert.strictEqual(myBookingsRes.status, 200);
    const myBookings = await myBookingsRes.json();
    assert.ok(myBookings.length >= 1, "New booking must appear in customer's my-bookings list");
  });

  // 18: Newly registered customer is visible in GET /api/guests BEFORE making any reservation
  it("18. Newly registered customer appears in GET /api/guests before making any room reservation", async () => {
    const unbookedEmail = `unbooked_${Date.now()}@example.com`;
    const regRes = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Unbooked Customer",
        email: unbookedEmail,
        password: "Password123!",
        phone: "+94 71 888 7777"
      })
    });
    assert.strictEqual(regRes.status, 201);

    const guestsRes = await fetch(`${BASE_URL}/guests?search=${unbookedEmail}`, {
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    assert.strictEqual(guestsRes.status, 200);
    const guests = await guestsRes.json();
    const guestFound = (Array.isArray(guests) ? guests : guests.guests).find(g => g.email === unbookedEmail.toLowerCase());
    assert.ok(guestFound, "Online registered customer must be visible before creating any reservation");
    assert.strictEqual(guestFound.bookingCount, 0, "Booking count should be 0");
    assert.strictEqual(guestFound.hasAccount, true);
  });

  // 19: Legacy unlinked User account is automatically healed on GET /api/guests
  it("19. Legacy customer User without a Guest record is automatically healed and appears in /api/guests", async () => {
    const legacyEmail = `legacy_${Date.now()}@example.com`;
    // Create an orphaned User directly without a Guest record (simulating legacy database data)
    const legacyUser = await User.create({
      name: "Legacy Orphan Customer",
      email: legacyEmail,
      password: "HashedPassword123!",
      phone: "+94 77 000 1111",
      role: "customer",
      status: "Active"
    });

    // Check before GET /api/guests
    const guestBefore = await Guest.findOne({ email: legacyEmail });
    assert.strictEqual(guestBefore, null, "Guest should not exist yet");

    // Calling GET /api/guests should heal the record
    const guestsRes = await fetch(`${BASE_URL}/guests?search=${legacyEmail}`, {
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    assert.strictEqual(guestsRes.status, 200);
    const guests = await guestsRes.json();
    const healed = (Array.isArray(guests) ? guests : guests.guests).find(g => g.email === legacyEmail);
    assert.ok(healed, "Legacy user must be healed and appear in guest list");

    // Check DB: Guest was created and User was linked
    const reloadedUser = await User.findById(legacyUser._id);
    assert.ok(reloadedUser.guest, "Legacy user must now have a guest ObjectId linked");
  });

  // 20: Property-scoped staff can see online customer accounts
  it("20. Property-scoped staff can view online registered customers in the guest directory", async () => {
    // Login as staff
    const staffLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "staff@hotel.com", password: "Password123!" })
    });
    assert.strictEqual(staffLoginRes.status, 200);
    const staffData = await staffLoginRes.json();

    const guestsRes = await fetch(`${BASE_URL}/guests`, {
      headers: { 
        "Authorization": `Bearer ${staffData.token}`,
        "x-property-id": pilotProperty._id.toString()
      }
    });
    assert.strictEqual(guestsRes.status, 200);
    const guests = await guestsRes.json();
    assert.ok(Array.isArray(guests) ? guests.length > 0 : guests.guests.length > 0, "Staff must see active/global guests");
  });
});
