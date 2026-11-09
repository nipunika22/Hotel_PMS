// backend/controllers/invoiceController.js
const mongoose = require("mongoose");
const Invoice = require("../models/Invoice");
const Reservation = require("../models/Reservation");
const GuestExpense = require("../models/GuestExpense");
const Guest = require("../models/Guest");
const { buildPropertyFilter, getActivePropertyId } = require("../middleware/propertyContext");
const notificationService = require("../services/notificationService");

// Get all invoices
exports.getInvoices = async (req, res) => {
  try {
    const filter = buildPropertyFilter(req, {});
    const invoices = await Invoice.find(filter)
      .populate("guest", "firstName lastName email phone")
      .populate("reservation", "reservationNumber")
      .populate("travelAgent", "companyName")
      .sort({ createdAt: -1 });
    res.json(invoices);
  } catch (err) {
    res.status(500).json({ error: "Failed to load invoices" });
  }
};

// Get invoices by date
exports.getInvoicesByDate = async (req, res) => {
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
      invoiceDate: { $gte: start, $lte: end }
    });

    const invoices = await Invoice.find(filter)
      .populate("guest", "firstName lastName")
      .populate("reservation", "reservationNumber")
      .sort({ invoiceDate: -1 });

    res.json(invoices);
  } catch (err) {
    res.status(500).json({ error: "Failed to load invoices" });
  }
};

// Get invoices by reservation
exports.getInvoicesByReservation = async (req, res) => {
  const { reservationId } = req.query;

  if (!reservationId) {
    return res.status(400).json({ error: "Reservation ID is required" });
  }

  try {
    const propertyFilter = req.propertyId ? { property: req.propertyId } : {};
    const invoices = await Invoice.find({ reservation: reservationId, ...propertyFilter })
      .populate("guest", "firstName lastName")
      .populate("reservation", "reservationNumber")
      .populate("travelAgent", "companyName")
      .sort({ invoiceDate: -1 });

    res.json(invoices);
  } catch (err) {
    res.status(500).json({ error: "Failed to load invoices" });
  }
};

// Get single invoice
exports.getInvoice = async (req, res) => {
  const { id } = req.params;

  try {
    const invoice = await Invoice.findById(id)
      .populate("guest")
      .populate("reservation")
      .populate("travelAgent")
      .populate("generatedBy", "name email");

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    if (
      req.propertyId &&
      invoice.property &&
      invoice.property.toString() !== req.propertyId.toString() &&
      req.user &&
      req.user.role !== "customer" &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ error: "Access denied to invoice in another property" });
    }

    res.json(invoice);
  } catch (err) {
    res.status(500).json({ error: "Failed to load invoice" });
  }
};

// Generate invoice from reservation
exports.generateInvoice = async (req, res) => {
  const { reservationId } = req.body;

  if (!reservationId) {
    return res.status(400).json({ error: "Reservation ID is required" });
  }

  try {
    const reservation = await Reservation.findById(reservationId)
      .populate("guest")
      .populate("travelAgent");

    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found" });
    }

    if (reservation.status !== "Checked-Out") {
      return res.status(400).json({ error: "Can only generate invoice for checked-out reservations" });
    }

    // Check if invoice already exists
    const existingInvoice = await Invoice.findOne({ reservation: reservationId });
    if (existingInvoice) {
      return res.status(400).json({ error: "Invoice already exists for this reservation" });
    }

    let targetPropertyId = reservation.property || req.propertyId;
    if (!targetPropertyId) {
      targetPropertyId = await getActivePropertyId();
    }

    // Get all guest expenses
    const expenses = await GuestExpense.find({ 
      reservation: reservationId,
      paymentStatus: { $ne: "Paid" }
    });

    const extraExpenses = expenses.map(exp => ({
      category: exp.category,
      description: exp.description,
      date: exp.expenseDate,
      amount: exp.totalAmount
    }));

    const totalExtraExpenses = expenses.reduce((sum, exp) => sum + exp.totalAmount, 0);

    const subtotal = reservation.roomCharges + totalExtraExpenses;
    const taxAmount = reservation.taxAmount || 0;
    const discountAmount = reservation.discountAmount || 0;
    const totalAmount = subtotal + taxAmount - discountAmount;
    const advancePaid = reservation.advancePayment || 0;
    const balanceDue = totalAmount - advancePaid;

    // Calculate commission if travel agent
    let commissionAmount = 0;
    if (reservation.travelAgent) {
      commissionAmount = (totalAmount * reservation.travelAgent.commissionRate) / 100;
    }

    const newInvoice = new Invoice({
      property: targetPropertyId,
      reservation: reservationId,
      guest: reservation.guest._id,
      checkInDate: reservation.checkInDate,
      checkOutDate: reservation.checkOutDate,
      numberOfNights: reservation.numberOfNights,
      roomCharges: reservation.roomCharges,
      extraExpenses,
      totalExtraExpenses,
      subtotal,
      taxPercentage: reservation.taxAmount > 0 ? ((reservation.taxAmount / reservation.roomCharges) * 100).toFixed(2) : 0,
      taxAmount,
      discountAmount,
      discountReason: reservation.discountReason,
      totalAmount,
      advancePaid,
      balanceDue,
      paymentStatus: balanceDue <= 0 ? "Paid" : advancePaid > 0 ? "Partial" : "Unpaid",
      billingAddress: {
        name: `${reservation.guest.firstName} ${reservation.guest.lastName}`,
        street: reservation.guest.address?.street,
        city: reservation.guest.address?.city,
        state: reservation.guest.address?.state,
        country: reservation.guest.address?.country,
        zipCode: reservation.guest.address?.zipCode
      },
      companyName: reservation.guest.company,
      travelAgent: reservation.travelAgent?._id,
      commissionAmount,
      totalPaid: advancePaid,
      generatedBy: req.user.id
    });

    // Add advance payment to payments array if exists
    if (advancePaid > 0) {
      newInvoice.payments.push({
        paymentDate: reservation.createdAt,
        amount: advancePaid,
        paymentMethod: "Advance",
        notes: "Advance payment at booking"
      });
    }

    await newInvoice.save();

    // Update guest expenses status
    await GuestExpense.updateMany(
      { reservation: reservationId },
      { paymentStatus: "Added to Bill" }
    );

    // Update guest total spent
    await Guest.findByIdAndUpdate(reservation.guest._id, {
      $inc: { totalSpent: totalAmount }
    });

    const invoice = await Invoice.findById(newInvoice._id)
      .populate("guest")
      .populate("reservation")
      .populate("travelAgent")
      .populate("generatedBy", "name");

    // Operational billing notification
    try {
      if (invoice?.guest?.user) {
        notificationService.createNotification({
          recipient: invoice.guest.user,
          title: "Invoice Generated",
          message: `Your invoice #${invoice.invoiceNumber} for LKR ${Number(invoice.totalAmount).toLocaleString()} is ready.`,
          category: "billing",
          priority: "normal",
          actionUrl: `/invoices`,
          relatedEntity: { entityType: "Invoice", entityId: invoice._id }
        }).catch(() => {});
      }
    } catch (e) {}

    res.status(201).json(invoice);
  } catch (err) {
    console.error("Generate invoice error:", err);
    res.status(500).json({ error: "Failed to generate invoice" });
  }
};

// Add payment to invoice
exports.addPayment = async (req, res) => {
  const { id } = req.params;
  const { amount, paymentMethod, transactionId, notes } = req.body;

  if (!amount || !paymentMethod) {
    return res.status(400).json({ error: "Amount and payment method are required" });
  }

  try {
    const invoice = await Invoice.findById(id);

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    invoice.payments.push({
      paymentDate: new Date(),
      amount,
      paymentMethod,
      transactionId,
      notes
    });

    invoice.totalPaid += amount;
    invoice.balanceDue = invoice.totalAmount - invoice.totalPaid;

    if (invoice.balanceDue <= 0) {
      invoice.paymentStatus = "Paid";
    } else if (invoice.totalPaid > 0) {
      invoice.paymentStatus = "Partial";
    }

    await invoice.save();

    const updatedInvoice = await Invoice.findById(id)
      .populate("guest")
      .populate("reservation")
      .populate("travelAgent");

    // Notify guest and finance
    try {
      if (updatedInvoice?.guest?.user) {
        notificationService.createNotification({
          recipient: updatedInvoice.guest.user,
          title: "Payment Received",
          message: `Payment of LKR ${Number(amount).toLocaleString()} received for Invoice #${updatedInvoice.invoiceNumber}. Balance due: LKR ${Number(updatedInvoice.balanceDue).toLocaleString()}.`,
          category: "billing",
          priority: "normal",
          actionUrl: "/invoices",
          relatedEntity: { entityType: "Invoice", entityId: updatedInvoice._id }
        }).catch(() => {});
      }
      notificationService.sendAudienceNotification({
        audience: "department",
        department: "Finance",
        title: "Payment Recorded",
        message: `Payment of LKR ${Number(amount).toLocaleString()} recorded on Invoice #${updatedInvoice.invoiceNumber}.`,
        category: "billing",
        priority: "normal",
        actionUrl: "/invoices",
        relatedEntity: { entityType: "Invoice", entityId: updatedInvoice._id }
      }).catch(() => {});
    } catch (e) {}

    res.json(updatedInvoice);
  } catch (err) {
    res.status(500).json({ error: "Failed to add payment" });
  }
};

// Update invoice
exports.updateInvoice = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  try {
    const invoice = await Invoice.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true
    })
      .populate("guest")
      .populate("reservation")
      .populate("travelAgent");

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    res.json(invoice);
  } catch (err) {
    console.error("Update failed:", err.message);
    res.status(500).json({ error: "Failed to update invoice" });
  }
};

// Delete invoice
exports.deleteInvoice = async (req, res) => {
  const { id } = req.params;

  try {
    const invoice = await Invoice.findByIdAndDelete(id);

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    // Reset guest expenses status
    await GuestExpense.updateMany(
      { reservation: invoice.reservation },
      { paymentStatus: "Pending" }
    );

    res.json({ message: "Invoice deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete invoice" });
  }
};

// Get invoice statistics
exports.getInvoiceStats = async (req, res) => {
  const { startDate, endDate } = req.query;

  try {
    const matchQuery = buildPropertyFilter(req, {});
    
    if (startDate && endDate) {
      matchQuery.invoiceDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const stats = await Invoice.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalInvoices: { $sum: 1 },
          totalAmount: { $sum: "$totalAmount" },
          totalPaid: { $sum: "$totalPaid" },
          totalDue: { $sum: "$balanceDue" }
        }
      }
    ]);

    const paymentStatusCount = await Invoice.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: "$paymentStatus",
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      summary: stats[0] || { totalInvoices: 0, totalAmount: 0, totalPaid: 0, totalDue: 0 },
      paymentStatusCount
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load invoice statistics" });
  }
};