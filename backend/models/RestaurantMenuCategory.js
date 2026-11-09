// backend/models/RestaurantMenuCategory.js
const mongoose = require("mongoose");

const restaurantMenuCategorySchema = new mongoose.Schema({
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
  sortOrder: {
    type: Number,
    default: 0
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

restaurantMenuCategorySchema.index({ property: 1, restaurant: 1, sortOrder: 1 });

restaurantMenuCategorySchema.pre("save", function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("RestaurantMenuCategory", restaurantMenuCategorySchema);
