// backend/routes/paymentRoutes.js
const express = require("express");
const router = express.Router();
const {
  initiatePayment,
  handlePayHereWebhook,
  verifyPaymentStatus,
  getMyPayments,
  getPayments,
  getFinancialAnalytics,
  getPaymentsByDate,
  getPayment,
  createPayment,
  processRefund,
  simulateSandboxPayment,
  updatePayment,
  deletePayment
} = require("../controllers/paymentController");
const { protect, authorize } = require("../middleware/auth");
const rejectDepartmentAdmin = require("../middleware/rejectDepartmentAdmin");

// -------------------------------------------------------------
// 1. PUBLIC WEBHOOK ROUTE (Server-to-Server from PayHere Gateway)
// Does NOT require JWT authentication; authenticity is verified
// via cryptographic MD5 checksum / secret signature!
// -------------------------------------------------------------
router.post("/payhere/notify", handlePayHereWebhook);

// -------------------------------------------------------------
// 2. AUTHENTICATED CUSTOMER & GENERAL PAYMENT ENDPOINTS
// -------------------------------------------------------------
router.post("/initiate", protect, initiatePayment);
router.get("/verify/:reference", protect, verifyPaymentStatus);
router.get("/my-payments", protect, getMyPayments);
router.post("/simulate-sandbox-confirmation", protect, simulateSandboxPayment);

// -------------------------------------------------------------
// 3. STAFF / FINANCIAL MANAGER / ADMIN ROUTES
// -------------------------------------------------------------
const FINANCE_ROLES = ["admin", "finance", "manager", "super_admin"];
const ALL_STAFF_ROLES = ["admin", "finance", "manager", "staff", "super_admin"];

// Financial Analytics Dashboard
router.get(
  "/financial-analytics",
  protect,
  authorize(...FINANCE_ROLES),
  getFinancialAnalytics
);

// Payment Transactions Directory
router.get(
  "/",
  protect,
  authorize(...ALL_STAFF_ROLES),
  getPayments
);

// Legacy by-date query
router.get(
  "/by-date",
  protect,
  authorize(...ALL_STAFF_ROLES),
  getPaymentsByDate
);

// Refund processing
router.post(
  "/:id/refund",
  protect,
  authorize(...FINANCE_ROLES),
  processRefund
);

// View single payment (Authorized customer or staff)
router.get("/:id", protect, getPayment);

// Manual payment creation (Backward compatibility)
router.post("/", protect, createPayment);

// Update payment
router.put(
  "/:id",
  protect,
  authorize(...FINANCE_ROLES),
  updatePayment
);

// Delete payment
router.delete(
  "/:id",
  protect,
  authorize("admin", "super_admin"),
  deletePayment
);

module.exports = router;
