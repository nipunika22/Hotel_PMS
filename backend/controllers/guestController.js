// backend/controllers/guestController.js
const mongoose = require("mongoose");
const Guest = require("../models/Guest");
const User = require("../models/User");
const Reservation = require("../models/Reservation");
const RestaurantReservation = require("../models/RestaurantReservation");
const EventBooking = require("../models/EventBooking");
const Invoice = require("../models/Invoice");

function isPropertyScoped(req) {
  return Boolean(req.user && (req.user.role !== "admin" || req.user.departmentAdmin === true) && req.propertyId);
}

async function guestBelongsToProperty(guest, propertyId) {
  if (!guest || !propertyId) return false;
  if (guest.property && String(guest.property) === String(propertyId)) return true;
  return Boolean(await Reservation.exists({ guest: guest._id, property: propertyId }));
}

// Reconcile any unlinked Customer Users with corresponding Guest profiles
async function reconcileCustomerGuests() {
  try {
    const unlinked = await User.find({
      role: "customer",
      $or: [{ guest: { $exists: false } }, { guest: null }]
    });

    for (const user of unlinked) {
      const email = (user.email || "").toLowerCase().trim();
      let guest = email ? await Guest.findOne({ email }) : null;

      if (!guest) {
        const nameParts = (user.name || "Valued Guest").trim().split(" ");
        const firstName = nameParts[0] || "Valued";
        const lastName = nameParts.slice(1).join(" ") || "Guest";
        guest = await Guest.create({
          firstName,
          lastName,
          email,
          phone: user.phone || "Not provided",
          user: user._id,
          property: user.property || null,
          nationalIdType: "Other",
          nationalIdNumber: `GST-${user._id.toString().slice(-6).toUpperCase()}`,
          nationality: "Resident",
          guestType: "Regular",
          status: user.status || "Active"
        });
      } else if (!guest.user) {
        guest.user = user._id;
        await guest.save();
      }

      user.guest = guest._id;
      await User.findByIdAndUpdate(user._id, { guest: guest._id });
    }
  } catch (err) {
    console.warn("Reconciliation notice (non-fatal):", err.message);
  }
}

// Get all guests (Admin & Staff) with search, filter, pagination, and hotel activity metadata
exports.getGuests = async (req, res) => {
  try {
    // Automatically heal and reconcile any unlinked registered customer accounts
    await reconcileCustomerGuests();

    const { 
      search, 
      status, 
      guestType, 
      page = 1, 
      limit = 20, 
      paginated = "false",
      sort = "createdAt",
      order = "desc"
    } = req.query;

    const andConditions = [];

    // 1. Search across name, email, phone, ID number
    if (search && search.trim()) {
      const term = search.trim();
      const regex = new RegExp(term, "i");
      andConditions.push({
        $or: [
          { firstName: regex },
          { lastName: regex },
          { email: regex },
          { phone: regex },
          { nationalIdNumber: regex },
          { company: regex }
        ]
      });
    }

    // 2. Filter by status
    if (status && status !== "All") {
      andConditions.push({ status });
    }

    // 3. Filter by guestType
    if (guestType && guestType !== "All") {
      andConditions.push({ guestType });
    }

    // 4. Tenancy Isolation:
    // If staff user is property-scoped (not a global admin) and property context is active
    if (isPropertyScoped(req)) {
      const propertyReservations = await Reservation.find({ property: req.propertyId }).distinct("guest");
      andConditions.push({
        $or: [
          { property: req.propertyId },
          { property: null },
          { property: { $exists: false } },
          { _id: { $in: propertyReservations } }
        ]
      });
    }

    const query = andConditions.length > 0 ? { $and: andConditions } : {};

    const sortOrder = order === "asc" ? 1 : -1;
    const sortField = sort || "createdAt";

    const isPaginated = paginated === "true" || req.query.page !== undefined;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const total = await Guest.countDocuments(query);

    let guestsQuery = Guest.find(query)
      .populate("user", "name email phone role status lastLogin createdAt")
      .sort({ [sortField]: sortOrder });

    if (isPaginated) {
      guestsQuery = guestsQuery.skip(skip).limit(limitNum);
    }

    const rawGuests = await guestsQuery;
    const guestIds = rawGuests.map(g => g._id);

    // Aggregate booking counts and latest booking date for each guest
    const [reservationCounts, latestReservations] = await Promise.all([
      Reservation.aggregate([
        { $match: { guest: { $in: guestIds }, ...(isPropertyScoped(req) ? { property: req.propertyId } : {}) } },
        { $group: { _id: "$guest", count: { $sum: 1 } } }
      ]),
      Reservation.aggregate([
        { $match: { guest: { $in: guestIds }, ...(isPropertyScoped(req) ? { property: req.propertyId } : {}) } },
        { $sort: { checkInDate: -1 } },
        { $group: { _id: "$guest", latestCheckIn: { $first: "$checkInDate" }, latestStatus: { $first: "$status" } } }
      ])
    ]);

    const countMap = {};
    reservationCounts.forEach(item => {
      countMap[item._id.toString()] = item.count;
    });

    const latestMap = {};
    latestReservations.forEach(item => {
      latestMap[item._id.toString()] = {
        latestCheckIn: item.latestCheckIn,
        latestStatus: item.latestStatus
      };
    });

    const enrichedGuests = rawGuests.map(g => {
      const gObj = g.toObject();
      const idStr = g._id.toString();
      gObj.bookingCount = countMap[idStr] || gObj.totalStays || 0;
      gObj.latestBookingDate = latestMap[idStr]?.latestCheckIn || null;
      gObj.latestBookingStatus = latestMap[idStr]?.latestStatus || null;
      gObj.hasAccount = !!gObj.user;
      gObj.accountStatus = gObj.user ? (gObj.user.status || "Active") : "Unregistered";
      return gObj;
    });

    if (isPaginated) {
      return res.json({
        guests: enrichedGuests,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum) || 1
      });
    }

    console.log(`[GUEST_DIRECTORY] Loaded ${enrichedGuests.length} guests (total in DB: ${total}) for user ${req.user?._id || 'unknown'} (role: ${req.user?.role})`);

    // Default return array for full backwards compatibility
    res.json(enrichedGuests);
  } catch (err) {
    console.error("Get guests error:", err);
    res.status(500).json({ error: "Failed to load guests" });
  }
};

// Search guests
exports.searchGuests = async (req, res) => {
  const { query } = req.query;

  if (!query) {
    return res.status(400).json({ error: "Search query is required" });
  }

  try {
    const term = query.trim();
    const filter = {
      $or: [
        { firstName: { $regex: term, $options: "i" } },
        { lastName: { $regex: term, $options: "i" } },
        { email: { $regex: term, $options: "i" } },
        { phone: { $regex: term, $options: "i" } },
        { nationalIdNumber: { $regex: term, $options: "i" } }
      ]
    };
    if (isPropertyScoped(req)) {
      const propertyReservations = await Reservation.distinct("guest", { property: req.propertyId });
      filter.$and = [{ $or: [{ property: req.propertyId }, { property: null }, { property: { $exists: false } }, { _id: { $in: propertyReservations } }] }];
    }
    const guests = await Guest.find(filter)
    .populate("user", "name email phone role status lastLogin")
    .limit(20);

    res.json(guests);
  } catch (err) {
    res.status(500).json({ error: "Failed to search guests" });
  }
};

// Get single guest with complete activity history (Admin & Staff)
exports.getGuest = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid guest ID format" });
  }

  try {
    const guest = await Guest.findById(id).populate("user", "-password");

    if (!guest) {
      return res.status(404).json({ error: "Guest not found" });
    }

    // Tenancy isolation check for staff
    if (isPropertyScoped(req)) {
      const hasReservationAtProperty = await Reservation.exists({
        guest: guest._id,
        property: req.propertyId
      });
      const isRegisteredAtProperty = guest.property && guest.property.toString() === req.propertyId.toString();
      if (!hasReservationAtProperty && !isRegisteredAtProperty) {
        return res.status(403).json({ error: "Access denied: Guest is not associated with your property" });
      }
    }

    // Fetch related room reservations
    const reservations = await Reservation.find({ guest: id, ...(isPropertyScoped(req) ? { property: req.propertyId } : {}) })
      .populate("room", "roomNumber roomType basePrice floor building")
      .populate("property", "name code city")
      .sort({ checkInDate: -1 });

    const reservationIds = reservations.map(r => r._id);

    // Fetch related restaurant reservations
    const restaurantQuery = {
      $or: [
        { hotelReservation: { $in: reservationIds } },
        { email: guest.email ? guest.email.toLowerCase() : "___nonexistent___" }
      ]
    };
    if (guest.user?._id) {
      restaurantQuery.$or.push({ user: guest.user._id });
    }

    if (req.user?.role === "admin" && req.user.departmentAdmin === true) restaurantQuery.$or = [{ hotelReservation: { $in: reservationIds } }];
    const restaurantReservations = await RestaurantReservation.find(restaurantQuery)
      .populate("restaurant", "name cuisine openingHours")
      .populate("table", "tableNumber capacity location")
      .sort({ date: -1 });

    // Fetch related event bookings
    const eventQuery = {
      $or: [
        { email: guest.email ? guest.email.toLowerCase() : "___nonexistent___" }
      ]
    };
    if (guest.user?._id) {
      eventQuery.$or.push({ user: guest.user._id });
    }

    if (req.user?.role === "admin" && req.user.departmentAdmin === true) eventQuery.$or = [{ _id: { $in: [] } }];
    const eventBookings = await EventBooking.find(eventQuery)
      .populate("event", "title eventType startDate startTime")
      .populate("venue", "name capacity")
      .sort({ createdAt: -1 });

    // Fetch related invoices
    const invoices = await Invoice.find({ guest: id, ...(isPropertyScoped(req) ? { property: req.propertyId } : {}) })
      .populate("reservation", "reservationNumber checkInDate checkOutDate status")
      .populate("property", "name code currency")
      .sort({ invoiceDate: -1 });

    const guestObj = guest.toObject();

    // Mask sensitive national ID for general staff unless user is admin or manager
    if (req.user && (req.user.departmentAdmin === true || !["admin", "manager", "super_admin"].includes(req.user.role)) && guestObj.nationalIdNumber) {
      const len = guestObj.nationalIdNumber.length;
      if (len > 4) {
        guestObj.nationalIdNumber = "*".repeat(len - 4) + guestObj.nationalIdNumber.slice(-4);
      }
    }

    res.json({
      ...guestObj,
      reservations,
      restaurantReservations,
      eventBookings,
      invoices,
      totalReservations: reservations.length,
      latestBookingDate: reservations[0]?.checkInDate || null
    });
  } catch (err) {
    console.error("Get guest details error:", err);
    res.status(500).json({ error: "Failed to load guest details" });
  }
};

// Add new guest manually (Admin / Staff)
exports.addGuest = async (req, res) => {
  const { 
    firstName, 
    lastName, 
    email, 
    phone, 
    nationalIdType, 
    nationalIdNumber,
    nationality,
    address,
    dateOfBirth,
    gender,
    guestType,
    preferences,
    notes,
    status
  } = req.body;

  if (!firstName || !lastName || !phone) {
    return res.status(400).json({ error: "First name, last name, and phone number are required" });
  }

  try {
    const normalizedEmail = email ? email.trim().toLowerCase() : "";

    // Check if guest with same national ID already exists (if provided)
    if (nationalIdNumber && nationalIdNumber.trim()) {
      const existingGuest = await Guest.findOne({ 
        nationalIdType: nationalIdType || "National ID", 
        nationalIdNumber: nationalIdNumber.trim() 
      });

      if (existingGuest) {
        return res.status(400).json({ error: "A guest with this ID number already exists" });
      }
    }

    // Check if an existing User exists for this email
    let linkedUser = null;
    if (normalizedEmail) {
      linkedUser = await User.findOne({ email: normalizedEmail });
    }

    const newGuest = new Guest({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: normalizedEmail,
      phone: phone.trim(),
      nationalIdType: nationalIdType || "Other",
      nationalIdNumber: nationalIdNumber ? nationalIdNumber.trim() : "",
      nationality: nationality ? nationality.trim() : "Resident",
      address,
      dateOfBirth,
      gender,
      guestType: guestType || "Regular",
      status: status || "Active",
      property: req.propertyId || null,
      user: linkedUser ? linkedUser._id : null,
      preferences,
      notes
    });

    await newGuest.save();

    // If User found, link guest to user
    if (linkedUser && !linkedUser.guest) {
      linkedUser.guest = newGuest._id;
      await linkedUser.save();
    }

    res.status(201).json(newGuest);
  } catch (err) {
    console.error("Add guest error:", err);
    res.status(500).json({ error: "Failed to add guest" });
  }
};

// Update guest (Admin / Staff)
exports.updateGuest = async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid guest ID format" });
  }

  // Prevent mass-assignment of internal / protected keys
  delete updates._id;
  delete updates.__v;
  delete updates.createdAt;

  try {
    const existingGuest = await Guest.findById(id);

    if (!existingGuest) {
      return res.status(404).json({ error: "Guest not found" });
    }

    // Tenancy isolation check for staff
    if (isPropertyScoped(req) && !await guestBelongsToProperty(existingGuest, req.propertyId)) {
      return res.status(403).json({ error: "Guest is outside your assigned property" });
    }

    if (updates.email) {
      updates.email = updates.email.trim().toLowerCase();
    }

    const guest = await Guest.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true
    }).populate("user", "name email phone role status");

    // Synchronize updates with linked User account if applicable
    if (guest.user) {
      const userUpdates = {};
      if (updates.firstName || updates.lastName) {
        userUpdates.name = `${guest.firstName} ${guest.lastName}`.trim();
      }
      if (updates.phone) {
        userUpdates.phone = updates.phone.trim();
      }
      if (updates.status) {
        userUpdates.status = updates.status;
      }
      if (Object.keys(userUpdates).length > 0) {
        await User.findByIdAndUpdate(guest.user._id || guest.user, userUpdates);
      }
    }

    res.json(guest);
  } catch (err) {
    console.error("Update guest error:", err.message);
    res.status(500).json({ error: "Failed to update guest: " + err.message });
  }
};

// Toggle or update account status (Admin / Staff)
exports.updateGuestStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!["Active", "Inactive", "Suspended"].includes(status)) {
    return res.status(400).json({ error: "Status must be 'Active', 'Inactive', or 'Suspended'" });
  }

  try {
    const guest = await Guest.findById(id);

    if (!guest) {
      return res.status(404).json({ error: "Guest not found" });
    }

    if (isPropertyScoped(req) && !await guestBelongsToProperty(guest, req.propertyId)) {
      return res.status(403).json({ error: "Guest is outside your assigned property" });
    }

    guest.status = status;
    await guest.save();

    // Synchronize linked User account status if exists
    if (guest.user) {
      await User.findByIdAndUpdate(guest.user, { status });
    }

    res.json({ message: `Guest account status updated to ${status}`, guest });
  } catch (err) {
    res.status(500).json({ error: "Failed to update guest status" });
  }
};

// Delete guest (Admin only)
exports.deleteGuest = async (req, res) => {
  const { id } = req.params;

  try {
    const guest = await Guest.findById(id);

    if (!guest) {
      return res.status(404).json({ error: "Guest not found" });
    }

    if (isPropertyScoped(req) && !await guestBelongsToProperty(guest, req.propertyId)) {
      return res.status(403).json({ error: "Guest is outside your assigned property" });
    }

    // Safety check: Do not delete guests who have active/completed reservations
    const reservationCount = await Reservation.countDocuments({ guest: id });
    if (reservationCount > 0) {
      return res.status(400).json({ 
        error: "Cannot delete a guest with hotel reservation history. Deactivate the account instead." 
      });
    }

    // Unlink guest from any User account before deletion
    if (guest.user) {
      await User.findByIdAndUpdate(guest.user, { $unset: { guest: 1 } });
    }

    await Guest.findByIdAndDelete(id);

    res.json({ message: "Guest deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete guest" });
  }
};

// Get guest statistics
exports.getGuestStats = async (req, res) => {
  try {
    const filter = {};
    if (isPropertyScoped(req)) {
      filter.property = req.propertyId;
    }

    const totalGuests = await Guest.countDocuments(filter);
    const vipGuests = await Guest.countDocuments({ ...filter, guestType: "VIP" });
    const activeGuests = await Guest.countDocuments({ ...filter, status: "Active" });
    const blacklistedGuests = await Guest.countDocuments({ ...filter, blacklisted: true });
    
    const topGuests = await Guest.find(filter)
      .sort({ totalSpent: -1 })
      .limit(10)
      .select("firstName lastName email totalStays totalSpent loyaltyPoints status guestType");

    res.json({
      totalGuests,
      vipGuests,
      activeGuests,
      blacklistedGuests,
      topGuests
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load guest statistics" });
  }
};
