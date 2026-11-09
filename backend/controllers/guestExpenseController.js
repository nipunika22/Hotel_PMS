// backend/controllers/guestExpenseController.js
const mongoose = require("mongoose");
const GuestExpense = require("../models/GuestExpense");
const Reservation = require("../models/Reservation");
const { buildPropertyFilter, getActivePropertyId } = require("../middleware/propertyContext");

// Get all expenses
exports.getExpenses = async (req, res) => {
  try {
    const filter = buildPropertyFilter(req, {});
    const expenses = await GuestExpense.find(filter)
      .populate("guest", "firstName lastName")
      .populate("reservation", "reservationNumber")
      .populate("addedBy", "name")
      .sort({ expenseDate: -1 });
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: "Failed to load expenses" });
  }
};

// Get expenses by reservation
exports.getExpensesByReservation = async (req, res) => {
  const { reservationId } = req.query;

  if (!reservationId) {
    return res.status(400).json({ error: "Reservation ID is required" });
  }

  try {
    const expenses = await GuestExpense.find({ reservation: reservationId })
      .populate("addedBy", "name")
      .sort({ expenseDate: -1 });

    const total = expenses.reduce((sum, exp) => sum + exp.totalAmount, 0);

    res.json({ expenses, total });
  } catch (err) {
    res.status(500).json({ error: "Failed to load expenses" });
  }
};

// Get expenses by date
exports.getExpensesByDate = async (req, res) => {
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
      expenseDate: { $gte: start, $lte: end }
    });

    const expenses = await GuestExpense.find(filter)
      .populate("guest", "firstName lastName")
      .populate("reservation", "reservationNumber")
      .populate("addedBy", "name")
      .sort({ expenseDate: -1 });

    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: "Failed to load expenses" });
  }
};

// Get single expense
exports.getExpense = async (req, res) => {
  const { id } = req.params;

  try {
    const expense = await GuestExpense.findById(id)
      .populate("guest")
      .populate("reservation")
      .populate("addedBy", "name email");

    if (!expense) {
      return res.status(404).json({ error: "Expense not found" });
    }

    if (
      req.propertyId &&
      expense.property &&
      expense.property.toString() !== req.propertyId.toString() &&
      req.user &&
      req.user.role !== "customer" &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ error: "Access denied to expense in another property" });
    }

    res.json(expense);
  } catch (err) {
    res.status(500).json({ error: "Failed to load expense" });
  }
};

// Add new expense
exports.addExpense = async (req, res) => {
  const {
    reservationId,
    guestId,
    expenseDate,
    category,
    description,
    quantity,
    unitPrice,
    taxPercentage,
    notes
  } = req.body;

  if (!reservationId || !guestId || !category || !description || !unitPrice) {
    return res.status(400).json({ error: "Required fields are missing" });
  }

  try {
    // Verify reservation exists
    const reservation = await Reservation.findById(reservationId);
    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found" });
    }

    if (reservation.status !== "Checked-In") {
      return res.status(400).json({ error: "Can only add expenses for checked-in guests" });
    }

    // Calculate amounts
    const qty = quantity || 1;
    const price = parseFloat(unitPrice) || 0;
    const taxPct = parseFloat(taxPercentage) || 0;
    
    const amount = qty * price;
    const taxAmount = (amount * taxPct) / 100;
    const totalAmount = amount + taxAmount;

    const targetPropertyId = reservation.property || req.propertyId || (await getActivePropertyId());

    const newExpense = new GuestExpense({
      property: targetPropertyId,
      reservation: reservationId,
      guest: guestId,
      expenseDate: expenseDate || new Date(),
      category,
      description,
      quantity: qty,
      unitPrice: price,
      amount,
      taxPercentage: taxPct,
      taxAmount,
      totalAmount,
      notes,
      addedBy: req.user.id
    });

    await newExpense.save();

    const expense = await GuestExpense.findById(newExpense._id)
      .populate("guest", "firstName lastName")
      .populate("reservation", "reservationNumber")
      .populate("addedBy", "name");

    res.status(201).json(expense);
  } catch (err) {
    console.error("Add expense error:", err);
    res.status(500).json({ error: "Failed to add expense" });
  }
};

// Update expense
exports.updateExpense = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  try {
    const expense = await GuestExpense.findById(id);

    if (!expense) {
      return res.status(404).json({ error: "Expense not found" });
    }

    // Recalculate amounts if relevant fields are updated
    if (updates.quantity !== undefined) {
      expense.quantity = updates.quantity;
    }
    if (updates.unitPrice !== undefined) {
      expense.unitPrice = updates.unitPrice;
    }
    if (updates.taxPercentage !== undefined) {
      expense.taxPercentage = updates.taxPercentage;
    }

    // Recalculate derived amounts
    const amount = expense.quantity * expense.unitPrice;
    const taxAmount = (amount * expense.taxPercentage) / 100;
    const totalAmount = amount + taxAmount;
    
    expense.amount = amount;
    expense.taxAmount = taxAmount;
    expense.totalAmount = totalAmount;

    // Update other fields
    Object.keys(updates).forEach(key => {
      if (key !== 'quantity' && key !== 'unitPrice' && key !== 'taxPercentage') {
        expense[key] = updates[key];
      }
    });

    await expense.save();

    const updatedExpense = await GuestExpense.findById(id)
      .populate("guest", "firstName lastName")
      .populate("reservation", "reservationNumber")
      .populate("addedBy", "name");

    res.json(updatedExpense);
  } catch (err) {
    console.error("Update failed:", err.message);
    res.status(500).json({ error: "Failed to update expense" });
  }
};

// Delete expense
exports.deleteExpense = async (req, res) => {
  const { id } = req.params;

  try {
    const expense = await GuestExpense.findByIdAndDelete(id);

    if (!expense) {
      return res.status(404).json({ error: "Expense not found" });
    }

    res.json({ message: "Expense deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete expense" });
  }
};

// Get expense summary by category
exports.getExpenseSummary = async (req, res) => {
  const { startDate, endDate } = req.query;

  try {
    const matchQuery = buildPropertyFilter(req, {});
    
    if (startDate && endDate) {
      matchQuery.expenseDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const summary = await GuestExpense.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: "$category",
          totalAmount: { $sum: "$totalAmount" },
          count: { $sum: 1 }
        }
      },
      { $sort: { totalAmount: -1 } }
    ]);

    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: "Failed to load expense summary" });
  }
};