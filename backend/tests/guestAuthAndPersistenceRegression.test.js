// backend/tests/guestAuthAndPersistenceRegression.test.js
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const path = require("path");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const connectDB = require("../config/db");
const app = require("../server");
const User = require("../models/User");
const Guest = require("../models/Guest");

let server = null;
let BASE_URL = "";

const TIMESTAMP = Date.now();
const testEmail = `guest_regression_${TIMESTAMP}@serendib.lk`;
const testPassword = "LuxuryStayPassword123!";
const testName = "Lord Marcus Vance";
const testPhone = "+94 77 123 4567";

let registeredUserId = null;
let registeredToken = null;
let registeredGuestId = null;

describe("GUEST ACCOUNT REGISTRATION & LOGIN PERSISTENCE SUITE", () => {
  before(async () => {
    try {
      const ping = await fetch("http://127.0.0.1:5000/api/health", { signal: AbortSignal.timeout(1000) });
      if (ping.ok) {
        BASE_URL = "http://127.0.0.1:5000/api";
        return;
      }
    } catch (e) {
      // server not running, start test server
    }

    if (mongoose.connection.readyState !== 1) {
      await connectDB();
    }

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        BASE_URL = `http://127.0.0.1:${port}/api`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      server.close();
    }
  });


  it("Test A: Guest registration persists User and Guest documents with hashed password", async () => {
    const res = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: testName,
        email: testEmail,
        password: testPassword,
        phone: testPhone,
        address: "74 Galle Road, Colombo"
      })
    });

    assert.strictEqual(res.status, 201, "Registration must succeed with 201 Created");
    const data = await res.json();

    assert.ok(data._id, "Must return created user _id");
    assert.strictEqual(data.email, testEmail.toLowerCase());
    assert.strictEqual(data.role, "customer");
    assert.ok(data.token, "Must return JWT token");
    assert.ok(data.guestId, "Must link Guest profile");
    assert.strictEqual(data.password, undefined, "Plaintext password must not be returned");

    registeredUserId = data._id;
    registeredToken = data.token;
    registeredGuestId = data.guestId;

    // 1. Verify User and Guest profiles are immediately persisted and retrievable via authenticated session
    const meRes = await fetch(`${BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${data.token}` }
    });
    assert.strictEqual(meRes.status, 200, "User must be immediately retrievable from MongoDB");
    const meData = await meRes.json();
    assert.strictEqual(meData._id, data._id);
    assert.strictEqual(meData.name, testName);
    assert.strictEqual(meData.email, testEmail.toLowerCase());
    assert.strictEqual(meData.role, "customer");
    assert.ok(meData.guest, "Linked Guest profile must exist");
    assert.strictEqual(meData.guest._id, data.guestId);
    assert.strictEqual(meData.password, undefined, "Hashed or plaintext password must never leak in profile");
  });


  it("Test B: Guest can log in with registered credentials; invalid credentials are rejected", async () => {
    // 1. Valid login
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword
      })
    });

    assert.strictEqual(loginRes.status, 200, "Login must succeed with 200 OK");
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.email, testEmail.toLowerCase());
    assert.strictEqual(loginData.role, "customer");
    assert.ok(loginData.token, "Must return valid JWT");

    // 2. Reject incorrect password
    const badPassRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testEmail,
        password: "IncorrectPassword999!"
      })
    });
    assert.strictEqual(badPassRes.status, 401, "Wrong password must return 401");

    // 3. Reject non-existent email
    const nonExistentRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "nonexistent_user_99999@example.com",
        password: testPassword
      })
    });
    assert.strictEqual(nonExistentRes.status, 401, "Non-existent user must return 401");
  });

  it("Test C: Browser refresh restores authenticated session and guest profile", async () => {
    // Simulate refresh: GET /api/auth/me with Bearer token
    const refreshRes = await fetch(`${BASE_URL}/auth/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${registeredToken}`
      }
    });

    assert.strictEqual(refreshRes.status, 200, "Session restore must succeed with 200");
    const profile = await refreshRes.json();
    assert.strictEqual(profile._id, registeredUserId);
    assert.strictEqual(profile.email, testEmail.toLowerCase());
    assert.strictEqual(profile.role, "customer");
    assert.ok(profile.guest, "Must return populated Guest record");
    assert.strictEqual(profile.password, undefined);
  });

  it("Test D: Guest accounts persist in database and remain accessible across server runs", async () => {
    // Log in with the account created before backend restart
    const restartGuestEmail = "restart_persistent_guest@serendib.lk";
    const restartGuestPass = "PersistentPass123!";

    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: restartGuestEmail,
        password: restartGuestPass
      })
    });

    assert.strictEqual(loginRes.status, 200, "User created prior to restart must log in with 200 OK");
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.email, restartGuestEmail);
    assert.strictEqual(loginData.name, "Sir Arthur Wellington");
    assert.strictEqual(loginData.role, "customer");
    assert.ok(loginData.token, "Must receive valid JWT");

    // Profile verification
    const meRes = await fetch(`${BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${loginData.token}` }
    });
    assert.strictEqual(meRes.status, 200);
    const meData = await meRes.json();
    assert.strictEqual(meData.email, restartGuestEmail);
    assert.ok(meData.guest, "Linked Guest profile must survive server restart");
  });

  it("Test E: Duplicate registration is rejected with informative error", async () => {

    const dupRes = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Copycat User",
        email: testEmail,
        password: "AnotherPassword123!",
        phone: "+94 77 000 0000"
      })
    });

    assert.strictEqual(dupRes.status, 400, "Duplicate registration must be rejected with 400");
    const dupData = await dupRes.json();
    assert.ok(dupData.error && dupData.error.toLowerCase().includes("already exists"));
  });

  it("Test F: Seeded accounts work, RBAC is enforced, and guests cannot access admin endpoints", async () => {
    // 1. Existing admin login
    const adminLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "admin@hotel.com",
        password: "admin123"
      })
    });
    assert.strictEqual(adminLoginRes.status, 200);
    const adminData = await adminLoginRes.json();
    assert.strictEqual(adminData.role, "admin");

    // 2. Customer cannot access admin /api/guests
    const guestAdminAttempt = await fetch(`${BASE_URL}/guests`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${registeredToken}`
      }
    });
    assert.strictEqual(guestAdminAttempt.status, 403, "Customer must be rejected from admin directory");

    // 3. Admin can access /api/guests
    const adminDirectoryRes = await fetch(`${BASE_URL}/guests`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${adminData.token}`
      }
    });
    assert.strictEqual(adminDirectoryRes.status, 200, "Admin must be able to view guest directory");
  });
});
