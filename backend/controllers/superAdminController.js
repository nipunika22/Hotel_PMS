const mongoose = require("mongoose");
const crypto = require("crypto");
const User = require("../models/User");
const Guest = require("../models/Guest");
const Property = require("../models/Property");
const HotelChain = require("../models/HotelChain");
const Room = require("../models/Room");
const Reservation = require("../models/Reservation");
const Booking = require("../models/Booking");
const AdminAuditLog = require("../models/AdminAuditLog");
const Attendance = require("../models/Attendance");
const Restaurant = require("../models/Restaurant");
const RestaurantOffer = require("../models/RestaurantOffer");
const Event = require("../models/Event");
const EventBooking = require("../models/EventBooking");
const { DEPARTMENTS, PERMISSIONS, DEPARTMENT_LABELS } = require("../config/departmentPermissions");

const STAFF_ROLES = ["admin", "staff", "manager", "finance", "housekeeping", "maintenance"];
const RESERVATION_STATUSES = ["Confirmed", "Checked-In", "Checked-Out", "Cancelled", "No-Show"];
const ROOM_STATUSES = ["Available", "Occupied", "Reserved", "Maintenance", "Out of Order", "Cleaning"];
const ROOM_TYPES = ["Single", "Double", "Twin", "Suite", "Deluxe", "Presidential", "Family", "Connecting"];
const PROPERTY_STATUSES = ["Active", "Inactive", "Under Maintenance"];
const OPERATIONAL_STAFF_ROLES = ["manager", "staff", "finance", "housekeeping", "maintenance"];

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function pagination(query) {
  const page = Math.max(1, Math.min(100000, Number.parseInt(query.page, 10) || 1));
  const pageSize = Math.max(1, Math.min(100, Number.parseInt(query.pageSize, 10) || 20));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function sendPage(res, items, total, page, pageSize) {
  res.json({ items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
}

function sendValidationError(res, error) {
  const status = error.code === 11000 ? 409 : error.name === "ValidationError" || error.name === "CastError" ? 400 : 500;
  return res.status(status).json({ error: status === 500 ? "The Super Admin request could not be completed" : error.message });
}

function validateDepartmentAssignments(body) {
  const departments = body.adminDepartments;
  const permissions = body.adminPermissions === undefined ? [] : body.adminPermissions;
  if (!Array.isArray(departments) || departments.length === 0 || departments.some((value) => !DEPARTMENTS.includes(value))) {
    return { error: "Select at least one supported department" };
  }
  if (!Array.isArray(permissions) || permissions.some((value) => !PERMISSIONS.includes(value))) {
    return { error: "Select only supported administrative permissions" };
  }
  return { departments: [...new Set(departments)], permissions: [...new Set(permissions)] };
}

async function createStaffId(requested) {
  if (requested !== undefined && requested !== "") {
    if (typeof requested !== "string" || !/^[A-Za-z0-9-]{3,30}$/.test(requested.trim())) throw Object.assign(new Error("Staff ID must be 3 to 30 letters, numbers, or hyphens"), { name: "ValidationError" });
    const normalized = requested.trim().toUpperCase();
    if (await User.exists({ staffId: normalized })) throw Object.assign(new Error("Staff ID is already in use"), { code: 11000 });
    return normalized;
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const generated = `STF-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
    if (!await User.exists({ staffId: generated })) return generated;
  }
  throw new Error("Unable to allocate a unique staff ID");
}

async function writeAudit(req, entry) {
  try {
    await AdminAuditLog.create({
      actor: req.user._id,
      actorName: req.user.name,
      ...entry
    });
    return true;
  } catch (error) {
    console.error("Super Admin audit write failed:", error.message);
    return false;
  }
}

function addPropertyFilter(req, query) {
  if (!req.query.propertyId) return null;
  if (!mongoose.Types.ObjectId.isValid(req.query.propertyId)) return false;
  query.property = new mongoose.Types.ObjectId(req.query.propertyId);
  return null;
}

function readDateRange(query) {
  if (!query.from && !query.to) return { error: null, filter: null };
  const from = query.from ? new Date(query.from) : null;
  const to = query.to ? new Date(query.to) : null;
  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime())) || (from && to && from > to)) {
    return { error: "Provide a valid date range where from is before or equal to to" };
  }
  const range = {};
  if (from) range.$gte = from;
  if (to) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(query.to)) to.setUTCHours(23, 59, 59, 999);
    range.$lte = to;
  }
  return { error: null, filter: range };
}

function localDateKey(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

exports.getDashboard = async (req, res) => {
  const dateRange = readDateRange(req.query);
  if (dateRange.error) return res.status(400).json({ error: dateRange.error });
  const propertyFilter = {};
  const propertyCheck = addPropertyFilter(req, propertyFilter);
  if (propertyCheck === false) return res.status(400).json({ error: "Invalid propertyId" });
  const propertyObjectId = req.query.propertyId ? new mongoose.Types.ObjectId(req.query.propertyId) : null;
  if (dateRange.filter) propertyFilter.createdAt = dateRange.filter;

  try {
    const reservationFilter = { ...propertyFilter };
    const roomsFilter = req.query.propertyId ? { property: propertyObjectId, isActive: true } : { isActive: true };
    const usersFilter = { role: "customer" };
    const allUsersFilter = { role: { $ne: "super_admin" } };
    const departmentAdminFilter = { role: "admin" };
    const operationalStaffFilter = { role: { $in: OPERATIONAL_STAFF_ROLES } };
    if (req.query.propertyId) {
      const propertyGuestIds = await Guest.distinct("_id", { property: propertyObjectId });
      usersFilter.$or = [{ property: propertyObjectId }, { allowedProperties: propertyObjectId }, { guest: { $in: propertyGuestIds } }];
      allUsersFilter.$or = [{ property: propertyObjectId }, { allowedProperties: propertyObjectId }, { guest: { $in: propertyGuestIds } }];
      departmentAdminFilter.$or = [{ property: propertyObjectId }, { allowedProperties: propertyObjectId }];
      operationalStaffFilter.$or = [{ property: propertyObjectId }, { allowedProperties: propertyObjectId }];
    }

    const propertyScope = propertyObjectId ? { _id: propertyObjectId } : {};
    const today = new Date();
    const [propertyCount, activePropertyCount, roomCount, customerCount, reservationCount,
      statusCounts, pendingPaymentCount, currentReservationCount, upcomingCheckInCount, availableRoomCount, occupiedRoomCount,
      registeredUserCount, staffCount, activeStaffCount, departmentAdminAnalytics, restaurantCount, activeOfferCount,
      upcomingEventCount, pendingEventEnquiryCount, recentReservations, recentCustomers, propertyRows, recentAdministrativeActivity] = await Promise.all([
      Property.countDocuments(propertyScope),
      Property.countDocuments({ ...propertyScope, status: "Active" }),
      Room.countDocuments(roomsFilter),
      User.countDocuments(usersFilter),
      Reservation.countDocuments(reservationFilter),
      Reservation.aggregate([
        { $match: reservationFilter },
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]),
      Reservation.countDocuments({ ...reservationFilter, paymentStatus: "Pending" }),
      Reservation.countDocuments({ ...reservationFilter, status: { $in: ["Confirmed", "Checked-In"] }, checkInDate: { $lte: new Date() }, checkOutDate: { $gt: new Date() } }),
      Reservation.countDocuments({ ...reservationFilter, status: "Confirmed", checkInDate: { $gte: today } }),
      Room.countDocuments({ ...roomsFilter, status: "Available" }),
      Room.countDocuments({ ...roomsFilter, status: "Occupied" }),
      User.countDocuments(allUsersFilter),
      User.countDocuments(operationalStaffFilter),
      User.countDocuments({ ...operationalStaffFilter, status: "Active" }),
      User.aggregate([
        { $match: departmentAdminFilter },
        { $facet: {
          statuses: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
          departments: [
            { $project: { assigned: { $setUnion: [
              { $ifNull: ["$adminDepartments", []] },
              { $cond: [{ $in: ["offers.dining", { $ifNull: ["$adminPermissions", []] }] }, ["dining"], []] }
            ] } } },
            { $unwind: "$assigned" },
            { $group: { _id: "$assigned", count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
          ]
        } }
      ]),
      Restaurant.countDocuments(propertyObjectId ? { property: propertyObjectId } : {}),
      RestaurantOffer.countDocuments({ ...(propertyObjectId ? { property: propertyObjectId } : {}), active: true }),
      Event.countDocuments({ ...(propertyObjectId ? { property: propertyObjectId } : {}), status: "PUBLISHED", startDate: { $gte: localDateKey(today, "UTC") } }),
      EventBooking.countDocuments({ ...(propertyObjectId ? { property: propertyObjectId } : {}), status: "PENDING" }),
      Reservation.find(reservationFilter).select("reservationNumber guest room property checkInDate checkOutDate numberOfGuests status paymentStatus createdAt")
        .populate("guest", "firstName lastName email")
        .populate("room", "roomNumber roomType")
        .populate("property", "name code currency")
        .sort({ createdAt: -1 }).limit(8).lean(),
      User.find(usersFilter).select("name email createdAt property").sort({ createdAt: -1 }).limit(8).lean(),
      Property.find(propertyScope).select("_id name code status currency timezone").sort({ name: 1 }).lean(),
      AdminAuditLog.find(propertyObjectId ? { property: propertyObjectId } : {}).select("actorName action resourceType summary createdAt property").populate("property", "name code").sort({ createdAt: -1 }).limit(5).lean()
    ]);

    const roomStatusDistribution = await Room.aggregate([
      { $match: roomsFilter },
      { $group: { _id: { $ifNull: ["$status", "Unrecognized"] }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    const counts = Object.fromEntries(RESERVATION_STATUSES.map((status) => [status, 0]));
    statusCounts.forEach(({ _id, count }) => { if (Object.prototype.hasOwnProperty.call(counts, _id)) counts[_id] = count; });
    const adminAnalytics = departmentAdminAnalytics[0] || { statuses: [], departments: [] };
    const adminStatuses = Object.fromEntries(["Active", "Inactive", "Suspended"].map((status) => [status, 0]));
    adminAnalytics.statuses.forEach(({ _id, count }) => { if (Object.prototype.hasOwnProperty.call(adminStatuses, _id)) adminStatuses[_id] = count; });
    const propertyIds = propertyRows.map((property) => property._id);
    const [roomByProperty, reservationByProperty] = propertyIds.length ? await Promise.all([
      Room.aggregate([{ $match: { property: { $in: propertyIds }, isActive: true } }, { $group: { _id: "$property", count: { $sum: 1 } } }]),
      Reservation.aggregate([{ $match: { property: { $in: propertyIds } } }, { $group: { _id: "$property", count: { $sum: 1 } } }])
    ]) : [[], []];
    const roomCounts = new Map(roomByProperty.map((row) => [String(row._id), row.count]));
    const reservationCounts = new Map(reservationByProperty.map((row) => [String(row._id), row.count]));
    const dailyAttendanceFilters = propertyRows.map((property) => ({ property: property._id, attendanceDate: localDateKey(today, property.timezone) }));
    const dailyAttendanceRows = dailyAttendanceFilters.length ? await Attendance.aggregate([
      { $match: { $or: dailyAttendanceFilters } },
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]) : [];
    const dailyAttendance = { Present: 0, Late: 0, Absent: 0, "On Leave": 0 };
    dailyAttendanceRows.forEach((row) => { dailyAttendance[row._id] = row.count; });
    const checkedInToday = dailyAttendanceFilters.length ? await Attendance.countDocuments({ $or: dailyAttendanceFilters, checkIn: { $ne: null } }) : 0;
    const missingAttendanceCheckouts = dailyAttendanceFilters.length ? await Attendance.countDocuments({ $or: dailyAttendanceFilters, checkIn: { $ne: null }, checkOut: null, status: { $in: ["Present", "Late"] } }) : 0;

    res.json({
      generatedAt: new Date(),
      filters: { from: req.query.from || null, to: req.query.to || null, propertyId: req.query.propertyId || null },
      summary: {
        properties: propertyCount,
        activeProperties: activePropertyCount,
        inactiveProperties: propertyCount - activePropertyCount,
        rooms: roomCount,
        roomStatusDistribution,
        availableRooms: availableRoomCount,
        occupiedRooms: occupiedRoomCount,
        registeredCustomers: customerCount,
        registeredUsers: registeredUserCount,
        activeAdministrators: adminStatuses.Active,
        staff: staffCount,
        reservations: reservationCount,
        currentReservations: currentReservationCount,
        upcomingCheckIns: upcomingCheckInCount,
        reservationsByStatus: counts,
        pendingPaymentReservations: pendingPaymentCount,
        departmentAdmins: {
          total: Object.values(adminStatuses).reduce((sum, count) => sum + count, 0),
          active: adminStatuses.Active,
          inactive: adminStatuses.Inactive + adminStatuses.Suspended,
          statuses: adminStatuses,
          distribution: adminAnalytics.departments.map(({ _id, count }) => ({ department: _id, count }))
        },
        activeStaff: activeStaffCount,
        restaurants: restaurantCount,
        activeDiningOffers: activeOfferCount,
        upcomingEvents: upcomingEventCount,
        pendingEventEnquiries: pendingEventEnquiryCount,
        checkedInToday,
        todayAttendance: dailyAttendance,
        missingAttendanceCheckouts,
        scheduledStaff: null,
        attendancePercentage: null,
        attendancePolicy: "No work schedule is configured. Absence and lateness are not inferred automatically.",
        revenue: { available: false, reason: "Revenue is not summarized because payment, invoice, and reservation records do not yet share a verified reconciliation rule." }
      },
      recentReservations,
      recentCustomers,
      recentAdministrativeActivity,
      propertySummaries: propertyRows.map((property) => ({
        ...property,
        rooms: roomCounts.get(String(property._id)) || 0,
        reservations: reservationCounts.get(String(property._id)) || 0
      }))
    });
  } catch (error) {
    console.error("Super Admin dashboard error:", error);
    return sendValidationError(res, error);
  }
};

exports.getProperties = async (req, res) => {
  const { page, pageSize, skip } = pagination(req.query);
  const filter = {};
  if (req.query.status) {
    if (!PROPERTY_STATUSES.includes(req.query.status)) return res.status(400).json({ error: "Invalid property status" });
    filter.status = req.query.status;
  }
  if (req.query.search) {
    const search = new RegExp(escapeRegex(String(req.query.search).trim().slice(0, 100)), "i");
    filter.$or = [{ name: search }, { code: search }, { city: search }, { country: search }];
  }
  try {
    const [total, items] = await Promise.all([
      Property.countDocuments(filter),
      Property.find(filter).populate("chain", "name code").sort({ name: 1 }).skip(skip).limit(pageSize).lean()
    ]);
    const ids = items.map((item) => item._id);
    const [rooms, reservations] = ids.length ? await Promise.all([
      Room.aggregate([{ $match: { property: { $in: ids }, isActive: true } }, { $group: { _id: "$property", count: { $sum: 1 } } }]),
      Reservation.aggregate([{ $match: { property: { $in: ids } } }, { $group: { _id: "$property", count: { $sum: 1 } } }])
    ]) : [[], []];
    const roomCounts = new Map(rooms.map((row) => [String(row._id), row.count]));
    const reservationCounts = new Map(reservations.map((row) => [String(row._id), row.count]));
    sendPage(res, items.map((item) => ({ ...item, roomCount: roomCounts.get(String(item._id)) || 0, reservationCount: reservationCounts.get(String(item._id)) || 0 })), total, page, pageSize);
  } catch (error) { return sendValidationError(res, error); }
};

exports.getChains = async (req, res) => {
  try {
    const chains = await HotelChain.find({ status: "Active" }).select("name code status").sort({ name: 1 }).lean();
    res.json({ items: chains });
  } catch (error) { return sendValidationError(res, error); }
};

function validatePropertyInput(body, isCreate) {
  const allowed = ["name", "code", "chain", "country", "countryCode", "city", "address", "timezone", "currency", "status", "contactPhone", "contactEmail", "starRating", "images", "checkInTime", "checkOutTime"];
  const updates = {};
  for (const key of allowed) if (body[key] !== undefined) updates[key] = body[key];
  if (isCreate && (!updates.name || !updates.code || !updates.chain)) return { error: "Name, code, and chain are required" };
  if (updates.name !== undefined && (typeof updates.name !== "string" || !updates.name.trim())) return { error: "Name must be a non-empty string" };
  if (updates.code !== undefined && (typeof updates.code !== "string" || !/^[A-Za-z0-9-]{2,20}$/.test(updates.code.trim()))) return { error: "Code must contain 2–20 letters, numbers, or hyphens" };
  if (updates.status !== undefined && !PROPERTY_STATUSES.includes(updates.status)) return { error: "Invalid property status" };
  if (updates.chain !== undefined && !mongoose.Types.ObjectId.isValid(updates.chain)) return { error: "Invalid chain ID" };
  if (updates.starRating !== undefined && (!Number.isFinite(Number(updates.starRating)) || Number(updates.starRating) < 1 || Number(updates.starRating) > 5)) return { error: "Star rating must be between 1 and 5" };
  if (updates.contactEmail !== undefined && updates.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.contactEmail)) return { error: "Contact email is invalid" };
  if (updates.images !== undefined && (!Array.isArray(updates.images) || updates.images.some((image) => typeof image !== "string" || image.length > 1000))) return { error: "Images must be an array of image URLs" };
  return { updates };
}

exports.createProperty = async (req, res) => {
  const validation = validatePropertyInput(req.body, true);
  if (validation.error) return res.status(400).json({ error: validation.error });
  try {
    const chain = await HotelChain.findOne({ _id: validation.updates.chain, status: "Active" });
    if (!chain) return res.status(400).json({ error: "The selected hotel chain does not exist" });
    const property = await Property.create(validation.updates);
    const auditLogged = await writeAudit(req, { action: "PROPERTY_CREATED", resourceType: "Property", resourceId: String(property._id), property: property._id, summary: `Created property ${property.name}`, changes: { code: property.code, status: property.status } });
    return res.status(201).json({ property, auditLogged });
  } catch (error) { return sendValidationError(res, error); }
};

exports.updateProperty = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid property ID" });
  const validation = validatePropertyInput(req.body, false);
  if (validation.error) return res.status(400).json({ error: validation.error });
  if (!Object.keys(validation.updates).length) return res.status(400).json({ error: "No supported property fields were provided" });
  try {
    if (validation.updates.chain && !await HotelChain.exists({ _id: validation.updates.chain, status: "Active" })) return res.status(400).json({ error: "The selected active hotel chain does not exist" });
    const property = await Property.findByIdAndUpdate(req.params.id, { $set: validation.updates }, { new: true, runValidators: true }).populate("chain", "name code");
    if (!property) return res.status(404).json({ error: "Property not found" });
    const auditLogged = await writeAudit(req, { action: "PROPERTY_UPDATED", resourceType: "Property", resourceId: String(property._id), property: property._id, summary: `Updated property ${property.name}`, changes: validation.updates });
    return res.json({ property, auditLogged });
  } catch (error) { return sendValidationError(res, error); }
};

exports.getStaff = async (req, res) => {
  const { page, pageSize, skip } = pagination(req.query);
  let roles = STAFF_ROLES;
  if (req.query.role) {
    if (!STAFF_ROLES.includes(req.query.role)) return res.status(400).json({ error: "Invalid staff role" });
    roles = [req.query.role];
  }
  if (req.query.excludeRole) {
    if (!STAFF_ROLES.includes(req.query.excludeRole)) return res.status(400).json({ error: "Invalid excluded staff role" });
    roles = roles.filter((role) => role !== req.query.excludeRole);
  }
  const filter = { role: { $in: roles } };
  const filterConditions = [];
  if (req.query.status) {
    if (!["Active", "Inactive", "Suspended"].includes(req.query.status)) return res.status(400).json({ error: "Invalid account status" });
    filter.status = req.query.status;
  }
  if (req.query.propertyId) {
    if (!mongoose.Types.ObjectId.isValid(req.query.propertyId)) return res.status(400).json({ error: "Invalid propertyId" });
    filterConditions.push({ $or: [{ property: req.query.propertyId }, { allowedProperties: req.query.propertyId }] });
  }
  if (req.query.departmentAccess) {
    if (!DEPARTMENTS.includes(req.query.departmentAccess)) return res.status(400).json({ error: "Invalid department access filter" });
    const access = req.query.departmentAccess;
    filterConditions.push(access === "dining"
      ? { $or: [{ adminDepartments: access }, { adminPermissions: "offers.dining" }] }
      : { adminDepartments: access });
  }
  if (req.query.search) {
    const search = new RegExp(escapeRegex(String(req.query.search).trim().slice(0, 100)), "i");
    filterConditions.push({ $or: [{ name: search }, { email: search }, { staffId: search }] });
  }
  if (filterConditions.length) filter.$and = filterConditions;
  try {
    const [total, items] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter).select("name email phone role department departmentAdmin adminDepartments adminPermissions staffId jobTitle property allowedProperties status lastLogin createdAt")
        .populate("property", "name code").populate("allowedProperties", "name code")
        .sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean()
    ]);
    sendPage(res, items, total, page, pageSize);
  } catch (error) { return sendValidationError(res, error); }
};

exports.getAdmins = async (req, res) => {
  req.query.role = "admin";
  return exports.getStaff(req, res);
};

exports.getStaffProfile = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid staff ID" });
  const month = req.query.month;
  if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return res.status(400).json({ error: "Month must use YYYY-MM format" });
  const { page, pageSize, skip } = pagination(req.query);
  try {
    const staff = await User.findOne({ _id: req.params.id, role: { $in: STAFF_ROLES } })
      .select("name email phone role department departmentAdmin adminDepartments adminPermissions staffId jobTitle property allowedProperties status createdAt lastLogin")
      .populate("property", "name code").populate("allowedProperties", "name code").lean();
    if (!staff) return res.status(404).json({ error: "Staff account not found" });
    const filter = { staff: staff._id };
    if (month) {
      const [year, monthNumber] = month.split("-").map(Number);
      filter.attendanceDate = { $gte: `${month}-01`, $lte: `${month}-${String(new Date(year, monthNumber, 0).getDate()).padStart(2, "0")}` };
    }
    const [total, attendance, monthlyRows] = await Promise.all([
      Attendance.countDocuments(filter),
      Attendance.find(filter).populate("property", "name code").sort({ attendanceDate: -1 }).skip(skip).limit(pageSize).lean(),
      month ? Attendance.aggregate([{ $match: filter }, { $group: { _id: "$status", count: { $sum: 1 } } }]) : []
    ]);
    return res.json({ staff, attendance, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }, monthlySummary: Object.fromEntries(monthlyRows.map((row) => [row._id, row.count])) });
  } catch (error) { return sendValidationError(res, error); }
};

exports.createStaff = async (req, res) => {
  const { name, email, password, phone, role, property, allowedProperties, department, jobTitle } = req.body;
  if (typeof name !== "string" || !name.trim() || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || typeof phone !== "string" || !phone.trim() || typeof password !== "string" || password.length < 10) {
    return res.status(400).json({ error: "Provide a name, valid email, phone, and password of at least 10 characters" });
  }
  if (!STAFF_ROLES.includes(role)) return res.status(400).json({ error: "Select a supported staff role" });
  if (role === "admin" && !req.departmentAdminCreation) return res.status(400).json({ error: "Create department administrator accounts through the Administrators workflow" });
  if (req.body.status !== undefined && !["Active", "Inactive", "Suspended"].includes(req.body.status)) return res.status(400).json({ error: "Invalid account status" });
  if (department !== undefined && !["Front Desk", "Housekeeping", "Maintenance", "Finance", "Kitchen", "Restaurant", "Management", "General"].includes(department)) return res.status(400).json({ error: "Select a supported staff department" });
  if (jobTitle !== undefined && (typeof jobTitle !== "string" || jobTitle.trim().length > 100)) return res.status(400).json({ error: "Job title must be no longer than 100 characters" });
  try {
    const propertyIds = Array.isArray(allowedProperties) ? [...new Set(allowedProperties.map(String))] : [];
    if (property && !mongoose.Types.ObjectId.isValid(property)) return res.status(400).json({ error: "Invalid property ID" });
    if (propertyIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) return res.status(400).json({ error: "Invalid allowed property ID" });
    const allIds = [...new Set([...(property ? [String(property)] : []), ...propertyIds])];
    if (allIds.length && await Property.countDocuments({ _id: { $in: allIds } }) !== allIds.length) return res.status(400).json({ error: "One or more selected properties do not exist" });
    const staffId = await createStaffId(req.body.staffId);
    const departmentValidation = req.departmentAdminCreation ? validateDepartmentAssignments(req.body) : null;
    if (departmentValidation?.error) return res.status(400).json({ error: departmentValidation.error });
    const user = await User.create({ name: name.trim(), email: email.trim().toLowerCase(), password, phone: phone.trim(), role, department: department || (role === "admin" ? "Management" : "General"), jobTitle: jobTitle?.trim() || "", staffId, departmentAdmin: role === "admin", adminDepartments: departmentValidation?.departments || [], adminPermissions: departmentValidation?.permissions || [], status: req.body.status || "Active", property: property || undefined, allowedProperties: propertyIds });
    const auditLogged = await writeAudit(req, { action: role === "admin" ? "DEPARTMENT_ADMIN_CREATED" : "STAFF_CREATED", resourceType: "User", resourceId: String(user._id), property: user.property || null, summary: `Created ${user.role} account`, changes: { staffId: user.staffId, email: user.email, role: user.role, department: user.department, adminDepartments: user.adminDepartments, adminPermissions: user.adminPermissions, status: user.status } });
    return res.status(201).json({ user: { _id: user._id, name: user.name, email: user.email, phone: user.phone, role: user.role, department: user.department, departmentAdmin: user.departmentAdmin, adminDepartments: user.adminDepartments, adminPermissions: user.adminPermissions, staffId: user.staffId, jobTitle: user.jobTitle, property: user.property, allowedProperties: user.allowedProperties, status: user.status, createdAt: user.createdAt }, auditLogged });
  } catch (error) { return sendValidationError(res, error); }
};

exports.createAdmin = async (req, res) => {
  if (!req.body.property && !(Array.isArray(req.body.allowedProperties) && req.body.allowedProperties.length)) return res.status(400).json({ error: "Assign an administrator to at least one property" });
  const departments = validateDepartmentAssignments(req.body);
  if (departments.error) return res.status(400).json({ error: departments.error });
  req.departmentAdminCreation = true;
  req.body = { ...req.body, adminDepartments: departments.departments, adminPermissions: departments.permissions, role: "admin" };
  return exports.createStaff(req, res);
};

exports.updateAdmin = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid administrator ID" });
  if (req.body.role !== undefined && req.body.role !== "admin") return res.status(400).json({ error: "Administrator role cannot be changed through this endpoint" });
  const current = await User.findOne({ _id: req.params.id, role: "admin" }).select("adminDepartments adminPermissions").lean();
  if (!current) return res.status(404).json({ error: "Administrator account not found" });
  const assignments = validateDepartmentAssignments({
    adminDepartments: req.body.adminDepartments ?? current.adminDepartments,
    adminPermissions: req.body.adminPermissions ?? current.adminPermissions ?? []
  });
  if (assignments.error) return res.status(400).json({ error: assignments.error });
  req.body = { ...req.body, adminDepartments: assignments.departments, adminPermissions: assignments.permissions };
  if (req.body.property === null || req.body.property === "" || (Array.isArray(req.body.allowedProperties) && req.body.allowedProperties.length === 0)) {
    const admin = await User.findOne({ _id: req.params.id, role: "admin" }).select("property allowedProperties").lean();
    const remainingPrimary = req.body.property !== undefined ? req.body.property : admin?.property;
    const remainingAllowed = req.body.allowedProperties !== undefined ? req.body.allowedProperties : admin?.allowedProperties;
    if (!remainingPrimary && !remainingAllowed?.length) return res.status(400).json({ error: "An administrator must remain assigned to at least one property" });
  }
  req.adminOnly = true;
  return exports.updateStaff(req, res);
};

exports.updateStaff = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid user ID" });
  const updates = {};
  if (req.body.name !== undefined) {
    if (typeof req.body.name !== "string" || !req.body.name.trim() || req.body.name.trim().length > 120) return res.status(400).json({ error: "Name must contain 1–120 characters" });
    updates.name = req.body.name.trim();
  }
  if (req.body.email !== undefined) {
    if (typeof req.body.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email.trim())) return res.status(400).json({ error: "Provide a valid email address" });
    updates.email = req.body.email.trim().toLowerCase();
  }
  if (req.body.phone !== undefined) {
    if (typeof req.body.phone !== "string" || !req.body.phone.trim() || req.body.phone.trim().length > 40) return res.status(400).json({ error: "Provide a valid phone number" });
    updates.phone = req.body.phone.trim();
  }
  if (req.body.role !== undefined) {
    if (!STAFF_ROLES.includes(req.body.role)) return res.status(400).json({ error: "Select a supported staff role" });
    if ((req.adminOnly && req.body.role !== "admin") || (!req.adminOnly && req.body.role === "admin")) return res.status(400).json({ error: "Use the department administrator management workflow to change administrator access" });
    updates.role = req.body.role;
  }
  if (req.body.department !== undefined) {
    if (!["Front Desk", "Housekeeping", "Maintenance", "Finance", "Kitchen", "Restaurant", "Management", "General"].includes(req.body.department)) return res.status(400).json({ error: "Select a supported staff department" });
    updates.department = req.body.department;
  }
  if (req.body.jobTitle !== undefined) {
    if (typeof req.body.jobTitle !== "string" || req.body.jobTitle.trim().length > 100) return res.status(400).json({ error: "Job title must be no longer than 100 characters" });
    updates.jobTitle = req.body.jobTitle.trim();
  }
  if (req.body.staffId !== undefined) {
    if (typeof req.body.staffId !== "string" || !/^[A-Za-z0-9-]{3,30}$/.test(req.body.staffId.trim())) return res.status(400).json({ error: "Staff ID must be 3 to 30 letters, numbers, or hyphens" });
    updates.staffId = req.body.staffId.trim().toUpperCase();
  }
  if (req.adminOnly && req.body.adminDepartments !== undefined) {
    const assignment = validateDepartmentAssignments(req.body);
    if (assignment.error) return res.status(400).json({ error: assignment.error });
    updates.adminDepartments = assignment.departments;
    updates.adminPermissions = assignment.permissions;
    updates.departmentAdmin = true;
  }
  if (req.body.status !== undefined) {
    if (!["Active", "Inactive", "Suspended"].includes(req.body.status)) return res.status(400).json({ error: "Invalid account status" });
    updates.status = req.body.status;
  }
  if (req.body.property !== undefined) {
    if (req.body.property && !mongoose.Types.ObjectId.isValid(req.body.property)) return res.status(400).json({ error: "Invalid property ID" });
    updates.property = req.body.property || null;
  }
  if (req.body.allowedProperties !== undefined) {
    if (!Array.isArray(req.body.allowedProperties)) return res.status(400).json({ error: "allowedProperties must be a list" });
    const ids = [...new Set(req.body.allowedProperties.map(String))];
    if (ids.some((id) => !mongoose.Types.ObjectId.isValid(id))) return res.status(400).json({ error: "Invalid allowed property ID" });
    updates.allowedProperties = ids;
  }
  if (!Object.keys(updates).length) return res.status(400).json({ error: "No supported account fields were provided" });
  try {
    if (updates.property && !await Property.exists({ _id: updates.property })) return res.status(400).json({ error: "The selected property does not exist" });
    if (updates.allowedProperties?.length && await Property.countDocuments({ _id: { $in: updates.allowedProperties } }) !== updates.allowedProperties.length) return res.status(400).json({ error: "One or more selected properties do not exist" });
    const target = await User.findOne({ _id: req.params.id, role: req.adminOnly ? "admin" : { $in: STAFF_ROLES } });
    if (!target) return res.status(404).json({ error: "Staff account not found" });
    if (String(target._id) === String(req.user._id)) return res.status(400).json({ error: "You cannot change your own Super Admin access through staff management" });
    if (updates.email && await User.exists({ _id: { $ne: target._id }, email: updates.email })) return res.status(409).json({ error: "An account with this email address already exists" });
    if (updates.staffId && await User.exists({ _id: { $ne: target._id }, staffId: updates.staffId })) return res.status(409).json({ error: "Staff ID is already in use" });
    Object.assign(target, updates);
    await target.save();
    const auditLogged = await writeAudit(req, { action: req.adminOnly ? "DEPARTMENT_ADMIN_UPDATED" : "STAFF_UPDATED", resourceType: "User", resourceId: String(target._id), property: target.property || null, summary: `Updated ${target.role} account`, changes: updates });
    return res.json({ user: { _id: target._id, name: target.name, email: target.email, phone: target.phone, role: target.role, department: target.department, departmentAdmin: target.departmentAdmin, adminDepartments: target.adminDepartments, adminPermissions: target.adminPermissions, staffId: target.staffId, jobTitle: target.jobTitle, property: target.property, allowedProperties: target.allowedProperties, status: target.status, lastLogin: target.lastLogin }, auditLogged });
  } catch (error) { return sendValidationError(res, error); }
};

exports.getManagedUsers = async (req, res) => {
  const { page, pageSize, skip } = pagination(req.query);
  const filter = { role: { $ne: "super_admin" } };
  if (req.query.role) {
    const roles = ["customer", ...STAFF_ROLES];
    if (!roles.includes(req.query.role)) return res.status(400).json({ error: "Invalid role filter" });
    filter.role = req.query.role;
  }
  if (req.query.status) {
    if (!["Active", "Inactive", "Suspended"].includes(req.query.status)) return res.status(400).json({ error: "Invalid account status" });
    filter.status = req.query.status;
  }
  if (req.query.propertyId) {
    if (!mongoose.Types.ObjectId.isValid(req.query.propertyId)) return res.status(400).json({ error: "Invalid propertyId" });
    filter.$or = [{ property: req.query.propertyId }, { allowedProperties: req.query.propertyId }];
  }
  if (req.query.search) {
    const search = new RegExp(escapeRegex(String(req.query.search).trim().slice(0, 100)), "i");
    const searchFilter = { $or: [{ name: search }, { email: search }] };
    if (filter.$or) filter.$and = [{ $or: filter.$or }, searchFilter];
    else Object.assign(filter, searchFilter);
  }
  try {
    if (req.query.propertyId) {
      const guestIds = await Guest.distinct("_id", { property: req.query.propertyId });
      filter.$and = [...(filter.$and || []), { $or: [{ property: req.query.propertyId }, { allowedProperties: req.query.propertyId }, { guest: { $in: guestIds } }] }];
      delete filter.$or;
    }
    const [total, items] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter).select("name email phone role department property allowedProperties guest status createdAt lastLogin")
        .populate("property", "name code").populate("allowedProperties", "name code")
        .populate("guest", "firstName lastName totalStays").sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean()
    ]);
    return sendPage(res, items, total, page, pageSize);
  } catch (error) { return sendValidationError(res, error); }
};

exports.resetManagedUserPassword = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid user ID" });
  const { newPassword } = req.body || {};
  if (typeof newPassword !== "string" || newPassword.length < 12 || newPassword.length > 128) return res.status(400).json({ error: "New password must contain 12 to 128 characters" });
  try {
    const target = await User.findOne({ _id: req.params.id, role: { $ne: "super_admin" } });
    if (!target) return res.status(404).json({ error: "Managed account not found" });
    if (String(target._id) === String(req.user._id)) return res.status(400).json({ error: "Use the account password-change workflow to change your own password" });
    target.password = newPassword;
    await target.save();
    const auditLogged = await writeAudit(req, { action: "USER_PASSWORD_RESET", resourceType: "User", resourceId: String(target._id), property: target.property || null, summary: `Reset password for ${target.role} account`, changes: { passwordReset: true } });
    return res.json({ success: true, auditLogged, message: "Password reset. Share the new password with the account owner through an approved private channel." });
  } catch (error) { return sendValidationError(res, error); }
};

exports.updateManagedUser = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid user ID" });
  if (Object.hasOwn(req.body, "role") || Object.hasOwn(req.body, "password") || Object.hasOwn(req.body, "guest")) return res.status(400).json({ error: "Role, password, and guest links cannot be changed through this endpoint" });
  const updates = {};
  if (req.body.name !== undefined) {
    if (typeof req.body.name !== "string" || !req.body.name.trim() || req.body.name.trim().length > 120) return res.status(400).json({ error: "Name must contain 1 to 120 characters" });
    updates.name = req.body.name.trim();
  }
  if (req.body.email !== undefined) {
    if (typeof req.body.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email.trim())) return res.status(400).json({ error: "Provide a valid email address" });
    updates.email = req.body.email.trim().toLowerCase();
  }
  if (req.body.phone !== undefined) {
    if (typeof req.body.phone !== "string" || !req.body.phone.trim() || req.body.phone.trim().length > 40) return res.status(400).json({ error: "Provide a valid phone number" });
    updates.phone = req.body.phone.trim();
  }
  if (req.body.status !== undefined) {
    if (!["Active", "Inactive", "Suspended"].includes(req.body.status)) return res.status(400).json({ error: "Invalid account status" });
    updates.status = req.body.status;
  }
  if (!Object.keys(updates).length) return res.status(400).json({ error: "No supported account fields were provided" });
  try {
    const target = await User.findOne({ _id: req.params.id, role: { $ne: "super_admin" } });
    if (!target) return res.status(404).json({ error: "Managed account not found" });
    if (String(target._id) === String(req.user._id)) return res.status(400).json({ error: "You cannot deactivate or edit your own account here" });
    if (updates.email && await User.exists({ _id: { $ne: target._id }, email: updates.email })) return res.status(409).json({ error: "An account with this email address already exists" });
    const before = { name: target.name, email: target.email, phone: target.phone, status: target.status };
    Object.assign(target, updates);
    await target.save();
    const changes = Object.fromEntries(Object.entries(updates).map(([key, value]) => [key, { from: before[key], to: value }]));
    const auditLogged = await writeAudit(req, { action: "USER_UPDATED", resourceType: "User", resourceId: String(target._id), property: target.property || null, summary: `Updated ${target.role} account`, changes });
    return res.json({ user: { _id: target._id, name: target.name, email: target.email, phone: target.phone, role: target.role, property: target.property, status: target.status, createdAt: target.createdAt, lastLogin: target.lastLogin }, auditLogged });
  } catch (error) { return sendValidationError(res, error); }
};

exports.getRoles = async (req, res) => {
  const roles = ["super_admin", "admin", "manager", "staff", "finance", "housekeeping", "maintenance", "customer"];
  res.json({ roles, departments: DEPARTMENTS, permissions: PERMISSIONS, departmentLabels: DEPARTMENT_LABELS, permissionModel: "Role checks are defined per API route; the project has no centralized permission matrix. This page is read-only and does not claim a complete permission map." });
};

exports.getReservations = async (req, res) => {
  const { page, pageSize, skip } = pagination(req.query);
  const filter = {};
  const propertyCheck = addPropertyFilter(req, filter);
  if (propertyCheck === false) return res.status(400).json({ error: "Invalid propertyId" });
  if (req.query.status) {
    if (!RESERVATION_STATUSES.includes(req.query.status)) return res.status(400).json({ error: "Invalid reservation status" });
    filter.status = req.query.status;
  }
  if (req.query.from || req.query.to) {
    const range = readDateRange(req.query);
    if (range.error) return res.status(400).json({ error: range.error });
    filter.checkInDate = range.filter;
  }
  if (req.query.search) {
    const search = new RegExp(escapeRegex(String(req.query.search).trim().slice(0, 100)), "i");
    filter.reservationNumber = search;
  }
  try {
    const [total, items] = await Promise.all([
      Reservation.countDocuments(filter),
      Reservation.find(filter).select("reservationNumber guest room property checkInDate checkOutDate numberOfAdults numberOfChildren numberOfGuests status paymentStatus createdAt totalAmount")
        .populate("guest", "firstName lastName email phone")
        .populate("room", "roomNumber roomType")
        .populate("property", "name code currency")
        .sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean()
    ]);
    sendPage(res, items, total, page, pageSize);
  } catch (error) { return sendValidationError(res, error); }
};

exports.getRooms = async (req, res) => {
  const { page, pageSize, skip } = pagination(req.query);
  const filter = {};
  const propertyCheck = addPropertyFilter(req, filter);
  if (propertyCheck === false) return res.status(400).json({ error: "Invalid propertyId" });
  if (req.query.status) {
    if (!ROOM_STATUSES.includes(req.query.status)) return res.status(400).json({ error: "Invalid room status" });
    filter.status = req.query.status;
  }
  if (req.query.roomType) {
    if (!ROOM_TYPES.includes(req.query.roomType)) return res.status(400).json({ error: "Invalid room type" });
    filter.roomType = req.query.roomType;
  }
  if (req.query.search) filter.roomNumber = new RegExp(escapeRegex(String(req.query.search).trim().slice(0, 100)), "i");
  try {
    const [total, items] = await Promise.all([
      Room.countDocuments(filter),
      Room.find(filter).select("roomNumber roomType floor building basePrice weekendPrice capacity status cleaningStatus property isActive")
        .populate("property", "name code currency").sort({ roomNumber: 1 }).skip(skip).limit(pageSize).lean()
    ]);
    sendPage(res, items, total, page, pageSize);
  } catch (error) { return sendValidationError(res, error); }
};

exports.getCustomers = async (req, res) => {
  const { page, pageSize, skip } = pagination(req.query);
  const filter = { role: "customer" };
  if (req.query.search) {
    const search = new RegExp(escapeRegex(String(req.query.search).trim().slice(0, 100)), "i");
    filter.$or = [{ name: search }, { email: search }];
  }
  try {
    const [total, items] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter).select("name email phone status createdAt lastLogin guest")
        .populate("guest", "_id firstName lastName totalStays guestType")
        .sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean()
    ]);
    sendPage(res, items, total, page, pageSize);
  } catch (error) { return sendValidationError(res, error); }
};

exports.getCustomerReservations = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid customer ID" });
  const { page, pageSize, skip } = pagination(req.query);
  try {
    const customer = await User.findOne({ _id: req.params.id, role: "customer" }).select("guest").lean();
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    const guestId = customer.guest?._id || customer.guest;
    const [reservationCount, reservations, bookingCount, bookings] = await Promise.all([
      guestId ? Reservation.countDocuments({ guest: guestId }) : 0,
      guestId ? Reservation.find({ guest: guestId }).select("reservationNumber property room checkInDate checkOutDate status paymentStatus createdAt")
        .populate("property", "name code").populate("room", "roomNumber roomType").sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean() : [],
      Booking.countDocuments({ user: customer._id }),
      Booking.find({ user: customer._id }).select("property room checkInDate checkOutDate bookingStatus paymentStatus createdAt reservationNumber")
        .populate("property", "name code").populate("room", "roomNumber roomType").sort({ createdAt: -1 }).limit(100).lean()
    ]);
    res.json({ reservations, pagination: { page, pageSize, total: reservationCount, totalPages: Math.ceil(reservationCount / pageSize) }, customerBookingRecords: bookings, customerBookingCount: bookingCount, note: "Reservation and Booking are separate legacy data models and are returned separately to avoid double-counting." });
  } catch (error) { return sendValidationError(res, error); }
};

exports.getReports = async (req, res) => {
  const dateRange = readDateRange(req.query);
  if (dateRange.error) return res.status(400).json({ error: dateRange.error });
  const propertyFilter = {};
  const propertyCheck = addPropertyFilter(req, propertyFilter);
  if (propertyCheck === false) return res.status(400).json({ error: "Invalid propertyId" });
  const propertyObjectId = req.query.propertyId ? new mongoose.Types.ObjectId(req.query.propertyId) : null;
  const match = { ...propertyFilter };
  if (dateRange.filter) match.createdAt = dateRange.filter;
  try {
    const customerMatch = { role: "customer", ...(dateRange.filter ? { createdAt: dateRange.filter } : {}) };
    const customerTrendPipeline = [{ $match: customerMatch }];
    if (req.query.propertyId) {
      customerTrendPipeline.push(
        { $lookup: { from: Guest.collection.name, localField: "guest", foreignField: "_id", as: "guestProfile" } },
        { $match: { $or: [{ property: propertyObjectId }, { allowedProperties: propertyObjectId }, { "guestProfile.property": propertyObjectId }] } }
      );
    }
    customerTrendPipeline.push({ $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } });
    const propertyStatusMatch = propertyObjectId ? { _id: propertyObjectId } : {};
    const [reservationTrends, customerTrends, propertyStatus, roomStatus] = await Promise.all([
      Reservation.aggregate([{ $match: match }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      User.aggregate(customerTrendPipeline),
      Property.aggregate([{ $match: propertyStatusMatch }, { $group: { _id: "$status", count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      Room.aggregate([{ $match: propertyObjectId ? { property: propertyObjectId } : {} }, { $group: { _id: "$status", count: { $sum: 1 } } }, { $sort: { _id: 1 } }])
    ]);
    res.json({ filters: { from: req.query.from || null, to: req.query.to || null, propertyId: req.query.propertyId || null }, reservationTrends, customerRegistrationTrends: customerTrends, propertiesByStatus: propertyStatus, roomsByOperationalStatus: roomStatus, revenue: { available: false, reason: "Payment, invoice, and reservation records do not share a verified reconciliation rule." } });
  } catch (error) { return sendValidationError(res, error); }
};

exports.getAuditLogs = async (req, res) => {
  const { page, pageSize, skip } = pagination(req.query);
  const filter = {};
  if (req.query.action) filter.action = String(req.query.action).slice(0, 80);
  if (req.query.resourceType) filter.resourceType = String(req.query.resourceType).slice(0, 50);
  if (req.query.from || req.query.to) {
    const range = readDateRange(req.query);
    if (range.error) return res.status(400).json({ error: range.error });
    filter.createdAt = range.filter;
  }
  try {
    const [total, items] = await Promise.all([
      AdminAuditLog.countDocuments(filter),
      AdminAuditLog.find(filter).select("actor actorName action resourceType resourceId property summary changes createdAt")
        .populate("property", "name code").sort({ createdAt: -1, _id: -1 }).skip(skip).limit(pageSize).lean()
    ]);
    sendPage(res, items, total, page, pageSize);
  } catch (error) { return sendValidationError(res, error); }
};

exports.getSettings = async (req, res) => {
  res.json({
    settings: [],
    editable: false,
    message: "No safe, persisted system-settings API exists in this project. Configuration values and environment variables are intentionally not exposed here."
  });
};
