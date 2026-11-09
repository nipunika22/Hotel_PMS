const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const authRoutes = require("../routes/authRoutes");
const seedInitialData = require("../config/seedData");
const User = require("../models/User");
const { getLandingPath } = require("../../frontend/src/config/roleAccess");

process.env.JWT_SECRET = "isolated-admin-login-test-secret";

let mongo;
let server;
let baseUrl;
let seededAdmin;

async function login(email, password) {
  return fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
}

describe("seeded demo admin login", () => {
  before(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await seedInitialData();
    seededAdmin = await User.findOne({ email: "admin@hotel.com" }).select("+password");
    const app = express();
    app.use(express.json());
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

  it("seeds the demo admin with an active admin role and a bcrypt hash without resetting existing credentials", async () => {
    assert.ok(seededAdmin);
    assert.equal(seededAdmin.role, "admin");
    assert.equal(seededAdmin.status, "Active");
    assert.match(seededAdmin.password, /^\$2[aby]\$/);
    const hashBeforeRerun = seededAdmin.password;
    await seedInitialData();
    const adminCount = await User.countDocuments({ email: "admin@hotel.com" });
    const afterRerun = await User.findOne({ email: "admin@hotel.com" }).select("+password");
    assert.equal(adminCount, 1);
    assert.equal(afterRerun.password, hashBeforeRerun);
  });

  it("authenticates the exact seeded credential through bcrypt and returns an admin JWT", async () => {
    const response = await login(" ADMIN@HOTEL.COM ", "admin123");
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.role, "admin");
    assert.equal(body.status, "Active");
    assert.ok(body.token);
    assert.equal(jwt.verify(body.token, process.env.JWT_SECRET).id, String(seededAdmin._id));
    assert.equal(getLandingPath(body.role), "/admin-dashboard");
  });

  it("rejects incorrect and legacy fallback-only passwords", async () => {
    const incorrect = await login("admin@hotel.com", "incorrect-test-password");
    assert.equal(incorrect.status, 401);
    const fallbackOnly = await login("admin@hotel.com", "Password123!");
    assert.equal(fallbackOnly.status, 401);
  });

  it("preserves customer registration and login", async () => {
    const registration = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Regression Customer", email: "customer-regression@example.test", password: "customer-test-password", phone: "100" })
    });
    assert.equal(registration.status, 201);
    const registered = await registration.json();
    assert.equal(registered.role, "customer");
    assert.ok(registered.token);
    const customerLogin = await login("customer-regression@example.test", "customer-test-password");
    assert.equal(customerLogin.status, 200);
    assert.equal((await customerLogin.json()).role, "customer");
  });
});
