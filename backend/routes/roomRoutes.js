// backend/routes/roomRoutes.js
const express = require("express");
const router = express.Router();
const {
  getRooms,
  getRoomsByStatus,
  getAvailableRooms,
  getRoom,
  addRoom,
  updateRoom,
  updateRoomStatus,
  deleteRoom,
  getRoomStats,
  getHousekeepingTasks
} = require("../controllers/roomController");
const { protect, authorize } = require("../middleware/auth");
const requireDepartmentPermission = require("../middleware/requireDepartmentPermission");

router.get("/", protect, authorize("admin", "manager", "staff", "housekeeping", "maintenance"), requireDepartmentPermission("rooms"), getRooms);
router.get("/status", protect, authorize("admin", "manager", "staff"), requireDepartmentPermission("rooms"), getRoomsByStatus);
router.get("/available", getAvailableRooms);
router.get("/stats", protect, authorize("admin", "manager", "staff"), requireDepartmentPermission("rooms"), getRoomStats);
router.get("/housekeeping", protect, authorize("admin", "manager", "staff", "housekeeping"), requireDepartmentPermission("rooms"), getHousekeepingTasks);
router.get("/:id", protect, authorize("admin", "manager", "staff", "housekeeping", "maintenance"), requireDepartmentPermission("rooms"), getRoom);
router.post("/", protect, authorize("admin", "manager", "staff"), requireDepartmentPermission("rooms"), addRoom);
router.put("/:id", protect, authorize("admin", "manager", "staff"), requireDepartmentPermission("rooms"), updateRoom);
router.put("/:id/status", protect, authorize("admin", "manager", "staff", "housekeeping"), requireDepartmentPermission("rooms"), updateRoomStatus);
router.delete("/:id", protect, authorize("admin"), requireDepartmentPermission("rooms"), deleteRoom);

module.exports = router;
