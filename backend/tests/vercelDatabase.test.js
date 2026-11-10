const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

const environmentKeys = ["VERCEL", "NODE_ENV", "MONGO_URI", "DB_MODE", "USE_IN_MEMORY_DB", "USE_LOCAL_DB", "ALLOW_LOCAL_FALLBACK"];
const originalEnvironment = Object.fromEntries(environmentKeys.map((name) => [name, process.env[name]]));

process.env.VERCEL = "1";
process.env.NODE_ENV = "test";
process.env.MONGO_URI = "";
process.env.DB_MODE = "";
process.env.USE_IN_MEMORY_DB = "";
process.env.USE_LOCAL_DB = "";
process.env.ALLOW_LOCAL_FALLBACK = "true";

const app = require("../server");
const HotelChain = require("../models/HotelChain");
const Property = require("../models/Property");

let mongo;
let server;
let baseUrl;

describe("Vercel database initialization", () => {
  before(async () => {
    mongo = await MongoMemoryServer.create();
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    if (mongo) await mongo.stop();
    for (const name of environmentKeys) {
      if (originalEnvironment[name] === undefined) delete process.env[name];
      else process.env[name] = originalEnvironment[name];
    }
  });

  it("requires a configured database, connects on requests, and resolves the active property without seeding", async () => {
    const missingUriResponse = await fetch(`${baseUrl}/api/health`);
    assert.equal(missingUriResponse.status, 503);
    assert.match((await missingUriResponse.json()).error, /Database service is temporarily unavailable/);

    process.env.MONGO_URI = mongo.getUri("vercel_request_test");
    const connectResponses = await Promise.all(
      Array.from({ length: 3 }, () => fetch(`${baseUrl}/api/health`))
    );
    assert.ok(connectResponses.every((response) => response.status === 200));
    assert.equal(mongoose.connection.readyState, 1);
    assert.equal(await HotelChain.countDocuments(), 0);

    const chain = await HotelChain.create({
      name: "Vercel request test chain",
      code: "VRT",
      status: "Active"
    });
    const property = await Property.create({
      chain: chain._id,
      name: "Vercel request test property",
      code: "VRT-1",
      status: "Active"
    });

    const propertyResponse = await fetch(`${baseUrl}/api/properties/current`);
    assert.equal(propertyResponse.status, 200);
    assert.equal((await propertyResponse.json())._id, String(property._id));

    await mongoose.disconnect();
    const reconnectResponse = await fetch(`${baseUrl}/api/health`);
    assert.equal(reconnectResponse.status, 200);
    assert.equal(mongoose.connection.readyState, 1);
  });
});
