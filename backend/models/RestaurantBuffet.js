// backend/models/RestaurantBuffet.js
const mongoose = require("mongoose");

const restaurantBuffetSchema = new mongoose.Schema({
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
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true,
    default: ""
  },
  schedule: {
    type: String,
    trim: true,
    default: "Daily"
  },
  mealPeriod: {
    type: String,
    enum: ["Breakfast", "Lunch", "Dinner", "Brunch"],
    default: "Dinner"
  },
  startTime: {
    type: String,
    required: true,
    trim: true
  },
  endTime: {
    type: String,
    required: true,
    trim: true
  },
  adultPrice: {
    type: Number,
    required: true,
    min: 0
  },
  childPrice: {
    type: Number,
    required: true,
    min: 0
  },
  hotelGuestPrice: {
    type: Number,
    min: 0
  },
  outsideGuestPrice: {
    type: Number,
    min: 0
  },
  currency: {
    type: String,
    default: "LKR",
    uppercase: true,
    trim: true
  },
  capacity: {
    type: Number,
    default: 120,
    min: 1
  },
  theme: {
    type: String,
    trim: true,
    default: "International Culinary Showcase"
  },
  image: {
    type: String,
    default: ""
  },
  highlights: [{
    type: String,
    trim: true
  }],
  active: {
    type: Boolean,
    default: true
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

restaurantBuffetSchema.index({ property: 1, restaurant: 1, active: 1 });

restaurantBuffetSchema.pre("save", function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("RestaurantBuffet", restaurantBuffetSchema);
