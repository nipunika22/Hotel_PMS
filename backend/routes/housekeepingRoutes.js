// backend/routes/housekeepingRoutes.js
const express = require("express");
const router = express.Router();
const {
  getTasks,
  getMyTasks,
  createTask,
  assignTask,
  startTask,
  completeTask,
  inspectTask,
  getStaff
} = require("../controllers/housekeepingController");
const { protect, authorize } = require("../middleware/auth");
const requireDepartmentPermission = require("../middleware/requireDepartmentPermission");

router.use(protect, requireDepartmentPermission("rooms"));

const ALL_HOUSEKEEPING_ROLES = ["admin", "manager", "staff", "housekeeping"];
const SUPERVISOR_ROLES = ["admin", "manager"];

router.get("/", protect, authorize(...ALL_HOUSEKEEPING_ROLES), getTasks);
router.get("/my", protect, authorize(...ALL_HOUSEKEEPING_ROLES), getMyTasks);
router.get("/staff", protect, authorize(...SUPERVISOR_ROLES, "staff"), getStaff);
router.post("/", protect, authorize(...SUPERVISOR_ROLES, "staff"), createTask);
router.put("/:id/assign", protect, authorize(...SUPERVISOR_ROLES, "staff"), assignTask);
router.put("/:id/start", protect, authorize(...ALL_HOUSEKEEPING_ROLES), startTask);
router.put("/:id/complete", protect, authorize(...ALL_HOUSEKEEPING_ROLES), completeTask);
router.put("/:id/inspect", protect, authorize(...SUPERVISOR_ROLES), inspectTask);

module.exports = router;
