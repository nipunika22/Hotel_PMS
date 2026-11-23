// backend/services/paymentService.js
const mongoose = require("mongoose");
const Payment = require("../models/Payment");
const Reservation = require("../models/Reservation");
const Booking = require("../models/Booking");
const Invoice = require("../models/Invoice");
const Guest = require("../models/Guest");
const User = require("../models/User");
const { runWithOptionalTransaction } = require("../utils/transactionHelper");
const { getActivePropertyId } = require("../middleware/propertyContext");

/**
 * Normalizes payment methods into the supported Payment schema enum:
 * ["Cash", "Card", "Online", "PayHere", "Bank Transfer"]
 */
function normalizePaymentMethod(method) {
  if (!method) return "Cash";
  const cleaned = String(method).trim().toLowerCase();
  if (cleaned.includes("cash")) return "Cash";
  if (cleaned.includes("card") || cleaned.includes("credit") || cleaned.includes("debit") || cleaned.includes("visa") || cleaned.includes("master")) {
    return "Card";
  }
  if (cleaned.includes("bank") || cleaned.includes("transfer") || cleaned.includes("cheque") || cleaned.includes("net banking")) {
    return "Bank Transfer";
  }
  if (cleaned.includes("payhere")) return "PayHere";
  if (cleaned.includes("online") || cleaned.includes("upi")) return "Online";
  return "Cash";
}

/**
 * Calculates current paid amount and outstanding balance for a reservation
 * by querying completed transactions from the canonical Payment ledger.
 */
async function getReservationFinancials(reservationId, session = null) {
  const query = {
    reservation: reservationId,
    paymentStatus: { $in: ["completed", "partially_refunded"] }
  };
  let paymentQuery = Payment.find(query);
  if (session) paymentQuery = paymentQuery.session(session);
  const completedPayments = await paymentQuery.lean();

  const collectedFromPayments = completedPayments.reduce((sum, p) => {
    const net = (p.amount || 0) - (p.refundAmount || 0);
    return sum + Math.max(0, net);
  }, 0);

  return {
    collectedFromPayments,
    completedPayments
  };
}

/**
 * Unified Payment Recording Operation
 * Atomically records a payment against a reservation/booking/invoice,
 * updates the canonical Payment ledger, and synchronizes all dependent models.
 *
 * @param {Object} params
 * @param {string|ObjectId} [params.reservationId]
 * @param {string|ObjectId} [params.bookingId]
 * @param {string|ObjectId} [params.invoiceId]
 * @param {number} params.amount
 * @param {string} params.paymentMethod
 * @param {string} [params.transactionReference]
 * @param {string} [params.transactionId]
 * @param {string} [params.notes]
 * @param {string|ObjectId} params.receivedBy - Staff user recording the payment
 * @param {string} [params.idempotencyKey]
 * @param {Date} [params.paymentDate]
 * @param {string|ObjectId} [params.propertyId]
 */
async function recordPayment(params) {
  const {
    reservationId,
    bookingId,
    invoiceId,
    amount,
    paymentMethod,
    transactionReference,
    transactionId,
    notes,
    receivedBy,
    idempotencyKey,
    paymentDate,
    propertyId
  } = params;

  const paymentAmount = Number(amount);
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    const error = new Error("Payment amount must be greater than zero");
    error.statusCode = 400;
    throw error;
  }

  const normalizedMethod = normalizePaymentMethod(paymentMethod);
  const effectiveRef = transactionReference || transactionId || undefined;

  // Idempotency check: if an idempotency key was provided and already succeeded
  if (idempotencyKey) {
    const existing = await Payment.findOne({ idempotencyKey, paymentStatus: "completed" })
      .populate("user", "name email")
      .populate("reservation")
      .populate("booking");
    if (existing) {
      return {
        success: true,
        isIdempotentReplay: true,
        payment: existing,
        message: "Payment already processed with this idempotency key"
      };
    }
  }

  return await runWithOptionalTransaction(async (session) => {
    // 1. Resolve Target Reservation, Booking, and Invoice
    let reservation = null;
    let booking = null;
    let invoice = null;

    if (reservationId) {
      let q = Reservation.findById(reservationId).populate("guest");
      if (session) q = q.session(session);
      reservation = await q;
    }

    if (!reservation && bookingId) {
      let bq = Booking.findById(bookingId);
      if (session) bq = bq.session(session);
      booking = await bq;

      if (booking?.reservation) {
        let rq = Reservation.findById(booking.reservation).populate("guest");
        if (session) rq = rq.session(session);
        reservation = await rq;
      }
    }

    if (!reservation && invoiceId) {
      let iq = Invoice.findById(invoiceId);
      if (session) iq = iq.session(session);
      invoice = await iq;

      if (invoice?.reservation) {
        let rq = Reservation.findById(invoice.reservation).populate("guest");
        if (session) rq = rq.session(session);
        reservation = await rq;
      }
    }

    // Try to find counterpart Booking if we resolved Reservation first
    if (reservation && !booking) {
      let bq = Booking.findOne({ reservation: reservation._id });
      if (session) bq = bq.session(session);
      booking = await bq;
    }

    // Try to find counterpart Invoice if we resolved Reservation first
    if (reservation && !invoice) {
      let iq = Invoice.findOne({ reservation: reservation._id, status: { $ne: "Cancelled" } });
      if (session) iq = iq.session(session);
      invoice = await iq;
    }

    if (!reservation && !booking && !invoice) {
      const error = new Error("No valid reservation, booking, or invoice found to apply payment");
      error.statusCode = 404;
      throw error;
    }

    // 2. Prevent accidental duplicate rapid-fire submissions (within 3 seconds)
    if (reservation) {
      const recentDuplicate = await Payment.findOne({
        reservation: reservation._id,
        amount: paymentAmount,
        paymentMethod: normalizedMethod,
        paymentStatus: "completed",
        createdAt: { $gte: new Date(Date.now() - 3000) }
      });
      if (recentDuplicate) {
        return {
          success: true,
          isDuplicateSuppressed: true,
          payment: recentDuplicate,
          message: "Duplicate payment submission suppressed"
        };
      }
    }

    // 3. Compute Authoritative Total and Outstanding Balance
    const totalAmount = Number(
      reservation?.totalAmount ?? invoice?.totalAmount ?? booking?.totalPrice ?? 0
    );

    let currentPaid = 0;
    if (reservation) {
      const fin = await getReservationFinancials(reservation._id, session);
      currentPaid = fin.collectedFromPayments;
      // Handle legacy records where advancePayment was set before Payment docs were recorded
      if (currentPaid === 0 && Number(reservation.advancePayment) > 0) {
        currentPaid = Number(reservation.advancePayment);
      }
    } else if (invoice) {
      currentPaid = Number(invoice.totalPaid || 0);
    }

    const outstandingBalance = Math.max(0, totalAmount - currentPaid);

    if (outstandingBalance <= 0) {
      const error = new Error("This reservation is already fully paid (outstanding balance is 0)");
      error.statusCode = 400;
      throw error;
    }

    if (paymentAmount > outstandingBalance) {
      const error = new Error(
        `Payment amount (LKR ${paymentAmount.toLocaleString()}) exceeds the outstanding balance of LKR ${outstandingBalance.toLocaleString()}`
      );
      error.statusCode = 400;
      throw error;
    }

    // 4. Resolve Target User and Property
    let targetProperty =
      propertyId ||
      reservation?.property ||
      booking?.property ||
      invoice?.property;

    if (!targetProperty) {
      targetProperty = await getActivePropertyId();
    }

    let userDocId = booking?.user || null;
    if (!userDocId && reservation?.guest) {
      const guestObj = reservation.guest;
      userDocId = guestObj.user || null;
    }
    if (!userDocId && reservation?.createdBy) {
      userDocId = reservation.createdBy;
    }
    if (!userDocId && receivedBy) {
      userDocId = receivedBy;
    }

    // 5. Create Canonical Payment Document
    const payment = new Payment({
      property: targetProperty,
      user: userDocId,
      purpose: invoice ? "invoice_settlement" : "room_booking",
      amount: paymentAmount,
      currency: "LKR",
      paymentMethod: normalizedMethod,
      paymentStatus: "completed",
      confirmedAt: new Date(),
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      transactionId: effectiveRef,
      gateway: "none",
      gatewayMethod: normalizedMethod,
      idempotencyKey: idempotencyKey || undefined,
      notes: notes || "",
      reservation: reservation?._id || undefined,
      booking: booking?._id || undefined,
      invoice: invoice?._id || undefined,
      auditLog: [
        {
          action: "MANUAL_PAYMENT_RECORDED",
          performedBy: receivedBy,
          timestamp: new Date(),
          notes: notes || `Recorded ${normalizedMethod} payment of LKR ${paymentAmount.toLocaleString()}`,
          metadata: {
            amount: paymentAmount,
            method: normalizedMethod,
            reference: effectiveRef,
            receivedBy: receivedBy ? String(receivedBy) : null
          }
        }
      ]
    });

    await payment.save({ session });

    // 6. Compute New Statuses
    const newPaidAmount = currentPaid + paymentAmount;
    const newBalanceDue = Math.max(0, totalAmount - newPaidAmount);

    const isFullySettled = newBalanceDue <= 0;
    const reservationPaymentStatus = isFullySettled ? "Paid" : "Partial";
    const bookingPaymentStatus = isFullySettled ? "paid" : "pending";
    const invoicePaymentStatus = isFullySettled ? "Paid" : "Partial";

    // 7. Update Reservation
    if (reservation) {
      reservation.advancePayment = newPaidAmount;
      reservation.paymentStatus = reservationPaymentStatus;
      if (!reservation.paymentMethod || reservation.paymentMethod === "Unspecified") {
        reservation.paymentMethod = normalizedMethod;
      }
      await reservation.save({ session });
    }

    // 8. Update Booking
    if (booking) {
      booking.paymentStatus = bookingPaymentStatus;
      if (!booking.paymentMethod || booking.paymentMethod === "Cash") {
        booking.paymentMethod = normalizedMethod;
      }
      await booking.save({ session });
    }

    // 9. Update Invoice (if exists)
    if (invoice) {
      invoice.payments.push({
        paymentDate: payment.paymentDate,
        amount: paymentAmount,
        paymentMethod: normalizedMethod,
        transactionId: payment.paymentReference || effectiveRef,
        notes: notes || ""
      });
      invoice.totalPaid = newPaidAmount;
      invoice.balanceDue = newBalanceDue;
      invoice.paymentStatus = invoicePaymentStatus;
      await invoice.save({ session });
    }

    // Populate payment response
    const populatedPayment = await Payment.findById(payment._id)
      .populate("user", "name email phone")
      .populate("property", "name code")
      .populate({
        path: "reservation",
        select: "reservationNumber status paymentStatus totalAmount advancePayment paymentMethod"
      })
      .populate({
        path: "booking",
        select: "bookingStatus paymentStatus paymentMethod totalPrice"
      })
      .populate({
        path: "auditLog.performedBy",
        select: "name email role"
      });

    return {
      success: true,
      payment: populatedPayment || payment,
      paidAmount: newPaidAmount,
      balanceDue: newBalanceDue,
      paymentStatus: reservationPaymentStatus,
      isFullySettled
    };
  });
}

/**
 * Retrieve verified payment history for a given reservation
 */
async function getReservationPayments(reservationId) {
  return await Payment.find({
    reservation: reservationId
  })
    .populate("user", "name email")
    .populate("auditLog.performedBy", "name email role")
    .sort({ paymentDate: -1, createdAt: -1 });
}

module.exports = {
  normalizePaymentMethod,
  getReservationFinancials,
  recordPayment,
  getReservationPayments
};
