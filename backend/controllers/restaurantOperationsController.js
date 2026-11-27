const Restaurant = require("../models/Restaurant");
const RestaurantReservation = require("../models/RestaurantReservation");
const RestaurantOrder = require("../models/RestaurantOrder");
const RestaurantMenuItem = require("../models/RestaurantMenuItem");
const RestaurantMenuCategory = require("../models/RestaurantMenuCategory");
const Payment = require("../models/Payment");
const { recoverablePayHereAttempt, getReservationPaymentsById, summarizeReservationPayment } = require("../services/diningPaymentService");
const { buildPayHereCheckout } = require("../services/payhereService");
const { eligibleStatuses, fail, objectId, saveOrder, settleOrder, money } = require("../services/restaurantOrderService");
const { seatReservation } = require("../services/diningSeatingService");

const reservationStatuses = RestaurantReservation.schema.path("status").enumValues;

function localDate(date, timezone) {
  const parts = new Intl.DateTimeFormat("en", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: timezone
  }).formatToParts(date);
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type).value).join("-");
}

function period(from, to, today) {
  const start = from ?? today;
  const end = to ?? today;
  for (const day of [start, end]) {
    if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
        !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day) {
      fail(400, "Enter valid start and end dates");
    }
  }
  if (end < start || Date.parse(end) - Date.parse(start) > 366 * 86400000) {
    fail(400, "The date range must be ordered and at most 367 days");
  }
  return [start, end];
}

function between(field, timezone, start, end) {
  const date = { $dateToString: { format: "%Y-%m-%d", date: `$${field}`, timezone } };
  return { $expr: { $and: [{ $gte: [date, start] }, { $lte: [date, end] }] } };
}

const arrival = row => row.status === "NO_SHOW" && row.arrivalStatus !== "ARRIVED"
  ? "NO_SHOW" : row.arrivalStatus || "EXPECTED";

function handle(work) {
  return async (req, res) => {
    try {
      if (!req.propertyId) fail(400, "Select a property");
      const property = req.propertyId;
      const timezone = req.property?.timezone || "Asia/Colombo";
      const currency = req.property?.currency || "LKR";
      const today = localDate(new Date(), timezone);
      const scope = { property };
      let restaurant;
      if (req.params.restaurantId) {
        scope.restaurant = objectId(req.params.restaurantId, "restaurant ID");
        restaurant = await Restaurant.findOne({ property, _id: scope.restaurant, active: true }).lean();
        if (!restaurant) fail(404, "Restaurant not found");
      }
      const data = await work(req, { scope, restaurant, timezone, currency, today }, res);
      res.json({ success: true, data });
    } catch (error) {
      const conflict = error.code === 11000 || error.name === "VersionError";
      if (!error.statusCode && !conflict) console.error("Restaurant operations:", error);
      res.status(error.statusCode || (conflict ? 409 : 500)).json({
        error: error.statusCode ? error.message : conflict
          ? "This record changed or the payment reference is already in use. Refresh and retry."
          : "Restaurant operation failed"
      });
    }
  };
}

async function orderPayments(scope, orders) {
  const payments = await Payment.find({
    ...scope, purpose: "restaurant_order", restaurantOrder: { $in: orders.map(order => order._id) }
  }).select("restaurantOrder paymentStatus paymentMethod paymentReference amount currency paymentDate transactionId gatewayStatusCode reconciliationRequired").lean();
  return new Map(payments.map(payment => [String(payment.restaurantOrder), payment]));
}

function paymentStatus(payment) {
  return payment?.paymentStatus || "unpaid";
}

exports.dashboard = handle(async (req, { scope, timezone, today }) => {
  const restaurants = await Restaurant.find({ property: scope.property, active: true })
    .select("name restaurantType heroImage featuredImage").sort("sortOrder name").lean();
  const ids = restaurants.map(restaurant => restaurant._id);
  const scopeByRestaurant = { property: scope.property, restaurant: { $in: ids } };
  const [reservations, orders, sales] = await Promise.all([
    RestaurantReservation.find({ ...scopeByRestaurant, $or: [
      { date: today, status: { $nin: ["CANCELLED", "NO_SHOW"] } },
      { arrivalStatus: "ARRIVED", ...between("arrivedAt", timezone, today, today) }
    ] }).select("restaurant date status guestCount arrivalStatus arrivedAt").lean(),
    RestaurantOrder.aggregate([
      { $match: { ...scopeByRestaurant, property: objectId(String(scope.property), "property ID") } },
      { $group: { _id: "$restaurant", total: { $sum: 1 }, today: { $sum: { $cond: [
        { $eq: [{ $dateToString: { date: "$createdAt", format: "%Y-%m-%d", timezone } }, today] }, 1, 0
      ] } } } }
    ]),
    Payment.find({ ...scopeByRestaurant, purpose: "restaurant_order", restaurantOrder: { $exists: true }, paymentStatus: "completed",
      ...between("paymentDate", timezone, today, today)
    }).select("restaurant amount currency").lean()
  ]);

  return restaurants.map(restaurant => {
    const matches = row => String(row.restaurant) === String(restaurant._id);
    const reservationsAtVenue = reservations.filter(matches);
    return {
      ...restaurant, today,
      reservationsToday: reservationsAtVenue.filter(row => row.date === today && !["CANCELLED", "NO_SHOW"].includes(row.status)).length,
      arrivedGuests: reservationsAtVenue.filter(row => row.arrivalStatus === "ARRIVED" && row.arrivedAt &&
        localDate(row.arrivedAt, timezone) === today).reduce((total, row) => total + row.guestCount, 0),
      totalOrders: orders.find(row => String(row._id) === String(restaurant._id))?.total || 0,
      ordersToday: orders.find(row => String(row._id) === String(restaurant._id))?.today || 0,
      sales: sumByCurrency(sales.filter(matches))
    };
  });
});

exports.reservations = handle(async (req, { scope, restaurant, today, currency }) => {
  const { period: filter, status, arrivalStatus, search } = req.query;
  const query = { ...scope };
  if (filter === "today") query.date = today;
  else if (filter === "upcoming") query.date = { $gt: today };
  else if (filter === "past") query.date = { $lt: today };
  else if (filter && filter !== "all") fail(400, "Invalid reservation period");
  if (status) {
    if (!reservationStatuses.includes(status)) fail(400, "Invalid reservation status");
    query.status = status;
  }
  if (arrivalStatus && !["EXPECTED", "ARRIVED", "NO_SHOW"].includes(arrivalStatus)) fail(400, "Invalid arrival status");
  if (search) {
    if (typeof search !== "string" || search.length > 100) fail(400, "Invalid search");
    const pattern = search.replace(/[.*+?^$${}()|[\]\\]/g, "\\$&");
    query.$or = [{ customerName: { $regex: pattern, $options: "i" } }, { confirmationNumber: { $regex: pattern, $options: "i" } }];
  }
  const rows = await RestaurantReservation.find(query)
    .populate({ path: "table", match: scope, select: "tableNumber" })
    .populate("arrivedBy", "name").populate("seatedBy", "name")
    .sort({ date: 1, time: 1, _id: 1 }).lean();
  const orders = await RestaurantOrder.find({ ...scope, reservation: { $in: rows.map(row => row._id) } })
    .select("reservation orderNumber").lean();
  const [payments, reservationPayments] = await Promise.all([
    orderPayments(scope, orders), getReservationPaymentsById(rows)
  ]);
  const ordersByReservation = new Map(orders.map(order => [String(order.reservation), order]));
  return {
    restaurant, today, currency,
    reservations: rows.filter(row => !arrivalStatus || arrival(row) === arrivalStatus).map(row => {
      const order = ordersByReservation.get(String(row._id));
      return {
        ...row, ...summarizeReservationPayment(row, reservationPayments.get(String(row._id)) || []),
        arrivalStatus: arrival(row), order,
        orderPaymentStatus: order ? paymentStatus(payments.get(String(order._id))) : undefined
      };
    })
  };
});

exports.arrive = handle(async (req, { scope }) => {
  const id = objectId(req.params.reservationId, "reservation ID");
  const arrived = await RestaurantReservation.findOneAndUpdate({
    ...scope, _id: id, status: { $in: eligibleStatuses }, arrivalStatus: { $in: ["EXPECTED", null] }
  }, { $set: { arrivalStatus: "ARRIVED", arrivedAt: new Date(), arrivedBy: req.user.id } }, {
    new: true, runValidators: true
  });
  if (arrived) return arrived;
  if (!await RestaurantReservation.exists({ ...scope, _id: id })) fail(404, "Dining reservation not found");
  fail(409, "This reservation cannot be marked as arrived");
});

exports.seat = handle(async (req, { scope }) => seatReservation({
  ...scope, reservationId: objectId(req.params.reservationId, "reservation ID"), userId: req.user.id
}));

exports.menu = handle(async (req, { scope }) => {
  const activeCategories = await RestaurantMenuCategory.find({ ...scope, active: true }).select("_id").lean();
  return RestaurantMenuItem.find({ ...scope, category: { $in: activeCategories.map(category => category._id) }, available: true })
    .select("name price currency").sort("name").lean();
});

function writeOrder(editing) {
  return handle(async (req, { scope, currency }, res) => {
    const reservation = objectId(req.params.reservationId, "reservation ID");
    const order = await saveOrder(scope, reservation, req.user.id, req.body.items, currency, editing);
    res.status(editing ? 200 : 201);
    return order;
  });
}
exports.createOrder = writeOrder(false);
exports.updateOrder = writeOrder(true);

exports.bill = handle(async (req, { scope, restaurant }) => {
  const order = await RestaurantOrder.findOne({ ...scope, _id: objectId(req.params.orderId, "order ID") }).populate("createdBy", "name").lean();
  if (!order) fail(404, "Order not found");
  const [payments, reservation] = await Promise.all([
    orderPayments(scope, [order]),
    RestaurantReservation.findOne({ ...scope, _id: order.reservation })
      .select("status confirmationNumber customerName guestType hotelReservation").lean()
  ]);
  const payment = payments.get(String(order._id)) || null;
  return {
    reservation,
    canRecoverPayment: !order.paymentReconciliationRequired && recoverablePayHereAttempt(payment),
    order, restaurant: { name: restaurant.name, location: restaurant.location, phone: restaurant.contactPhone },
    property: { name: req.property?.name, address: req.property?.address },
    payment
  };
});

exports.pay = handle(async (req, { scope, restaurant, currency }) => {
  const result = await settleOrder(scope, objectId(req.params.orderId, "order ID"), req.user.id, req.body, currency);
  const { payment, order } = result;
  if (req.body.method === "PAYHERE" && payment.paymentStatus === "pending") {
    const checkout = await buildPayHereCheckout(payment, req.user, `${restaurant.name} ${order.orderNumber}`,
      "restaurant_order", order._id);
    const operationsUrl = `${new URL(checkout.payHereParams.return_url).origin}/admin/restaurants/operations/${restaurant._id}`;
    checkout.payHereParams.return_url = operationsUrl;
    checkout.payHereParams.cancel_url = operationsUrl;
    return { ...result, checkout };
  }
  return result;
});

function sumByCurrency(payments) {
  const amounts = {};
  for (const payment of payments) {
    amounts[payment.currency] = money((amounts[payment.currency] || 0) + payment.amount);
  }
  return amounts;
}

exports.sales = handle(async (req, { scope, today, timezone }) => {
  const [start, end] = period(req.query.from, req.query.to, today);
  const [orders, periodPayments] = await Promise.all([
    RestaurantOrder.find({ ...scope, ...between("createdAt", timezone, start, end) }).sort({ createdAt: -1 }).lean(),
    Payment.find({ ...scope, purpose: "restaurant_order", restaurantOrder: { $exists: true }, paymentStatus: { $in: ["completed", "posted_to_folio"] },
      ...between("paymentDate", timezone, start, end)
    }).lean()
  ]);
  const placed = new Set(orders.map(order => String(order._id)));
  const earlierOrderIds = periodPayments.map(payment => payment.restaurantOrder)
    .filter(id => id && !placed.has(String(id)));
  const earlierOrders = await RestaurantOrder.find({ ...scope, _id: { $in: earlierOrderIds } }).lean();
  const historyOrders = [...orders, ...earlierOrders].sort((a, b) => b.createdAt - a.createdAt);
  const payments = await orderPayments(scope, historyOrders);
  const collected = periodPayments.filter(payment => payment.paymentStatus === "completed");
  const history = historyOrders.map(order => ({
    ...order, payment: payments.get(String(order._id)) || null
  }));
  const placedStatuses = orders.map(order => paymentStatus(payments.get(String(order._id))));
  const totals = sumByCurrency(orders.map(order => ({ currency: order.currency, amount: order.total })));
  const averages = Object.fromEntries(Object.entries(totals).map(([currency, total]) => [
    currency, money(total / orders.filter(order => order.currency === currency).length)
  ]));
  return {
    today, from: start, to: end, orders: orders.length,
    paidOrders: placedStatuses.filter(status => status === "completed").length,
    unpaidOrders: placedStatuses.filter(status => !["completed", "posted_to_folio"].includes(status)).length,
    folioOrders: placedStatuses.filter(status => status === "posted_to_folio").length,
    averageOrderValue: averages, collectedSales: sumByCurrency(collected),
    cash: sumByCurrency(collected.filter(payment => payment.paymentMethod === "Cash")),
    card: sumByCurrency(collected.filter(payment => payment.paymentMethod === "Card")),
    payHere: sumByCurrency(collected.filter(payment => payment.paymentMethod === "PayHere")),
    folioPosted: sumByCurrency(periodPayments.filter(payment => payment.paymentStatus === "posted_to_folio")),
    history
  };
});
