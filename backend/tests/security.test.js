// backend/tests/security.test.js
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

// Load env
dotenv.config();

const connectDB = require("../config/db");
const app = require("../server");
const User = require("../models/User");

let server;
let baseUrl;

// Test user credentials
const TEST_TIMESTAMP = Date.now();
const testUsers = {
  customerUser: {
    name: "Regular Customer",
    email: `test_customer_${TEST_TIMESTAMP}@example.com`,
    password: "Password123!",
    phone: "1234567890",
    address: "123 Beachfront Blvd"
  },
  adminUser: {
    name: "System Admin",
    email: `test_admin_${TEST_TIMESTAMP}@example.com`,
    password: "AdminPassword123!",
    phone: "1234567891",
    address: "999 Executive Suite",
    role: "admin"
  }
};

let customerToken = null;
let adminToken = null;

describe("Step 2 Part 10: Role-Based Dashboard & Profile Test Flows", () => {
  before(async () => {
    // Ensure DB connection is fully open (readyState === 1)
    if (mongoose.connection.readyState !== 1) {
      if (mongoose.connection.readyState === 2) {
        await new Promise((resolve) => mongoose.connection.once("connected", resolve));
      } else {
        await connectDB();
      }
    }

    // Clean up any previous test users with matching email prefixes
    await User.deleteMany({ email: { $regex: /^test_/ } });

    // Seed admin directly in DB with password hashed by pre-save
    await User.create(testUsers.adminUser);

    // Start server on an ephemeral port
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    // Cleanup test users
    await User.deleteMany({ email: { $regex: /^test_/ } });

    // Close HTTP server and Mongoose connection
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  });

  it("TEST 1: Login as Admin. Expected: Admin credentials verified, role is admin", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testUsers.adminUser.email,
        password: testUsers.adminUser.password
      })
    });

    assert.strictEqual(res.status, 200, "Admin login should return HTTP 200");
    const data = await res.json();
    assert.strictEqual(data.role, "admin", "Admin user role must be 'admin'");
    assert.ok(data.token, "Admin login should return a valid JWT");
    adminToken = data.token;
  });

  it("TEST 2: Login as Customer. Expected: Customer credentials verified, role is customer", async () => {
    // First register customer
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testUsers.customerUser)
    });
    assert.strictEqual(regRes.status, 201, "Customer registration should return HTTP 201");

    // Login as Customer
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testUsers.customerUser.email,
        password: testUsers.customerUser.password
      })
    });

    assert.strictEqual(loginRes.status, 200, "Customer login should return HTTP 200");
    const data = await loginRes.json();
    assert.strictEqual(data.role, "customer", "Customer user role must be 'customer'");
    assert.ok(data.token, "Customer login should return a valid JWT");
    customerToken = data.token;
  });

  it("TEST 3: Customer opens an admin-only endpoint. Expected: Access denied (HTTP 403 Forbidden)", async () => {
    const res = await fetch(`${baseUrl}/api/auth/users`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${customerToken}`
      }
    });

    assert.strictEqual(res.status, 403, "Customer accessing admin-only endpoint must receive HTTP 403 Forbidden");
    const data = await res.json();
    assert.ok(data.error, "Response must include an error description");
  });

  it("TEST 4: Customer opens /profile. Expected: Customer's own profile appears", async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${customerToken}`
      }
    });

    assert.strictEqual(res.status, 200, "Customer getMe must return HTTP 200");
    const data = await res.json();
    assert.strictEqual(data.email, testUsers.customerUser.email);
    assert.strictEqual(data.name, testUsers.customerUser.name);
    assert.strictEqual(data.role, "customer");
    assert.strictEqual(data.password, undefined, "Password must not be returned in profile");
  });

  it("TEST 5: Customer edits name/phone/address. Expected: Changes are saved", async () => {
    const updatedInfo = {
      name: "Updated Customer Name",
      phone: "9876543210",
      address: "456 Oceanfront Suite"
    };

    const res = await fetch(`${baseUrl}/api/auth/profile`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken}`
      },
      body: JSON.stringify(updatedInfo)
    });

    assert.strictEqual(res.status, 200, "Profile update should return HTTP 200");
    const data = await res.json();
    assert.strictEqual(data.name, updatedInfo.name);
    assert.strictEqual(data.phone, updatedInfo.phone);
    assert.strictEqual(data.address, updatedInfo.address);

    // Verify in database
    const dbUser = await User.findById(data._id);
    assert.strictEqual(dbUser.name, updatedInfo.name);
    assert.strictEqual(dbUser.phone, updatedInfo.phone);
    assert.strictEqual(dbUser.address, updatedInfo.address);
  });

  it("TEST 6: Admin opens /profile. Expected: Admin's own profile appears", async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${adminToken}`
      }
    });

    assert.strictEqual(res.status, 200, "Admin getMe must return HTTP 200");
    const data = await res.json();
    assert.strictEqual(data.email, testUsers.adminUser.email);
    assert.strictEqual(data.role, "admin");
    assert.strictEqual(data.password, undefined, "Password must not be returned");
  });

  it("TEST 7: Admin edits allowed profile fields. Expected: Changes are saved", async () => {
    const updatedAdminInfo = {
      name: "Chief Admin Officer",
      phone: "5551234567",
      address: "Penthouse Suite A"
    };

    const res = await fetch(`${baseUrl}/api/auth/profile`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify(updatedAdminInfo)
    });

    assert.strictEqual(res.status, 200, "Admin profile update should return HTTP 200");
    const data = await res.json();
    assert.strictEqual(data.name, updatedAdminInfo.name);
    assert.strictEqual(data.phone, updatedAdminInfo.phone);
    assert.strictEqual(data.address, updatedAdminInfo.address);
  });

  it("TEST 8: User attempts to change their role. Expected: Role cannot be changed", async () => {
    const maliciousPayload = {
      name: "Hacker Attempt",
      role: "admin" // Attempting privilege escalation via profile update
    };

    const res = await fetch(`${baseUrl}/api/auth/profile`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken}`
      },
      body: JSON.stringify(maliciousPayload)
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.role, "customer", "Role MUST NOT be altered via profile update");

    // Double check DB
    const dbUser = await User.findOne({ email: testUsers.customerUser.email });
    assert.strictEqual(dbUser.role, "customer", "Role in DB must strictly remain 'customer'");
  });

  it("TEST 9: User changes password using correct current password. Expected: Password changes successfully", async () => {
    const newPassword = "NewSecretPassword456!";

    const res = await fetch(`${baseUrl}/api/auth/password`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken}`
      },
      body: JSON.stringify({
        currentPassword: testUsers.customerUser.password,
        newPassword
      })
    });

    assert.strictEqual(res.status, 200, "Password change with correct current password should return HTTP 200");
    const data = await res.json();
    assert.strictEqual(data.message, "Password updated successfully");

    // Verify login with NEW password succeeds
    const newLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testUsers.customerUser.email,
        password: newPassword
      })
    });
    assert.strictEqual(newLoginRes.status, 200, "Login with newly updated password must succeed");

    // Update customer password in test object for any subsequent tests
    testUsers.customerUser.password = newPassword;
  });

  it("TEST 10: User enters incorrect current password. Expected: Password change is rejected (HTTP 400)", async () => {
    const res = await fetch(`${baseUrl}/api/auth/password`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken}`
      },
      body: JSON.stringify({
        currentPassword: "WrongCurrentPassword999!",
        newPassword: "AnotherNewPassword789!"
      })
    });

    assert.strictEqual(res.status, 400, "Password change with incorrect current password must return HTTP 400");
    const data = await res.json();
    assert.strictEqual(data.error, "Incorrect current password");
  });

  it("TEST 11: Public registration sends role=admin. Expected: Account is NOT created as admin", async () => {
    const attemptEmail = `test_tryadmin_${Date.now()}@example.com`;

    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Wannabe Admin",
        email: attemptEmail,
        password: "Password123!",
        phone: "1231231234",
        role: "admin"
      })
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.role, "customer", "Role MUST be 'customer'");
    assert.notStrictEqual(data.role, "admin", "User must NOT have role 'admin'");

    const dbUser = await User.findOne({ email: attemptEmail });
    assert.strictEqual(dbUser.role, "customer", "DB record must have role 'customer'");
  });
});
