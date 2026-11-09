// backend/routes/guestRoutes.js
const express = require("express");
const router = express.Router();
const {
  getGuests,
  searchGuests,
  getGuest,
  addGuest,
  updateGuest,
  updateGuestStatus,
  deleteGuest,
  getGuestStats
} = require("../controllers/guestController");
const { protect, authorize } = require("../middleware/auth");
const requireDepartmentPermission = require("../middleware/requireDepartmentPermission");

const GUEST_VIEW_ROLES = ["admin", "staff", "manager"];

router.use(protect, requireDepartmentPermission("reservations"));
router.get("/", authorize(...GUEST_VIEW_ROLES), getGuests);
router.get("/search", authorize(...GUEST_VIEW_ROLES), searchGuests);
router.get("/stats", authorize(...GUEST_VIEW_ROLES), getGuestStats);
router.get("/:id", authorize(...GUEST_VIEW_ROLES), getGuest);
router.post("/", authorize(...GUEST_VIEW_ROLES), addGuest);
router.put("/:id", authorize(...GUEST_VIEW_ROLES), updateGuest);
router.put("/:id/status", authorize(...GUEST_VIEW_ROLES), updateGuestStatus);
router.delete("/:id", authorize("admin"), deleteGuest);

module.exports = router;
