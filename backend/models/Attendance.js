const mongoose = require("mongoose");

const correctionSchema = new mongoose.Schema({
  correctedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  correctedAt: { type: Date, required: true, default: Date.now },
  reason: { type: String, required: true, trim: true, maxlength: 500 },
  previousStatus: { type: String, enum: ["Present", "Late", "On Leave", "Absent"], default: null },
  previousCheckIn: { type: Date, default: null },
  previousCheckOut: { type: Date, default: null }
}, { _id: false });

const attendanceSchema = new mongoose.Schema({
  staff: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", required: true, index: true },
  attendanceDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  checkIn: { type: Date, default: null },
  checkOut: { type: Date, default: null },
  status: { type: String, enum: ["Present", "Late", "On Leave", "Absent"], required: true, default: "Present" },
  corrections: { type: [correctionSchema], default: [] }
}, { timestamps: true });

attendanceSchema.index({ staff: 1, attendanceDate: 1 }, { unique: true });
attendanceSchema.index({ property: 1, attendanceDate: 1, status: 1 });

module.exports = mongoose.model("Attendance", attendanceSchema);
