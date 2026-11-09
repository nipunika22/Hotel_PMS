// backend/models/EventVenue.js
const mongoose = require("mongoose");

const eventPackageSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  event: {
    type: String,
    default: "Weddings & occasions",
    trim: true
  },
  includes: {
    type: String,
    default: "",
    trim: true
  },
  price: {
    type: Number,
    default: 0
  },
  currency: {
    type: String,
    default: "LKR"
  }
}, { _id: false });

const eventVenueSchema = new mongoose.Schema({
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
    trim: true
  },
  hotel: {
    type: String,
    default: "Serendib Sanctuary · Flagship Property",
    trim: true
  },
  location: {
    type: String,
    default: "Colombo, Sri Lanka",
    trim: true
  },
  type: {
    type: String,
    enum: ["Indoor", "Outdoor", "Hybrid"],
    default: "Indoor"
  },
  area: {
    type: Number,
    default: 100 // Square meters
  },
  min: {
    type: Number,
    default: 10,
    min: 1
  },
  max: {
    type: Number,
    required: true,
    min: 1
  },
  categories: [{
    type: String,
    trim: true
  }],
  seating: [{
    type: String,
    trim: true
  }],
  facilities: [{
    type: String,
    trim: true
  }],
  image: {
    type: String,
    default: ""
  },
  gallery: [{
    type: String
  }],
  description: {
    type: String,
    default: "",
    trim: true
  },
  packages: [eventPackageSchema],
  isActive: {
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

eventVenueSchema.pre("validate", function(next) {
  if (!this.slug && this.name) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }
  this.updatedAt = Date.now();
  next();
});

eventVenueSchema.index({ property: 1, slug: 1 }, { unique: true });
eventVenueSchema.index({ property: 1, isActive: 1 });

module.exports = mongoose.model("EventVenue", eventVenueSchema);
