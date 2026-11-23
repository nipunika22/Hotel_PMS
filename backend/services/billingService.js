// backend/services/billingService.js
const mongoose = require("mongoose");
const Invoice = require("../models/Invoice");
const Reservation = require("../models/Reservation");
const Booking = require("../models/Booking");
const GuestExpense = require("../models/GuestExpense");
const Guest = require("../models/Guest");
const { runWithOptionalTransaction } = require("../utils/transactionHelper");
const { getActivePropertyId } = require("../middleware/propertyContext");

/**
 * Recalculates invoice totals (subtotal, taxes, discounts, total, payments, balanceDue, paymentStatus)
 * and keeps the parent Reservation and Booking totals and paymentStatus in sync.
 *
 * @param {Object} invoiceDoc - Mongoose Invoice document
 * @param {Object} [session] - Optional Mongoose transaction session
 * @returns {Promise<{ invoice: Object, reservation: Object|null }>}
 */
async function recalculateInvoiceTotals(invoiceDoc, session = null) {
  // Sum up all extraExpenses
  const totalExtraExpenses = (invoiceDoc.extraExpenses || []).reduce((sum, item) => {
    return sum + (Number(item.amount) || 0);
  }, 0);

  const roomCharges = Number(invoiceDoc.roomCharges) || 0;
  const subtotal = roomCharges + totalExtraExpenses;
  const taxAmount = Number(invoiceDoc.taxAmount) || 0;
  const discountAmount = Number(invoiceDoc.discountAmount) || 0;
  const totalAmount = Math.max(0, Math.round((subtotal + taxAmount - discountAmount) * 100) / 100);

  // Calculate total payments made from invoice.payments or advancePaid or Payment ledger
  let totalPaid = 0;
  if (Array.isArray(invoiceDoc.payments) && invoiceDoc.payments.length > 0) {
    totalPaid = invoiceDoc.payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  } else {
    totalPaid = Number(invoiceDoc.advancePaid) || 0;
  }

  // Double check canonical Payment records if available to ensure total accuracy
  if (invoiceDoc.reservation) {
    try {
      const Payment = require("../models/Payment");
      let pq = Payment.find({
        reservation: invoiceDoc.reservation,
        paymentStatus: { $in: ["completed", "partially_refunded"] }
      });
      if (session) pq = pq.session(session);
      const completedPayments = await pq.lean();

      if (completedPayments && completedPayments.length > 0) {
        const netPayments = completedPayments.reduce((sum, p) => {
          const net = (Number(p.amount) || 0) - (Number(p.refundAmount) || 0);
          return sum + Math.max(0, net);
        }, 0);
        if (netPayments > 0) {
          totalPaid = Math.max(totalPaid, netPayments);
        }
      }
    } catch (e) {
      // Non-fatal, use existing totalPaid
    }
  }

  const balanceDue = Math.max(0, Math.round((totalAmount - totalPaid) * 100) / 100);

  let paymentStatus = "Unpaid";
  if (balanceDue <= 0 && totalAmount > 0) {
    paymentStatus = "Paid";
  } else if (totalPaid > 0) {
    paymentStatus = "Partial";
  } else {
    paymentStatus = "Unpaid";
  }

  invoiceDoc.totalExtraExpenses = totalExtraExpenses;
  invoiceDoc.subtotal = subtotal;
  invoiceDoc.totalAmount = totalAmount;
  invoiceDoc.totalPaid = totalPaid;
  invoiceDoc.balanceDue = balanceDue;
  invoiceDoc.paymentStatus = paymentStatus;

  await invoiceDoc.save({ session });

  // Synchronize reservation
  let reservation = null;
  if (invoiceDoc.reservation) {
    let rq = Reservation.findById(invoiceDoc.reservation);
    if (session) rq = rq.session(session);
    reservation = await rq;

    if (reservation) {
      reservation.totalAmount = totalAmount;
      if (reservation.paymentStatus !== "Refunded") {
        if (balanceDue <= 0 && totalAmount > 0) {
          reservation.paymentStatus = "Paid";
        } else if (totalPaid > 0) {
          reservation.paymentStatus = "Partial";
        } else {
          reservation.paymentStatus = "Pending";
        }
      }
      await reservation.save({ session });

      // Synchronize counterpart booking if present
      let bq = Booking.findOne({ reservation: reservation._id });
      if (session) bq = bq.session(session);
      const booking = await bq;
      if (booking) {
        booking.totalPrice = totalAmount;
        if (booking.paymentStatus !== "Refunded") {
          booking.paymentStatus = reservation.paymentStatus;
        }
        await booking.save({ session });
      }
    }
  }

  return { invoice: invoiceDoc, reservation };
}

/**
 * Gets the existing invoice for a reservation, or safely creates one.
 * Never creates duplicate invoices for the same reservation.
 *
 * @param {string|ObjectId} reservationId
 * @param {string|ObjectId} [staffUserId]
 * @param {Object} [session]
 * @returns {Promise<Object>} Mongoose Invoice document
 */
async function getOrCreateInvoiceForReservation(reservationId, staffUserId = null, session = null) {
  let invoiceQuery = Invoice.findOne({ reservation: reservationId });
  if (session) invoiceQuery = invoiceQuery.session(session);
  let invoice = await invoiceQuery;

  if (invoice) {
    return invoice;
  }

  // Find reservation with populated guest
  let rq = Reservation.findById(reservationId).populate("guest").populate("room").populate("travelAgent");
  if (session) rq = rq.session(session);
  const reservation = await rq;

  if (!reservation) {
    const error = new Error("Reservation not found");
    error.statusCode = 404;
    throw error;
  }

  let propertyId = reservation.property;
  if (!propertyId) {
    propertyId = await getActivePropertyId();
  }

  const checkIn = new Date(reservation.checkInDate);
  const checkOut = new Date(reservation.checkOutDate);
  const diffDays = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
  const numberOfNights = reservation.numberOfNights || (diffDays > 0 ? diffDays : 1);

  const roomCharges = Number(
    reservation.roomCharges ||
    (reservation.ratePerNight ? reservation.ratePerNight * numberOfNights : reservation.totalAmount) ||
    0
  );
  const taxAmount = Number(reservation.taxAmount || 0);
  const discountAmount = Number(reservation.discountAmount || 0);
  const advancePaid = Number(reservation.advancePayment || 0);

  // Retrieve any payments already recorded in canonical Payment ledger
  let paymentsArray = [];
  let totalPaymentsMade = 0;
  try {
    const Payment = require("../models/Payment");
    let pq = Payment.find({
      reservation: reservation._id,
      paymentStatus: { $in: ["completed", "partially_refunded"] }
    });
    if (session) pq = pq.session(session);
    const completedPayments = await pq.lean();

    if (completedPayments && completedPayments.length > 0) {
      totalPaymentsMade = completedPayments.reduce(
        (s, p) => s + Math.max(0, (Number(p.amount) || 0) - (Number(p.refundAmount) || 0)),
        0
      );
      paymentsArray = completedPayments.map((p) => ({
        paymentDate: p.createdAt || new Date(),
        amount: Number(p.amount) || 0,
        paymentMethod: p.paymentMethod || "Cash",
        transactionId: p.transactionId || p.transactionReference || "",
        notes: p.notes || "Recorded payment"
      }));
    }
  } catch (e) {
    // Non-fatal fallback
  }

  const effectivePaid = totalPaymentsMade > 0 ? totalPaymentsMade : advancePaid;
  const guestAddress = reservation.guest?.address || {};
  const guestName = reservation.guest
    ? `${reservation.guest.firstName || ""} ${reservation.guest.lastName || ""}`.trim()
    : "Valued Guest";

  const subtotal = roomCharges;
  const totalAmount = Math.max(0, Math.round((subtotal + taxAmount - discountAmount) * 100) / 100);
  const balanceDue = Math.max(0, Math.round((totalAmount - effectivePaid) * 100) / 100);

  invoice = new Invoice({
    property: propertyId,
    reservation: reservation._id,
    guest: reservation.guest?._id || reservation.guest,
    checkInDate: reservation.checkInDate,
    checkOutDate: reservation.checkOutDate,
    numberOfNights,
    roomCharges,
    extraExpenses: [],
    totalExtraExpenses: 0,
    subtotal,
    taxPercentage: roomCharges > 0 ? Math.round(((taxAmount / roomCharges) * 100) * 100) / 100 : 0,
    taxAmount,
    discountAmount,
    discountReason: reservation.discountReason,
    totalAmount,
    advancePaid: effectivePaid,
    totalPaid: effectivePaid,
    balanceDue,
    paymentStatus: balanceDue <= 0 ? "Paid" : effectivePaid > 0 ? "Partial" : "Unpaid",
    payments: paymentsArray,
    billingAddress: {
      name: guestName,
      street: guestAddress.street || "",
      city: guestAddress.city || "",
      state: guestAddress.state || "",
      country: guestAddress.country || "",
      zipCode: guestAddress.zipCode || ""
    },
    companyName: reservation.guest?.company || "",
    travelAgent: reservation.travelAgent?._id,
    generatedBy: staffUserId || reservation.createdBy
  });

  await invoice.save({ session });
  return invoice;
}

/**
 * Adds a guest expense to the reservation's invoice / bill.
 * Handles idempotency, duplicate prevention, and balance updates.
 *
 * @param {Object} options
 * @param {string|ObjectId} options.expenseId
 * @param {string|ObjectId} [options.staffUserId]
 * @param {string|ObjectId} [options.reservationId]
 * @param {Object} [options.session]
 * @returns {Promise<Object>}
 */
async function addExpenseToBill({ expenseId, staffUserId = null, reservationId = null, session = null }) {
  const runner = async (activeSession) => {
    let eq = GuestExpense.findById(expenseId);
    if (activeSession) eq = eq.session(activeSession);
    const expense = await eq;

    if (!expense) {
      const error = new Error("Expense not found");
      error.statusCode = 404;
      throw error;
    }

    const targetReservationId = reservationId || expense.reservation;
    if (!targetReservationId) {
      const error = new Error("No reservation linked to this expense");
      error.statusCode = 400;
      throw error;
    }

    let rq = Reservation.findById(targetReservationId);
    if (activeSession) rq = rq.session(activeSession);
    const reservation = await rq;

    if (!reservation) {
      const error = new Error("Reservation not found");
      error.statusCode = 404;
      throw error;
    }

    if (reservation.status === "Cancelled") {
      const error = new Error("Cannot add expense to a cancelled reservation");
      error.statusCode = 400;
      throw error;
    }

    if (expense.guest && reservation.guest && expense.guest.toString() !== reservation.guest.toString()) {
      const error = new Error("Expense guest does not match reservation guest");
      error.statusCode = 400;
      throw error;
    }

    if (expense.paymentStatus === "Paid") {
      const error = new Error("Cannot add an expense that is already paid directly to bill");
      error.statusCode = 400;
      throw error;
    }

    // Get or safely create the Invoice for the reservation
    const invoice = await getOrCreateInvoiceForReservation(reservation._id, staffUserId, activeSession);

    // Check if expense is already in this invoice's extraExpenses (idempotency check)
    const isAlreadyInInvoice = (invoice.extraExpenses || []).some((item) => {
      const itemExpId = (item.expense?._id || item.expense || item.expenseId?._id || item.expenseId || "").toString();
      return itemExpId === expense._id.toString();
    });

    if (isAlreadyInInvoice) {
      // Ensure expense record reflects "Added to Bill"
      if (expense.paymentStatus !== "Added to Bill" || !expense.invoice) {
        expense.paymentStatus = "Added to Bill";
        expense.invoice = invoice._id;
        expense.billedAt = expense.billedAt || new Date();
        expense.billedBy = expense.billedBy || staffUserId || expense.addedBy;
        await expense.save({ session: activeSession });
      }
      return {
        success: true,
        isIdempotentReplay: true,
        message: "Expense is already added to this bill",
        invoice,
        expense
      };
    }

    // If expense was already added to a DIFFERENT invoice
    if (
      expense.paymentStatus === "Added to Bill" &&
      expense.invoice &&
      expense.invoice.toString() !== invoice._id.toString()
    ) {
      const error = new Error("Expense is already attached to a different invoice");
      error.statusCode = 400;
      throw error;
    }

    // Prepare line item for invoice
    const expenseAmount = Number(expense.totalAmount ?? expense.amount ?? 0);
    const expenseItem = {
      expense: expense._id,
      expenseId: expense._id,
      category: expense.category || "Other",
      description: expense.description || `${expense.category} expense`,
      date: expense.expenseDate || new Date(),
      amount: expenseAmount,
      quantity: expense.quantity || 1,
      unitPrice: expense.unitPrice || expenseAmount,
      taxPercentage: expense.taxPercentage || 0,
      taxAmount: expense.taxAmount || 0
    };

    invoice.extraExpenses.push(expenseItem);

    // Update expense document
    expense.paymentStatus = "Added to Bill";
    expense.invoice = invoice._id;
    expense.billedAt = new Date();
    if (staffUserId) {
      expense.billedBy = staffUserId;
    }
    if (!expense.reservation) {
      expense.reservation = reservation._id;
    }
    if (!expense.property && reservation.property) {
      expense.property = reservation.property;
    }
    await expense.save({ session: activeSession });

    // Recalculate totals
    const result = await recalculateInvoiceTotals(invoice, activeSession);

    // Increment guest totalSpent if guest exists
    if (reservation.guest) {
      try {
        await Guest.findByIdAndUpdate(
          reservation.guest,
          { $inc: { totalSpent: expenseAmount } },
          { session: activeSession }
        );
      } catch (guestErr) {
        console.warn("Could not update Guest totalSpent:", guestErr.message);
      }
    }

    return {
      success: true,
      message: "Expense successfully added to bill",
      invoice: result.invoice,
      reservation: result.reservation,
      expense
    };
  };

  if (session) {
    return await runner(session);
  }
  return await runWithOptionalTransaction(runner);
}

/**
 * Removes an expense from the bill / invoice and resets its status.
 *
 * @param {Object} options
 * @param {string|ObjectId} options.expenseId
 * @param {string|ObjectId} [options.staffUserId]
 * @param {Object} [options.session]
 * @returns {Promise<Object>}
 */
async function removeExpenseFromBill({ expenseId, staffUserId = null, session = null }) {
  const runner = async (activeSession) => {
    let eq = GuestExpense.findById(expenseId);
    if (activeSession) eq = eq.session(activeSession);
    const expense = await eq;

    if (!expense) {
      const error = new Error("Expense not found");
      error.statusCode = 404;
      throw error;
    }

    let invoice = null;
    if (expense.invoice) {
      let iq = Invoice.findById(expense.invoice);
      if (activeSession) iq = iq.session(activeSession);
      invoice = await iq;
    } else if (expense.reservation) {
      let iq = Invoice.findOne({ reservation: expense.reservation });
      if (activeSession) iq = iq.session(activeSession);
      invoice = await iq;
    }

    if (invoice && Array.isArray(invoice.extraExpenses)) {
      const initialCount = invoice.extraExpenses.length;
      invoice.extraExpenses = invoice.extraExpenses.filter((item) => {
        const itemExpId = (item.expense?._id || item.expense || item.expenseId?._id || item.expenseId || "").toString();
        return itemExpId !== expense._id.toString();
      });

      if (invoice.extraExpenses.length !== initialCount) {
        await recalculateInvoiceTotals(invoice, activeSession);
      }
    }

    const previousAmount = Number(expense.totalAmount ?? expense.amount ?? 0);
    expense.paymentStatus = "Pending";
    expense.invoice = undefined;
    expense.billedAt = undefined;
    expense.billedBy = undefined;
    await expense.save({ session: activeSession });

    // Decrement guest totalSpent if needed
    if (expense.guest && previousAmount > 0) {
      try {
        await Guest.findByIdAndUpdate(
          expense.guest,
          { $inc: { totalSpent: -previousAmount } },
          { session: activeSession }
        );
      } catch (guestErr) {
        console.warn("Could not revert Guest totalSpent:", guestErr.message);
      }
    }

    return {
      success: true,
      message: "Expense removed from bill",
      invoice,
      expense
    };
  };

  if (session) {
    return await runner(session);
  }
  return await runWithOptionalTransaction(runner);
}

/**
 * Synchronizes all expenses marked "Added to Bill" for a reservation into its invoice.
 * Used during checkout and detail views to guarantee invoice completeness.
 *
 * @param {string|ObjectId} reservationId
 * @param {string|ObjectId} [staffUserId]
 * @param {Object} [session]
 * @returns {Promise<Object>} Updated Mongoose Invoice document
 */
async function syncAllBilledExpensesForReservation(reservationId, staffUserId = null, session = null) {
  const runner = async (activeSession) => {
    const invoice = await getOrCreateInvoiceForReservation(reservationId, staffUserId, activeSession);

    let eq = GuestExpense.find({
      reservation: reservationId,
      paymentStatus: "Added to Bill"
    });
    if (activeSession) eq = eq.session(activeSession);
    const billedExpenses = await eq;

    let modified = false;
    for (const exp of billedExpenses) {
      const isAlreadyInInvoice = (invoice.extraExpenses || []).some((item) => {
        const itemExpId = (item.expense?._id || item.expense || item.expenseId?._id || item.expenseId || "").toString();
        return itemExpId === exp._id.toString();
      });

      if (!isAlreadyInInvoice) {
        const expenseAmount = Number(exp.totalAmount ?? exp.amount ?? 0);
        invoice.extraExpenses.push({
          expense: exp._id,
          expenseId: exp._id,
          category: exp.category || "Other",
          description: exp.description || `${exp.category} expense`,
          date: exp.expenseDate || new Date(),
          amount: expenseAmount,
          quantity: exp.quantity || 1,
          unitPrice: exp.unitPrice || expenseAmount,
          taxPercentage: exp.taxPercentage || 0,
          taxAmount: exp.taxAmount || 0
        });
        exp.invoice = invoice._id;
        if (!exp.billedAt) exp.billedAt = new Date();
        await exp.save({ session: activeSession });
        modified = true;
      }
    }

    // If items were added, recalculate totals
    if (modified || invoice.isModified()) {
      await recalculateInvoiceTotals(invoice, activeSession);
    }

    return invoice;
  };

  if (session) {
    return await runner(session);
  }
  return await runWithOptionalTransaction(runner);
}

module.exports = {
  recalculateInvoiceTotals,
  getOrCreateInvoiceForReservation,
  addExpenseToBill,
  removeExpenseFromBill,
  syncAllBilledExpensesForReservation
};
