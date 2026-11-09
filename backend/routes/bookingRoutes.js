// backend/routes/bookingRoutes.js
const express = require("express");
const router = express.Router();
const {
  getBookings,
  getMyBookings,
  getBookingsByDate,
  getBooking,
  createBooking,
  updateBooking,
  cancelBooking,
  deleteBooking
} = require("../controllers/bookingController");
const { protect, authorize } = require("../middleware/auth");
const rejectDepartmentAdmin = require("../middleware/rejectDepartmentAdmin");

router.use(protect, rejectDepartmentAdmin);

router.get("/", protect, authorize("admin", "staff"), getBookings);
router.get("/my-bookings", protect, getMyBookings);
router.get("/by-date", protect, authorize("admin", "staff"), getBookingsByDate);
router.get("/:id", protect, getBooking);
router.post("/", protect, createBooking);
router.put("/:id", protect, updateBooking);
router.put("/:id/cancel", protect, cancelBooking);
router.delete("/:id", protect, authorize("admin"), deleteBooking);

module.exports = router;
