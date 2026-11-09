// backend/models/Reservation.js
const mongoose = require("mongoose");

const reservationSchema = new mongoose.Schema({
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Property",
    index: true
  },
  reservationNumber: {
    type: String,
    required: true,
    unique: true
  },
  guest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Guest",
    required: true
  },
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Room"
  },
  bookingSource: {
    type: String,
    enum: ["Walk-in", "Booking.com", "Agoda", "Airbnb", "Travel Agent", "Hotel Website", "Phone", "Email", "Other"],
    required: true
  },
  travelAgent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "TravelAgent"
  },
  bookingReference: {
    type: String
  },
  checkInDate: {
    type: Date,
    required: true
  },
  checkOutDate: {
    type: Date,
    required: true
  },
  actualCheckInDate: {
    type: Date
  },
  actualCheckOutDate: {
    type: Date
  },
  numberOfAdults: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },
  numberOfChildren: {
    type: Number,
    default: 0,
    min: 0
  },
  roomType: {
    type: String,
    required: true
  },
  numberOfRooms: {
    type: Number,
    default: 1,
    min: 1
  },
  ratePerNight: {
    type: Number,
    required: true
  },
  numberOfNights: {
    type: Number,
    required: true
  },
  roomCharges: {
    type: Number,
    required: true
  },
  taxAmount: {
    type: Number,
    default: 0
  },
  discountAmount: {
    type: Number,
    default: 0
  },
  discountReason: {
    type: String
  },
  totalAmount: {
    type: Number,
    required: true
  },
  advancePayment: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ["Confirmed", "Checked-In", "Checked-Out", "Cancelled", "No-Show"],
    default: "Confirmed"
  },
  paymentStatus: {
    type: String,
    enum: ["Pending", "Partial", "Paid", "Refunded"],
    default: "Pending"
  },
  mealPlan: {
    type: String,
    enum: ["None", "Breakfast", "Half Board", "Full Board", "All Inclusive"],
    default: "None"
  },
  specialRequests: {
    type: String
  },
  purpose: {
    type: String,
    enum: ["Business", "Leisure", "Conference", "Wedding", "Other"]
  },
  numberOfGuests: {
    type: Number,
    required: true
  },
  additionalGuests: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Guest"
  }],
  cancellationReason: {
    type: String
  },
  cancellationDate: {
    type: Date
  },
  cancellationCharges: {
    type: Number,
    default: 0
  },
  notes: {
    type: String
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
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

// Generate reservation number before saving if not already set
reservationSchema.pre("save", async function(next) {
  if (this.isNew && !this.reservationNumber) {
    const session = typeof this.$session === "function" ? this.$session() : null;
    const date = new Date();
    const yearMonth = date.getFullYear().toString().slice(-2) + (date.getMonth() + 1).toString().padStart(2, '0');
    const prefix = `RES${yearMonth}`;

    let latestQuery = mongoose.model("Reservation").findOne({ reservationNumber: new RegExp(`^${prefix}`) }, "reservationNumber")
      .sort({ reservationNumber: -1 });
    if (session) latestQuery = latestQuery.session(session);
    const latest = await latestQuery.lean();

    let seq = 1;
    if (latest && latest.reservationNumber) {
      const parsed = parseInt(latest.reservationNumber.replace(prefix, ""), 10);
      if (!Number.isNaN(parsed)) {
        seq = parsed + 1;
      }
    }

    let candidate = `${prefix}${seq.toString().padStart(5, '0')}`;
    let existsQuery = mongoose.model("Reservation").findOne({ reservationNumber: candidate }, "_id");
    if (session) existsQuery = existsQuery.session(session);
    while (await existsQuery.lean()) {
      seq++;
      candidate = `${prefix}${seq.toString().padStart(5, '0')}`;
      existsQuery = mongoose.model("Reservation").findOne({ reservationNumber: candidate }, "_id");
      if (session) existsQuery = existsQuery.session(session);
    }
    this.reservationNumber = candidate;
  }
  this.updatedAt = Date.now();
  next();
});

// Property-scoped indexes for availability and reporting queries
reservationSchema.index({ property: 1, status: 1, checkInDate: 1 });
reservationSchema.index({ property: 1, checkInDate: 1, checkOutDate: 1 });
reservationSchema.index({ property: 1, guest: 1 });

module.exports = mongoose.model("Reservation", reservationSchema);