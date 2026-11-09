const express = require("express");
const controller = require("../controllers/superAdminController");
const { protect, requireActiveSuperAdmin } = require("../middleware/superAdminAuth");

const router = express.Router();
router.use(protect, requireActiveSuperAdmin);

router.get("/dashboard", controller.getDashboard);
router.get("/properties", controller.getProperties);
router.get("/chains", controller.getChains);
router.post("/properties", controller.createProperty);
router.put("/properties/:id", controller.updateProperty);
router.get("/admins", controller.getAdmins);
router.post("/admins", controller.createAdmin);
router.put("/admins/:id", controller.updateAdmin);
router.get("/staff", controller.getStaff);
router.get("/staff/:id", controller.getStaffProfile);
router.post("/staff", controller.createStaff);
router.put("/staff/:id", controller.updateStaff);
router.get("/roles", controller.getRoles);
router.get("/reservations", controller.getReservations);
router.get("/rooms", controller.getRooms);
router.get("/customers", controller.getCustomers);
router.get("/users", controller.getManagedUsers);
router.put("/users/:id", controller.updateManagedUser);
router.put("/users/:id/password", controller.resetManagedUserPassword);
router.get("/customers/:id/reservations", controller.getCustomerReservations);
router.get("/reports", controller.getReports);
router.get("/audit-logs", controller.getAuditLogs);
router.get("/settings", controller.getSettings);

module.exports = router;
