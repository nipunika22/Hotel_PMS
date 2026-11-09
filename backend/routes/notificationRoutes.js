// backend/routes/notificationRoutes.js
const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notificationController");
const { protect, authorize } = require("../middleware/auth");
const rejectDepartmentAdmin = require("../middleware/rejectDepartmentAdmin");

// -------------------------------------------------------------
// Authenticated User Notification Inboxes (Guest & Staff)
// -------------------------------------------------------------
router.get("/", protect, notificationController.getMyNotifications);
router.get("/unread-count", protect, notificationController.getMyUnreadCount);
router.patch("/read-all", protect, notificationController.markAllNotificationsRead);
router.patch("/:id/read", protect, notificationController.markNotificationRead);
router.delete("/:id", protect, notificationController.archiveNotification);

// -------------------------------------------------------------
// Admin & Management Notification Center Endpoints
// -------------------------------------------------------------
router.post(
  "/admin/send",
  protect,
  rejectDepartmentAdmin,
  authorize("admin", "manager"),
  notificationController.sendAdminNotification
);

router.get(
  "/admin/stats",
  protect,
  rejectDepartmentAdmin,
  authorize("admin", "manager"),
  notificationController.getAdminNotificationStats
);

router.get(
  "/admin/campaigns",
  protect,
  rejectDepartmentAdmin,
  authorize("admin", "manager"),
  notificationController.getAdminCampaigns
);

router.get(
  "/admin/campaigns/:campaignId",
  protect,
  rejectDepartmentAdmin,
  authorize("admin", "manager"),
  notificationController.getCampaignDetails
);

router.get(
  "/admin/preview-recipients",
  protect,
  rejectDepartmentAdmin,
  authorize("admin", "manager"),
  notificationController.previewRecipients
);

router.get(
  "/admin/recipient-options",
  protect,
  rejectDepartmentAdmin,
  authorize("admin", "manager"),
  notificationController.getRecipientOptions
);

module.exports = router;
