const mongoose = require("mongoose");
const RestaurantOrder = require("../models/RestaurantOrder");
const RestaurantReservation = require("../models/RestaurantReservation");
const RestaurantMenuItem = require("../models/RestaurantMenuItem");
const RestaurantMenuCategory = require("../models/RestaurantMenuCategory");
const Reservation = require("../models/Reservation");
const GuestExpense = require("../models/GuestExpense");
const Invoice = require("../models/Invoice");
const Payment = require("../models/Payment");
const { recoverablePayHereAttempt } = require("./diningPaymentService");

const eligibleStatuses = ["PENDING", "CONFIRMED", "SEATED"];
const money = (value) => Math.round(value * 100) / 100;

function fail(statusCode, message) {
  throw Object.assign(new Error(message), { statusCode });
}

function objectId(value, label) {
  if (typeof value !== "string" || !mongoose.isObjectIdOrHexString(value)) fail(400, `Invalid ${label}`);
  return new mongoose.Types.ObjectId(value);
}

async function priceItems(scope, inputs, currency, previousItems = []) {
  if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 100) {
    fail(400, "An order must contain between 1 and 100 menu items");
  }
  const quantities = new Map();
  for (const row of inputs) {
    const id = String(objectId(row?.menuItem, "menu item ID"));
    if (!Number.isInteger(row.quantity) || row.quantity < 1 || row.quantity > 100) {
      fail(400, "Menu item quantities must be whole numbers from 1 to 100");
    }
    if (quantities.has(id)) fail(400, "Combine duplicate menu selections into one line");
    quantities.set(id, row.quantity);
  }
  const activeCategories = await RestaurantMenuCategory.find({ ...scope, active: true }).select("_id").lean();
  const menu = await RestaurantMenuItem.find({ ...scope, _id: { $in: [...quantities.keys()] }, category: { $in: activeCategories.map(category => category._id) }, available: true }).lean();
  const byId = new Map(menu.map(item => [String(item._id), item]));
  const snapshots = new Map(previousItems.map(item => [String(item.menuItem), item]));
  return [...quantities].map(([id, quantity]) => {
    const previous = snapshots.get(id);
    const item = byId.get(id);
    if ((!previous || quantity > previous.quantity) && !item) fail(400, "A selected menu item is unavailable");
    if (item && (!previous || quantity > previous.quantity) && item.currency !== currency) {
      fail(400, "Menu item currency differs from the order currency");
    }
    const unitPrice = previous?.unitPrice ?? money(item.price);
    return { menuItem: id, name: previous?.name ?? item.name, quantity, unitPrice, lineTotal: money(quantity * unitPrice) };
  });
}

async function saveOrder(scope, reservationId, userId, inputs, currency, editing) {
  const reservation = await RestaurantReservation.findOne({ ...scope, _id: reservationId })
    .populate({ path: "table", match: scope, select: "tableNumber" });
  if (!reservation) fail(404, "Dining reservation not found");
  if (reservation.status !== "SEATED" || reservation.arrivalStatus !== "ARRIVED") {
    fail(409, "The guest must be seated before staff can create or edit an order");
  }
  const current = await RestaurantOrder.findOne({ ...scope, reservation: reservationId });
  if (editing && !current) fail(404, "Order not found");
  if (!editing && current) fail(409, "This reservation already has an order");
  if (current?.settlementStarted) fail(409, "Order items are locked after settlement starts");

  const orderCurrency = current?.currency || currency;
  const items = await priceItems(scope, inputs, orderCurrency, current?.items);
  const total = money(items.reduce((sum, item) => sum + item.lineTotal, 0));
  if (!total) fail(400, "The order total must be greater than zero");
  if (current) {
    current.set({ items, subtotal: total, total });
    return current.save();
  }

  return RestaurantOrder.create({
    ...scope, reservation: reservationId, orderNumber: `ORD-${reservation.confirmationNumber}`,
    confirmationNumber: reservation.confirmationNumber, customerName: reservation.customerName,
    tableNumber: reservation.table?.tableNumber, createdBy: userId,
    items, subtotal: total, total, currency: orderCurrency
  });
}

async function settleOrder(scope, orderId, userId, { method, amount, transactionReference }, propertyCurrency) {
  const methods = { CASH: "Cash", CARD: "Card", PAYHERE: "PayHere", ROOM_FOLIO: "Room Folio" };
  if (!Object.hasOwn(methods, method)) fail(400, "Invalid payment method");
  const reference = typeof transactionReference === "string" ? transactionReference.trim() : "";
  if (method === "CARD" && (!reference || reference.length > 120)) {
    fail(400, "Enter the reference from the successful external card transaction");
  }

  // Order, payment and any folio expense must commit together on Atlas.
  return mongoose.connection.transaction(async session => {
    const order = await RestaurantOrder.findOne({ ...scope, _id: orderId }).session(session);
    if (!order) fail(404, "Order not found");
    if (["CASH", "CARD"].includes(method) &&
        (typeof amount !== "number" || !Number.isFinite(amount) || amount !== order.total)) {
      fail(400, "Payment amount must equal the full bill");
    }

    if (order.paymentReconciliationRequired) fail(409, "This order requires payment reconciliation");

    const previous = await Payment.findOne({ ...scope, restaurantOrder: order._id }).session(session);
    const retrying = recoverablePayHereAttempt(previous);
    if (previous && !retrying) {
      if (previous.paymentMethod !== methods[method] ||
          (method === "CARD" && previous.transactionId !== reference)) {
        fail(409, "The order already has a different settlement");
      }
      return { payment: previous, order };
    }
    if (order.settlementStarted && !retrying) fail(409, "Settlement is already in progress");

    const dining = await RestaurantReservation.findOne({ ...scope, _id: order.reservation }).session(session);
    if (!dining || ["CANCELLED", "NO_SHOW"].includes(dining.status)) fail(409, "The dining reservation cannot be settled");
    order.settlementStarted = true;
    if (retrying) {
      // Touch the version even though the lock remains set, to serialize against a late callback.
      await RestaurantOrder.updateOne({ _id: order._id }, { $inc: { __v: 1 } }, { session });
      previous.previousRestaurantOrder = order._id;
      previous.restaurantOrder = undefined;
      previous.auditLog.push({ action: "RESTAURANT_ORDER_ATTEMPT_SUPERSEDED", performedBy: userId });
      await previous.save({ session });
    } else {
      await order.save({ session });
    }

    const payment = new Payment({
      ...scope, purpose: "restaurant_order", restaurantOrder: order._id,
      restaurantReservation: dining._id, user: userId, amount: order.total, currency: order.currency,
      paymentMethod: methods[method], paymentStatus: method === "PAYHERE" ? "pending" : "completed",
      gateway: method === "PAYHERE" ? "PayHere" : "Manual",
      transactionId: method === "CARD" ? reference : undefined,
      confirmedAt: ["CASH", "CARD"].includes(method) ? new Date() : undefined,
      auditLog: [{ action: "RESTAURANT_ORDER_SETTLEMENT", performedBy: userId }]
    });

    if (method === "ROOM_FOLIO") {
      if (order.currency !== propertyCurrency) fail(409, "Order and folio currencies differ");
      const stay = dining.guestType === "Hotel Guest" && dining.hotelReservation
        ? await Reservation.findOne({
          _id: dining.hotelReservation, property: scope.property, status: "Checked-In"
        }).session(session) : null;
      if (!stay || !stay.guest) fail(409, "A linked checked-in hotel stay is required");
      // Coordinate folio posting with legacy dining charges and hotel checkout.
      await Reservation.updateOne({ _id: stay._id }, { $inc: { __v: 1 } }, { session });
      if (await Invoice.exists({ reservation: stay._id }).session(session)) {
        fail(409, "The stay already has an invoice. Use another payment method.");
      }
      const expense = new GuestExpense({
        property: scope.property, reservation: stay._id, guest: stay.guest, category: "Restaurant",
        description: `Restaurant order ${order.orderNumber}`, quantity: 1,
        unitPrice: order.total, amount: order.total, totalAmount: order.total,
        paymentStatus: "Added to Bill", addedBy: userId
      });
      await expense.save({ session });
      payment.folioExpense = expense._id;
      // Keep the hotel reservation separate from restaurant reservation-level payments.
      payment.paymentStatus = "posted_to_folio";
    }
    await payment.save({ session });
    return { payment, order };
  });
}

module.exports = { eligibleStatuses, money, fail, objectId, saveOrder, settleOrder };
