const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const originalFrontendUrl = process.env.FRONTEND_URL;
const originalFrontendOrigins = process.env.FRONTEND_ORIGINS;
process.env.FRONTEND_URL = "https://hotel-pms.example";
process.env.FRONTEND_ORIGINS = "https://preview.hotel-pms.example, https://admin.hotel-pms.example";

const app = require("../server");

let server;
let baseUrl;

describe("API CORS configuration", () => {
  before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (originalFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = originalFrontendUrl;
    if (originalFrontendOrigins === undefined) delete process.env.FRONTEND_ORIGINS;
    else process.env.FRONTEND_ORIGINS = originalFrontendOrigins;
  });

  for (const origin of [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://hotel-pms.example",
    "https://preview.hotel-pms.example",
    "https://admin.hotel-pms.example"
  ]) {
    it(`allows credentialed preflight requests from ${origin}`, async () => {
      const response = await fetch(`${baseUrl}/api/properties/current`, {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "GET",
          "Access-Control-Request-Headers": "authorization,content-type,x-property-id,x-dining-guest-token"
        }
      });

      assert.equal(response.status, 204);
      assert.equal(response.headers.get("access-control-allow-origin"), origin);
      assert.equal(response.headers.get("access-control-allow-credentials"), "true");
      const allowedHeaders = response.headers.get("access-control-allow-headers")
        .toLowerCase().split(/,\s*/);
      for (const header of ["authorization", "content-type", "x-property-id", "x-dining-guest-token"]) {
        assert.ok(allowedHeaders.includes(header));
      }
    });
  }

  for (const path of [
    "/api/restaurants",
    "/api/properties/current",
    "/api/rooms/available?checkInDate=2026-11-26&checkOutDate=2026-11-28"
  ]) {
    it(`keeps CORS headers on database readiness errors for ${path}`, async () => {
      const origin = "http://localhost:3000";
      const response = await fetch(`${baseUrl}${path}`, { headers: { Origin: origin } });

      assert.equal(response.status, 503);
      assert.equal(response.headers.get("access-control-allow-origin"), origin);
    });
  }

  it("does not grant CORS access to an unconfigured origin", async () => {
    const response = await fetch(`${baseUrl}/api/properties/current`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://untrusted.example",
        "Access-Control-Request-Method": "GET"
      }
    });

    assert.equal(response.headers.get("access-control-allow-origin"), null);
  });
});
