// backend/routes/guestExpenseRoutes.js
const express = require("express");
const router = express.Router();
const {
  getExpenses,
  getExpensesByReservation,
  getExpensesByDate,
  getExpense,
  addExpense,
  updateExpense,
  deleteExpense,
  getExpenseSummary
} = require("../controllers/guestExpenseController");
const { protect, authorize } = require("../middleware/auth");
const rejectDepartmentAdmin = require("../middleware/rejectDepartmentAdmin");

router.use(protect, rejectDepartmentAdmin);

router.get("/", protect, authorize("admin", "staff"), getExpenses);
router.get("/reservation", protect, authorize("admin", "staff"), getExpensesByReservation);
router.get("/date", protect, authorize("admin", "staff"), getExpensesByDate);
router.get("/summary", protect, authorize("admin", "staff"), getExpenseSummary);
router.get("/:id", protect, authorize("admin", "staff"), getExpense);
router.post("/", protect, authorize("admin", "staff"), addExpense);
router.put("/:id", protect, authorize("admin", "staff"), updateExpense);
router.delete("/:id", protect, authorize("admin"), deleteExpense);

module.exports = router;
