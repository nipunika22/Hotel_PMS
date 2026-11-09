// backend/models/Invoice.js
const mongoose = require("mongoose");

const invoiceSchema = new mongoose.Schema({
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Property",
    index: true
  },
  invoiceNumber: {
    type: String,
    required: true,
    unique: true
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
  invoiceDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  checkInDate: {
    type: Date,
    required: true
  },
  checkOutDate: {
    type: Date,
    required: true
  },
  numberOfNights: {
    type: Number,
    required: true
  },
  roomCharges: {
    type: Number,
    required: true
  },
  extraExpenses: [{
    category: String,
    description: String,
    date: Date,
    amount: Number
  }],
  totalExtraExpenses: {
    type: Number,
    default: 0
  },
  subtotal: {
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
  discountAmount: {
    type: Number,
    default: 0
  },
  discountReason: {
    type: String
  },
  totalAmount: {
    type: Number,
    required: true
  },
  advancePaid: {
    type: Number,
    default: 0
  },
  balanceDue: {
    type: Number,
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ["Unpaid", "Partial", "Paid", "Refunded"],
    default: "Unpaid"
  },
  payments: [{
    paymentDate: Date,
    amount: Number,
    paymentMethod: String,
    transactionId: String,
    notes: String
  }],
  totalPaid: {
    type: Number,
    default: 0
  },
  billingAddress: {
    name: String,
    street: String,
    city: String,
    state: String,
    country: String,
    zipCode: String
  },
  gstNumber: {
    type: String
  },
  companyName: {
    type: String
  },
  travelAgent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "TravelAgent"
  },
  commissionAmount: {
    type: Number,
    default: 0
  },
  notes: {
    type: String
  },
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Generate invoice number before saving
invoiceSchema.pre("save", async function(next) {
  if (this.isNew) {
    const count = await mongoose.model("Invoice").countDocuments();
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    this.invoiceNumber = `INV${year}${month}${(count + 1).toString().padStart(5, '0')}`;
  }
  this.updatedAt = Date.now();
  next();
});

// Property-scoped indexes for billing and accounting queries
invoiceSchema.index({ property: 1, paymentStatus: 1, invoiceDate: 1 });
invoiceSchema.index({ property: 1, reservation: 1 });

module.exports = mongoose.model("Invoice", invoiceSchema);