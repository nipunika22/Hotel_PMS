// backend/routes/invoiceRoutes.js
const express = require("express");
const router = express.Router();
const {
  getInvoices,
  getInvoicesByDate,
  getInvoicesByReservation,
  getInvoice,
  generateInvoice,
  addPayment,
  updateInvoice,
  deleteInvoice,
  getInvoiceStats
} = require("../controllers/invoiceController");
const { protect, authorize } = require("../middleware/auth");
const rejectDepartmentAdmin = require("../middleware/rejectDepartmentAdmin");

router.use(protect, rejectDepartmentAdmin);

router.get("/", protect, authorize("admin", "staff"), getInvoices);
router.get("/date", protect, authorize("admin", "staff"), getInvoicesByDate);
router.get("/reservation", protect, authorize("admin", "staff"), getInvoicesByReservation);
router.get("/stats", protect, authorize("admin", "staff"), getInvoiceStats);
router.get("/:id", protect, authorize("admin", "staff"), getInvoice);
router.post("/generate", protect, authorize("admin", "staff"), generateInvoice);
router.put("/:id/payment", protect, authorize("admin", "staff"), addPayment);
router.put("/:id", protect, authorize("admin", "staff"), updateInvoice);
router.delete("/:id", protect, authorize("admin"), deleteInvoice);

module.exports = router;
