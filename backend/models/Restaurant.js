// backend/models/Restaurant.js
const mongoose = require("mongoose");

const restaurantSchema = new mongoose.Schema({
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Property",
    required: true,
    index: true
  },
  name: {
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
  tagline: {
    type: String,
    trim: true,
    default: ""
  },
  description: {
    type: String,
    trim: true,
    default: ""
  },
  story: {
    concept: { type: String, default: "" },
    atmosphere: { type: String, default: "" },
    philosophy: { type: String, default: "" },
    signature: { type: String, default: "" }
  },
  cuisine: {
    type: String,
    required: true,
    trim: true
  },
  restaurantType: {
    type: String,
    enum: ["Fine Dining", "All-Day Dining", "Bistro", "Lounge", "Bar & Grill"],
    default: "Fine Dining"
  },
  location: {
    type: String,
    required: true,
    trim: true
  },
  openingHours: {
    type: String,
    required: true,
    trim: true
  },
  hours: [{
    period: { type: String, trim: true },
    time: { type: String, trim: true },
    days: { type: String, trim: true, default: "Daily" }
  }],
  contactPhone: {
    type: String,
    trim: true,
    default: "+94 11 234 5678"
  },
  contactEmail: {
    type: String,
    trim: true,
    default: "dining@grandhorizon.lk"
  },
  dressCode: {
    type: String,
    trim: true,
    default: "Smart Casual / Resort Evening"
  },
  reservationPolicy: {
    type: String,
    trim: true,
    default: "Reservations recommended. Walk-ins welcomed based on table availability."
  },
  capacity: {
    type: Number,
    default: 80,
    min: 1
  },
  diningStyles: [{
    type: String,
    trim: true
  }],
  priceRange: {
    type: String,
    trim: true,
    default: "$$$$"
  },
  heroImage: {
    type: String,
    default: ""
  },
  featuredImage: {
    type: String,
    default: ""
  },
  images: [{
    type: String
  }],
  gallery: [{
    url: { type: String, required: true },
    caption: { type: String, default: "" },
    category: {
      type: String,
      enum: ["Interior", "Exterior", "Food", "Chef", "Buffet", "Atmosphere", "Table Settings"],
      default: "Food"
    }
  }],
  chef: {
    name: { type: String, default: "" },
    title: { type: String, default: "Executive Chef" },
    bio: { type: String, default: "" },
    specialty: { type: String, default: "" },
    image: { type: String, default: "" }
  },
  featuredDishes: [{
    name: { type: String, required: true },
    description: { type: String, default: "" },
    price: { type: Number, required: true },
    currency: { type: String, default: "LKR" },
    image: { type: String, default: "" },
    badge: { type: String, default: "Chef's Selection" }
  }],
  experiences: [{
    title: { type: String, required: true },
    description: { type: String, default: "" },
    price: { type: Number, default: 0 },
    currency: { type: String, default: "LKR" },
    image: { type: String, default: "" },
    tag: { type: String, default: "Signature" }
  }],
  active: {
    type: Boolean,
    default: true,
    index: true
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

// Compound unique index for property + slug to ensure property isolation
restaurantSchema.index({ property: 1, slug: 1 }, { unique: true });
restaurantSchema.index({ property: 1, active: 1, sortOrder: 1 });

restaurantSchema.pre("validate", function(next) {
  if (!this.slug && this.name) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }
  next();
});

restaurantSchema.pre("save", function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("Restaurant", restaurantSchema);
