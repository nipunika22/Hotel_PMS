// backend/models/Guest.js
const mongoose = require("mongoose");

const guestSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    required: true
  },
  alternatePhone: {
    type: String
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    index: true
  },
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Property",
    index: true
  },
  status: {
    type: String,
    enum: ["Active", "Inactive", "Suspended"],
    default: "Active"
  },
  nationalIdType: {
    type: String,
    enum: ["Passport", "National ID", "Driver License", "Other"],
    default: "Other"
  },
  nationalIdNumber: {
    type: String,
    default: ""
  },
  nationality: {
    type: String,
    default: "Resident"
  },
  address: {
    street: String,
    city: String,
    state: String,
    country: String,
    zipCode: String
  },
  dateOfBirth: {
    type: Date
  },
  gender: {
    type: String,
    enum: ["Male", "Female", "Other"]
  },
  company: {
    type: String
  },
  guestType: {
    type: String,
    enum: ["Regular", "VIP", "Corporate", "Group"],
    default: "Regular"
  },
  specialRequests: {
    type: String
  },
  preferences: {
    roomType: String,
    floor: String,
    smoking: Boolean,
    bedType: String,
    otherPreferences: String
  },
  totalStays: {
    type: Number,
    default: 0
  },
  totalSpent: {
    type: Number,
    default: 0
  },
  loyaltyPoints: {
    type: Number,
    default: 0
  },
  blacklisted: {
    type: Boolean,
    default: false
  },
  blacklistReason: {
    type: String
  },
  notes: {
    type: String
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

// Update updatedAt on save
guestSchema.pre("save", function(next) {
  this.updatedAt = Date.now();
  next();
});

guestSchema.index({ email: 1 });

module.exports = mongoose.model("Guest", guestSchema);