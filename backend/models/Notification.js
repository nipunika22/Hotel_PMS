// backend/models/Notification.js
const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property",
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000
    },
    category: {
      type: String,
      enum: [
        "reservation",
        "dining",
        "housekeeping",
        "maintenance",
        "billing",
        "event",
        "announcement",
        "system"
      ],
      default: "system",
      index: true
    },
    priority: {
      type: String,
      enum: ["low", "normal", "high", "urgent"],
      default: "normal",
      index: true
    },
    targetAudience: {
      type: String,
      enum: [
        "individual",
        "guest",
        "selected_guests",
        "department",
        "role",
        "staff",
        "all_guests",
        "all_users"
      ],
      default: "individual"
    },
    targetDepartment: {
      type: String,
      trim: true
    },
    targetRole: {
      type: String,
      trim: true
    },
    relatedEntity: {
      entityType: {
        type: String,
        enum: [
          "Reservation",
          "Room",
          "Guest",
          "Invoice",
          "HousekeepingTask",
          "MaintenanceTicket",
          "RestaurantReservation",
          "EventBooking",
          "None"
        ],
        default: "None"
      },
      entityId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null
      }
    },
    actionUrl: {
      type: String,
      trim: true,
      default: ""
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true
    },
    readAt: {
      type: Date,
      default: null
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true
    },
    campaignId: {
      type: String,
      index: true,
      default: null
    },
    expiresAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Compound indexes for optimal recipient queries & unread count performance
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, isArchived: 1, createdAt: -1 });
notificationSchema.index({ property: 1, createdAt: -1 });
notificationSchema.index({ campaignId: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
