// backend/models/MaintenanceTicket.js
const mongoose = require("mongoose");

const maintenanceTicketSchema = new mongoose.Schema({
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Property",
    index: true
  },
  ticketNumber: {
    type: String,
    required: true,
    unique: true
  },
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Room",
    required: true
  },
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  issueCategory: {
    type: String,
    enum: [
      "Plumbing",
      "Electrical",
      "HVAC",
      "Furniture",
      "Appliance",
      "Carpentry",
      "Painting",
      "Structural",
      "Other"
    ],
    default: "Other"
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  priority: {
    type: String,
    enum: ["Low", "Medium", "High", "Urgent"],
    default: "Medium"
  },
  status: {
    type: String,
    enum: ["Reported", "Assigned", "In Progress", "Resolved", "Closed"],
    default: "Reported"
  },
  assignedTechnician: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  estimatedCost: {
    type: Number,
    default: 0,
    min: 0
  },
  actualCost: {
    type: Number,
    default: 0,
    min: 0
  },
  isBlocking: {
    type: Boolean,
    default: false
  },
  scheduledDate: {
    type: Date
  },
  startedAt: {
    type: Date
  },
  resolvedAt: {
    type: Date
  },
  closedAt: {
    type: Date
  },
  resolutionNotes: {
    type: String,
    default: ""
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

maintenanceTicketSchema.pre("save", function(next) {
  this.updatedAt = Date.now();
  next();
});

// Property-scoped indexes for ticket queries
maintenanceTicketSchema.index({ property: 1, status: 1 });
maintenanceTicketSchema.index({ property: 1, room: 1 });

module.exports = mongoose.model("MaintenanceTicket", maintenanceTicketSchema);
