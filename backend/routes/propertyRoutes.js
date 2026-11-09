// backend/routes/propertyRoutes.js
const express = require("express");
const router = express.Router();
const {
  getCurrentProperty,
  getProperties,
  getPropertyById,
  updateProperty
} = require("../controllers/propertyController");
const { protect, authorize } = require("../middleware/auth");
const rejectDepartmentAdmin = require("../middleware/rejectDepartmentAdmin");

router.get("/current", getCurrentProperty);
router.get("/", getProperties);
router.get("/:id", getPropertyById);
router.put("/:id", protect, rejectDepartmentAdmin, authorize("admin"), updateProperty);

module.exports = router;
