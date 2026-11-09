// backend/routes/maintenanceRoutes.js
const express = require("express");
const router = express.Router();
const {
  getTickets,
  getMyTickets,
  getTicket,
  createTicket,
  assignTechnician,
  startTicket,
  resolveTicket,
  closeTicket,
  blockRoom,
  releaseRoom,
  getTechnicians
} = require("../controllers/maintenanceController");
const { protect, authorize } = require("../middleware/auth");
const requireDepartmentPermission = require("../middleware/requireDepartmentPermission");

router.use(protect, requireDepartmentPermission("rooms"));

const ALL_MAINTENANCE_ROLES = ["admin", "manager", "staff", "housekeeping", "maintenance"];
const TECHNICIAN_ROLES = ["admin", "manager", "staff", "maintenance"];
const SUPERVISOR_ROLES = ["admin", "manager"];

router.get("/", protect, authorize(...ALL_MAINTENANCE_ROLES), getTickets);
router.get("/my", protect, authorize(...TECHNICIAN_ROLES), getMyTickets);
router.get("/technicians", protect, authorize(...SUPERVISOR_ROLES, "staff"), getTechnicians);
router.get("/:id", protect, authorize(...ALL_MAINTENANCE_ROLES), getTicket);
router.post("/", protect, authorize("admin", "manager", "staff", "housekeeping"), createTicket);
router.put("/block-room", protect, authorize(...SUPERVISOR_ROLES), blockRoom);
router.put("/release-room", protect, authorize(...SUPERVISOR_ROLES), releaseRoom);
router.put("/:id/assign", protect, authorize(...SUPERVISOR_ROLES), assignTechnician);
router.put("/:id/start", protect, authorize(...TECHNICIAN_ROLES), startTicket);
router.put("/:id/resolve", protect, authorize(...TECHNICIAN_ROLES), resolveTicket);
router.put("/:id/close", protect, authorize(...SUPERVISOR_ROLES), closeTicket);

module.exports = router;
