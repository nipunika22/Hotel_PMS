const express = require("express");
const controller = require("../controllers/attendanceController");
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();
const STAFF_ROLES = ["admin", "manager", "staff", "finance", "housekeeping", "maintenance"];
const ADMIN_ROLES = ["admin", "super_admin"];

function requireAttendanceAdmin(req, res, next) {
  if (req.user.role !== "super_admin" && req.user.departmentAdmin === true) {
    return res.status(403).json({ error: "Department administrators may access only their own attendance" });
  }
  return next();
}

router.use(protect);
router.get("/properties", authorize(...STAFF_ROLES), controller.myProperties);
router.get("/mine", authorize(...STAFF_ROLES), controller.getMine);
router.post("/check-in", authorize(...STAFF_ROLES), controller.checkIn);
router.post("/check-out", authorize(...STAFF_ROLES), controller.checkOut);
router.get("/summary", authorize(...ADMIN_ROLES), requireAttendanceAdmin, controller.summary);
router.get("/staff", authorize(...ADMIN_ROLES), requireAttendanceAdmin, controller.staffOptions);
router.get("/", authorize(...ADMIN_ROLES), requireAttendanceAdmin, controller.list);
router.post("/corrections", authorize(...ADMIN_ROLES), requireAttendanceAdmin, controller.createCorrection);
router.put("/:id/correction", authorize(...ADMIN_ROLES), requireAttendanceAdmin, controller.correct);

module.exports = router;
