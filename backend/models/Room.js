// backend/models/Room.js
const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema({
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Property",
    index: true
  },
  roomNumber: {
    type: String,
    required: true
  },
  roomType: {
    type: String,
    required: true,
    enum: ["Single", "Double", "Twin", "Suite", "Deluxe", "Presidential", "Family", "Connecting"]
  },
  floor: {
    type: Number,
    required: true
  },
  building: {
    type: String,
    default: "Main"
  },
  basePrice: {
    type: Number,
    required: true
  },
  weekendPrice: {
    type: Number
  },
  capacity: {
    maxAdults: {
      type: Number,
      required: true
    },
    maxChildren: {
      type: Number,
      default: 0
    },
    maxOccupancy: {
      type: Number,
      required: true
    }
  },
  bedConfiguration: {
    type: String,
    enum: ["Single Bed", "Double Bed", "Twin Beds", "King Bed", "Queen Bed", "Multiple Beds"],
    required: true
  },
  roomSize: {
    type: Number,
    description: "Room size in square feet"
  },
  view: {
    type: String,
    enum: ["City View", "Sea View", "Garden View", "Pool View", "Mountain View", "No View"]
  },
  amenities: [{
    type: String
  }],
  features: {
    smoking: {
      type: Boolean,
      default: false
    },
    petFriendly: {
      type: Boolean,
      default: false
    },
    accessible: {
      type: Boolean,
      default: false
    },
    balcony: {
      type: Boolean,
      default: false
    },
    kitchenette: {
      type: Boolean,
      default: false
    }
  },
  status: {
    type: String,
    enum: ["Available", "Occupied", "Reserved", "Maintenance", "Out of Order", "Cleaning"],
    default: "Available"
  },
  cleaningStatus: {
    type: String,
    enum: ["Clean", "Dirty", "Inspected", "Pickup"],
    default: "Clean"
  },
  currentReservation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Reservation"
  },
  lastCleanedAt: {
    type: Date
  },
  lastMaintenanceAt: {
    type: Date
  },
  maintenanceNotes: {
    type: String
  },
  images: [{
    type: String
  }],
  description: {
    type: String
  },
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

// Update updatedAt on save
roomSchema.pre("save", function(next) {
  this.updatedAt = Date.now();
  next();
});

// Compound unique index: roomNumber must be unique within a property, but can be reused across properties
roomSchema.index({ property: 1, roomNumber: 1 }, { unique: true });
roomSchema.index({ property: 1, status: 1, isActive: 1 });
roomSchema.index({ property: 1, roomType: 1 });

module.exports = mongoose.model("Room", roomSchema);