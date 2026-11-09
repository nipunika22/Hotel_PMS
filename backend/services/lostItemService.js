// backend/services/lostItemService.js
const LostItem = require("../models/LostItem");
const HousekeepingTask = require("../models/HousekeepingTask");
const Room = require("../models/Room");
const User = require("../models/User");

/**
 * Generate unique, collision-resistant item number (e.g. LOST261000001)
 */
async function generateItemNumber(session = null) {
  const now = new Date();
  const yearMonth = now.getFullYear().toString().slice(-2) + (now.getMonth() + 1).toString().padStart(2, "0");
  const prefix = `LOST${yearMonth}`;

  let latestQuery = LostItem.findOne({ itemNumber: new RegExp(`^${prefix}`) }, "itemNumber")
    .sort({ itemNumber: -1 });
  if (session) latestQuery = latestQuery.session(session);
  const latest = await latestQuery.lean();

  let seq = 1;
  if (latest && latest.itemNumber) {
    const parsed = parseInt(latest.itemNumber.replace(prefix, ""), 10);
    if (!Number.isNaN(parsed)) {
      seq = parsed + 1;
    }
  }

  let candidate = `${prefix}${seq.toString().padStart(5, "0")}`;
  let existsQuery = LostItem.findOne({ itemNumber: candidate }, "_id");
  if (session) existsQuery = existsQuery.session(session);
  while (await existsQuery.lean()) {
    seq++;
    candidate = `${prefix}${seq.toString().padStart(5, "0")}`;
    existsQuery = LostItem.findOne({ itemNumber: candidate }, "_id");
    if (session) existsQuery = existsQuery.session(session);
  }
  return candidate;
}

/**
 * Register a new lost item.
 */
async function registerLostItem({
  itemDescription,
  category = "Other",
  roomId,
  location,
  foundBy,
  foundDate,
  storageLocation,
  guestId,
  notes,
  sourceTaskId,
  propertyId = null
}, userId = null, session = null) {
  if (!itemDescription || !location || !foundBy) {
    const err = new Error("Item description, location, and foundBy are required");
    err.statusCode = 400;
    throw err;
  }

  const itemNumber = await generateItemNumber(session);

  let targetPropertyId = propertyId;
  if (!targetPropertyId && roomId) {
    const room = await Room.findById(roomId).select("property").lean();
    if (room && room.property) targetPropertyId = room.property;
  }
  if (!targetPropertyId) {
    const { getActivePropertyId } = require("../middleware/propertyContext");
    targetPropertyId = await getActivePropertyId();
  }

  const lostItem = new LostItem({
    property: targetPropertyId,
    itemNumber,
    itemDescription: itemDescription.trim(),
    category: category || "Other",
    room: roomId || null,
    location: location.trim(),
    foundBy: foundBy.trim(),
    foundDate: foundDate ? new Date(foundDate) : new Date(),
    status: "Found",
    storageLocation: storageLocation || "Front Desk Storage",
    guest: guestId || null,
    notes: notes || "",
    sourceTask: sourceTaskId || null,
    auditLog: [{
      action: "ITEM_REPORTED",
      performedBy: userId || null,
      timestamp: new Date(),
      details: `Item recorded: ${itemDescription.trim()} found at ${location.trim()} by ${foundBy.trim()}`
    }]
  });

  await lostItem.save({ session });

  return lostItem.populate([
    { path: "room", select: "roomNumber roomType floor" },
    { path: "guest", select: "firstName lastName phone email" },
    { path: "claimedBy", select: "name email role" },
    { path: "disposedBy", select: "name email role" }
  ]);
}

/**
 * List lost items with search and filters.
 */
async function listLostItems(filters = {}) {
  const query = {};

  if (filters.property) query.property = filters.property;
  if (filters.status) query.status = filters.status;
  if (filters.category) query.category = filters.category;
  if (filters.roomId) query.room = filters.roomId;

  if (filters.search) {
    const searchRegex = new RegExp(filters.search, "i");
    query.$or = [
      { itemDescription: searchRegex },
      { location: searchRegex },
      { foundBy: searchRegex },
      { itemNumber: searchRegex },
      { claimantName: searchRegex }
    ];
  }

  if (filters.startDate || filters.endDate) {
    query.foundDate = {};
    if (filters.startDate) query.foundDate.$gte = new Date(filters.startDate);
    if (filters.endDate) query.foundDate.$lte = new Date(filters.endDate);
  }

  return LostItem.find(query)
    .populate("room", "roomNumber roomType floor")
    .populate("guest", "firstName lastName phone email")
    .populate("claimedBy", "name email role")
    .populate("disposedBy", "name email role")
    .sort({ foundDate: -1, createdAt: -1 });
}

/**
 * Get single lost item by ID.
 */
async function getLostItem(id) {
  const item = await LostItem.findById(id)
    .populate("room", "roomNumber roomType floor")
    .populate("guest", "firstName lastName phone email")
    .populate("claimedBy", "name email role")
    .populate("disposedBy", "name email role")
    .populate("sourceTask");

  if (!item) {
    const err = new Error("Lost item not found");
    err.statusCode = 404;
    throw err;
  }
  return item;
}

/**
 * Process a claim for a lost item.
 */
async function claimLostItem(id, {
  claimantName,
  claimantPhone,
  claimantEmail,
  handoverVerification,
  notes
}, userId) {
  const item = await LostItem.findById(id);
  if (!item) {
    const err = new Error("Lost item not found");
    err.statusCode = 404;
    throw err;
  }

  if (item.status !== "Found") {
    const err = new Error(`Cannot claim item: current status is already '${item.status}'`);
    err.statusCode = 409;
    throw err;
  }

  if (!claimantName || (!claimantPhone && !claimantEmail)) {
    const err = new Error("Claimant name and contact phone or email are required");
    err.statusCode = 400;
    throw err;
  }

  const staffUser = await User.findById(userId);

  item.status = "Claimed";
  item.claimantName = claimantName.trim();
  item.claimantPhone = (claimantPhone || "").trim();
  item.claimantEmail = (claimantEmail || "").trim();
  item.handoverVerification = (handoverVerification || "").trim();
  item.claimedAt = new Date();
  item.claimedBy = userId;
  if (notes) item.notes = `${item.notes ? item.notes + "\n" : ""}Claim note: ${notes}`;

  item.auditLog.push({
    action: "ITEM_CLAIMED",
    performedBy: userId,
    timestamp: new Date(),
    details: `Item claimed by ${claimantName.trim()} (Phone: ${claimantPhone || "N/A"}, Email: ${claimantEmail || "N/A"}). Handover verified by ${staffUser?.name || "Staff"}`
  });

  await item.save();

  // Backward-compatible sync with embedded task.lostItems if applicable
  if (item.sourceTask) {
    await HousekeepingTask.updateOne(
      { _id: item.sourceTask, "lostItems.itemDescription": item.itemDescription },
      { $set: { "lostItems.$.status": "Claimed" } }
    ).catch(() => {});
  }

  return item.populate([
    { path: "room", select: "roomNumber roomType floor" },
    { path: "guest", select: "firstName lastName phone email" },
    { path: "claimedBy", select: "name email role" }
  ]);
}

/**
 * Dispose of an unclaimed lost item (Manager/Admin authorized).
 */
async function disposeLostItem(id, { disposalReason, notes }, userId) {
  const item = await LostItem.findById(id);
  if (!item) {
    const err = new Error("Lost item not found");
    err.statusCode = 404;
    throw err;
  }

  if (item.status !== "Found") {
    const err = new Error(`Cannot dispose item: current status is already '${item.status}'`);
    err.statusCode = 409;
    throw err;
  }

  if (!disposalReason) {
    const err = new Error("Disposal reason is required");
    err.statusCode = 400;
    throw err;
  }

  const staffUser = await User.findById(userId);
  if (!staffUser || !["admin", "manager"].includes(staffUser.role)) {
    const err = new Error("Only managers or admins can authorize lost item disposal");
    err.statusCode = 403;
    throw err;
  }

  item.status = "Disposed";
  item.disposalReason = disposalReason.trim();
  item.disposedAt = new Date();
  item.disposedBy = userId;
  if (notes) item.notes = `${item.notes ? item.notes + "\n" : ""}Disposal note: ${notes}`;

  item.auditLog.push({
    action: "ITEM_DISPOSED",
    performedBy: userId,
    timestamp: new Date(),
    details: `Item disposed by ${staffUser.name}. Reason: ${disposalReason.trim()}`
  });

  await item.save();

  // Backward-compatible sync with embedded task.lostItems if applicable
  if (item.sourceTask) {
    await HousekeepingTask.updateOne(
      { _id: item.sourceTask, "lostItems.itemDescription": item.itemDescription },
      { $set: { "lostItems.$.status": "Disposed" } }
    ).catch(() => {});
  }

  return item.populate([
    { path: "room", select: "roomNumber roomType floor" },
    { path: "guest", select: "firstName lastName phone email" },
    { path: "disposedBy", select: "name email role" }
  ]);
}

/**
 * Synchronize lost items from a HousekeepingTask into canonical LostItem records.
 * Keeps embedded task.lostItems intact for backward compatibility.
 * Idempotent: does not create duplicate LostItem records.
 */
async function syncFromHousekeepingTask(task, userId = null) {
  if (!task || !Array.isArray(task.lostItems) || task.lostItems.length === 0) {
    return [];
  }

  const syncedItems = [];
  const room = await Room.findById(task.room).lean();
  const roomLabel = room ? `Room ${room.roomNumber}` : "Room";

  for (const embeddedItem of task.lostItems) {
    if (!embeddedItem.itemDescription) continue;

    // Idempotency check: see if a canonical LostItem already exists for this task and description
    const existing = await LostItem.findOne({
      sourceTask: task._id,
      itemDescription: embeddedItem.itemDescription
    });

    if (existing) {
      syncedItems.push(existing);
      continue;
    }

    const itemNumber = await generateItemNumber();
    let targetPropertyId = task.property;
    if (!targetPropertyId && room && room.property) {
      targetPropertyId = room.property;
    }
    if (!targetPropertyId) {
      const { getActivePropertyId } = require("../middleware/propertyContext");
      targetPropertyId = await getActivePropertyId();
    }

    const canonical = new LostItem({
      property: targetPropertyId,
      itemNumber,
      itemDescription: embeddedItem.itemDescription,
      category: "Other",
      room: task.room,
      location: embeddedItem.location || roomLabel,
      foundBy: embeddedItem.foundBy || "Housekeeping Staff",
      foundDate: embeddedItem.foundDate || new Date(),
      status: embeddedItem.status || "Found",
      storageLocation: "Front Desk Storage",
      sourceTask: task._id,
      notes: embeddedItem.notes || "",
      auditLog: [{
        action: "ITEM_REPORTED",
        performedBy: userId || null,
        timestamp: new Date(),
        details: `Synchronized from Housekeeping Task ${task._id} for ${roomLabel}`
      }]
    });

    await canonical.save();
    syncedItems.push(canonical);
  }

  return syncedItems;
}

module.exports = {
  generateItemNumber,
  registerLostItem,
  listLostItems,
  getLostItem,
  claimLostItem,
  disposeLostItem,
  syncFromHousekeepingTask
};
