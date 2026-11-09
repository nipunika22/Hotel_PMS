// backend/routes/reservationRoutes.js
const express = require("express");
const router = express.Router();
const {
  getReservations,
  getReservationsByStatus,
  getReservationsByDateRange,
  getReservation,
  createReservation,
  updateReservation,
  checkIn,
  checkOut,
  cancelReservation,
  markNoShow,
  deleteReservation,
  getDashboardStats
} = require("../controllers/reservationController");
const { protect, authorize } = require("../middleware/auth");
const requireDepartmentPermission = require("../middleware/requireDepartmentPermission");

router.get("/", protect, authorize("admin", "staff"), requireDepartmentPermission("reservations"), getReservations);
router.get("/status", protect, authorize("admin", "staff"), requireDepartmentPermission("reservations"), getReservationsByStatus);
router.get("/date-range", protect, authorize("admin", "staff"), requireDepartmentPermission("reservations"), getReservationsByDateRange);
router.get("/dashboard-stats", protect, authorize("admin", "staff"), requireDepartmentPermission("reservations"), getDashboardStats);
router.get("/:id", protect, authorize("admin", "staff"), requireDepartmentPermission("reservations"), getReservation);
router.post("/", protect, authorize("admin", "staff"), requireDepartmentPermission("reservations"), createReservation);
router.put("/:id", protect, authorize("admin", "staff"), requireDepartmentPermission("reservations"), updateReservation);
router.put("/:id/check-in", protect, authorize("admin", "staff"), requireDepartmentPermission("reservations"), checkIn);
router.put("/:id/check-out", protect, authorize("admin", "staff"), requireDepartmentPermission("reservations"), checkOut);
router.put("/:id/cancel", protect, authorize("admin", "staff"), requireDepartmentPermission("reservations"), cancelReservation);
router.put("/:id/no-show", protect, authorize("admin", "staff"), requireDepartmentPermission("reservations"), markNoShow);
router.delete("/:id", protect, authorize("admin"), requireDepartmentPermission("reservations"), deleteReservation);

module.exports = router;
