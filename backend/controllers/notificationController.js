// backend/controllers/notificationController.js
const notificationService = require("../services/notificationService");
const User = require("../models/User");
const Guest = require("../models/Guest");

/**
 * @desc Get notifications for current authenticated user
 * @route GET /api/notifications
 * @access Private
 */
exports.getMyNotifications = async (req, res) => {
  try {
    const data = await notificationService.getUserNotifications(req.user._id, req.query);
    res.json({
      success: true,
      ...data
    });
  } catch (err) {
    console.error("Get notifications error:", err);
    res.status(500).json({ error: "Failed to load notifications" });
  }
};

/**
 * @desc Get unread notifications count for current authenticated user
 * @route GET /api/notifications/unread-count
 * @access Private
 */
exports.getMyUnreadCount = async (req, res) => {
  try {
    const count = await notificationService.getUnreadCount(req.user._id);
    res.json({
      success: true,
      unreadCount: count
    });
  } catch (err) {
    console.error("Get unread count error:", err);
    res.status(500).json({ error: "Failed to retrieve unread notification count" });
  }
};

/**
 * @desc Mark single notification as read
 * @route PATCH /api/notifications/:id/read
 * @access Private
 */
exports.markNotificationRead = async (req, res) => {
  try {
    const notification = await notificationService.markAsRead(req.params.id, req.user._id);
    res.json({
      success: true,
      notification
    });
  } catch (err) {
    const status = err.message.includes("not found") ? 404 : 400;
    res.status(status).json({ error: err.message || "Failed to mark notification as read" });
  }
};

/**
 * @desc Mark all notifications as read for current user
 * @route PATCH /api/notifications/read-all
 * @access Private
 */
exports.markAllNotificationsRead = async (req, res) => {
  try {
    const result = await notificationService.markAllAsRead(req.user._id);
    res.json({
      success: true,
      modifiedCount: result.modifiedCount
    });
  } catch (err) {
    console.error("Mark all read error:", err);
    res.status(500).json({ error: "Failed to mark all notifications as read" });
  }
};

/**
 * @desc Archive / Dismiss notification
 * @route DELETE /api/notifications/:id
 * @access Private
 */
exports.archiveNotification = async (req, res) => {
  try {
    const notification = await notificationService.archiveNotification(req.params.id, req.user._id);
    res.json({
      success: true,
      notification
    });
  } catch (err) {
    const status = err.message.includes("not found") ? 404 : 400;
    res.status(status).json({ error: err.message || "Failed to archive notification" });
  }
};

/**
 * @desc Admin/Manager: Send manual notification to targeted audience
 * @route POST /api/notifications/admin/send
 * @access Private (Admin, Manager)
 */
exports.sendAdminNotification = async (req, res) => {
  try {
    const {
      audience,
      targetId,
      selectedGuestIds,
      selectedUserIds,
      department,
      role,
      title,
      message,
      category,
      priority,
      actionUrl,
      expiresAt
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Notification title is required" });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Message body is required" });
    }

    const result = await notificationService.sendAudienceNotification({
      audience: audience || "individual",
      targetId,
      selectedGuestIds,
      selectedUserIds,
      department,
      role,
      title: title.trim(),
      message: message.trim(),
      category: category || "announcement",
      priority: priority || "normal",
      senderId: req.user._id,
      propertyId: req.propertyId || req.user.property || null,
      actionUrl: actionUrl || "",
      expiresAt: expiresAt ? new Date(expiresAt) : null
    });

    res.status(201).json({
      success: true,
      ...result
    });
  } catch (err) {
    console.error("Send admin notification error:", err);
    res.status(400).json({ error: err.message || "Failed to send notification" });
  }
};

/**
 * @desc Admin/Manager: Preview recipient count before sending bulk announcement
 * @route GET /api/notifications/admin/preview-recipients
 * @access Private (Admin, Manager)
 */
exports.previewRecipients = async (req, res) => {
  try {
    const { audience, targetId, department, role, selectedGuestIds, selectedUserIds } = req.query;

    const guestIds = selectedGuestIds ? selectedGuestIds.split(",").filter(Boolean) : [];
    const userIds = selectedUserIds ? selectedUserIds.split(",").filter(Boolean) : [];

    const recipients = await notificationService.resolveRecipients({
      audience: audience || "individual",
      targetId,
      selectedGuestIds: guestIds,
      selectedUserIds: userIds,
      department,
      role,
      propertyId: req.propertyId
    });

    res.json({
      success: true,
      count: recipients.length,
      sampleRecipients: recipients.slice(0, 10).map(u => ({
        id: u._id,
        name: u.name,
        role: u.role,
        department: u.department
      }))
    });
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to preview recipients" });
  }
};

/**
 * @desc Admin/Manager: Get notification analytics & delivery stats
 * @route GET /api/notifications/admin/stats
 * @access Private (Admin, Manager)
 */
exports.getAdminNotificationStats = async (req, res) => {
  try {
    const stats = await notificationService.getAdminStats(req.propertyId);
    res.json({
      success: true,
      stats
    });
  } catch (err) {
    console.error("Get admin notification stats error:", err);
    res.status(500).json({ error: "Failed to load notification statistics" });
  }
};

/**
 * @desc Admin/Manager: Get list of sent notification campaigns / announcements
 * @route GET /api/notifications/admin/campaigns
 * @access Private (Admin, Manager)
 */
exports.getAdminCampaigns = async (req, res) => {
  try {
    const data = await notificationService.getAdminCampaigns(req.propertyId, req.query);
    res.json({
      success: true,
      ...data
    });
  } catch (err) {
    console.error("Get admin campaigns error:", err);
    res.status(500).json({ error: "Failed to load notification campaigns" });
  }
};

/**
 * @desc Admin/Manager: Get recipient delivery details for a campaign
 * @route GET /api/notifications/admin/campaigns/:campaignId
 * @access Private (Admin, Manager)
 */
exports.getCampaignDetails = async (req, res) => {
  try {
    const recipients = await notificationService.getCampaignRecipients(req.params.campaignId, req.propertyId);
    res.json({
      success: true,
      recipients
    });
  } catch (err) {
    console.error("Get campaign details error:", err);
    res.status(500).json({ error: "Failed to load campaign recipient details" });
  }
};

/**
 * @desc Admin/Manager: Get searchable lists of users and guests for composer dropdowns
 * @route GET /api/notifications/admin/recipient-options
 * @access Private (Admin, Manager)
 */
exports.getRecipientOptions = async (req, res) => {
  try {
    const [staffUsers, guests] = await Promise.all([
      User.find({ role: { $ne: "customer" }, status: { $ne: "Suspended" } })
        .select("_id name email role department")
        .sort({ name: 1 })
        .lean(),
      Guest.find({ status: { $ne: "Suspended" } })
        .select("_id firstName lastName email phone user")
        .sort({ firstName: 1 })
        .limit(100)
        .lean()
    ]);

    res.json({
      success: true,
      staffUsers,
      guests: guests.map(g => ({
        _id: g._id,
        name: `${g.firstName} ${g.lastName}`.trim(),
        email: g.email || "No email",
        hasAccount: !!g.user
      }))
    });
  } catch (err) {
    console.error("Get recipient options error:", err);
    res.status(500).json({ error: "Failed to load recipient options" });
  }
};
