// backend/models/HotelChain.js
const mongoose = require("mongoose");

const hotelChainSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  description: {
    type: String,
    default: "",
    trim: true
  },
  status: {
    type: String,
    enum: ["Active", "Inactive"],
    default: "Active"
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

hotelChainSchema.pre("save", function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("HotelChain", hotelChainSchema);
