// backend/models/RestaurantOffer.js
const mongoose = require("mongoose");

const restaurantOfferSchema = new mongoose.Schema({
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
  title: {
    type: String,
    required: true,
    trim: true
  },
  slug: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  shortDescription: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  image: {
    type: String,
    default: ""
  },
  price: {
    type: Number,
    min: 0
  },
  discount: {
    type: String,
    trim: true,
    default: ""
  },
  currency: {
    type: String,
    default: "LKR",
    uppercase: true,
    trim: true
  },
  validFrom: {
    type: Date,
    default: Date.now
  },
  validUntil: {
    type: Date
  },
  applicableDays: [{
    type: String,
    trim: true
  }],
  inclusions: [{
    type: String,
    trim: true
  }],
  terms: {
    type: String,
    trim: true,
    default: "Advance reservation required. Subject to table availability. Taxes and service charges included."
  },
  active: {
    type: Boolean,
    default: true
  },
  featured: {
    type: Boolean,
    default: true
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

restaurantOfferSchema.index({ property: 1, restaurant: 1, active: 1 });
restaurantOfferSchema.index({ property: 1, slug: 1 }, { unique: true });

restaurantOfferSchema.pre("save", function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("RestaurantOffer", restaurantOfferSchema);
