// backend/models/Payment.js
const mongoose = require("mongoose");

const paymentAuditSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  notes: {
    type: String,
    default: ""
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  }
}, { _id: false });

const paymentSchema = new mongoose.Schema({
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Property",
    index: true
  },
  paymentReference: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  purpose: {
    type: String,
    enum: ["room_booking", "restaurant_dining", "event_booking", "invoice_settlement", "custom"],
    default: "room_booking",
    index: true
  },
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Booking",
    index: true
  },
  reservation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Reservation",
    index: true
  },
  restaurantReservation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "RestaurantReservation",
    index: true
  },
  eventBooking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "EventBooking",
    index: true
  },
  invoice: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Invoice",
    index: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: "LKR",
    uppercase: true
  },
  paymentMethod: {
    type: String,
    enum: ["Cash", "Card", "Online", "PayHere", "Bank Transfer"],
    default: "Online"
  },
  paymentStatus: {
    type: String,
    enum: [
      "pending",
      "processing",
      "completed",
      "failed",
      "cancelled",
      "refund_pending",
      "partially_refunded",
      "refunded"
    ],
    default: "pending",
    index: true
  },
  gateway: {
    type: String,
    default: "PayHere"
  },
  gatewayOrderId: {
    type: String,
    index: true
  },
  gatewayTransactionId: {
    type: String,
    index: true
  },
  transactionId: {
    type: String,
    index: true
  },
  gatewayStatusCode: {
    type: Number
  },
  gatewayMethod: {
    type: String
  },
  gatewayStatusMessage: {
    type: String
  },
  idempotencyKey: {
    type: String,
    index: true,
    sparse: true
  },
  // Refund details
  refundAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  refundReason: {
    type: String,
    default: ""
  },
  refundDate: {
    type: Date
  },
  refundReference: {
    type: String
  },
  refundedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  paymentDate: {
    type: Date,
    default: Date.now
  },
  confirmedAt: {
    type: Date
  },
  notes: {
    type: String,
    default: ""
  },
  auditLog: [paymentAuditSchema],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Auto-generate unique readable payment reference: PAY-YYMM-XXXXXX
paymentSchema.pre("validate", function(next) {
  if (!this.paymentReference) {
    const now = new Date();
    const yearMonth = now.getFullYear().toString().slice(-2) + (now.getMonth() + 1).toString().padStart(2, "0");
    const rand = Math.floor(100000 + Math.random() * 900000);
    this.paymentReference = `PAY-${yearMonth}-${rand}`;
  }
  if (!this.gatewayOrderId) {
    this.gatewayOrderId = this.paymentReference;
  }
  if (!this.transactionId && this.gatewayTransactionId) {
    this.transactionId = this.gatewayTransactionId;
  }
  this.updatedAt = Date.now();
  next();
});

// Compound indexes for querying and analytics
paymentSchema.index({ property: 1, paymentStatus: 1, paymentDate: -1 });
paymentSchema.index({ property: 1, purpose: 1, paymentStatus: 1 });
paymentSchema.index({ user: 1, paymentDate: -1 });

module.exports = mongoose.model("Payment", paymentSchema);