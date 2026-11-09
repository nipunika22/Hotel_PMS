// backend/models/Property.js
const mongoose = require("mongoose");

const propertySchema = new mongoose.Schema({
  chain: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "HotelChain",
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  country: {
    type: String,
    default: "Sri Lanka",
    trim: true
  },
  countryCode: {
    type: String,
    default: "LK",
    uppercase: true,
    trim: true
  },
  city: {
    type: String,
    default: "Colombo",
    trim: true
  },
  address: {
    type: String,
    default: "",
    trim: true
  },
  timezone: {
    type: String,
    default: "Asia/Colombo",
    trim: true
  },
  currency: {
    type: String,
    default: "LKR",
    uppercase: true,
    trim: true
  },
  status: {
    type: String,
    enum: ["Active", "Inactive", "Under Maintenance"],
    default: "Active"
  },
  contactPhone: {
    type: String,
    default: "",
    trim: true
  },
  contactEmail: {
    type: String,
    default: "",
    lowercase: true,
    trim: true
  },
  starRating: {
    type: Number,
    default: 5,
    min: 1,
    max: 5
  },
  images: [{
    type: String
  }],
  checkInTime: {
    type: String,
    default: "14:00"
  },
  checkOutTime: {
    type: String,
    default: "11:00"
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

propertySchema.pre("save", function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("Property", propertySchema);
