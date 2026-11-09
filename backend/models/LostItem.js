// backend/models/LostItem.js
const mongoose = require("mongoose");

const lostItemSchema = new mongoose.Schema({
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Property",
    index: true
  },
  itemNumber: {
    type: String,
    required: true,
    unique: true
  },
  itemDescription: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    enum: [
      "Electronics",
      "Clothing",
      "Jewelry",
      "Documents/Cards",
      "Luggage/Bags",
      "Keys",
      "Eyewear",
      "Personal Accessories",
      "Other"
    ],
    default: "Other"
  },
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Room"
  },
  location: {
    type: String,
    required: true,
    trim: true
  },
  foundBy: {
    type: String,
    required: true,
    trim: true
  },
  foundDate: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ["Found", "Claimed", "Disposed"],
    default: "Found"
  },
  storageLocation: {
    type: String,
    default: "Front Desk Storage",
    trim: true
  },
  guest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Guest"
  },
  claimantName: {
    type: String,
    default: "",
    trim: true
  },
  claimantPhone: {
    type: String,
    default: "",
    trim: true
  },
  claimantEmail: {
    type: String,
    default: "",
    trim: true
  },
  claimedAt: {
    type: Date
  },
  claimedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  disposedAt: {
    type: Date
  },
  disposedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  disposalReason: {
    type: String,
    default: "",
    trim: true
  },
  handoverVerification: {
    type: String,
    default: "",
    trim: true
  },
  sourceTask: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "HousekeepingTask"
  },
  notes: {
    type: String,
    default: "",
    trim: true
  },
  auditLog: [{
    action: {
      type: String,
      required: true
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    details: {
      type: String,
      default: ""
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

lostItemSchema.pre("save", function(next) {
  this.updatedAt = Date.now();
  next();
});

// Property-scoped indexes for lost items
lostItemSchema.index({ property: 1, status: 1 });
lostItemSchema.index({ property: 1, room: 1 });

module.exports = mongoose.model("LostItem", lostItemSchema);
