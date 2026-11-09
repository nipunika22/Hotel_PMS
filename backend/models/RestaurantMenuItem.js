// backend/models/RestaurantMenuItem.js
const mongoose = require("mongoose");

const restaurantMenuItemSchema = new mongoose.Schema({
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
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "RestaurantMenuCategory",
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
  price: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: "LKR",
    uppercase: true,
    trim: true
  },
  image: {
    type: String,
    default: ""
  },
  dietaryTags: [{
    type: String,
    enum: [
      "Vegetarian",
      "Vegan",
      "Seafood",
      "Spicy",
      "Gluten-free",
      "Chef's choice",
      "Halal",
      "Dairy-free",
      "Organic"
    ]
  }],
  allergens: [{
    type: String,
    trim: true
  }],
  available: {
    type: Boolean,
    default: true
  },
  featured: {
    type: Boolean,
    default: false
  },
  sortOrder: {
    type: Number,
    default: 0
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

restaurantMenuItemSchema.index({ property: 1, restaurant: 1, category: 1, sortOrder: 1 });

restaurantMenuItemSchema.pre("save", function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("RestaurantMenuItem", restaurantMenuItemSchema);
