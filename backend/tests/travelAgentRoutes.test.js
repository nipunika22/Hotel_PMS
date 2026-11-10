const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const TravelAgent = require("../models/TravelAgent");
const Reservation = require("../models/Reservation");
const Invoice = require("../models/Invoice");
const User = require("../models/User");
const travelAgentRoutes = require("../routes/travelAgentRoutes");

process.env.JWT_SECRET = "travel-agent-route-test-secret";

let mongo;
let server;
let baseUrl;
let token;

async function request(path, options = {}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...options.headers
  };
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
}

describe("travel agent routes", () => {
  before(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    const user = await User.create({
      name: "Travel Agent Test Admin",
      email: "travel-agent-admin@example.test",
      password: "test-password",
      phone: "100",
      role: "admin"
    });
    token = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET);

    const app = express();
    app.use(express.json());
    app.use("/api/travel-agents", travelAgentRoutes);
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}/api/travel-agents`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    if (mongo) await mongo.stop();
  });

  it("loads without authentication only when authorized and preserves the CRUD/statistics API", async () => {
    const unauthorized = await fetch(baseUrl);
    assert.equal(unauthorized.status, 401);

    const createdResponse = await request("", {
      method: "POST",
      body: {
        agentName: "Alex Agent",
        companyName: "Example Travel",
        agentCode: "example-001",
        email: "AGENT@EXAMPLE.TEST",
        phone: "123456",
        commissionRate: 12.5,
        paymentTerms: "Credit",
        totalBookings: 99
      }
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    assert.equal(created.agentCode, "EXAMPLE-001");
    assert.equal(created.email, "agent@example.test");
    assert.equal(created.totalBookings, 0);
    assert.equal(created.totalRevenue, 0);
    assert.equal(created.balance, 0);

    const secondResponse = await request("", {
      method: "POST",
      body: {
        agentName: "Inactive Agent",
        companyName: "Inactive Travel",
        agentCode: "inactive-001",
        status: "Inactive"
      }
    });
    assert.equal(secondResponse.status, 201);

    const duplicateResponse = await request("", {
      method: "POST",
      body: {
        agentName: "Duplicate Agent",
        companyName: "Duplicate Travel",
        agentCode: "example-001"
      }
    });
    assert.equal(duplicateResponse.status, 409);

    const allAgents = await request("");
    assert.equal((await allAgents.json()).length, 2);
    const activeAgents = await request("/active");
    const active = await activeAgents.json();
    assert.equal(active.length, 1);
    assert.equal(active[0]._id, created._id);

    const statsResponse = await request("/stats");
    const stats = await statsResponse.json();
    assert.equal(stats.totalAgents, 2);
    assert.equal(stats.activeAgents, 1);
    assert.equal(stats.topAgents.length, 2);

    const singleAgentResponse = await request(`/${created._id}`);
    assert.equal(singleAgentResponse.status, 200);
    assert.equal((await singleAgentResponse.json())._id, created._id);

    const updateResponse = await request(`/${created._id}`, {
      method: "PUT",
      body: { commissionRate: 15, status: "Inactive", totalBookings: 500 }
    });
    assert.equal(updateResponse.status, 200);
    const updated = await updateResponse.json();
    assert.equal(updated.commissionRate, 15);
    assert.equal(updated.totalBookings, 0);

    const balanceResponse = await request(`/${created._id}/balance`, {
      method: "PUT",
      body: { balance: "125.50" }
    });
    assert.equal(balanceResponse.status, 200);
    assert.equal((await balanceResponse.json()).balance, 125.5);
    const invalidBalanceResponse = await request(`/${created._id}/balance`, {
      method: "PUT",
      body: {}
    });
    assert.equal(invalidBalanceResponse.status, 400);

    await TravelAgent.findByIdAndUpdate(created._id, {
      $inc: { totalBookings: 1, totalRevenue: 250 }
    });
    const agentAfterReservationUpdate = await TravelAgent.findById(created._id);
    assert.equal(agentAfterReservationUpdate.totalBookings, 1);
    assert.equal(agentAfterReservationUpdate.totalRevenue, 250);

    const deleteResponse = await request(`/${created._id}`, { method: "DELETE" });
    assert.equal(deleteResponse.status, 200);
    assert.equal((await deleteResponse.json()).message, "Travel agent deleted successfully");
    const deletedAgentResponse = await request(`/${created._id}`);
    assert.equal(deletedAgentResponse.status, 404);
  });

  it("uses the TravelAgent model reference from reservation and invoice schemas", () => {
    assert.equal(Reservation.schema.path("travelAgent").options.ref, "TravelAgent");
    assert.equal(Invoice.schema.path("travelAgent").options.ref, "TravelAgent");
    assert.ok(TravelAgent.schema.path("companyName"));
    assert.ok(TravelAgent.schema.path("agentCode"));
    assert.ok(TravelAgent.schema.path("commissionRate"));
    assert.ok(TravelAgent.schema.path("totalBookings"));
    assert.ok(TravelAgent.schema.path("totalRevenue"));
  });
});
