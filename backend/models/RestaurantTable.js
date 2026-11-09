// backend/models/RestaurantTable.js
const mongoose = require("mongoose");

const restaurantTableSchema = new mongoose.Schema({
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
  tableNumber: {
    type: String,
    required: true,
    trim: true
  },
  capacity: {
    type: Number,
    required: true,
    min: 1
  },
  location: {
    type: String,
    enum: ["Indoor", "Window", "Ocean Terrace", "Private Dining", "Garden", "Outdoor", "Bar Counter"],
    default: "Indoor"
  },
  type: {
    type: String,
    default: "Standard Table"
  },
  status: {
    type: String,
    enum: ["AVAILABLE", "RESERVED", "OCCUPIED", "CLEANING", "OUT_OF_SERVICE"],
    default: "AVAILABLE"
  },
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

restaurantTableSchema.index({ property: 1, restaurant: 1, tableNumber: 1 }, { unique: true });
restaurantTableSchema.index({ property: 1, restaurant: 1, status: 1 });

restaurantTableSchema.pre("save", function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("RestaurantTable", restaurantTableSchema);
