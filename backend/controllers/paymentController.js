// backend/controllers/paymentController.js
const mongoose = require("mongoose");
const Payment = require("../models/Payment");
const Booking = require("../models/Booking");
const Reservation = require("../models/Reservation");
const RestaurantReservation = require("../models/RestaurantReservation");
const EventBooking = require("../models/EventBooking");
const Invoice = require("../models/Invoice");
const Property = require("../models/Property");
const User = require("../models/User");
const { buildPropertyFilter, getActivePropertyId } = require("../middleware/propertyContext");
const {
  getPayHereConfig,
  formatPayHereAmount,
  generatePaymentHash,
  verifyNotificationSignature,
  mapPayHereStatusCode
} = require("../services/payhereService");

/**
 * Helper: Find authoritative business record and calculate amount
 */
const resolveBusinessEntity = async (purpose, targetId, sessionUser) => {
  let record = null;
  let amount = 0;
  let currency = "LKR";
  let title = "Serendib Sanctuary Hospitality Service";
  let propertyId = null;

  switch (purpose) {
    case "room_booking": {
      record = await Booking.findById(targetId)
        .populate("room", "roomNumber roomType basePrice property")
        .populate("reservation");
      if (!record) throw new Error("Room booking not found");
      // Security: verify user authorization
      if (sessionUser.role !== "admin" && sessionUser.role !== "staff" && sessionUser.role !== "finance" && record.user.toString() !== sessionUser.id) {
        const err = new Error("Not authorized to pay for this booking");
        err.statusCode = 403;
        throw err;
      }
      amount = Number(record.totalPrice || 0);
      propertyId = record.property || record.room?.property;
      title = `Serendib Sanctuary Stay — Room ${record.room?.roomNumber || ""} (${record.room?.roomType || "Suite"})`;
      break;
    }

    case "restaurant_dining": {
      record = await RestaurantReservation.findById(targetId).populate("restaurant", "name property");
      if (!record) throw new Error("Restaurant dining reservation not found");
      if (sessionUser.role !== "admin" && sessionUser.role !== "staff" && sessionUser.role !== "finance" && record.user && record.user.toString() !== sessionUser.id) {
        const err = new Error("Not authorized to pay for this dining reservation");
        err.statusCode = 403;
        throw err;
      }
      amount = Number(record.totalAmount || 0);
      currency = record.currency || "LKR";
      propertyId = record.property || record.restaurant?.property;
      title = `Dining at ${record.restaurant?.name || "Serendib Restaurant"} — Ref ${record.confirmationNumber}`;
      break;
    }

    case "event_booking": {
      record = await EventBooking.findById(targetId).populate("venue", "name property");
      if (!record) throw new Error("Event booking request not found");
      if (sessionUser.role !== "admin" && sessionUser.role !== "staff" && sessionUser.role !== "finance" && record.user && record.user.toString() !== sessionUser.id) {
        const err = new Error("Not authorized to pay for this event booking");
        err.statusCode = 403;
        throw err;
      }
      amount = Number(record.estimatedPrice || 0);
      currency = record.currency || "LKR";
      propertyId = record.property || record.venue?.property;
      title = `Event Booking — ${record.venueName || record.venue?.name || "Sanctuary Venue"} (${record.eventType})`;
      break;
    }

    case "invoice_settlement": {
      record = await Invoice.findById(targetId).populate("guest");
      if (!record) throw new Error("Invoice not found");
      amount = Number(record.balanceDue || record.totalAmount || 0);
      propertyId = record.property;
      title = `Invoice Settlement — #${record.invoiceNumber}`;
      break;
    }

    default:
      throw new Error(`Unsupported payment purpose: ${purpose}`);
  }

  if (amount <= 0) {
    const err = new Error("Payable amount must be greater than zero");
    err.statusCode = 400;
    throw err;
  }

  return { record, amount, currency, title, propertyId };
};

/**
 * 1. INITIATE PAYMENT (POST /api/payments/initiate)
 * Generates secure PayHere checkout parameters and hash on the server.
 */
exports.initiatePayment = async (req, res) => {
  const { purpose = "room_booking", targetId, customAmount, notes } = req.body;

  if (!targetId) {
    return res.status(400).json({ error: "Target record ID is required" });
  }

  try {
    const { record, amount: authoritativeAmount, currency, title, propertyId } = await resolveBusinessEntity(
      purpose,
      targetId,
      req.user
    );

    // If already paid
    if (purpose === "room_booking" && record.paymentStatus === "paid") {
      return res.status(400).json({ error: "This booking has already been paid for." });
    }

    // Effective payment amount (authoritative)
    const payableAmount = authoritativeAmount;
    const targetPropertyId = propertyId || req.propertyId || (await getActivePropertyId());

    // Check for an existing pending payment for this exact purpose & record
    const query = {
      user: req.user.id,
      purpose,
      paymentStatus: "pending"
    };
    if (purpose === "room_booking") query.booking = targetId;
    if (purpose === "restaurant_dining") query.restaurantReservation = targetId;
    if (purpose === "event_booking") query.eventBooking = targetId;
    if (purpose === "invoice_settlement") query.invoice = targetId;

    let payment = await Payment.findOne(query);

    if (!payment) {
      payment = new Payment({
        property: targetPropertyId,
        user: req.user.id,
        purpose,
        amount: payableAmount,
        currency,
        paymentMethod: "PayHere",
        paymentStatus: "pending",
        gateway: "PayHere",
        notes: notes || "",
        ...(purpose === "room_booking" && { booking: targetId, reservation: record.reservation?._id || record.reservation }),
        ...(purpose === "restaurant_dining" && { restaurantReservation: targetId }),
        ...(purpose === "event_booking" && { eventBooking: targetId }),
        ...(purpose === "invoice_settlement" && { invoice: targetId }),
        auditLog: [
          {
            action: "PAYMENT_INITIATED",
            performedBy: req.user.id,
            timestamp: new Date(),
            notes: `Checkout initiated for ${purpose} (${payableAmount} ${currency})`
          }
        ]
      });
      await payment.save();
    } else {
      // Refresh amount in case changed server-side
      payment.amount = payableAmount;
      payment.currency = currency;
      payment.auditLog.push({
        action: "PAYMENT_REINITIATED",
        performedBy: req.user.id,
        timestamp: new Date(),
        notes: `Checkout re-initiated for ${purpose}`
      });
      await payment.save();
    }

    // Retrieve user contact details for checkout
    const currentUser = await User.findById(req.user.id);
    const firstName = currentUser?.name?.split(" ")[0] || "Valued";
    const lastName = currentUser?.name?.split(" ").slice(1).join(" ") || "Guest";
    const email = currentUser?.email || req.user.email || "";
    const phone = currentUser?.phone || req.user.phone || "0770000000";
    const address = currentUser?.address || "Serendib Guest Residence";

    const config = getPayHereConfig();
    const orderId = payment.paymentReference;
    const hash = generatePaymentHash(orderId, payableAmount, currency);

    // PayHere checkout payload
    const payHereParams = {
      sandbox: config.isSandbox,
      merchant_id: config.merchantId,
      return_url: `${config.frontendBaseUrl}/payment/success?ref=${orderId}`,
      cancel_url: `${config.frontendBaseUrl}/payment/cancel?ref=${orderId}`,
      notify_url: `${config.backendBaseUrl}/api/payments/payhere/notify`,
      order_id: orderId,
      items: title,
      amount: formatPayHereAmount(payableAmount),
      currency: currency.toUpperCase(),
      hash: hash,
      first_name: firstName,
      last_name: lastName,
      email: email,
      phone: phone,
      address: address,
      city: "Colombo",
      country: "Sri Lanka",
      custom_1: purpose,
      custom_2: String(targetId)
    };

    res.status(200).json({
      success: true,
      paymentId: payment._id,
      paymentReference: payment.paymentReference,
      amount: payableAmount,
      currency,
      checkoutUrl: config.checkoutUrl,
      payHereParams
    });
  } catch (err) {
    console.error("initiatePayment error:", err);
    res.status(err.statusCode || 500).json({ error: err.message || "Failed to initiate payment" });
  }
};

/**
 * 2. PAYHERE WEBHOOK / NOTIFY_URL (POST /api/payments/payhere/notify)
 * Official server-to-server confirmation from PayHere.
 */
exports.handlePayHereWebhook = async (req, res) => {
  try {
    const {
      merchant_id,
      order_id,
      payment_id,
      payhere_amount,
      payhere_currency,
      status_code,
      md5sig,
      method,
      status_message,
      custom_1,
      custom_2
    } = req.body;

    if (!merchant_id || !order_id || !payhere_amount || !status_code || !md5sig) {
      return res.status(400).send("Missing required PayHere notification parameters");
    }

    // Verify cryptographic signature
    const isValidSignature = verifyNotificationSignature({
      merchantId: merchant_id,
      orderId: order_id,
      payhereAmount: payhere_amount,
      payhereCurrency: payhere_currency,
      statusCode: status_code,
      receivedMd5sig: md5sig
    });

    if (!isValidSignature) {
      console.error(`[PAYHERE] Tampering detected! Invalid MD5 signature for Order ID: ${order_id}`);
      return res.status(400).send("Invalid signature");
    }

    // Find the associated Payment record by unique order_id (paymentReference)
    const payment = await Payment.findOne({ paymentReference: order_id });
    if (!payment) {
      console.warn(`[PAYHERE] Payment reference not found: ${order_id}`);
      return res.status(404).send("Payment reference not found");
    }

    // Amount & Currency verification against database
    const expectedAmount = formatPayHereAmount(payment.amount);
    const receivedAmount = formatPayHereAmount(payhere_amount);
    if (expectedAmount !== receivedAmount || (payment.currency && payment.currency.toUpperCase() !== payhere_currency.toUpperCase())) {
      console.error(`[PAYHERE] Amount/Currency mismatch! Expected ${expectedAmount} ${payment.currency}, received ${receivedAmount} ${payhere_currency}`);
      payment.paymentStatus = "failed";
      payment.notes = `Amount mismatch: expected ${expectedAmount}, received ${receivedAmount}`;
      payment.auditLog.push({
        action: "PAYMENT_FAILED_AMOUNT_MISMATCH",
        timestamp: new Date(),
        notes: `Gateway reported ${receivedAmount} ${payhere_currency}, database expected ${expectedAmount} ${payment.currency}`
      });
      await payment.save();
      return res.status(400).send("Amount or currency mismatch");
    }

    // Idempotency: If already completed, respond 200 without duplicate action
    if (payment.paymentStatus === "completed") {
      return res.status(200).send("Already confirmed");
    }

    const mappedStatus = mapPayHereStatusCode(status_code);

    payment.gatewayTransactionId = payment_id || order_id;
    payment.transactionId = payment_id || order_id;
    payment.gatewayStatusCode = Number(status_code);
    payment.gatewayMethod = method || "Card";
    payment.gatewayStatusMessage = status_message || "";
    payment.paymentStatus = mappedStatus;

    if (mappedStatus === "completed") {
      payment.confirmedAt = new Date();
      payment.auditLog.push({
        action: "PAYMENT_CONFIRMED_WEBHOOK",
        timestamp: new Date(),
        notes: `PayHere payment successfully confirmed via webhook. Gateway Ref: ${payment_id}, Method: ${method}`
      });

      // Synchronize related business record atomically
      if (payment.purpose === "room_booking" && payment.booking) {
        const booking = await Booking.findById(payment.booking);
        if (booking) {
          booking.paymentStatus = "paid";
          booking.paymentMethod = "Online";
          await booking.save();

          if (booking.reservation) {
            const reservation = await Reservation.findById(booking.reservation);
            if (reservation) {
              reservation.paymentStatus = "Paid";
              reservation.advancePayment = payment.amount;
              await reservation.save();
            }
          }
        }
      } else if (payment.purpose === "restaurant_dining" && payment.restaurantReservation) {
        const dining = await RestaurantReservation.findById(payment.restaurantReservation);
        if (dining) {
          dining.status = "CONFIRMED";
          dining.notes = (dining.notes ? dining.notes + " | " : "") + `Paid online via PayHere (${payment.paymentReference})`;
          await dining.save();
        }
      } else if (payment.purpose === "event_booking" && payment.eventBooking) {
        const eventBooking = await EventBooking.findById(payment.eventBooking);
        if (eventBooking) {
          eventBooking.status = "CONFIRMED";
          eventBooking.auditLog.push({
            action: "PAYMENT_CONFIRMED",
            timestamp: new Date(),
            notes: `Online deposit of ${payment.amount} LKR received via PayHere (${payment.paymentReference})`
          });
          await eventBooking.save();
        }
      } else if (payment.purpose === "invoice_settlement" && payment.invoice) {
        const invoice = await Invoice.findById(payment.invoice);
        if (invoice) {
          invoice.payments.push({
            paymentDate: new Date(),
            amount: payment.amount,
            paymentMethod: "PayHere Online",
            transactionId: payment_id || order_id,
            notes: `Settled via PayHere. Ref: ${payment.paymentReference}`
          });
          invoice.totalPaid = (invoice.totalPaid || 0) + payment.amount;
          invoice.balanceDue = Math.max(0, (invoice.totalAmount || 0) - invoice.totalPaid);
          invoice.paymentStatus = invoice.balanceDue === 0 ? "Paid" : "Partial";
          await invoice.save();
        }
      }
    } else {
      payment.auditLog.push({
        action: `PAYMENT_${mappedStatus.toUpperCase()}`,
        timestamp: new Date(),
        notes: `PayHere notification arrived with status ${status_code}: ${status_message || mappedStatus}`
      });
    }

    await payment.save();
    return res.status(200).send("OK");
  } catch (err) {
    console.error("handlePayHereWebhook error:", err);
    return res.status(500).send("Internal processing error");
  }
};

/**
 * 3. VERIFY PAYMENT STATUS (GET /api/payments/verify/:reference)
 * Customer return URL & polling verification.
 */
exports.verifyPaymentStatus = async (req, res) => {
  const { reference } = req.params;

  try {
    const payment = await Payment.findOne({ paymentReference: reference })
      .populate("user", "name email phone")
      .populate("property", "name code city address phone email")
      .populate({
        path: "booking",
        populate: { path: "room", select: "roomNumber roomType basePrice images" }
      })
      .populate("restaurantReservation")
      .populate("eventBooking")
      .populate("invoice");

    if (!payment) {
      return res.status(404).json({ error: "Payment record not found" });
    }

    // Customer can only view their own payment; Staff/Admin can view any
    if (
      req.user.role !== "admin" &&
      req.user.role !== "staff" &&
      req.user.role !== "finance" &&
      req.user.role !== "manager" &&
      req.user.role !== "super_admin" &&
      payment.user._id.toString() !== req.user.id
    ) {
      return res.status(403).json({ error: "Unauthorized access to payment details" });
    }

    res.json(payment);
  } catch (err) {
    res.status(500).json({ error: "Failed to verify payment status" });
  }
};

/**
 * 4. GET MY PAYMENTS (GET /api/payments/my-payments)
 * Customer portal payment history.
 */
exports.getMyPayments = async (req, res) => {
  try {
    const payments = await Payment.find({ user: req.user.id })
      .populate("property", "name city")
      .populate({
        path: "booking",
        populate: { path: "room", select: "roomNumber roomType" }
      })
      .populate("restaurantReservation", "confirmationNumber date time guestCount diningType")
      .populate("eventBooking", "confirmationNumber eventType date venueName")
      .populate("invoice", "invoiceNumber totalAmount balanceDue")
      .sort({ createdAt: -1 });

    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: "Failed to load customer payment history" });
  }
};

/**
 * 5. GET ALL PAYMENTS (GET /api/payments)
 * Admin & Financial Manager paginated transactions list with search and filters.
 */
exports.getPayments = async (req, res) => {
  try {
    const {
      status,
      purpose,
      startDate,
      endDate,
      search,
      page = 1,
      limit = 20
    } = req.query;

    const filter = buildPropertyFilter(req, {});

    if (status && status !== "ALL") {
      filter.paymentStatus = status.toLowerCase();
    }
    if (purpose && purpose !== "ALL") {
      filter.purpose = purpose;
    }
    if (startDate || endDate) {
      filter.paymentDate = {};
      if (startDate) filter.paymentDate.$gte = new Date(startDate);
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        filter.paymentDate.$lte = e;
      }
    }
    if (search) {
      const searchRegex = new RegExp(search.trim(), "i");
      filter.$or = [
        { paymentReference: searchRegex },
        { gatewayTransactionId: searchRegex },
        { transactionId: searchRegex }
      ];
    }

    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
    const total = await Payment.countDocuments(filter);

    const payments = await Payment.find(filter)
      .populate("user", "name email phone")
      .populate("property", "name code city")
      .populate({
        path: "booking",
        populate: { path: "room", select: "roomNumber roomType" }
      })
      .populate("restaurantReservation", "confirmationNumber date time customerName")
      .populate("eventBooking", "confirmationNumber eventType date venueName customerName")
      .populate("invoice", "invoiceNumber totalAmount balanceDue")
      .populate("refundedBy", "name email")
      .sort({ paymentDate: -1 })
      .skip(skip)
      .limit(Number(limit));

    res.json({
      payments,
      pagination: {
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit)) || 1,
        limit: Number(limit)
      }
    });
  } catch (err) {
    console.error("getPayments error:", err);
    res.status(500).json({ error: "Failed to load payments" });
  }
};

/**
 * 6. GET SINGLE PAYMENT (GET /api/payments/:id)
 */
exports.getPayment = async (req, res) => {
  const { id } = req.params;

  try {
    const payment = await Payment.findById(id)
      .populate("user", "name email phone address")
      .populate("property", "name code city address phone email")
      .populate({
        path: "booking",
        populate: { path: "room", select: "roomNumber roomType basePrice amenities" }
      })
      .populate("restaurantReservation")
      .populate("eventBooking")
      .populate("invoice")
      .populate("refundedBy", "name email");

    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    // Role check: customer can only view own payment
    if (
      req.user.role === "customer" &&
      payment.user._id.toString() !== req.user.id
    ) {
      return res.status(403).json({ error: "Not authorized to access this payment" });
    }

    res.json(payment);
  } catch (err) {
    res.status(500).json({ error: "Failed to load payment" });
  }
};

/**
 * 7. FINANCIAL ANALYTICS & DASHBOARD METRICS (GET /api/payments/financial-analytics)
 * Authoritative financial overview for Admin and Financial Manager.
 */
exports.getFinancialAnalytics = async (req, res) => {
  try {
    const { startDate, endDate, propertyId } = req.query;

    const baseFilter = buildPropertyFilter(req, {});
    if (propertyId && propertyId !== "ALL") {
      baseFilter.property = new mongoose.Types.ObjectId(propertyId);
    }
    if (startDate || endDate) {
      baseFilter.paymentDate = {};
      if (startDate) baseFilter.paymentDate.$gte = new Date(startDate);
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        baseFilter.paymentDate.$lte = e;
      }
    }

    // Confirmed Revenue & Volume (Gross Confirmed includes completed, partially_refunded, and refunded)
    const confirmedMatch = {
      ...baseFilter,
      paymentStatus: { $in: ["completed", "partially_refunded", "refunded"] }
    };
    const confirmedAgg = await Payment.aggregate([
      { $match: confirmedMatch },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" },
          count: { $sum: 1 }
        }
      }
    ]);

    const totalConfirmedRevenue = confirmedAgg[0]?.totalRevenue || 0;
    const totalConfirmedCount = confirmedAgg[0]?.count || 0;

    // Status breakdown
    const statusCounts = await Payment.aggregate([
      { $match: baseFilter },
      {
        $group: {
          _id: "$paymentStatus",
          count: { $sum: 1 },
          amount: { $sum: "$amount" }
        }
      }
    ]);

    const statusMap = {};
    statusCounts.forEach((s) => {
      statusMap[s._id] = { count: s.count, amount: s.amount };
    });

    // Refund totals
    const refundMatch = {
      ...baseFilter,
      paymentStatus: { $in: ["partially_refunded", "refunded"] }
    };
    const refundAgg = await Payment.aggregate([
      { $match: refundMatch },
      {
        $group: {
          _id: null,
          totalRefunded: { $sum: "$refundAmount" },
          count: { $sum: 1 }
        }
      }
    ]);
    const totalRefundedAmount = refundAgg[0]?.totalRefunded || 0;
    const totalRefundedCount = refundAgg[0]?.count || 0;

    const netRevenue = Math.max(0, totalConfirmedRevenue - totalRefundedAmount);

    // Revenue by Purpose (Rooms vs Restaurant vs Events vs Invoices)
    const purposeAgg = await Payment.aggregate([
      { $match: confirmedMatch },
      {
        $group: {
          _id: "$purpose",
          revenue: { $sum: "$amount" },
          count: { $sum: 1 }
        }
      }
    ]);

    // Revenue by Property
    const propertyAgg = await Payment.aggregate([
      { $match: confirmedMatch },
      {
        $group: {
          _id: "$property",
          revenue: { $sum: "$amount" },
          count: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: "properties",
          localField: "_id",
          foreignField: "_id",
          as: "propertyDetails"
        }
      },
      {
        $unwind: { path: "$propertyDetails", preserveNullAndEmptyArrays: true }
      },
      {
        $project: {
          propertyName: { $ifNull: ["$propertyDetails.name", "Default Property"] },
          revenue: 1,
          count: 1
        }
      }
    ]);

    // Revenue over time (Last 30 days or daily grouping)
    const timelineAgg = await Payment.aggregate([
      { $match: confirmedMatch },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$paymentDate" } },
          revenue: { $sum: "$amount" },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Payment Methods breakdown
    const methodAgg = await Payment.aggregate([
      { $match: confirmedMatch },
      {
        $group: {
          _id: { $ifNull: ["$gatewayMethod", "$paymentMethod"] },
          count: { $sum: 1 },
          revenue: { $sum: "$amount" }
        }
      }
    ]);

    res.json({
      summary: {
        totalConfirmedRevenue,
        totalConfirmedCount,
        pendingCount: statusMap.pending?.count || 0,
        pendingAmount: statusMap.pending?.amount || 0,
        failedCount: statusMap.failed?.count || 0,
        cancelledCount: statusMap.cancelled?.count || 0,
        totalRefundedAmount,
        totalRefundedCount,
        netRevenue
      },
      revenueByPurpose: purposeAgg,
      revenueByProperty: propertyAgg,
      timeline: timelineAgg,
      methods: methodAgg
    });
  } catch (err) {
    console.error("getFinancialAnalytics error:", err);
    res.status(500).json({ error: "Failed to generate financial analytics" });
  }
};

/**
 * 8. PROCESS REFUND (POST /api/payments/:id/refund)
 * Role restricted: admin, finance, super_admin.
 */
exports.processRefund = async (req, res) => {
  const { id } = req.params;
  const { amount, reason } = req.body;

  try {
    const payment = await Payment.findById(id);
    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    if (payment.paymentStatus !== "completed" && payment.paymentStatus !== "partially_refunded") {
      return res.status(400).json({ error: "Only completed payments can be refunded" });
    }

    const refundValue = Number(amount) || payment.amount;
    if (refundValue <= 0 || refundValue > payment.amount) {
      return res.status(400).json({ error: `Refund amount must be between 1 and ${payment.amount}` });
    }

    const newRefundTotal = (payment.refundAmount || 0) + refundValue;
    if (newRefundTotal > payment.amount) {
      return res.status(400).json({ error: "Total refunded exceeds payment amount" });
    }

    payment.refundAmount = newRefundTotal;
    payment.refundReason = reason || "Staff initiated refund";
    payment.refundDate = new Date();
    payment.refundReference = `REF-${Date.now().toString().slice(-6)}`;
    payment.refundedBy = req.user.id;
    payment.paymentStatus = newRefundTotal === payment.amount ? "refunded" : "partially_refunded";

    payment.auditLog.push({
      action: payment.paymentStatus === "refunded" ? "FULL_REFUND_PROCESSED" : "PARTIAL_REFUND_PROCESSED",
      performedBy: req.user.id,
      timestamp: new Date(),
      notes: `Refund of ${refundValue} ${payment.currency} processed. Reason: ${payment.refundReason}`
    });

    await payment.save();

    // If linked to Booking, update status
    if (payment.booking) {
      const booking = await Booking.findById(payment.booking);
      if (booking) {
        booking.paymentStatus = payment.paymentStatus === "refunded" ? "refunded" : "paid";
        await booking.save();
      }
    }

    res.json({
      message: `Refund of ${refundValue} ${payment.currency} processed successfully`,
      payment
    });
  } catch (err) {
    console.error("processRefund error:", err);
    res.status(500).json({ error: "Failed to process refund" });
  }
};

/**
 * 9. SIMULATE SANDBOX PAYMENT (POST /api/payments/simulate-sandbox-confirmation)
 * Development & test helper to test PayHere signature verification and state machine.
 */
exports.simulateSandboxPayment = async (req, res) => {
  const { paymentReference } = req.body;

  if (!paymentReference) {
    return res.status(400).json({ error: "paymentReference is required" });
  }

  const config = getPayHereConfig();
  if (!config.isSandbox && process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Simulation only permitted in Sandbox / Dev environment" });
  }

  try {
    const payment = await Payment.findOne({ paymentReference });
    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    // Generate real signature as PayHere server would
    const crypto = require("crypto");
    const secretHash = crypto.createHash("md5").update(config.merchantSecret).digest("hex").toUpperCase();
    const formattedAmount = formatPayHereAmount(payment.amount);
    const rawSig = `${config.merchantId}${payment.paymentReference}${formattedAmount}${payment.currency}2${secretHash}`;
    const md5sig = crypto.createHash("md5").update(rawSig).digest("hex").toUpperCase();

    // Dispatch internally through handlePayHereWebhook
    const mockReq = {
      body: {
        merchant_id: config.merchantId,
        order_id: payment.paymentReference,
        payment_id: `SIM-PH-${Date.now()}`,
        payhere_amount: formattedAmount,
        payhere_currency: payment.currency,
        status_code: 2,
        md5sig: md5sig,
        method: "VISA",
        status_message: "Sandbox test payment successfully authorized"
      }
    };

    let responseSent = false;
    const mockRes = {
      status: (code) => ({
        send: (msg) => {
          if (!responseSent) {
            responseSent = true;
            res.status(code).json({ status: code, message: msg, simulated: true });
          }
        }
      })
    };

    await exports.handlePayHereWebhook(mockReq, mockRes);
  } catch (err) {
    console.error("simulateSandboxPayment error:", err);
    res.status(500).json({ error: "Simulation failed: " + err.message });
  }
};

/**
 * 10. CREATE PAYMENT (Backward Compatibility for manual cash/staff entries)
 */
exports.createPayment = async (req, res) => {
  const { bookingId, amount, paymentMethod, transactionId, notes } = req.body;

  if (!bookingId || !amount || !paymentMethod) {
    return res.status(400).json({ error: "Booking ID, amount, and payment method are required" });
  }

  try {
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    // Verify user authorization
    if (req.user.role !== "admin" && req.user.role !== "staff" && req.user.role !== "finance" && booking.user.toString() !== req.user.id) {
      return res.status(403).json({ error: "Not authorized to create payment for this booking" });
    }

    const targetPropertyId = booking.property || req.propertyId || (await getActivePropertyId());

    const newPayment = new Payment({
      property: targetPropertyId,
      booking: bookingId,
      reservation: booking.reservation,
      user: booking.user,
      purpose: "room_booking",
      amount,
      currency: "LKR",
      paymentMethod,
      transactionId: transactionId || `MANUAL-${Date.now()}`,
      notes,
      paymentStatus: "completed",
      confirmedAt: new Date(),
      auditLog: [
        {
          action: "MANUAL_PAYMENT_RECORDED",
          performedBy: req.user.id,
          timestamp: new Date(),
          notes: notes || "Recorded via internal PMS"
        }
      ]
    });

    await newPayment.save();

    booking.paymentStatus = "paid";
    await booking.save();

    if (booking.reservation) {
      const reservation = await Reservation.findById(booking.reservation);
      if (reservation) {
        reservation.paymentStatus = "Paid";
        reservation.advancePayment = amount;
        await reservation.save();
      }
    }

    const payment = await Payment.findById(newPayment._id)
      .populate("user", "name email")
      .populate({
        path: "booking",
        populate: { path: "room", select: "roomNumber roomType" }
      });

    res.status(201).json(payment);
  } catch (err) {
    res.status(500).json({ error: "Failed to create payment" });
  }
};

/**
 * 11. UPDATE PAYMENT
 */
exports.updatePayment = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  try {
    const payment = await Payment.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true
    })
      .populate("user", "name email")
      .populate({
        path: "booking",
        populate: { path: "room", select: "roomNumber roomType" }
      });

    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    res.json(payment);
  } catch (err) {
    res.status(500).json({ error: "Failed to update payment" });
  }
};

/**
 * 12. DELETE PAYMENT
 */
exports.deletePayment = async (req, res) => {
  const { id } = req.params;

  try {
    const payment = await Payment.findById(id);

    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    if (payment.booking) {
      const booking = await Booking.findById(payment.booking);
      if (booking) {
        booking.paymentStatus = "pending";
        await booking.save();
      }
    }

    await Payment.findByIdAndDelete(id);
    res.json({ message: "Payment deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete payment" });
  }
};

/**
 * 13. GET PAYMENTS BY DATE (Backward compatibility)
 */
exports.getPaymentsByDate = async (req, res) => {
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ error: "Date is required" });
  }

  try {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const filter = buildPropertyFilter(req, {
      paymentDate: { $gte: start, $lte: end }
    });

    const payments = await Payment.find(filter)
      .populate("user", "name email")
      .populate({
        path: "booking",
        populate: { path: "room", select: "roomNumber roomType" }
      })
      .sort({ paymentDate: -1 });

    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: "Failed to load payment records" });
  }
};