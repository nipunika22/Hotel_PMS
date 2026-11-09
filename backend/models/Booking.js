// backend/models/Booking.js
const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Property",
    index: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Room",
    required: true
  },
  checkInDate: {
    type: Date,
    required: true
  },
  checkOutDate: {
    type: Date,
    required: true
  },
  numberOfGuests: {
    type: Number,
    required: true,
    min: 1
  },
  totalPrice: {
    type: Number,
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ["pending", "paid", "cancelled", "refunded"],
    default: "pending"
  },
  paymentMethod: {
    type: String,
    enum: ["Cash", "Card", "Online", "PayHere", "Bank Transfer"],
    default: "Cash"
  },
  bookingStatus: {
    type: String,
    enum: ["confirmed", "checked-in", "checked-out", "cancelled"],
    default: "confirmed"
  },
  specialRequests: {
    type: String
  },
  reservationNumber: {
    type: String
  },
  reservation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Reservation"
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
bookingSchema.pre("save", function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("Booking", bookingSchema);