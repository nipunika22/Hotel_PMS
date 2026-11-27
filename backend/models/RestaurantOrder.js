const mongoose = require("mongoose");
const { Schema } = mongoose;

const itemSchema = new Schema({
  menuItem: { type: Schema.Types.ObjectId, ref: "RestaurantMenuItem", required: true },
  name: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 },
  lineTotal: { type: Number, required: true, min: 0 }
}, { _id: false });

const orderSchema = new Schema({
  property: { type: Schema.Types.ObjectId, ref: "Property", required: true },
  restaurant: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true },
  reservation: { type: Schema.Types.ObjectId, ref: "RestaurantReservation", required: true, unique: true },
  orderNumber: { type: String, required: true },
  confirmationNumber: { type: String, required: true },
  customerName: { type: String, required: true },
  tableNumber: String,
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  items: { type: [itemSchema], required: true },
  subtotal: { type: Number, required: true, min: 0 },
  total: { type: Number, required: true, min: 0 },
  currency: { type: String, required: true, match: /^[A-Z]{3}$/ },
  paymentReconciliationRequired: { type: Boolean, default: false },
  settlementStarted: { type: Boolean, default: false }
}, { timestamps: true, optimisticConcurrency: true });

orderSchema.index({ property: 1, restaurant: 1, createdAt: -1 });

module.exports = mongoose.model("RestaurantOrder", orderSchema);
