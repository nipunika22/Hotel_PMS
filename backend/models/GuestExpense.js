// backend/models/GuestExpense.js
const mongoose = require("mongoose");

const guestExpenseSchema = new mongoose.Schema({
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Property",
    index: true
  },
  reservation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Reservation",
    required: true
  },
  guest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Guest",
    required: true
  },
  expenseDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  category: {
    type: String,
    required: true,
    enum: [
      "Room Service",
      "Restaurant",
      "Bar",
      "Laundry",
      "Spa",
      "Gym",
      "Minibar",
      "Telephone",
      "Internet",
      "Parking",
      "Transportation",
      "Extra Bed",
      "Late Checkout",
      "Early Checkin",
      "Damage Charges",
      "Other"
    ]
  },
  description: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    default: 1,
    min: 1
  },
  unitPrice: {
    type: Number,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  taxPercentage: {
    type: Number,
    default: 0
  },
  taxAmount: {
    type: Number,
    default: 0
  },
  totalAmount: {
    type: Number,
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ["Pending", "Paid", "Added to Bill"],
    default: "Pending"
  },
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  notes: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Calculate amounts before saving
guestExpenseSchema.pre("save", function(next) {
  this.amount = this.quantity * this.unitPrice;
  this.taxAmount = (this.amount * this.taxPercentage) / 100;
  this.totalAmount = this.amount + this.taxAmount;
  next();
});

module.exports = mongoose.model("GuestExpense", guestExpenseSchema);