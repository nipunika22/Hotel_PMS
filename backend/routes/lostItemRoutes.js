// backend/routes/lostItemRoutes.js
const express = require("express");
const router = express.Router();
const {
  getItems,
  getItem,
  createItem,
  claimItem,
  disposeItem
} = require("../controllers/lostItemController");
const { protect, authorize } = require("../middleware/auth");
const rejectDepartmentAdmin = require("../middleware/rejectDepartmentAdmin");

router.use(protect, rejectDepartmentAdmin);

const ALL_STAFF_ROLES = ["admin", "manager", "staff", "housekeeping", "maintenance"];
const CLAIM_ROLES = ["admin", "manager", "staff"];
const DISPOSAL_ROLES = ["admin", "manager"];

router.get("/", protect, authorize(...ALL_STAFF_ROLES), getItems);
router.get("/:id", protect, authorize(...ALL_STAFF_ROLES), getItem);
router.post("/", protect, authorize(...ALL_STAFF_ROLES), createItem);
router.put("/:id/claim", protect, authorize(...CLAIM_ROLES), claimItem);
router.put("/:id/dispose", protect, authorize(...DISPOSAL_ROLES), disposeItem);

module.exports = router;
