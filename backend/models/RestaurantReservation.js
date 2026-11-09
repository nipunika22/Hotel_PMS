// backend/models/RestaurantReservation.js
const mongoose = require("mongoose");

const restaurantReservationSchema = new mongoose.Schema({
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Property",
    required: true,
    index: true
  },
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Restaurant",
    required: true,
    index: true
  },
  table: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "RestaurantTable"
  },
  confirmationNumber: {
    type: String,
    required: true,
    unique: true
  },
  guestType: {
    type: String,
    enum: ["Hotel Guest", "Outside Guest"],
    default: "Outside Guest"
  },
  hotelReservation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Reservation"
  },
  roomNumber: {
    type: String,
    trim: true,
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
  date: {
    type: String,
    required: true // Format: "YYYY-MM-DD"
  },
  time: {
    type: String,
    required: true // Format: "HH:MM" e.g., "19:30"
  },
  guestCount: {
    type: Number,
    required: true,
    min: 1
  },
  seatingPreference: {
    type: String,
    enum: ["Any", "Indoor", "Window", "Ocean Terrace", "Private Dining", "Outdoor", "Bar Counter"],
    default: "Any"
  },
  diningType: {
    type: String,
    enum: ["À la carte", "Buffet", "Offer / Experience", "Special Occasion"],
    default: "À la carte"
  },
  buffetSession: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "RestaurantBuffet"
  },
  offer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "RestaurantOffer"
  },
  occasion: {
    type: String,
    enum: [
      "Casual Dining",
      "Birthday",
      "Anniversary",
      "Romantic Dinner",
      "Business Dinner",
      "Family Gathering",
      "Celebration",
      "Other"
    ],
    default: "Casual Dining"
  },
  specialRequests: {
    type: String,
    trim: true,
    default: ""
  },
  status: {
    type: String,
    enum: ["PENDING", "CONFIRMED", "SEATED", "COMPLETED", "CANCELLED", "NO_SHOW"],
    default: "CONFIRMED"
  },
  cancellationReason: {
    type: String,
    trim: true,
    default: ""
  },
  billedToFolio: {
    type: Boolean,
    default: false
  },
  folioExpenseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "GuestExpense"
  },
  totalAmount: {
    type: Number,
    default: 0
  },
  currency: {
    type: String,
    default: "LKR"
  },
  notes: {
    type: String,
    default: ""
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

// Auto-generate confirmation number before save if not present
restaurantReservationSchema.pre("validate", function(next) {
  if (!this.confirmationNumber) {
    const now = new Date();
    const yearMonth = now.getFullYear().toString().slice(-2) + (now.getMonth() + 1).toString().padStart(2, "0");
    const rand = Math.floor(1000 + Math.random() * 9000);
    this.confirmationNumber = `RST-${yearMonth}-${rand}`;
  }
  this.updatedAt = Date.now();
  next();
});

restaurantReservationSchema.index({ property: 1, restaurant: 1, date: 1, time: 1 });
restaurantReservationSchema.index({ property: 1, status: 1 });
restaurantReservationSchema.index({ property: 1, email: 1 });
restaurantReservationSchema.index({ property: 1, hotelReservation: 1 });

module.exports = mongoose.model("RestaurantReservation", restaurantReservationSchema);
