// backend/models/HousekeepingTask.js
const mongoose = require("mongoose");

const housekeepingTaskSchema = new mongoose.Schema({
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Property",
    index: true
  },
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Room",
    required: true
  },
  reservation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Reservation"
  },
  taskType: {
    type: String,
    enum: [
      "Check-out Cleaning",
      "Daily Cleaning",
      "Deep Cleaning",
      "Touch-up",
      "Inspection",
      "Maintenance Cleaning"
    ],
    default: "Check-out Cleaning"
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  status: {
    type: String,
    enum: [
      "Pending",
      "Assigned",
      "In Progress",
      "Completed",
      "Inspected",
      "Needs Recleaning"
    ],
    default: "Pending"
  },
  priority: {
    type: String,
    enum: ["Low", "Medium", "High", "Urgent"],
    default: "High"
  },
  notes: {
    type: String,
    default: ""
  },
  lostItems: [{
    itemDescription: { type: String, required: true },
    location: { type: String, default: "" },
    foundBy: { type: String, default: "" },
    foundDate: { type: Date, default: Date.now },
    status: { type: String, enum: ["Found", "Claimed", "Disposed"], default: "Found" },
    notes: { type: String, default: "" }
  }],
  startedAt: {
    type: Date
  },
  completedAt: {
    type: Date
  },
  inspectedAt: {
    type: Date
  },
  inspectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  inspectionNotes: {
    type: String,
    default: ""
  },
  auditLog: [{
    action: { type: String, required: true },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    timestamp: { type: Date, default: Date.now },
    details: { type: String, default: "" }
  }],
  createdBy: {
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

housekeepingTaskSchema.pre("save", function(next) {
  this.updatedAt = Date.now();
  next();
});

// Property-scoped indexes for task queues
housekeepingTaskSchema.index({ property: 1, status: 1, priority: 1 });
housekeepingTaskSchema.index({ property: 1, room: 1 });

module.exports = mongoose.model("HousekeepingTask", housekeepingTaskSchema);
