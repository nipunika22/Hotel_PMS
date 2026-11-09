// backend/models/EventBooking.js
const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema({
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
  }
}, { _id: false });

const eventBookingSchema = new mongoose.Schema({
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Property",
    required: true,
    index: true
  },
  confirmationNumber: {
    type: String,
    required: true,
    unique: true
  },
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Event"
  },
  venue: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "EventVenue"
  },
  venueName: {
    type: String,
    default: ""
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  customerName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  eventType: {
    type: String,
    required: true,
    trim: true
  },
  date: {
    type: String,
    required: true // Format: "YYYY-MM-DD"
  },
  startTime: {
    type: String,
    required: true // Format: "HH:MM"
  },
  endTime: {
    type: String,
    required: true // Format: "HH:MM"
  },
  guestCount: {
    type: Number,
    required: true,
    min: 1
  },
  seatingArrangement: {
    type: String,
    default: ""
  },
  selectedPackage: {
    type: String,
    default: ""
  },
  cateringRequirements: {
    type: String,
    default: ""
  },
  decorationRequirements: {
    type: String,
    default: ""
  },
  equipmentRequirements: {
    type: String,
    default: ""
  },
  specialRequests: {
    type: String,
    default: ""
  },
  status: {
    type: String,
    enum: ["PENDING", "CONFIRMED", "REJECTED", "CANCELLED", "COMPLETED"],
    default: "PENDING"
  },
  internalNotes: {
    type: String,
    default: ""
  },
  rejectionReason: {
    type: String,
    default: ""
  },
  cancellationReason: {
    type: String,
    default: ""
  },
  confirmedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  confirmedAt: {
    type: Date
  },
  estimatedPrice: {
    type: Number,
    default: 0
  },
  currency: {
    type: String,
    default: "LKR"
  },
  auditLog: [auditLogSchema],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

eventBookingSchema.pre("validate", function(next) {
  if (!this.confirmationNumber) {
    const now = new Date();
    const yearMonth = now.getFullYear().toString().slice(-2) + (now.getMonth() + 1).toString().padStart(2, "0");
    const rand = Math.floor(1000 + Math.random() * 9000);
    this.confirmationNumber = `EVT-${yearMonth}-${rand}`;
  }
  this.updatedAt = Date.now();
  next();
});

eventBookingSchema.index({ property: 1, venue: 1, date: 1, status: 1 });
eventBookingSchema.index({ property: 1, status: 1 });
eventBookingSchema.index({ property: 1, user: 1 });
eventBookingSchema.index({ property: 1, email: 1 });

module.exports = mongoose.model("EventBooking", eventBookingSchema);
