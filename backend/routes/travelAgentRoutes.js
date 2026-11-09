// backend/routes/travelAgentRoutes.js
const express = require("express");
const router = express.Router();
const {
  getAgents,
  getActiveAgents,
  getAgent,
  addAgent,
  updateAgent,
  deleteAgent,
  updateBalance,
  getAgentStats
} = require("../controllers/travelAgentController");
const { protect, authorize } = require("../middleware/auth");
const requireDepartmentPermission = require("../middleware/requireDepartmentPermission");

router.use(protect, requireDepartmentPermission("reservations"));

router.get("/", protect, authorize("admin", "staff"), getAgents);
router.get("/active", protect, authorize("admin", "staff"), getActiveAgents);
router.get("/stats", protect, authorize("admin", "staff"), getAgentStats);
router.get("/:id", protect, authorize("admin", "staff"), getAgent);
router.post("/", protect, authorize("admin", "staff"), addAgent);
router.put("/:id", protect, authorize("admin", "staff"), updateAgent);
router.put("/:id/balance", protect, authorize("admin", "staff"), updateBalance);
router.delete("/:id", protect, authorize("admin"), deleteAgent);

module.exports = router;
