// backend/models/User.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { DEPARTMENTS, PERMISSIONS } = require("../config/departmentPermissions");

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  phone: {
    type: String,
    required: true
  },
  address: {
    type: String,
    default: "",
    trim: true
  },
  role: {
    type: String,
    enum: ["customer", "admin", "staff", "manager", "finance", "housekeeping", "maintenance", "super_admin"],
    default: "customer"
  },
  department: {
    type: String,
    enum: ["Front Desk", "Housekeeping", "Maintenance", "Finance", "Kitchen", "Restaurant", "Management", "General"],
    default: "General"
  },
  departmentAdmin: { type: Boolean, default: false, index: true },
  adminDepartments: [{ type: String, enum: DEPARTMENTS }],
  adminPermissions: [{ type: String, enum: PERMISSIONS }],
  staffId: { type: String, trim: true, uppercase: true, unique: true, sparse: true },
  jobTitle: { type: String, trim: true, maxlength: 100, default: "" },
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Property"
  },
  allowedProperties: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Property"
  }],
  guest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Guest"
  },
  status: {
    type: String,
    enum: ["Active", "Inactive", "Suspended"],
    default: "Active"
  },
  lastLogin: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Hash password before saving
userSchema.pre("save", async function(next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (typeof candidatePassword !== "string" || typeof this.password !== "string") return false;
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
