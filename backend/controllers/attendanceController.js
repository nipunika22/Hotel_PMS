const mongoose = require("mongoose");
const Attendance = require("../models/Attendance");
const User = require("../models/User");
const Property = require("../models/Property");
const AdminAuditLog = require("../models/AdminAuditLog");

const STAFF_ROLES = ["admin", "manager", "staff", "finance", "housekeeping", "maintenance"];
const ATTENDANCE_STATUSES = ["Present", "Late", "On Leave", "Absent"];
const PAGE_SIZE_MAX = 100;

function validDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function dateInTimezone(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "UTC", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function assignedPropertyIds(user) {
  return [...new Set([
    ...(user.property ? [String(user.property._id || user.property)] : []),
    ...((user.allowedProperties || []).map((item) => String(item._id || item)))
  ])];
}

async function resolveStaffProperty(req, requestedId) {
  const ids = assignedPropertyIds(req.user);
  let id = requestedId ? String(requestedId) : "";
  if (!id) {
    if (req.user.property) id = String(req.user.property._id || req.user.property);
    else if (ids.length === 1) id = ids[0];
    else if (ids.length > 1) return { error: "Choose one of your assigned properties" };
    else return { error: "A property assignment is required for attendance" };
  }
  if (!mongoose.Types.ObjectId.isValid(id)) return { error: "Invalid property ID", status: 400 };
  if (!ids.includes(id)) return { error: "You are not assigned to this property", status: 403 };
  const property = await Property.findOne({ _id: id, status: "Active" }).select("name code timezone").lean();
  if (!property) return { error: "Active assigned property not found", status: 404 };
  try { dateInTimezone(new Date(), property.timezone); }
  catch { return { error: "The property's timezone is invalid. Contact an administrator.", status: 400 }; }
  return { property };
}

exports.myProperties = async (req, res) => {
  try {
    const ids = assignedPropertyIds(req.user);
    const properties = ids.length ? await Property.find({ _id: { $in: ids }, status: "Active" }).select("name code timezone").sort({ name: 1 }).lean() : [];
    return res.json({ items: properties });
  } catch (error) { return sendError(res, error); }
};

function sendError(res, error) {
  if (error.code === 11000) return res.status(409).json({ error: "Attendance already exists for this staff member and date" });
  if (error.name === "ValidationError" || error.name === "CastError") return res.status(400).json({ error: error.message });
  console.error("Attendance request failed:", error.message);
  return res.status(500).json({ error: "The attendance request could not be completed" });
}

exports.getMine = async (req, res) => {
  try {
    const selected = await resolveStaffProperty(req, req.query.propertyId);
    if (selected.error) return res.status(selected.status || 400).json({ error: selected.error });
    const today = dateInTimezone(new Date(), selected.property.timezone);
    const [todayRecord, history] = await Promise.all([
      Attendance.findOne({ staff: req.user._id, property: selected.property._id, attendanceDate: today }).lean(),
      Attendance.find({ staff: req.user._id, property: selected.property._id })
        .sort({ attendanceDate: -1 }).limit(90).lean()
    ]);
    return res.json({ property: { _id: selected.property._id, name: selected.property.name, timezone: selected.property.timezone }, attendanceDate: today, today: todayRecord, history, policy: "Check-in records are timestamped by the server. No automatic late or absent rule is configured; administrators must record a correction with a reason." });
  } catch (error) { return sendError(res, error); }
};

exports.checkIn = async (req, res) => {
  try {
    const selected = await resolveStaffProperty(req, req.body?.propertyId);
    if (selected.error) return res.status(selected.status || 400).json({ error: selected.error });
    const now = new Date();
    const attendanceDate = dateInTimezone(now, selected.property.timezone);
    const existing = await Attendance.findOne({ staff: req.user._id, property: selected.property._id, attendanceDate });
    if (existing) return res.status(409).json({ error: existing.checkIn ? "You have already checked in for this attendance date" : "An attendance record already exists; contact an administrator to correct it" });
    const record = await Attendance.create({ staff: req.user._id, property: selected.property._id, attendanceDate, checkIn: now, status: "Present" });
    return res.status(201).json({ attendance: record });
  } catch (error) { return sendError(res, error); }
};

exports.checkOut = async (req, res) => {
  try {
    const selected = await resolveStaffProperty(req, req.body?.propertyId);
    if (selected.error) return res.status(selected.status || 400).json({ error: selected.error });
    const attendanceDate = dateInTimezone(new Date(), selected.property.timezone);
    const filter = { staff: req.user._id, property: selected.property._id, attendanceDate };
    const record = await Attendance.findOneAndUpdate(
      { ...filter, checkIn: { $ne: null }, checkOut: null, status: { $in: ["Present", "Late"] } },
      { $set: { checkOut: new Date() } },
      { new: true, runValidators: true }
    );
    if (record) return res.json({ attendance: record });

    const existing = await Attendance.findOne(filter);
    if (!existing || !existing.checkIn) return res.status(409).json({ error: "Check in before checking out" });
    if (existing.checkOut) return res.status(409).json({ error: "You have already checked out for this attendance date" });
    return res.status(409).json({ error: "This attendance status cannot be checked out; contact an administrator" });
  } catch (error) { return sendError(res, error); }
};

function attendanceScope(req) {
  if (req.user.role === "super_admin") return {};
  const ids = assignedPropertyIds(req.user);
  return ids.length ? { property: { $in: ids } } : null;
}

exports.list = async (req, res) => {
  const scope = attendanceScope(req);
  if (!scope) return res.status(403).json({ error: "An explicit property assignment is required" });
  const filter = { ...scope };
  if (req.user.role !== "super_admin" && req.query.propertyId && !assignedPropertyIds(req.user).includes(String(req.query.propertyId))) {
    return res.status(403).json({ error: "You are not assigned to this property" });
  }
  if (req.query.propertyId) {
    if (!mongoose.Types.ObjectId.isValid(req.query.propertyId)) return res.status(400).json({ error: "Invalid property ID" });
    filter.property = req.query.propertyId;
  }
  if (req.query.month && (req.query.from || req.query.to)) return res.status(400).json({ error: "Use either a month or a date range" });
  if (req.query.month) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.month)) return res.status(400).json({ error: "Month must use YYYY-MM format" });
    const [year, month] = req.query.month.split("-").map(Number);
    filter.attendanceDate = { $gte: `${req.query.month}-01`, $lte: `${req.query.month}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}` };
  } else if (req.query.from || req.query.to) {
    if ((req.query.from && !validDateKey(req.query.from)) || (req.query.to && !validDateKey(req.query.to)) || (req.query.from && req.query.to && req.query.from > req.query.to)) return res.status(400).json({ error: "Provide a valid date range" });
    filter.attendanceDate = {};
    if (req.query.from) filter.attendanceDate.$gte = req.query.from;
    if (req.query.to) filter.attendanceDate.$lte = req.query.to;
  }
  if (req.query.status) {
    if (!ATTENDANCE_STATUSES.includes(req.query.status)) return res.status(400).json({ error: "Invalid attendance status" });
    filter.status = req.query.status;
  }
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 20));
  try {
    if (req.query.staffId) {
      const requestedStaff = String(req.query.staffId).trim();
      const staffQuery = { role: { $in: STAFF_ROLES }, $or: [{ staffId: requestedStaff.toUpperCase() }] };
      if (mongoose.Types.ObjectId.isValid(requestedStaff)) staffQuery.$or.push({ _id: requestedStaff });
      const staff = await User.findOne(staffQuery).select("_id").lean();
      if (!staff) return res.json({ items: [], pagination: { page, pageSize, total: 0, totalPages: 0 } });
      filter.staff = staff._id;
    }
    if (req.query.search) {
      const term = String(req.query.search).trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const staff = await User.find({ role: { $in: STAFF_ROLES }, $or: [{ name: new RegExp(term, "i") }, { email: new RegExp(term, "i") }, { staffId: new RegExp(term, "i") }] }).select("_id").lean();
      const matchingIds = staff.map((item) => item._id);
      filter.staff = filter.staff ? (matchingIds.some((id) => String(id) === String(filter.staff)) ? filter.staff : { $in: [] }) : { $in: matchingIds };
    }
    const [total, items] = await Promise.all([
      Attendance.countDocuments(filter),
      Attendance.find(filter).populate("staff", "name email role staffId department jobTitle").populate("property", "name code timezone")
        .sort({ attendanceDate: -1, createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean()
    ]);
    return res.json({ items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  } catch (error) { return sendError(res, error); }
};

exports.staffOptions = async (req, res) => {
  const scope = attendanceScope(req);
  if (!scope) return res.status(403).json({ error: "An explicit property assignment is required" });
  const filter = { role: { $in: STAFF_ROLES }, status: "Active" };
  const ids = assignedPropertyIds(req.user);
  if (req.user.role !== "super_admin") filter.$and = [{ $or: [{ property: { $in: ids } }, { allowedProperties: { $in: ids } }] }];
  if (req.query.propertyId) {
    if (!mongoose.Types.ObjectId.isValid(req.query.propertyId)) return res.status(400).json({ error: "Invalid property ID" });
    if (req.user.role !== "super_admin" && !ids.includes(String(req.query.propertyId))) return res.status(403).json({ error: "You are not assigned to this property" });
    filter.$and = [...(filter.$and || []), { $or: [{ property: req.query.propertyId }, { allowedProperties: req.query.propertyId }] }];
  }
  try {
    const items = await User.find(filter).select("name role staffId department jobTitle property allowedProperties").populate("property", "name").populate("allowedProperties", "name").sort({ name: 1 }).limit(500).lean();
    return res.json({ items });
  } catch (error) { return sendError(res, error); }
};

exports.summary = async (req, res) => {
  const scope = attendanceScope(req);
  if (!scope) return res.status(403).json({ error: "An explicit property assignment is required" });
  try {
    if (req.query.propertyId && !mongoose.Types.ObjectId.isValid(req.query.propertyId)) return res.status(400).json({ error: "Invalid property ID" });
    const properties = req.query.propertyId
      ? await Property.find({ $and: [{ _id: req.query.propertyId }, ...(req.user.role === "super_admin" ? [] : [{ _id: { $in: scope.property.$in } }])] }).select("_id name timezone").lean()
      : await Property.find(scope.property ? { _id: { $in: scope.property.$in } } : {}).select("_id name timezone").lean();
    if (req.query.propertyId && !properties.length) return res.status(req.user.role === "super_admin" ? 404 : 403).json({ error: "Property is unavailable or outside your access" });
    const today = new Date();
    const monthKey = req.query.month;
    if (monthKey && !/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) return res.status(400).json({ error: "Month must use YYYY-MM format" });
    const dailyFilters = properties.map((property) => ({ property: property._id, attendanceDate: dateInTimezone(today, property.timezone) }));
    const rows = dailyFilters.length ? await Attendance.aggregate([
      { $match: { $or: dailyFilters } },
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]) : [];
    const counts = Object.fromEntries(ATTENDANCE_STATUSES.map((status) => [status, 0]));
    rows.forEach((row) => { counts[row._id] = row.count; });
    const missingCheckouts = dailyFilters.length ? await Attendance.countDocuments({ $or: dailyFilters, checkIn: { $ne: null }, checkOut: null, status: { $in: ["Present", "Late"] } }) : 0;
    let monthly = null;
    if (monthKey) {
      const [year, month] = monthKey.split("-").map(Number);
      const from = `${monthKey}-01`;
      const to = `${monthKey}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
      const propertyIds = properties.map((property) => property._id);
      const monthlyRows = propertyIds.length ? await Attendance.aggregate([
        { $match: { property: { $in: propertyIds }, attendanceDate: { $gte: from, $lte: to } } },
        { $group: { _id: { day: "$attendanceDate", status: "$status" }, count: { $sum: 1 } } },
        { $sort: { "_id.day": 1 } }
      ]) : [];
      const monthlyCounts = Object.fromEntries(ATTENDANCE_STATUSES.map((status) => [status, 0]));
      const byDay = {};
      monthlyRows.forEach((row) => {
        monthlyCounts[row._id.status] += row.count;
        byDay[row._id.day] ||= Object.fromEntries(ATTENDANCE_STATUSES.map((status) => [status, 0]));
        byDay[row._id.day][row._id.status] = row.count;
      });
      monthly = { month: monthKey, from, to, counts: monthlyCounts, byDay };
    }
    return res.json({ dateGeneratedAt: today, propertyId: req.query.propertyId || null, propertyCount: properties.length, counts, missingCheckouts, monthly, scheduledStaff: null, attendancePercentage: null, note: "No schedules are configured. Absences are never inferred, and an attendance percentage is unavailable." });
  } catch (error) { return sendError(res, error); }
};

exports.correct = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid attendance ID" });
  const { status, reason } = req.body || {};
  if (!ATTENDANCE_STATUSES.includes(status)) return res.status(400).json({ error: "Select a supported attendance status" });
  if (typeof reason !== "string" || reason.trim().length < 5 || reason.trim().length > 500) return res.status(400).json({ error: "Provide a correction reason of 5 to 500 characters" });
  try {
    const scope = attendanceScope(req);
    if (!scope) return res.status(403).json({ error: "An explicit property assignment is required" });
    const filter = { _id: req.params.id, ...scope };
    if (req.user.role !== "super_admin" && req.query.propertyId && !assignedPropertyIds(req.user).includes(String(req.query.propertyId))) return res.status(403).json({ error: "You are not assigned to this property" });
    if (req.query.propertyId) filter.property = req.query.propertyId;
    const record = await Attendance.findOne(filter);
    if (!record) return res.status(404).json({ error: "Attendance record not found" });
    if (String(record.staff) === String(req.user._id)) return res.status(403).json({ error: "Administrators cannot correct their own attendance" });
    const before = { status: record.status, checkIn: record.checkIn, checkOut: record.checkOut };
    record.corrections.push({ correctedBy: req.user._id, reason: reason.trim(), previousStatus: before.status, previousCheckIn: before.checkIn, previousCheckOut: before.checkOut });
    record.status = status;
    await record.save();
    await AdminAuditLog.create({
      actor: req.user._id,
      actorName: req.user.name,
      action: "ATTENDANCE_CORRECTED",
      resourceType: "Attendance",
      resourceId: String(record._id),
      property: record.property,
      summary: `Corrected attendance status to ${status}`,
      changes: { from: before.status, to: status, reason: reason.trim() }
    });
    return res.json({ attendance: record });
  } catch (error) { return sendError(res, error); }
};

exports.createCorrection = async (req, res) => {
  const { staffId, propertyId, attendanceDate, status, reason } = req.body || {};
  if (!mongoose.Types.ObjectId.isValid(staffId) || !mongoose.Types.ObjectId.isValid(propertyId)) return res.status(400).json({ error: "Provide a valid staff and property ID" });
  if (!validDateKey(attendanceDate)) return res.status(400).json({ error: "Provide a valid attendance date" });
  if (!["On Leave", "Absent"].includes(status)) return res.status(400).json({ error: "New records may only be marked On Leave or Absent" });
  if (typeof reason !== "string" || reason.trim().length < 5 || reason.trim().length > 500) return res.status(400).json({ error: "Provide a reason of 5 to 500 characters" });
  try {
    if (req.user.role !== "super_admin" && !assignedPropertyIds(req.user).includes(String(propertyId))) return res.status(403).json({ error: "You are not assigned to this property" });
    const [staff, property] = await Promise.all([
      User.findOne({ _id: staffId, role: { $in: STAFF_ROLES } }).select("name property allowedProperties").lean(),
      Property.findById(propertyId).select("name timezone").lean()
    ]);
    if (!staff) return res.status(404).json({ error: "Staff account not found" });
    if (!property) return res.status(404).json({ error: "Property not found" });
    if (attendanceDate > dateInTimezone(new Date(), property.timezone)) return res.status(400).json({ error: "Attendance date cannot be in the future for the selected property's timezone" });
    const staffPropertyIds = assignedPropertyIds(staff);
    if (!staffPropertyIds.includes(String(propertyId))) return res.status(400).json({ error: "Staff member is not assigned to this property" });
    const existing = await Attendance.findOne({ staff: staffId, property: propertyId, attendanceDate });
    if (existing) return res.status(409).json({ error: "An attendance record already exists for this date; use the correction action" });
    const record = await Attendance.create({
      staff: staffId, property: propertyId, attendanceDate, status,
      corrections: [{ correctedBy: req.user._id, reason: reason.trim(), previousStatus: null }]
    });
    await AdminAuditLog.create({
      actor: req.user._id, actorName: req.user.name, action: "ATTENDANCE_RECORDED",
      resourceType: "Attendance", resourceId: String(record._id), property: propertyId,
      summary: `Recorded ${status.toLowerCase()} attendance for ${staff.name}`,
      changes: { attendanceDate, status, reason: reason.trim() }
    });
    return res.status(201).json({ attendance: record });
  } catch (error) { return sendError(res, error); }
};

