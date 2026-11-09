// backend/services/notificationService.js
const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const User = require("../models/User");
const Guest = require("../models/Guest");

/**
 * Maps standard hotel departments to matching roles and department values.
 */
const DEPARTMENT_ROLE_MAP = {
  "Housekeeping": ["housekeeping"],
  "Maintenance": ["maintenance"],
  "Finance": ["finance"],
  "Front Desk": ["staff"],
  "Management": ["admin", "manager"],
  "Kitchen": ["staff", "manager"],
  "Restaurant": ["staff", "manager"],
  "General": ["staff", "manager", "admin"]
};

/**
 * Creates a single notification for a specific recipient user.
 */
async function createNotification({
  recipient,
  sender = null,
  property = null,
  title,
  message,
  category = "system",
  priority = "normal",
  relatedEntity = { entityType: "None", entityId: null },
  actionUrl = "",
  targetAudience = "individual",
  targetDepartment = null,
  targetRole = null,
  campaignId = null,
  expiresAt = null
}) {
  if (!recipient || !mongoose.Types.ObjectId.isValid(recipient)) {
    throw new Error("Valid recipient user ID is required");
  }

  // Ensure recipient user exists and is eligible (not suspended)
  const recipientUser = await User.findById(recipient).select("status role email name");
  if (!recipientUser) {
    throw new Error("Recipient user not found");
  }

  if (recipientUser.status === "Suspended") {
    // Silently skip suspended user to prevent unintended delivery
    return null;
  }

  const notification = new Notification({
    recipient,
    sender,
    property,
    title,
    message,
    category,
    priority,
    targetAudience,
    targetDepartment,
    targetRole,
    relatedEntity,
    actionUrl,
    campaignId,
    expiresAt
  });

  return await notification.save();
}

/**
 * Resolves eligible recipient users for a given targeting audience.
 */
async function resolveRecipients({
  audience,
  targetId,
  selectedGuestIds = [],
  selectedUserIds = [],
  department,
  role,
  propertyId
}) {
  const query = { status: { $ne: "Suspended" } };

  // Property scoping for staff members where applicable
  if (propertyId && mongoose.Types.ObjectId.isValid(propertyId)) {
    // If property specified, filter users associated with this property or chain-wide staff
    // Guests can book across properties, but staff can be property-scoped
  }

  switch (audience) {
    case "individual": {
      if (!targetId || !mongoose.Types.ObjectId.isValid(targetId)) {
        throw new Error("Valid target user ID is required for individual recipient");
      }
      query._id = targetId;
      break;
    }

    case "guest": {
      if (!targetId || !mongoose.Types.ObjectId.isValid(targetId)) {
        throw new Error("Valid guest ID is required");
      }
      const guest = await Guest.findById(targetId);
      if (!guest) throw new Error("Guest profile not found");

      // Find user associated with guest
      let userQuery = {};
      if (guest.user) {
        userQuery._id = guest.user;
      } else if (guest.email) {
        userQuery.email = guest.email.toLowerCase().trim();
      } else {
        throw new Error("Guest has no linked user account or email address");
      }
      query._id = (await User.findOne(userQuery).select("_id"))?._id;
      if (!query._id) {
        throw new Error("No registered customer user account found for this guest");
      }
      break;
    }

    case "selected_guests": {
      if (!Array.isArray(selectedGuestIds) || selectedGuestIds.length === 0) {
        throw new Error("At least one guest ID must be selected");
      }
      const guests = await Guest.find({ _id: { $in: selectedGuestIds } }).select("user email");
      const userIds = [];
      const emails = [];

      for (const g of guests) {
        if (g.user) userIds.push(g.user);
        else if (g.email) emails.push(g.email.toLowerCase().trim());
      }

      const users = await User.find({
        $or: [
          { _id: { $in: userIds } },
          { email: { $in: emails } }
        ],
        status: { $ne: "Suspended" }
      }).select("_id");

      query._id = { $in: users.map(u => u._id) };
      break;
    }

    case "department": {
      if (!department) {
        throw new Error("Department name is required");
      }
      const mappedRoles = DEPARTMENT_ROLE_MAP[department] || [];
      const deptFilter = [
        { department: department },
        { role: { $in: mappedRoles } }
      ];

      // If specific individual users selected within department
      if (Array.isArray(selectedUserIds) && selectedUserIds.length > 0) {
        query._id = { $in: selectedUserIds };
      } else {
        query.$or = deptFilter;
      }
      query.role = { $ne: "customer" }; // Departments only apply to staff
      break;
    }

    case "role": {
      if (!role) {
        throw new Error("Role name is required");
      }
      query.role = role.toLowerCase().trim();
      break;
    }

    case "staff": {
      query.role = { $in: ["admin", "staff", "manager", "finance", "housekeeping", "maintenance"] };
      if (department) {
        const mappedRoles = DEPARTMENT_ROLE_MAP[department] || [];
        query.$and = [
          { $or: [{ department }, { role: { $in: mappedRoles } }] }
        ];
      }
      if (role) {
        query.role = role.toLowerCase().trim();
      }
      break;
    }

    case "all_guests": {
      query.role = "customer";
      break;
    }

    case "all_users": {
      // All eligible active users (staff and guests)
      break;
    }

    default:
      throw new Error(`Unsupported recipient audience mode: ${audience}`);
  }

  return await User.find(query).select("_id name email role department status");
}

/**
 * Sends a notification to an audience group (bulk dispatch).
 */
async function sendAudienceNotification({
  audience,
  targetId,
  selectedGuestIds = [],
  selectedUserIds = [],
  department,
  role,
  title,
  message,
  category = "announcement",
  priority = "normal",
  senderId = null,
  propertyId = null,
  relatedEntity = { entityType: "None", entityId: null },
  actionUrl = "",
  expiresAt = null
}) {
  if (!title || !message) {
    throw new Error("Notification title and message body are required");
  }

  const recipients = await resolveRecipients({
    audience,
    targetId,
    selectedGuestIds,
    selectedUserIds,
    department,
    role,
    propertyId
  });

  if (!recipients || recipients.length === 0) {
    return {
      success: true,
      count: 0,
      campaignId: null,
      message: "No eligible recipients found for the selected targeting criteria."
    };
  }

  // Generate unique campaign ID grouping this send
  const campaignId = `cmp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const docs = recipients.map(user => ({
    recipient: user._id,
    sender: senderId,
    property: propertyId,
    title: title.trim(),
    message: message.trim(),
    category,
    priority,
    targetAudience: audience,
    targetDepartment: department || (user.department || null),
    targetRole: role || user.role,
    relatedEntity,
    actionUrl: actionUrl.trim(),
    campaignId,
    expiresAt,
    isRead: false,
    createdAt: new Date()
  }));

  const inserted = await Notification.insertMany(docs);

  return {
    success: true,
    count: inserted.length,
    campaignId,
    recipientsCount: inserted.length
  };
}

/**
 * Retrieves paginated notifications for an authenticated user with optional read/category filters.
 */
async function getUserNotifications(userId, {
  isRead,
  category,
  priority,
  search,
  page = 1,
  limit = 20
} = {}) {
  const query = {
    recipient: userId,
    isArchived: false
  };

  if (isRead !== undefined && isRead !== null && isRead !== "") {
    query.isRead = isRead === "true" || isRead === true;
  }

  if (category && category !== "all") {
    query.category = category;
  }

  if (priority && priority !== "all") {
    query.priority = priority;
  }

  if (search && search.trim()) {
    const s = search.trim();
    query.$or = [
      { title: { $regex: s, $options: "i" } },
      { message: { $regex: s, $options: "i" } }
    ];
  }

  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (p - 1) * l;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(query)
      .populate("sender", "name email role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(l)
      .lean(),
    Notification.countDocuments(query),
    Notification.countDocuments({ recipient: userId, isRead: false, isArchived: false })
  ]);

  return {
    notifications,
    total,
    unreadCount,
    page: p,
    limit: l,
    totalPages: Math.ceil(total / l) || 1
  };
}

/**
 * Fast unread notification count lookup.
 */
async function getUnreadCount(userId) {
  return await Notification.countDocuments({
    recipient: userId,
    isRead: false,
    isArchived: false
  });
}

/**
 * Marks a single notification as read, enforcing recipient ownership.
 */
async function markAsRead(notificationId, userId) {
  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    throw new Error("Invalid notification ID");
  }

  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, recipient: userId },
    { $set: { isRead: true, readAt: new Date() } },
    { new: true }
  ).populate("sender", "name email role");

  if (!notification) {
    throw new Error("Notification not found or access denied");
  }

  return notification;
}

/**
 * Marks all notifications as read for a specific authenticated user.
 */
async function markAllAsRead(userId) {
  const result = await Notification.updateMany(
    { recipient: userId, isRead: false, isArchived: false },
    { $set: { isRead: true, readAt: new Date() } }
  );

  return {
    success: true,
    modifiedCount: result.modifiedCount
  };
}

/**
 * Archives a notification for the recipient.
 */
async function archiveNotification(notificationId, userId) {
  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    throw new Error("Invalid notification ID");
  }

  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, recipient: userId },
    { $set: { isArchived: true } },
    { new: true }
  );

  if (!notification) {
    throw new Error("Notification not found or access denied");
  }

  return notification;
}

/**
 * Returns administrative statistics for notifications across the system/property.
 */
async function getAdminStats(propertyId = null) {
  const match = { isArchived: false };
  if (propertyId && mongoose.Types.ObjectId.isValid(propertyId)) {
    match.property = new mongoose.Types.ObjectId(propertyId);
  }

  const [totalSent, totalRead, totalUnread, categoryStats, priorityStats, audienceStats] = await Promise.all([
    Notification.countDocuments(match),
    Notification.countDocuments({ ...match, isRead: true }),
    Notification.countDocuments({ ...match, isRead: false }),
    Notification.aggregate([
      { $match: match },
      { $group: { _id: "$category", count: { $sum: 1 } } }
    ]),
    Notification.aggregate([
      { $match: match },
      { $group: { _id: "$priority", count: { $sum: 1 } } }
    ]),
    Notification.aggregate([
      { $match: match },
      { $group: { _id: "$targetAudience", count: { $sum: 1 } } }
    ])
  ]);

  const readRate = totalSent > 0 ? Math.round((totalRead / totalSent) * 100) : 0;

  return {
    totalSent,
    totalRead,
    totalUnread,
    readRate,
    categories: categoryStats.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {}),
    priorities: priorityStats.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {}),
    audiences: audienceStats.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {})
  };
}

/**
 * Returns administrative list of campaigns and notifications.
 */
async function getAdminCampaigns(propertyId, {
  page = 1,
  limit = 15,
  search = "",
  category = "all",
  priority = "all",
  audience = "all"
} = {}) {
  const match = { isArchived: false };
  if (propertyId && mongoose.Types.ObjectId.isValid(propertyId)) {
    match.property = new mongoose.Types.ObjectId(propertyId);
  }

  if (category && category !== "all") match.category = category;
  if (priority && priority !== "all") match.priority = priority;
  if (audience && audience !== "all") match.targetAudience = audience;

  if (search && search.trim()) {
    match.$or = [
      { title: { $regex: search.trim(), $options: "i" } },
      { message: { $regex: search.trim(), $options: "i" } }
    ];
  }

  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 15));
  const skip = (p - 1) * l;

  // Group by campaignId or _id for single notifications
  const aggregatePipeline = [
    { $match: match },
    {
      $group: {
        _id: { $ifNull: ["$campaignId", { $toString: "$_id" }] },
        notificationId: { $first: "$_id" },
        title: { $first: "$title" },
        message: { $first: "$message" },
        category: { $first: "$category" },
        priority: { $first: "$priority" },
        targetAudience: { $first: "$targetAudience" },
        targetDepartment: { $first: "$targetDepartment" },
        targetRole: { $first: "$targetRole" },
        actionUrl: { $first: "$actionUrl" },
        sender: { $first: "$sender" },
        createdAt: { $first: "$createdAt" },
        totalRecipients: { $sum: 1 },
        readCount: {
          $sum: { $cond: [{ $eq: ["$isRead", true] }, 1, 0] }
        }
      }
    },
    { $sort: { createdAt: -1 } }
  ];

  const countPipeline = [...aggregatePipeline, { $count: "total" }];
  const [totalRes, items] = await Promise.all([
    Notification.aggregate(countPipeline),
    Notification.aggregate([
      ...aggregatePipeline,
      { $skip: skip },
      { $limit: l },
      {
        $lookup: {
          from: "users",
          localField: "sender",
          foreignField: "_id",
          as: "senderInfo"
        }
      },
      {
        $addFields: {
          senderUser: { $arrayElemAt: ["$senderInfo", 0] },
          readRate: {
            $cond: [
              { $gt: ["$totalRecipients", 0] },
              { $round: [{ $multiply: [{ $divide: ["$readCount", "$totalRecipients"] }, 100] }] },
              0
            ]
          }
        }
      },
      {
        $project: {
          _id: 1,
          notificationId: 1,
          title: 1,
          message: 1,
          category: 1,
          priority: 1,
          targetAudience: 1,
          targetDepartment: 1,
          targetRole: 1,
          actionUrl: 1,
          createdAt: 1,
          totalRecipients: 1,
          readCount: 1,
          readRate: 1,
          sender: {
            _id: "$senderUser._id",
            name: "$senderUser.name",
            email: "$senderUser.email",
            role: "$senderUser.role"
          }
        }
      }
    ])
  ]);

  const total = totalRes[0]?.total || 0;

  return {
    campaigns: items,
    total,
    page: p,
    limit: l,
    totalPages: Math.ceil(total / l) || 1
  };
}

/**
 * Returns detailed recipient list and read statistics for a campaign.
 */
async function getCampaignRecipients(campaignId, propertyId = null) {
  const query = {
    $or: [
      { campaignId: campaignId },
      ...(mongoose.Types.ObjectId.isValid(campaignId) ? [{ _id: new mongoose.Types.ObjectId(campaignId) }] : [])
    ]
  };

  const notifications = await Notification.find(query)
    .populate("recipient", "name email role department status")
    .select("recipient isRead readAt createdAt")
    .lean();

  return notifications.map(n => ({
    recipientId: n.recipient?._id,
    name: n.recipient?.name || "Unknown",
    email: n.recipient?.email || "N/A",
    role: n.recipient?.role || "guest",
    department: n.recipient?.department || "General",
    isRead: n.isRead,
    readAt: n.readAt,
    sentAt: n.createdAt
  }));
}

module.exports = {
  createNotification,
  resolveRecipients,
  sendAudienceNotification,
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  archiveNotification,
  getAdminStats,
  getAdminCampaigns,
  getCampaignRecipients
};
