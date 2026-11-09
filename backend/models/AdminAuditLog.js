const mongoose = require("mongoose");

const adminAuditLogSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  actorName: { type: String, required: true },
  action: { type: String, required: true, index: true },
  resourceType: { type: String, required: true, index: true },
  resourceId: { type: String, default: "" },
  property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", default: null, index: true },
  summary: { type: String, required: true },
  changes: { type: mongoose.Schema.Types.Mixed, default: null },
  createdAt: { type: Date, default: Date.now, index: true }
}, { versionKey: false });

adminAuditLogSchema.index({ createdAt: -1, _id: -1 });

module.exports = mongoose.model("AdminAuditLog", adminAuditLogSchema);
