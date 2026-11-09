const mongoose = require("mongoose");

const adminBootstrapLockSchema = new mongoose.Schema({
  _id: { type: String },
  createdAt: { type: Date, default: Date.now },
  createdUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
}, { versionKey: false, collection: "admin_bootstrap_locks" });

module.exports = mongoose.model("AdminBootstrapLock", adminBootstrapLockSchema);
