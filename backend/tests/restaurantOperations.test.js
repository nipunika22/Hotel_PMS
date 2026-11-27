const { before, after, afterEach, it } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const { propertyContext } = require("../middleware/propertyContext");
const HotelChain = require("../models/HotelChain");
const Property = require("../models/Property");
const User = require("../models/User");
const Restaurant = require("../models/Restaurant");
const RestaurantReservation = require("../models/RestaurantReservation");
const RestaurantTable = require("../models/RestaurantTable");
const RestaurantMenuItem = require("../models/RestaurantMenuItem");
const RestaurantMenuCategory = require("../models/RestaurantMenuCategory");
const RestaurantOrder = require("../models/RestaurantOrder");
const Reservation = require("../models/Reservation");
const GuestExpense = require("../models/GuestExpense");
const Guest = require("../models/Guest");
const Invoice = require("../models/Invoice");
const Payment = require("../models/Payment");
const restaurantRoutes = require("../routes/restaurantRoutes");
const paymentRoutes = require("../routes/paymentRoutes");
const { getPayHereConfig } = require("../services/payhereService");

process.env.JWT_SECRET = "isolated-restaurant-operations-test";
process.env.PAYHERE_MERCHANT_ID = "1212345";
process.env.PAYHERE_MERCHANT_SECRET = "isolated-webhook-test";

let mongo, server, root, property, otherProperty, venue, secondVenue, foreignVenue, staff, customer, scopedAdmin, globalAdmin;
let table, food, drink, unavailable, otherItem;
let sequence = 0;
const today = () => new Date().toISOString().slice(0, 10);
const operations = (restaurant = venue) => `/restaurants/admin/operations/${restaurant._id}`;

async function request(path, method = "GET", body, user = staff, extraHeaders = {}) {
  const token = user ? jwt.sign({ id: user._id }, process.env.JWT_SECRET) : undefined;
  const response = await fetch(`${root}/api${path}`, {
    method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  return { status: response.status, data: response.headers.get("content-type")?.includes("json") ? JSON.parse(text) : text };
}

async function makeReservation(restaurant = venue, additions = {}) {
  const number = ++sequence;
  return RestaurantReservation.create({
    property: restaurant.property, restaurant: restaurant._id,
    confirmationNumber: `DINE-TEST-${number}`, customerName: `Visitor ${number}`,
    email: `visitor${number}@example.test`, phone: "0770000000",
    date: today(), time: "18:00", guestCount: 2,
    ...additions
  });
}

async function arrive(row) {
  return request(`${operations()}/reservations/${row._id}/arrival`, "PUT");
}

async function makeOrder(row, items = [{ menuItem: food.id, quantity: 2 }]) {
  if (!row.table) {
    const assigned = await RestaurantTable.create({ property: row.property, restaurant: row.restaurant,
      tableNumber: `AUTO-${sequence}`, capacity: 4 });
    row.table = assigned._id;
    await row.save();
  }
  await RestaurantTable.updateOne({ _id: row.table }, { $set: { status: "AVAILABLE" } });
  assert.equal((await arrive(row)).status, 200);
  const seated = await request(`${operations()}/reservations/${row._id}/seat`, "PUT");
  assert.equal(seated.status, 200, JSON.stringify(seated.data));
  const response = await request(`${operations()}/reservations/${row._id}/order`, "POST", { items });
  assert.equal(response.status, 201, JSON.stringify(response.data));
  return response.data.data;
}

const pay = (order, body) => request(`${operations()}/orders/${order._id}/payment`, "POST", body);

before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([RestaurantOrder.init(), Payment.init(), RestaurantReservation.init()]);
  const chain = await HotelChain.create({ name: "Operations fixture", code: "OP" });
  property = await Property.create({ chain: chain._id, name: "First property", code: "OP-1", timezone: "UTC" });
  otherProperty = await Property.create({ chain: chain._id, name: "Second property", code: "OP-2", timezone: "UTC" });
  const restaurantData = { cuisine: "Local", location: "Lobby", openingHours: "Daily", active: true };
  venue = await Restaurant.create({ ...restaurantData, property: property._id, name: "First venue" });
  secondVenue = await Restaurant.create({ ...restaurantData, property: property._id, name: "Second venue" });
  foreignVenue = await Restaurant.create({ ...restaurantData, property: otherProperty._id, name: "Foreign venue" });
  await Restaurant.create({ ...restaurantData, property: property._id, name: "Closed venue", active: false });
  const makeUser = (name, role, extra = {}) => User.create({
    property: property._id, name, role, email: `${name}@example.test`,
    phone: "0770000000", password: "test-fixture-password", ...extra
  });
  staff = await makeUser("staff", "staff");
  customer = await makeUser("customer", "customer");
  scopedAdmin = await makeUser("scoped-admin", "admin", { departmentAdmin: true, adminDepartments: ["rooms"] });
  globalAdmin = await makeUser("global-admin", "admin");
  table = await RestaurantTable.create({ property: property._id, restaurant: venue._id, tableNumber: "T1", capacity: 4 });
  const category = await RestaurantMenuCategory.create({ property: property._id, restaurant: venue._id, name: "Menu" });
  const common = { property: property._id, restaurant: venue._id, category: category._id, currency: "LKR" };
  food = await RestaurantMenuItem.create({ ...common, name: "Rice", price: 750 });
  drink = await RestaurantMenuItem.create({ ...common, name: "Tea", price: 125.50 });
  unavailable = await RestaurantMenuItem.create({ ...common, name: "Unavailable special", price: 50, available: false });
  otherItem = await RestaurantMenuItem.create({ ...common, restaurant: secondVenue._id, name: "Other venue item", price: 50 });

  const app = express();
  app.use(express.json());
  app.use(propertyContext);
  app.use("/api/restaurants", restaurantRoutes);
  app.use("/api/payments", paymentRoutes);
  app.use("/api/reservations", require("../routes/reservationRoutes"));
  server = app.listen(0);
  await new Promise(resolve => server.once("listening", resolve));
  root = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect();
  await mongo?.stop();
});

afterEach(async () => {
  if (!table?._id || mongoose.connection.readyState !== 1) return;
  await RestaurantReservation.updateMany({ property: property._id, restaurant: venue._id, table: table._id, status: "SEATED" },
    { $set: { status: "COMPLETED" } });
  await RestaurantTable.updateOne({ _id: table._id }, { $set: { status: "AVAILABLE" } });
});

it("lists dynamic active venues, isolates properties and applies staff and department grants", async () => {
  const dashboard = "/restaurants/admin/operations";
  assert.equal((await request(dashboard, "GET", undefined, null)).status, 401);
  assert.equal((await request(dashboard, "GET", undefined, customer)).status, 403);
  assert.equal((await request(dashboard, "GET", undefined, scopedAdmin)).status, 403);
  const response = await request(dashboard);
  assert.equal(response.status, 200);
  assert.deepEqual(response.data.data.map(row => row.name), ["First venue", "Second venue"]);
  assert.equal((await request(`${operations(foreignVenue)}/reservations`)).status, 404);
  assert.equal((await request("/restaurants/admin/operations/bad/reservations")).status, 400);
});

it("admin menu CRUD validates restaurant/category ownership and preserves order snapshots", async () => {
  const headers = { "x-property-id": String(property._id) };
  const categories = await request(`/restaurants/admin/categories?restaurantId=${venue._id}`, "GET", undefined, staff, headers);
  assert.equal(categories.status, 200);
  assert.ok(categories.data.data.some(row => row.name === "Menu"));

  const createdCategory = await request("/restaurants/admin/categories", "POST", {
    restaurant: String(venue._id), name: "Lunch"
  }, staff, headers);
  assert.equal(createdCategory.status, 201);
  assert.equal((await request("/restaurants/admin/categories", "POST", {
    restaurant: String(venue._id), name: "lunch"
  }, staff, headers)).status, 409);
  assert.equal((await request("/restaurants/admin/categories", "POST", {
    restaurant: String(venue._id), name: "Wrong restaurant", description: "", active: true
  }, staff, { "x-property-id": String(otherProperty._id) })).status, 403);

  assert.equal((await request("/restaurants/admin/menu-items", "POST", {
    restaurant: String(venue._id), category: String(createdCategory.data.data._id), name: "Bad price", price: 0
  }, staff, headers)).status, 400);
  const foreignCategory = await RestaurantMenuCategory.create({ property: property._id, restaurant: secondVenue._id, name: "Foreign category" });
  assert.equal((await request("/restaurants/admin/menu-items", "POST", {
    restaurant: String(venue._id), category: String(foreignCategory._id), name: "Foreign category item", price: 20
  }, staff, headers)).status, 400);

  const created = await request("/restaurants/admin/menu-items", "POST", {
    restaurant: String(venue._id), category: String(createdCategory.data.data._id), name: "Snapshot curry", price: 100,
    available: true, image: "https://example.test/curry.jpg"
  }, staff, headers);
  assert.equal(created.status, 201);
  const item = created.data.data;
  const reservation = await makeReservation();
  const order = await makeOrder(reservation, [{ menuItem: String(item._id), quantity: 1 }]);
  const updated = await request(`/restaurants/admin/menu-items/${item._id}`, "PUT", { name: "Renamed curry", price: 500 }, staff, headers);
  assert.equal(updated.status, 200);
  assert.equal((await RestaurantOrder.findById(order._id)).items[0].name, "Snapshot curry");
  assert.equal((await RestaurantOrder.findById(order._id)).items[0].unitPrice, 100);
  const deleted = await request(`/restaurants/admin/menu-items/${item._id}`, "DELETE", undefined, globalAdmin, headers);
  assert.equal(deleted.status, 200);
  assert.equal(deleted.data.deactivated, true);
  assert.equal((await RestaurantMenuItem.findById(item._id)).available, false);
  assert.equal((await request("/restaurants/admin/categories/" + createdCategory.data.data._id, "DELETE", undefined, globalAdmin, headers)).status, 409);
});

it("offers available tables and persists the customer's selected table", async () => {
  const headers = { "x-property-id": String(property._id) };
  const query = `date=2036-02-20&time=19:00&guestCount=2`;
  const availability = await request(`/restaurants/${venue._id}/availability?${query}`, "GET", undefined, null, headers);
  assert.equal(availability.status, 200);
  assert.ok(Array.isArray(availability.data.availableTables));
  assert.ok(availability.data.availableTables.some(row => String(row._id) === String(table._id)));
  const otherTable = await RestaurantTable.create({ property: property._id, restaurant: secondVenue._id,
    tableNumber: "SECOND", capacity: 4 });
  const payload = { customerName: "Table selection guest", email: "table@example.test", phone: "0770000000",
    date: "2036-02-20", time: "19:00", guestCount: 2, tableId: String(table._id) };
  const wrongTable = await request(`/restaurants/${venue._id}/reservations`, "POST", { ...payload, tableId: String(otherTable._id) }, null, headers);
  assert.equal(wrongTable.status, 409);
  const booking = await request(`/restaurants/${venue._id}/reservations`, "POST", payload, null, headers);
  assert.equal(booking.status, 201, JSON.stringify(booking.data));
  assert.equal(String(booking.data.data.restaurant._id), String(venue._id));
  assert.equal(String(booking.data.data.table._id), String(table._id));
});

it("allocates an available table once across concurrent overlapping public bookings", async () => {
  const allocationVenue = await Restaurant.create({
    property: property._id, name: "Allocation venue", cuisine: "Local", location: "Lobby", openingHours: "Daily"
  });
  const allocationTable = await RestaurantTable.create({
    property: property._id, restaurant: allocationVenue._id, tableNumber: "ONLY-TABLE", capacity: 4
  });

  for (let attempt = 0; attempt < 5; attempt++) {
    const date = `203${attempt}-01-15`;
    const payload = {
      customerName: "Concurrent guest", email: `allocation${attempt}@example.test`, phone: "0770000000",
      date, time: "19:00", guestCount: 2
    };
    const results = await Promise.all(Array.from({ length: 4 }, () =>
      request(`/restaurants/${allocationVenue._id}/reservations`, "POST", payload, null, {
        "x-property-id": String(property._id)
      })
    ));
    const accepted = results.filter(result => result.status === 201);
    assert.equal(accepted.length, 1, JSON.stringify(results.map(result => result.status)));
    const rejected = results.filter(result => result.status === 409);
    assert.equal(rejected.length, 3);
    assert.ok(rejected.every(result => /No table is available/.test(result.data.error)));

    const bookings = await RestaurantReservation.find({
      property: property._id, restaurant: allocationVenue._id, date
    }).lean();
    const confirmed = bookings.filter(row => row.status === "CONFIRMED");
    assert.equal(confirmed.length, 1);
    assert.equal(String(confirmed[0].table), String(allocationTable._id));
    assert.ok(bookings.every(row => row.table), "A confirmed booking must never be left unassigned");
  }
});

it("rejects terminal and invalid legacy reservation status transitions", async () => {
  const transitions = [
    ["PENDING", "COMPLETED"],
    ["CONFIRMED", "PENDING"],
    ["SEATED", "CONFIRMED"],
    ["CANCELLED", "CONFIRMED"],
    ["CANCELLED", "SEATED"],
    ["NO_SHOW", "CONFIRMED"],
    ["NO_SHOW", "PENDING"],
    ["COMPLETED", "CONFIRMED"],
    ["COMPLETED", "SEATED"]
  ];

  for (const [currentStatus, nextStatus] of transitions) {
    const row = await makeReservation(venue, { status: currentStatus });
    const result = await request(`/restaurants/admin/reservations/${row._id}/status`, "PUT", { status: nextStatus });
    assert.equal(result.status, 409, `${currentStatus} -> ${nextStatus}: ${JSON.stringify(result.data)}`);
    assert.equal((await RestaurantReservation.findById(row._id)).status, currentStatus);
  }

  const pending = await makeReservation(venue, { status: "PENDING" });
  assert.equal((await request(`/restaurants/admin/reservations/${pending._id}/status`, "PUT", { status: "CONFIRMED" })).status, 200);
  const confirmed = await makeReservation(venue, { table: table._id });
  assert.equal((await request(`/restaurants/admin/reservations/${confirmed._id}/status`, "PUT", { status: "SEATED" })).status, 409);
  assert.equal((await arrive(confirmed)).status, 200);
  await RestaurantTable.updateOne({ _id: table._id }, { $set: { status: "AVAILABLE" } });
  assert.equal((await request(`/restaurants/admin/reservations/${confirmed._id}/status`, "PUT", { status: "SEATED" })).status, 200);
  const seatedState = await RestaurantReservation.findById(confirmed._id);
  assert.ok(seatedState.seatedAt);
  assert.equal(String(seatedState.seatedBy), staff.id);
  assert.equal((await RestaurantTable.findById(table._id)).status, "OCCUPIED");
  const seated = await makeReservation(venue, { status: "SEATED" });
  assert.equal((await request(`/restaurants/admin/reservations/${seated._id}/status`, "PUT", { status: "COMPLETED" })).status, 200);
});

it("keeps a guest-cancelled reservation closed to staff updates and arrival", async () => {
  const row = await makeReservation(venue, { user: customer._id });
  const cancelled = await request(`/restaurants/reservations/${row.confirmationNumber}/cancel`, "PUT", {}, customer);
  assert.equal(cancelled.status, 200);

  const confirmation = await request(`/restaurants/admin/reservations/${row._id}/status`, "PUT", { status: "CONFIRMED" });
  const arrivalStatus = await request(`/restaurants/admin/reservations/${row._id}/status`, "PUT", { status: "SEATED" });
  const arrival = await arrive(row);
  assert.equal(confirmation.status, 409);
  assert.equal(arrivalStatus.status, 409);
  assert.equal(arrival.status, 409);
  const saved = await RestaurantReservation.findById(row._id);
  assert.equal(saved.status, "CANCELLED");
  assert.notEqual(saved.arrivalStatus, "ARRIVED");

  const confirmed = await makeReservation(venue);
  assert.equal((await arrive(confirmed)).status, 200);
  assert.equal((await RestaurantReservation.findById(confirmed._id)).arrivalStatus, "ARRIVED");
});

it("does not expose inactive restaurant catalogues or accept bookings for them", async () => {
  const active = await Restaurant.findById(venue._id);
  try {
    await Restaurant.updateOne({ _id: venue._id }, { $set: { active: false } });
    const headers = { "x-property-id": String(property._id) };
    for (const path of [
      `/restaurants/${venue._id}/menu`,
      `/restaurants/${venue._id}/buffets`,
      `/restaurants/${venue._id}/offers`,
      `/restaurants/${venue.slug}`,
      `/restaurants/${venue._id}/availability?date=2035-01-01&time=19:00&guestCount=2`
    ]) {
      assert.equal((await request(path, "GET", undefined, null, headers)).status, 404, path);
    }
    const discovery = await request("/restaurants", "GET", undefined, null, headers);
    assert.equal(discovery.status, 200);
    assert.ok(!discovery.data.data.some(row => String(row._id) === String(venue._id)));
    const adminUpdate = await request(`/restaurants/admin/restaurants/${venue._id}`, "PUT", {
      description: "Admin can still manage an inactive venue"
    }, globalAdmin, headers);
    assert.equal(adminUpdate.status, 200);
    const booking = await request(`/restaurants/${venue._id}/reservations`, "POST", {
      customerName: "Inactive guest", email: "inactive@example.test", phone: "0770000000",
      date: "2035-01-01", time: "19:00", guestCount: 2
    }, null, headers);
    assert.equal(booking.status, 404);
  } finally {
    await Restaurant.updateOne({ _id: venue._id }, { $set: { active: active.active } });
  }
});

it("updates restaurant taglines with validation and preserves them when omitted", async () => {
  const headers = { "x-property-id": String(property._id) };
  const updated = await request(`/restaurants/admin/restaurants/${venue._id}`, "PUT", {
    tagline: "Fresh local flavours"
  }, globalAdmin, headers);
  assert.equal(updated.status, 200);
  assert.equal(updated.data.data.tagline, "Fresh local flavours");

  const omitted = await request(`/restaurants/admin/restaurants/${venue._id}`, "PUT", {
    description: "Updated without a tagline"
  }, globalAdmin, headers);
  assert.equal(omitted.status, 200);
  assert.equal(omitted.data.data.tagline, "Fresh local flavours");

  for (const tagline of [42, "x".repeat(161)]) {
    assert.equal((await request(`/restaurants/admin/restaurants/${venue._id}`, "PUT", { tagline }, globalAdmin, headers)).status, 400);
  }
  const read = await request(`/restaurants/${venue._id}`, "GET", undefined, null, headers);
  assert.equal(read.status, 200);
  assert.equal(read.data.data.tagline, "Fresh local flavours");
});

it("filters reservations and records arrival once while leaving reservation status intact", async () => {
  const row = await makeReservation(venue, { table: table._id });
  const cancelled = await makeReservation(venue, { status: "CANCELLED" });
  const absent = await makeReservation(venue, { status: "NO_SHOW" });
  await makeReservation(secondVenue);
  await RestaurantReservation.updateOne({ _id: row._id }, { $unset: { arrivalStatus: 1 } });
  const filtered = await request(`${operations()}/reservations?period=today&arrivalStatus=EXPECTED&search=${row.confirmationNumber}`);
  assert.equal(filtered.status, 200);
  assert.equal(filtered.data.data.reservations.length, 1);
  assert.equal(filtered.data.data.reservations[0].table.tableNumber, "T1");
  assert.equal((await request(`${operations(secondVenue)}/reservations/${row._id}/arrival`, "PUT")).status, 404);
  assert.equal((await arrive(cancelled)).status, 409);
  assert.equal((await arrive(absent)).status, 409);
  const results = await Promise.all([arrive(row), arrive(row)]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  const saved = await RestaurantReservation.findById(row._id);
  assert.equal(saved.status, "CONFIRMED");
  assert.equal(saved.arrivalStatus, "ARRIVED");
  assert.ok(saved.arrivedAt);
  assert.equal(String(saved.arrivedBy), staff.id);
});

it("seats only an arrived reservation at its own available table and releases it on completion", async () => {
  const invalidTable = await RestaurantTable.create({ property: otherProperty._id, restaurant: foreignVenue._id,
    tableNumber: "FOREIGN", capacity: 4 });
  const invalid = await makeReservation(venue, { table: invalidTable._id });
  assert.equal((await arrive(invalid)).status, 200);
  assert.equal((await request(`${operations()}/reservations/${invalid._id}/seat`, "PUT")).status, 409);

  const row = await makeReservation(venue, { table: table._id });
  assert.equal((await request(`${operations()}/reservations/${row._id}/seat`, "PUT")).status, 409);
  assert.equal((await arrive(row)).status, 200);
  assert.equal((await request(`${operations()}/reservations/${row._id}/order`, "POST", {
    items: [{ menuItem: food.id, quantity: 1 }]
  })).status, 409);
  await RestaurantTable.updateOne({ _id: table._id }, { $set: { status: "AVAILABLE" } });
  const results = await Promise.all([
    request(`${operations()}/reservations/${row._id}/seat`, "PUT"),
    request(`${operations()}/reservations/${row._id}/seat`, "PUT")
  ]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  const saved = await RestaurantReservation.findById(row._id);
  assert.equal(saved.status, "SEATED");
  assert.ok(saved.seatedAt);
  assert.equal(String(saved.seatedBy), staff.id);
  assert.equal((await RestaurantTable.findById(table._id)).status, "OCCUPIED");
  const complete = await request(`/restaurants/admin/reservations/${row._id}/status`, "PUT", { status: "COMPLETED" });
  assert.equal(complete.status, 200);
  assert.equal((await RestaurantTable.findById(table._id)).status, "CLEANING");
});

it("prices multiple order lines on the server, retains snapshots and locks a paid bill", async () => {
  const row = await makeReservation(venue, { table: table._id, paymentStatus: "Paid", paidAmount: 114 });
  const orderPath = `${operations()}/reservations/${row._id}/order`;
  assert.equal((await request(orderPath, "POST", { items: [{ menuItem: food.id, quantity: 1 }] })).status, 409);
  const order = await makeOrder(row, [
    { menuItem: food.id, quantity: 2, unitPrice: 0.01 }, { menuItem: drink.id, quantity: 3, lineTotal: 0 }
  ]);
  assert.equal(order.total, 1876.5);
  assert.equal(order.tableNumber, "T1");
  assert.equal((await request(orderPath, "POST", { items: [{ menuItem: food.id, quantity: 1 }] })).status, 409);
  for (const item of [unavailable, otherItem]) {
    assert.equal((await request(orderPath, "PUT", { items: [{ menuItem: item.id, quantity: 1 }] })).status, 400);
  }
  await RestaurantMenuItem.updateOne({ _id: food._id }, { price: 900, name: "New name" });
  const edit = await request(orderPath, "PUT", { items: [{ menuItem: food.id, quantity: 3 }, { menuItem: drink.id, quantity: 1 }] });
  assert.equal(edit.status, 200);
  assert.equal(edit.data.data.items[0].name, "Rice");
  assert.equal(edit.data.data.total, 2375.5);
  assert.equal((await request(`${operations(secondVenue)}/orders/${order._id}`)).status, 404);
  assert.equal((await pay(order, { method: "CASH", amount: 2376 })).status, 400);

  const payments = await Promise.all([
    pay(order, { method: "CASH", amount: 2375.5 }), pay(order, { method: "CASH", amount: 2375.5 })
  ]);
  assert.ok(payments.every(response => response.status === 200), JSON.stringify(payments));
  assert.equal(await Payment.countDocuments({ restaurantOrder: order._id }), 1);
  assert.equal((await pay(order, { method: "CARD", amount: 2375.5, transactionReference: "test-ref" })).status, 409);
  assert.equal((await request(orderPath, "PUT", { items: [{ menuItem: food.id, quantity: 1 }] })).status, 409);
  const bill = await request(`${operations()}/orders/${order._id}`);
  assert.equal(bill.data.data.order.subtotal, 2375.5);
  assert.equal(bill.data.data.payment.paymentStatus, "completed");
  assert.equal((await RestaurantReservation.findById(row._id)).paidAmount, 114);
  await RestaurantMenuItem.updateOne({ _id: food._id }, { price: 750, name: "Rice" });
});

it("records external card references and blocks their reuse on another order", async () => {
  const first = await makeOrder(await makeReservation());
  const second = await makeOrder(await makeReservation());
  assert.equal((await pay(first, { method: "CARD", amount: first.total })).status, 400);
  assert.equal((await pay(first, { method: "CARD", amount: first.total, transactionReference: "TERM-001" })).status, 200);
  assert.equal((await pay(second, { method: "CARD", amount: second.total, transactionReference: "TERM-001" })).status, 409);
  assert.equal((await RestaurantOrder.findById(second._id)).settlementStarted, false);
});

it("validates signed PayHere callbacks and settles exactly once", async () => {
  const order = await makeOrder(await makeReservation());
  const initiation = await pay(order, { method: "PAYHERE" });
  assert.equal(initiation.status, 200);
  assert.equal(initiation.data.data.payment.paymentStatus, "pending");
  const checkout = initiation.data.data.checkout;
  assert.equal(Number(checkout.payHereParams.amount), order.total);
  assert.equal((await pay(order, { method: "CASH", amount: order.total })).status, 409);
  const config = getPayHereConfig();
  const md5 = value => crypto.createHash("md5").update(value).digest("hex").toUpperCase();
  const callback = {
    merchant_id: config.merchantId, order_id: checkout.paymentReference, payment_id: "TEST-PAYHERE",
    payhere_amount: checkout.payHereParams.amount, payhere_currency: "LKR", status_code: "2", md5sig: "invalid"
  };
  assert.equal((await request("/payments/payhere/notify", "POST", callback, null)).status, 400);
  callback.md5sig = md5(config.merchantId + callback.order_id + callback.payhere_amount + "LKR2" + md5(config.merchantSecret));
  const results = await Promise.all([
    request("/payments/payhere/notify", "POST", callback, null), request("/payments/payhere/notify", "POST", callback, null)
  ]);
  assert.ok(results.every(result => result.status === 200));
  const saved = await Payment.findOne({ restaurantOrder: order._id });
  assert.equal(saved.paymentStatus, "completed");
  assert.equal(saved.auditLog.filter(entry => entry.action === "PAYHERE_COMPLETED").length, 1);
});

it("posts only eligible folio orders and excludes the postings and unpaid bills from collected sales", async () => {
  const outside = await makeOrder(await makeReservation());
  assert.equal((await pay(outside, { method: "ROOM_FOLIO" })).status, 409);
  const guest = await Guest.create({
    property: property._id, firstName: "Folio", lastName: "Guest", email: "folio@example.test",
    phone: "0770000000", nationality: "Sri Lankan", nationalIdType: "National ID", nationalIdNumber: "FOLIO-01"
  });
  const stay = await Reservation.create({
    property: property._id, guest: guest._id, reservationNumber: "HOTEL-FOLIO-TEST", status: "Checked-In",
    bookingSource: "Walk-in", checkInDate: new Date("2026-11-20"), checkOutDate: new Date("2026-11-22"),
    roomType: "Deluxe", numberOfNights: 2, numberOfGuests: 2, numberOfAdults: 2,
    ratePerNight: 1000, roomCharges: 2000, totalAmount: 2000, createdBy: staff._id
  });
  const row = await makeReservation(venue, {
    guestType: "Hotel Guest", hotelReservation: stay._id, reservationTotalPrice: 225
  });
  const order = await makeOrder(row);
  const [first, second] = await Promise.all([pay(order, { method: "ROOM_FOLIO" }), pay(order, { method: "ROOM_FOLIO" })]);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(await GuestExpense.countDocuments({ reservation: stay._id, paymentStatus: "Added to Bill" }), 1);
  assert.equal((await Payment.findOne({ restaurantOrder: order._id })).paymentStatus, "posted_to_folio");
  const sales = await request(`${operations()}/sales?from=${today()}&to=${today()}`);
  assert.equal(sales.status, 200);
  assert.deepEqual(sales.data.data.collectedSales, { LKR: 5375.5 });
  assert.deepEqual(sales.data.data.cash, { LKR: 2375.5 });
  assert.deepEqual(sales.data.data.card, { LKR: 1500 });
  assert.deepEqual(sales.data.data.payHere, { LKR: 1500 });
  assert.deepEqual(sales.data.data.folioPosted, { LKR: 1500 });
  assert.equal(sales.data.data.folioOrders, 1);
  assert.ok(sales.data.data.unpaidOrders >= 1);
  const otherSales = await request(`${operations(secondVenue)}/sales`);
  assert.equal(otherSales.data.data.orders, 0);
  assert.deepEqual(otherSales.data.data.collectedSales, {});
  const cash = await Payment.findOne({ purpose: "restaurant_order", paymentMethod: "Cash" });
  await RestaurantOrder.collection.updateOne({ _id: cash.restaurantOrder }, { $set: { createdAt: new Date(0) } });
  const laterSettlement = await request(`${operations()}/sales?from=${today()}&to=${today()}`);
  assert.equal(laterSettlement.data.data.orders, sales.data.data.orders - 1);
  assert.deepEqual(laterSettlement.data.data.collectedSales, sales.data.data.collectedSales);
  assert.ok(laterSettlement.data.data.history.some(entry => entry._id === String(cash.restaurantOrder)));

  // Keep the existing dining reservation charge separate from the new food-order charge.
  const legacy = await request(`/restaurants/admin/reservations/${row._id}/charge-folio`, "POST", { amount: 225 });
  assert.equal(legacy.status, 200);
  assert.equal(await GuestExpense.countDocuments({ reservation: stay._id }), 2);
  const checkout = await request(`/reservations/${stay._id}/check-out`, "PUT", {});
  assert.equal(checkout.status, 400);
  const invoice = await Invoice.findById(checkout.data.invoiceId);
  assert.equal(invoice.totalAmount, 3725);
  assert.equal(invoice.extraExpenses.length, 2);
  assert.equal((await request(`${operations()}/sales?from=2026-02-30`)).status, 400);
});

it("protects legacy reservation folio charges from closed, invoiced and concurrent stays", async () => {
  const guest = await Guest.create({
    property: property._id, firstName: "Legacy", lastName: "Folio", email: "legacy-folio@example.test",
    phone: "0770000000", nationality: "Sri Lankan", nationalIdType: "National ID", nationalIdNumber: "LEGACY-FOLIO"
  });
  let hotelSequence = 0;
  const makeStay = (status = "Checked-In") => Reservation.create({
    property: property._id, guest: guest._id, reservationNumber: `LEGACY-FOLIO-${++hotelSequence}`,
    status, bookingSource: "Walk-in", checkInDate: new Date("2026-11-20"), checkOutDate: new Date("2026-11-22"),
    roomType: "Deluxe", numberOfNights: 2, numberOfGuests: 2, numberOfAdults: 2,
    ratePerNight: 1000, roomCharges: 2000, totalAmount: 2000, createdBy: staff._id
  });
  const makeDiningReservation = (stay, amount = 225) => makeReservation(venue, {
    guestType: "Hotel Guest", hotelReservation: stay._id, reservationTotalPrice: amount
  });
  const legacyCharge = (row, amount = 225) => request(
    `/restaurants/admin/reservations/${row._id}/charge-folio`, "POST", { amount }
  );

  const eligibleStay = await makeStay();
  const eligibleBooking = await makeDiningReservation(eligibleStay);
  const eligibleResult = await legacyCharge(eligibleBooking);
  assert.equal(eligibleResult.status, 200, JSON.stringify(eligibleResult.data));
  assert.equal(await GuestExpense.countDocuments({ reservation: eligibleStay._id }), 1);

  const closedStay = await makeStay("Checked-Out");
  const closedBooking = await makeDiningReservation(closedStay);
  assert.equal((await legacyCharge(closedBooking)).status, 409);
  assert.equal(await GuestExpense.countDocuments({ reservation: closedStay._id }), 0);

  const invoicedStay = await makeStay();
  await Invoice.create({
    property: property._id, invoiceNumber: `LEGACY-PAID-${Date.now()}`, reservation: invoicedStay._id,
    guest: guest._id, invoiceDate: new Date(), checkInDate: invoicedStay.checkInDate,
    checkOutDate: invoicedStay.checkOutDate, numberOfNights: 2, roomCharges: 2000,
    subtotal: 2000, totalAmount: 2000, balanceDue: 0, totalPaid: 2000,
    paymentStatus: "Paid", status: "Paid", generatedBy: staff._id
  });
  const invoicedBooking = await makeDiningReservation(invoicedStay);
  assert.equal((await legacyCharge(invoicedBooking)).status, 409);
  assert.equal(await GuestExpense.countDocuments({ reservation: invoicedStay._id }), 0);

  const historicalStay = await makeStay();
  const historicalBooking = await makeReservation(venue, {
    guestType: "Hotel Guest", hotelReservation: historicalStay._id
  });
  assert.equal((await legacyCharge(historicalBooking)).status, 400);
  assert.equal(await GuestExpense.countDocuments({ reservation: historicalStay._id }), 0);

  const duplicateStay = await makeStay();
  const duplicateBooking = await makeDiningReservation(duplicateStay);
  const duplicateResults = await Promise.all([legacyCharge(duplicateBooking), legacyCharge(duplicateBooking)]);
  assert.equal(duplicateResults.filter(result => result.status === 200).length, 1);
  assert.ok(duplicateResults.every(result => [200, 400, 409].includes(result.status)));
  assert.equal(await GuestExpense.countDocuments({ reservation: duplicateStay._id }), 1);

  for (let attempt = 0; attempt < 5; attempt++) {
    const racingStay = await makeStay();
    const racingBooking = await makeDiningReservation(racingStay);
    const [charge, checkout] = await Promise.all([
      legacyCharge(racingBooking),
      request(`/reservations/${racingStay._id}/check-out`, "PUT", {})
    ]);
    assert.ok([200, 409].includes(charge.status), JSON.stringify(charge.data));
    const expense = await GuestExpense.findOne({ reservation: racingStay._id });
    const invoice = await Invoice.findOne({ reservation: racingStay._id });
    if (expense) {
      assert.ok(invoice?.extraExpenses.some(line => line.expense?.toString() === expense._id.toString() ||
        line.expenseId?.toString() === expense._id.toString() || line.description === expense.description),
      `Checkout must include the racing folio charge (checkout ${checkout.status})`);
    }
    if (invoice) {
      assert.equal(await GuestExpense.countDocuments({ reservation: racingStay._id }), invoice.extraExpenses.length);
    }
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const racingStay = await makeStay();
    const racingBooking = await makeDiningReservation(racingStay);
    const order = await makeOrder(racingBooking);
    const [payment, checkout] = await Promise.all([
      pay(order, { method: "ROOM_FOLIO" }),
      request(`/reservations/${racingStay._id}/check-out`, "PUT", {})
    ]);
    assert.ok([200, 409].includes(payment.status), JSON.stringify(payment.data));
    const expense = await GuestExpense.findOne({ reservation: racingStay._id });
    const invoice = await Invoice.findOne({ reservation: racingStay._id });
    if (expense) {
      assert.ok(invoice?.extraExpenses.some(line => line.expense?.toString() === expense._id.toString() ||
        line.expenseId?.toString() === expense._id.toString() || line.description === expense.description),
      `Checkout must include the order folio charge (checkout ${checkout.status})`);
    }
    if (invoice) {
      assert.equal(await GuestExpense.countDocuments({ reservation: racingStay._id }), invoice.extraExpenses.length);
    }
  }
});

async function signedCallback(reference, amount, code) {
  const { merchantId, merchantSecret } = getPayHereConfig();
  const md5 = text => crypto.createHash("md5").update(text).digest("hex").toUpperCase();
  const formatted = Number(amount).toFixed(2);
  return request("/payments/payhere/notify", "POST", {
    merchant_id: merchantId, order_id: reference, payment_id: `fixture-${reference}`,
    payhere_amount: formatted, payhere_currency: "LKR", status_code: String(code),
    md5sig: md5(merchantId + reference + formatted + "LKR" + code + md5(merchantSecret))
  }, null);
}

it("recovers food orders only after a signed terminal callback and credits a late old attempt once for reconciliation", async () => {
  const order = await makeOrder(await makeReservation());
  const initial = await pay(order, { method: "PAYHERE" });
  const reference = initial.data.data.checkout.paymentReference;
  assert.equal((await pay(order, { method: "CASH", amount: order.total })).status, 409);
  assert.equal((await signedCallback(reference, order.total + 1, -2)).status, 400);
  assert.equal((await pay(order, { method: "CASH", amount: order.total })).status, 409);
  assert.equal((await signedCallback(reference, order.total, -2)).status, 200);
  const bill = await request(`${operations()}/orders/${order._id}`);
  assert.equal(bill.data.data.canRecoverPayment, true);
  const retry = await pay(order, { method: "PAYHERE" });
  const newReference = retry.data.data.checkout.paymentReference;
  assert.notEqual(newReference, reference);
  assert.equal((await signedCallback(newReference, order.total, -1)).status, 200);
  assert.equal((await pay(order, { method: "CASH", amount: order.total })).status, 200);
  const before = (await request(`${operations()}/sales`)).data.data.collectedSales;
  await Promise.all([signedCallback(reference, order.total, 2), signedCallback(reference, order.total, 2)]);
  const archived = await Payment.findOne({ paymentReference: reference });
  assert.equal(archived.paymentStatus, "completed");
  assert.equal(String(archived.previousRestaurantOrder), order._id);
  assert.equal(archived.reconciliationRequired, true);
  assert.equal(archived.auditLog.filter(entry => entry.action === "PAYHERE_COMPLETED").length, 1);
  assert.equal((await RestaurantOrder.findById(order._id)).paymentReconciliationRequired, true);
  assert.equal(await Payment.countDocuments({ restaurantOrder: order._id }), 1);
  assert.deepEqual((await request(`${operations()}/sales`)).data.data.collectedSales, before);
  assert.equal((await pay(order, { method: "PAYHERE" })).status, 409);
});

it("serializes partial legacy reservation checkout and reconciles each confirmed payment exactly once", async () => {
  const row = await makeReservation(venue, { user: customer._id, reservationTotalPrice: 700 });
  await Payment.create({
    property: property._id, restaurantReservation: row._id, user: customer._id,
    amount: 200, currency: "LKR", purpose: "restaurant_dining", paymentMethod: "PayHere", paymentStatus: "completed"
  });
  const initiate = () => request("/payments/initiate", "POST", { purpose: "restaurant_dining", targetId: row.id }, customer);
  const [first, second] = await Promise.all([initiate(), initiate()]);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(first.data.amount, 500);
  assert.equal(first.data.paymentReference, second.data.paymentReference);
  assert.equal(await Payment.countDocuments({ restaurantReservation: row._id, paymentStatus: "pending" }), 1);
  assert.equal((await request("/payments/simulate-sandbox-confirmation", "POST", { paymentReference: first.data.paymentReference }, customer)).status, 409);
  const results = await Promise.all([
    signedCallback(first.data.paymentReference, 500, 2), signedCallback(first.data.paymentReference, 500, 2)
  ]);
  assert.ok(results.every(result => result.status === 200));
  const updated = await RestaurantReservation.findById(row._id);
  assert.equal(updated.paidAmount, 700);
  assert.equal(updated.paymentStatus, "Paid");
  assert.equal((await initiate()).status, 409);
  await RestaurantReservation.updateOne({ _id: row._id }, { status: "COMPLETED" });
  assert.equal((await signedCallback(first.data.paymentReference, 500, 2)).status, 200);
  assert.equal((await RestaurantReservation.findById(row._id)).paymentReconciliationRequired, false);

  const accounts = [
    await request("/restaurants/my-reservations", "GET", undefined, customer),
    await request(`/restaurants/admin/reservations?search=${row.confirmationNumber}`)
  ];
  for (const account of accounts) {
    const view = account.data.data.find(entry => entry._id === row.id);
    assert.ok(view);
    assert.equal(view.paidAmount, 700);
    assert.equal(view.outstandingBalance, 0);
    assert.equal(view.paymentStatus, "Paid");
  }
});

it("preserves cancelled and completed reservations when verified callbacks arrive late", async () => {
  for (const status of ["CANCELLED", "COMPLETED"]) {
    const row = await makeReservation(venue, { user: customer._id, reservationTotalPrice: 250 });
    const initiated = await request("/payments/initiate", "POST", { purpose: "restaurant_dining", targetId: row.id }, customer);
    assert.equal(initiated.status, 200);
    if (status === "CANCELLED") {
      assert.equal((await request(`/restaurants/reservations/${row.confirmationNumber}/cancel`, "PUT", {}, customer)).status, 200);
    } else {
      assert.equal((await request(`/restaurants/admin/reservations/${row.id}/status`, "PUT", { status })).status, 200);
    }
    assert.equal((await signedCallback(initiated.data.paymentReference, 250, 2)).status, 200);
    const saved = await RestaurantReservation.findById(row._id);
    assert.equal(saved.status, status);
    assert.equal(saved.paidAmount, 250);
    assert.equal(saved.paymentReconciliationRequired, true);
    const payment = await Payment.findOne({ paymentReference: initiated.data.paymentReference });
    assert.equal(payment.paymentStatus, "completed");
    assert.equal(payment.reconciliationRequired, true);
  }
});

it("protects reference lookup and cancellation with scoped ownership or a private guest token", async () => {
  const own = await makeReservation(venue, { user: customer._id });
  const path = `/restaurants/reservations/${own.confirmationNumber}`;
  assert.equal((await request(path, "GET", undefined, null)).status, 401);
  assert.equal((await request(path, "GET", undefined, staff)).status, 404);
  assert.equal((await request(path, "GET", undefined, customer)).status, 200);
  assert.equal((await request(path + "/cancel", "PUT", {}, null)).status, 404);
  assert.equal((await request(path + "/cancel", "PUT", {}, staff)).status, 404);
  assert.equal((await request(path + `/cancel?propertyId=${otherProperty.id}`, "PUT", {}, customer)).status, 404);
  assert.equal((await request(path + "/cancel", "PUT", {}, customer)).status, 200);

  const guest = await request(`/restaurants/${venue.id}/reservations`, "POST", {
    customerName: "Token guest", email: "token@example.test", phone: "0771234567",
    guestCount: 1, date: "2030-06-22", time: "18:00"
  }, null);
  assert.equal(guest.status, 201);
  const token = guest.data.guestManagementToken;
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal(guest.data.data.guestManagementTokenHash, undefined);
  const receipt = await request(`/restaurants/reservations/${guest.data.data.confirmationNumber}`,
    "GET", undefined, null, { "X-Dining-Guest-Token": token });
  assert.equal(receipt.status, 200);
  assert.equal(receipt.data.data.guestManagementTokenHash, undefined);

  const guestPath = `/restaurants/reservations/${guest.data.data.confirmationNumber}/cancel`;
  assert.equal((await request(guestPath, "PUT", { email: "token@example.test", phone: "0771234567" }, null)).status, 404);
  assert.equal((await request(guestPath + `?propertyId=${otherProperty.id}`, "PUT", { guestToken: token }, null)).status, 404);
  assert.equal((await request(guestPath, "PUT", { guestToken: token }, null)).status, 200);

  const legacy = await makeReservation(venue);
  const oldPath = `/restaurants/reservations/${legacy.confirmationNumber}/cancel`;
  assert.equal((await request(oldPath, "PUT", { email: legacy.email }, null)).status, 404);
  assert.equal((await request(oldPath, "PUT", { email: legacy.email, phone: legacy.phone }, null)).status, 200);

});

it("requires hotel reference and verified contact fields before revealing or linking a stay", async () => {
  const guest = await Guest.create({
    property: property._id, firstName: "Verified", lastName: "Guest", email: "stay@example.test",
    phone: "+94 77 123 4567", nationality: "Sri Lankan", nationalIdType: "National ID", nationalIdNumber: "STAY-01"
  });
  const Room = require("../models/Room");
  const room = await Room.create({
    property: property._id, roomNumber: "QA-321", roomType: "Deluxe", floor: 1, basePrice: 1000,
    capacity: { maxAdults: 2, maxOccupancy: 2 }, bedConfiguration: "King Bed"
  });
  const stay = await Reservation.create({
    property: property._id, guest: guest._id, room: room._id, reservationNumber: "HOTEL-VERIFIED",
    status: "Checked-In", bookingSource: "Walk-in", checkInDate: new Date("2030-06-20"), checkOutDate: new Date("2030-06-25"),
    roomType: "Deluxe", numberOfNights: 5, numberOfGuests: 2, numberOfAdults: 2,
    ratePerNight: 1000, roomCharges: 5000, totalAmount: 5000, createdBy: staff._id
  });
  const lookup = "/restaurants/lookup-hotel-stay";
  const identity = { reservationNumber: stay.reservationNumber, email: "stay@example.test", phone: "0771234567", roomNumber: "QA-321" };
  assert.equal((await request(lookup, "POST", { roomNumber: "QA-321" }, null)).status, 400);
  for (const invalid of [{ phone: "0770000000" }, { email: "wrong@example.test" }, { roomNumber: "wrong" }, { reservationNumber: "wrong" }]) {
    const response = await request(lookup, "POST", { ...identity, ...invalid }, null);
    assert.equal(response.status, 404);
    assert.equal(response.data.data, undefined);
  }
  const verified = await request(lookup, "POST", identity, null);
  assert.equal(verified.status, 200);
  assert.equal(verified.data.data.reservationId, stay.id);
  assert.equal(verified.data.data.email, undefined);
  assert.equal(verified.data.data.phone, undefined);
  const booking = {
    guestType: "Hotel Guest", hotelReservationId: stay.id, customerName: "Verified Guest",
    email: identity.email, phone: identity.phone, roomNumber: identity.roomNumber,
    date: "2030-06-22", time: "19:00", guestCount: 1
  };
  const path = `/restaurants/${venue.id}/reservations`;
  assert.equal((await request(path, "POST", { ...booking, phone: "0770000000" }, null)).status, 404);
  const accepted = await request(path, "POST", booking, null);
  assert.equal(accepted.status, 201);
  assert.equal(String((await RestaurantReservation.findById(accepted.data.data._id)).hotelReservation), stay.id);
});
