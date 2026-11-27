const mongoose = require("mongoose");
const Payment = require("../models/Payment");
const RestaurantReservation = require("../models/RestaurantReservation");
const RestaurantOrder = require("../models/RestaurantOrder");
const { withRoomLock, runWithOptionalTransaction } = require("../utils/transactionHelper");
const { mapPayHereStatusCode } = require("./payhereService");

const cents = value => Math.round(Number(value || 0) * 100);
const active = ["pending", "processing"];
const collected = ["completed", "partially_refunded"];
const mismatchReason = "Verified callback amount or currency differs from the requested payment";
const openReservations = ["PENDING", "CONFIRMED", "SEATED"];

function fail(statusCode, message) {
  throw Object.assign(new Error(message), { statusCode });
}

function reservationPaymentQuery(reservations) {
  return { restaurantReservation: reservations, purpose: { $ne: "restaurant_order" } };
}

async function getReservationPaymentsById(reservations) {
  const ids = reservations.map(reservation => reservation._id);
  const payments = ids.length
    ? await Payment.find(reservationPaymentQuery({ $in: ids })).sort({ createdAt: -1 }).lean() : [];
  const byReservation = new Map();
  for (const payment of payments) {
    const id = String(payment.restaurantReservation);
    if (!byReservation.has(id)) byReservation.set(id, []);
    byReservation.get(id).push(payment);
  }
  return byReservation;
}

function summarizeReservationPayment(reservation, payments) {
  const currency = reservation.reservationPriceCurrency || reservation.currency || "LKR";
  const relevant = payments.filter(payment =>
    (!payment.property || String(payment.property) === String(reservation.property)) &&
    (!payment.currency || payment.currency === currency)
  );
  const amountPaid = relevant.filter(payment => collected.includes(payment.paymentStatus))
    .reduce((sum, payment) => sum + Math.max(0, cents(payment.amount) - cents(payment.refundAmount)), 0);
  const savedTotal = reservation.reservationTotalPrice ?? (reservation.totalAmount > 0 ? reservation.totalAmount : null);
  const outstanding = savedTotal == null ? null : Math.max(0, cents(savedTotal) - amountPaid);
  let status = "Unpaid";
  if (savedTotal == null) status = "Historical - price unavailable";
  else if (outstanding === 0) status = "Paid";
  else if (amountPaid > 0) status = "Partially Paid";
  else if (relevant.some(payment => active.includes(payment.paymentStatus))) status = "Pending";
  else if (relevant.some(payment => payment.paymentStatus === "refunded")) status = "Refunded";
  else if (relevant.some(payment => payment.paymentStatus === "failed")) status = "Failed";
  return {
    savedReservationTotal: savedTotal, savedReservationCurrency: currency,
    paidAmount: amountPaid / 100, amountPaid: amountPaid / 100, paymentStatus: status,
    outstandingBalance: outstanding === null ? null : outstanding / 100,
    paymentReconciliationRequired: Boolean(reservation.paymentReconciliationRequired ||
      relevant.some(payment => payment.reconciliationRequired))
  };
}

function canReadReservation(user, reservation) {
  return !!user && !!reservation.user && String(reservation.user._id || reservation.user) === String(user._id || user.id);
}

function canManageDining(user) {
  return ["admin", "manager", "staff", "finance", "super_admin"].includes(user?.role) &&
    (user.role !== "admin" || !user.departmentAdmin ||
      [...(user.adminDepartments || []), ...(user.adminPermissions || [])].includes("dining"));
}

async function initiateReservationPayment({ targetId, property, user, notes }) {
  if (!property || typeof targetId !== "string" || !mongoose.isObjectIdOrHexString(targetId)) {
    fail(400, "A valid dining reservation and property are required");
  }
  return withRoomLock(`dining-reservation-payment:${targetId.toLowerCase()}`, () => runWithOptionalTransaction(async session => {
    const reservation = await RestaurantReservation.findOne({ _id: targetId, property })
      .session(session).populate("restaurant", "name");
    if (!reservation) fail(404, "Dining reservation not found");
    if (!canReadReservation(user, reservation) && !canManageDining(user)) fail(403, "Not authorized to pay for this reservation");
    if (!openReservations.includes(reservation.status)) fail(409, "This reservation cannot accept payments");
    // Write to the reservation in the same transaction so other API instances serialize initiation and callbacks.
    await RestaurantReservation.updateOne({ _id: reservation._id }, { $inc: { __v: 1 } }, { session });
    const payments = await Payment.find(reservationPaymentQuery(reservation._id)).session(session);
    const balance = summarizeReservationPayment(reservation, payments);
    if (!(balance.outstandingBalance > 0)) fail(409, "There is no outstanding dining reservation balance");
    if (reservation.billedToFolio || balance.paymentReconciliationRequired) fail(409, "This reservation requires payment reconciliation");
    const pending = payments.filter(payment => active.includes(payment.paymentStatus));
    if (pending.length) {
      const [payment] = pending;
      if (pending.length !== 1 || payment.paymentMethod !== "PayHere" ||
          String(payment.property) !== String(property) || payment.currency !== balance.savedReservationCurrency ||
          cents(payment.amount) !== cents(balance.outstandingBalance) || String(payment.user) !== String(user.id)) {
        fail(409, "An existing payment attempt must be reconciled before checkout can continue");
      }
      return { reservation, payment };
    }
    const payment = new Payment({
      property, user: user.id, purpose: "restaurant_dining", restaurantReservation: reservation._id,
      amount: balance.outstandingBalance, currency: balance.savedReservationCurrency,
      paymentMethod: "PayHere", paymentStatus: "pending", gateway: "PayHere", notes,
      auditLog: [{ action: "PAYMENT_INITIATED", performedBy: user.id }]
    });
    await payment.save({ session });
    return { reservation, payment };
  }));
}

function recoverablePayHereAttempt(payment) {
  return payment?.paymentMethod === "PayHere" &&
    ((payment.paymentStatus === "failed" && payment.gatewayStatusCode === -2) ||
      (payment.paymentStatus === "cancelled" && payment.gatewayStatusCode === -1));
}

async function recordDiningAmountMismatch(payment) {
  if (payment.purpose !== "restaurant_dining") return;
  await Payment.updateOne({ _id: payment._id, paymentStatus: { $in: active } }, {
    $set: { paymentStatus: "failed", reconciliationRequired: true, reconciliationReason: mismatchReason },
    $push: { auditLog: { action: "PAYMENT_FAILED_AMOUNT_MISMATCH" } }
  });
}

async function recordGatewayStatus(payment, status, session) {
  const code = Number(status.status_code);
  // Unknown or intermediate events never release a settlement; terminal success is replay-safe.
  if (![2, 0, -1, -2, -3].includes(code)) return;
  if (payment.paymentStatus === "refunded" ||
      (payment.paymentStatus === "completed" && code !== -3) ||
      (code === -3 && payment.paymentStatus !== "completed") ||
      (recoverablePayHereAttempt(payment) && code !== 2) ||
      (code === 0 && active.includes(payment.paymentStatus))) return;
  payment.paymentStatus = mapPayHereStatusCode(code);
  payment.gatewayStatusCode = code;
  payment.gatewayTransactionId = status.payment_id || payment.paymentReference;
  payment.transactionId = payment.gatewayTransactionId;
  payment.gatewayMethod = status.method;
  payment.gatewayStatusMessage = status.status_message;
  if (code === 2) {
    payment.confirmedAt = payment.paymentDate = new Date();
    if (payment.reconciliationReason === mismatchReason) {
      payment.reconciliationRequired = false;
      payment.reconciliationReason = undefined;
    }
  }
  if (code === -3) payment.refundAmount = payment.amount;
  payment.auditLog.push({ action: `PAYHERE_${payment.paymentStatus.toUpperCase()}` });
  await payment.save({ session });
}

async function flagPayment(payment, reason, session) {
  if (payment.reconciliationRequired) return;
  payment.set({ reconciliationRequired: true, reconciliationReason: reason });
  payment.auditLog.push({ action: "DINING_PAYMENT_RECONCILIATION_REQUIRED", notes: reason });
  await payment.save({ session });
}

async function applyDiningCallback(original, status) {
  const isOrder = original.purpose === "restaurant_order";
  const id = isOrder ? original.restaurantOrder || original.previousRestaurantOrder : original.restaurantReservation;
  if (!id) fail(404, "Payment target not found");
  const Model = isOrder ? RestaurantOrder : RestaurantReservation;
  const run = isOrder ? work => mongoose.connection.transaction(work) : runWithOptionalTransaction;
  await withRoomLock(`dining-${isOrder ? "order" : "reservation"}-payment:${id}`, () => run(async session => {
    const target = await Model.findOneAndUpdate(
      { _id: id, ...(original.property ? { property: original.property } : {}) },
      { $inc: { __v: 1 } }, { session, new: true }
    );
    const payment = await Payment.findById(original._id).session(session);
    if (!target || !payment || payment.paymentMethod !== "PayHere") fail(404, "Payment target not found");
    const previouslyCollected = collected.includes(payment.paymentStatus);
    await recordGatewayStatus(payment, status, session);

    if (isOrder) {
      if (payment.previousRestaurantOrder && payment.paymentStatus === "completed") {
        await flagPayment(payment, "A superseded PayHere attempt collected funds", session);
        await RestaurantOrder.updateOne({ _id: id }, { paymentReconciliationRequired: true }, { session });
      }
      return;
    }

    const payments = await Payment.find(reservationPaymentQuery(id)).session(session);
    const totals = summarizeReservationPayment(target, payments);
    const collectedHere = collected.includes(payment.paymentStatus);
    const otherAttempt = payments.some(row => !row._id.equals(payment._id) && active.includes(row.paymentStatus));
    const terminalArrival = !previouslyCollected && !openReservations.includes(target.status);
    if (collectedHere && (terminalArrival || target.billedToFolio ||
        otherAttempt || totals.paidAmount > (totals.savedReservationTotal ?? 0))) {
      await flagPayment(payment, terminalArrival
        ? "Payment received for a terminal dining reservation"
        : "Dining reservation settlement requires balance or duplicate-attempt review", session);
    }
    target.paidAmount = totals.paidAmount;
    if (totals.paymentStatus !== "Historical - price unavailable") target.paymentStatus = totals.paymentStatus;
    if (payment.reconciliationRequired || totals.paymentReconciliationRequired) target.paymentReconciliationRequired = true;
    await target.save({ session });
  }));
}

module.exports = {
  applyDiningCallback, recordDiningAmountMismatch, initiateReservationPayment, recoverablePayHereAttempt,
  reservationPaymentQuery, summarizeReservationPayment, getReservationPaymentsById, canReadReservation
};
