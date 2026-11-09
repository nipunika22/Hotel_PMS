// backend/models/Event.js
const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Property",
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
    trim: true
  },
  eventType: {
    type: String,
    required: true,
    trim: true,
    default: "weddings"
    // Can be: weddings, corporate, office-parties, private-celebrations, gala, entertainment, etc.
  },
  shortDescription: {
    type: String,
    trim: true,
    default: ""
  },
  description: {
    type: String,
    trim: true,
    default: ""
  },
  coverImage: {
    type: String,
    default: ""
  },
  gallery: [{
    type: String
  }],
  venue: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "EventVenue"
  },
  startDate: {
    type: String,
    required: true // Format: "YYYY-MM-DD"
  },
  endDate: {
    type: String,
    default: "" // Format: "YYYY-MM-DD"
  },
  startTime: {
    type: String,
    default: "09:00" // "HH:MM"
  },
  endTime: {
    type: String,
    default: "17:00" // "HH:MM"
  },
  minCapacity: {
    type: Number,
    default: 10
  },
  maxCapacity: {
    type: Number,
    default: 200
  },
  expectedGuestCount: {
    type: Number,
    default: 50
  },
  pricingModel: {
    type: String,
    enum: ["Per Person", "Per Table", "Fixed Package", "Free", "Custom Quote"],
    default: "Fixed Package"
  },
  basePrice: {
    type: Number,
    default: 0
  },
  currency: {
    type: String,
    default: "LKR"
  },
  status: {
    type: String,
    enum: ["DRAFT", "PUBLISHED", "CANCELLED", "COMPLETED", "ARCHIVED"],
    default: "PUBLISHED"
  },
  featured: {
    type: Boolean,
    default: false
  },
  termsAndConditions: {
    type: String,
    default: ""
  },
  contactPhone: {
    type: String,
    default: ""
  },
  contactEmail: {
    type: String,
    default: ""
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
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

eventSchema.pre("validate", function(next) {
  if (!this.slug && this.title) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }
  this.updatedAt = Date.now();
  next();
});

eventSchema.index({ property: 1, slug: 1 }, { unique: true });
eventSchema.index({ property: 1, status: 1, eventType: 1 });
eventSchema.index({ property: 1, featured: 1 });

module.exports = mongoose.model("Event", eventSchema);
