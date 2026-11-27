// backend/controllers/restaurantController.js
const mongoose = require("mongoose");
const Restaurant = require("../models/Restaurant");
const RestaurantTable = require("../models/RestaurantTable");
const RestaurantMenuCategory = require("../models/RestaurantMenuCategory");
const RestaurantMenuItem = require("../models/RestaurantMenuItem");
const RestaurantOrder = require("../models/RestaurantOrder");
const RestaurantBuffet = require("../models/RestaurantBuffet");
const RestaurantOffer = require("../models/RestaurantOffer");
const RestaurantReservation = require("../models/RestaurantReservation");
const Reservation = require("../models/Reservation");
const GuestExpense = require("../models/GuestExpense");
const Invoice = require("../models/Invoice");
const Payment = require("../models/Payment");
const { findVerifiedStay, matchesContact, hashGuestToken, createGuestToken, verifyGuestToken } = require("../services/diningGuestVerification");
const { reservationPaymentQuery, summarizeReservationPayment, getReservationPaymentsById, canReadReservation } = require("../services/diningPaymentService");
const { isGuestCountWithinCapacity, resolveReservationPricing } = require("../utils/diningPricing");
const { seatReservation, completeReservation } = require("../services/diningSeatingService");

const RESERVATION_TRANSITIONS = {
  PENDING: ["CONFIRMED", "CANCELLED", "NO_SHOW"],
  CONFIRMED: ["SEATED", "COMPLETED", "CANCELLED", "NO_SHOW"],
  SEATED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: []
};

function parseDiningDateTime(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) || !/^\d{2}:\d{2}$/.test(String(time || ""))) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  if (hours > 23 || minutes > 59) return null;
  const timestamp = Date.UTC(year, month - 1, day, hours, minutes);
  return new Date(timestamp).toISOString().slice(0, 10) === date ? timestamp : null;
}

function isTimeConflicting(date1, time1, date2, time2, windowMinutes = 90) {
  const start1 = parseDiningDateTime(date1, time1);
  const start2 = parseDiningDateTime(date2, time2);
  return start1 !== null && start2 !== null && Math.abs(start1 - start2) < windowMinutes * 60_000;
}

function shiftDiningDate(date, days) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function validReservationTransition(current, next) {
  return current === next || RESERVATION_TRANSITIONS[current]?.includes(next);
}

function validateTagline(body) {
  return body?.tagline === undefined ||
    (typeof body.tagline === "string" && body.tagline.trim().length <= 160);
}

function currentCapacityAllows(restaurant, bookedCovers, requestedCovers) {
  return bookedCovers + requestedCovers <= Number(restaurant.capacity || 80) * 1.2;
}

function getReservationEndTime(startTime) {
  if (!/^\d{2}:\d{2}$/.test(String(startTime || ""))) return "";
  const [hours, minutes] = String(startTime).split(":").map(Number);
  const endMinutes = hours * 60 + minutes + 90;
  const endHours = Math.floor(endMinutes / 60) % 24;
  const endRemainder = endMinutes % 60;
  return `${String(endHours).padStart(2, "0")}:${String(endRemainder).padStart(2, "0")}`;
}

async function getMaxPartySize(propertyId, restaurant) {
  const largestTable = await RestaurantTable.findOne({
    property: propertyId,
    restaurant: restaurant._id,
    active: true,
    status: { $ne: "OUT_OF_SERVICE" }
  }).sort({ capacity: -1 }).select("capacity").lean();
  const maxTableCapacity = largestTable?.capacity || restaurant.capacity || 30;
  return restaurant.capacity ? Math.min(maxTableCapacity, restaurant.capacity) : maxTableCapacity;
}

// ==========================================
// PUBLIC & CUSTOMER-FACING CONTROLLERS
// ==========================================

/**
 * @desc Get all active restaurants for current property
 * @route GET /api/restaurants
 * @access Public
 */
exports.getRestaurants = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    if (!propertyId) {
      return res.status(400).json({ error: "Property context required" });
    }

    let restaurants = await Restaurant.find({ property: propertyId, active: true })
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean();

    // Ensure any legacy restaurant records without a slug have one populated
    const maxTables = await RestaurantTable.aggregate([
      { $match: { property: propertyId, restaurant: { $in: restaurants.map((rest) => rest._id) }, active: true, status: { $ne: "OUT_OF_SERVICE" } } },
      { $group: { _id: "$restaurant", capacity: { $max: "$capacity" } } }
    ]);
    const maxCapacityByRestaurant = new Map(maxTables.map((item) => [String(item._id), item.capacity]));
    restaurants = restaurants.map((rest) => {
      if (!rest.slug && rest.name) {
        rest.slug = rest.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      }
      const maxTableCapacity = maxCapacityByRestaurant.get(String(rest._id)) || rest.capacity || 30;
      rest.maxPartySize = rest.capacity ? Math.min(maxTableCapacity, rest.capacity) : maxTableCapacity;
      rest.reservationPricePerGuest = Number(rest.reservationPricePerGuest) || 0;
      rest.reservationPriceCurrency = rest.reservationPriceCurrency || req.property?.currency || "LKR";
      return rest;
    });

    return res.status(200).json({
      success: true,
      count: restaurants.length,
      data: restaurants
    });
  } catch (err) {
    console.error("getRestaurants error:", err);
    return res.status(500).json({ error: "Failed to fetch restaurants" });
  }
};

/**
 * @desc Get single restaurant by slug with categories, menu items, buffets, offers
 * @route GET /api/restaurants/:slug
 * @access Public
 */
exports.getRestaurantBySlug = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const { slug } = req.params;

    if (!propertyId) {
      return res.status(400).json({ error: "Property context required" });
    }

    // Try finding by slug, or by ObjectId if valid
    const query = {
      property: propertyId,
      active: true,
      ...(mongoose.Types.ObjectId.isValid(slug) ? { $or: [{ slug }, { _id: slug }] } : { slug })
    };

    let restaurant = await Restaurant.findOne(query).lean();

    // Robust fallback: If not found by exact slug/id, check if restaurant matches by slug pattern or name
    if (!restaurant) {
      const escaped = slug.replace(/-/g, '.*');
      restaurant = await Restaurant.findOne({
        property: propertyId,
        active: true,
        $or: [
          { slug: { $regex: new RegExp(`^${escaped}$`, 'i') } },
          { name: { $regex: new RegExp(escaped, 'i') } }
        ]
      }).lean();
    }

    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found in current property" });
    }

    // Fetch related active menu categories and items
    const categories = await RestaurantMenuCategory.find({
      property: propertyId,
      restaurant: restaurant._id,
      active: true
    })
      .sort({ sortOrder: 1 })
      .lean();

    const menuItems = await RestaurantMenuItem.find({
      property: propertyId,
      restaurant: restaurant._id,
      available: true
    })
      .sort({ sortOrder: 1 })
      .lean();

    // Group items under categories
    const categoriesWithItems = categories.map((cat) => ({
      ...cat,
      items: menuItems.filter((item) => item.category.toString() === cat._id.toString())
    }));

    // Fetch active buffets
    const buffets = await RestaurantBuffet.find({
      property: propertyId,
      restaurant: restaurant._id,
      active: true
    })
      .sort({ createdAt: 1 })
      .lean();

    // Fetch active offers
    const offers = await RestaurantOffer.find({
      property: propertyId,
      restaurant: restaurant._id,
      active: true
    })
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean();

    // Fetch available seating locations
    const tables = await RestaurantTable.find({
      property: propertyId,
      restaurant: restaurant._id,
      active: true
    })
      .select("location capacity tableNumber status")
      .lean();

    const uniqueLocations = Array.from(new Set(tables.map((t) => t.location)));
    const maxTableCapacity = tables.filter((table) => table.status !== "OUT_OF_SERVICE").reduce((max, table) => Math.max(max, table.capacity || 0), 0) || restaurant.capacity || 30;
    const maxPartySize = restaurant.capacity ? Math.min(maxTableCapacity, restaurant.capacity) : maxTableCapacity;

    return res.status(200).json({
      success: true,
      data: {
        ...restaurant,
        maxPartySize,
        reservationPricePerGuest: Number(restaurant.reservationPricePerGuest) || 0,
        reservationPriceCurrency: restaurant.reservationPriceCurrency || req.property?.currency || "LKR",
        menuCategories: categoriesWithItems,
        buffets,
        offers,
        seatingLocations: uniqueLocations,
        totalTablesCount: tables.length
      }
    });
  } catch (err) {
    console.error("getRestaurantBySlug error:", err);
    return res.status(500).json({ error: "Failed to fetch restaurant details" });
  }
};

/**
 * @desc Get menu categories and items for a restaurant
 * @route GET /api/restaurants/:id/menu
 * @access Public
 */
exports.getRestaurantMenu = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const { id } = req.params;

    const query = mongoose.Types.ObjectId.isValid(id)
      ? { _id: id, property: propertyId }
      : { slug: id, property: propertyId };

    const restaurant = await Restaurant.findOne({ ...query, active: true });
    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    const categories = await RestaurantMenuCategory.find({
      property: propertyId,
      restaurant: restaurant._id,
      active: true
    })
      .sort({ sortOrder: 1 })
      .lean();

    const items = await RestaurantMenuItem.find({
      property: propertyId,
      restaurant: restaurant._id,
      available: true
    })
      .sort({ sortOrder: 1 })
      .lean();

    const categoriesWithItems = categories.map((cat) => ({
      ...cat,
      items: items.filter((item) => item.category.toString() === cat._id.toString())
    }));

    return res.status(200).json({
      success: true,
      data: categoriesWithItems
    });
  } catch (err) {
    console.error("getRestaurantMenu error:", err);
    return res.status(500).json({ error: "Failed to fetch menu" });
  }
};

/**
 * @desc Get buffets for a restaurant
 * @route GET /api/restaurants/:id/buffets
 * @access Public
 */
exports.getRestaurantBuffets = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const { id } = req.params;

    const query = mongoose.Types.ObjectId.isValid(id)
      ? { _id: id, property: propertyId }
      : { slug: id, property: propertyId };

    const restaurant = await Restaurant.findOne({ ...query, active: true });
    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    const buffets = await RestaurantBuffet.find({
      property: propertyId,
      restaurant: restaurant._id,
      active: true
    }).sort({ createdAt: 1 });

    return res.status(200).json({
      success: true,
      data: buffets
    });
  } catch (err) {
    console.error("getRestaurantBuffets error:", err);
    return res.status(500).json({ error: "Failed to fetch buffets" });
  }
};

/**
 * @desc Get offers for a restaurant
 * @route GET /api/restaurants/:id/offers
 * @access Public
 */
exports.getRestaurantOffers = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const { id } = req.params;

    const query = mongoose.Types.ObjectId.isValid(id)
      ? { _id: id, property: propertyId }
      : { slug: id, property: propertyId };

    const restaurant = await Restaurant.findOne({ ...query, active: true });
    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    const offers = await RestaurantOffer.find({
      property: propertyId,
      restaurant: restaurant._id,
      active: true
    }).sort({ sortOrder: 1, createdAt: 1 });

    return res.status(200).json({
      success: true,
      data: offers
    });
  } catch (err) {
    console.error("getRestaurantOffers error:", err);
    return res.status(500).json({ error: "Failed to fetch offers" });
  }
};

/**
 * @desc Check table availability for date, time, guests, and seating preference
 * @route GET /api/restaurants/:id/availability
 * @access Public
 */
exports.checkAvailability = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const { id } = req.params;
    const { date, time, guestCount = 2, seatingPreference = "Any" } = req.query;

    if (!date || !time) {
      return res.status(400).json({ error: "Date and time parameters are required" });
    }
    if (parseDiningDateTime(date, time) === null) {
      return res.status(400).json({ error: "Enter a valid date and time" });
    }

    const guests = Number(guestCount);
    if (!Number.isSafeInteger(guests) || guests < 1) {
      return res.status(400).json({ error: "Valid guestCount is required (minimum 1)" });
    }

    const query = mongoose.Types.ObjectId.isValid(id)
      ? { _id: id, property: propertyId }
      : { slug: id, property: propertyId };

    const restaurant = await Restaurant.findOne({ ...query, active: true });
    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    const maxPartySize = await getMaxPartySize(propertyId, restaurant);

    // Find all tables for this restaurant that can accommodate the party
    const tableQuery = {
      property: propertyId,
      restaurant: restaurant._id,
      active: true,
      capacity: { $gte: guests },
      status: { $in: ["AVAILABLE", "RESERVED"] }
    };

    if (seatingPreference && seatingPreference !== "Any") {
      tableQuery.location = seatingPreference;
    }

    const candidateTables = await RestaurantTable.find(tableQuery).sort({ capacity: 1 }).lean();

    // Find existing non-cancelled reservations for this date
    const existingReservations = await RestaurantReservation.find({
      property: propertyId,
      restaurant: restaurant._id,
      date: { $gte: shiftDiningDate(date, -1), $lte: shiftDiningDate(date, 1) },
      status: { $in: ["PENDING", "CONFIRMED", "SEATED"] }
    }).lean();

    // Filter candidate tables that have no time conflict (+/- 90 mins)
    const availableTables = candidateTables.filter((table) => {
      const tableReservations = existingReservations.filter(
        (r) => r.table && r.table.toString() === table._id.toString()
      );
      const hasConflict = tableReservations.some((r) => isTimeConflicting(r.date, r.time, date, time, 90));
      return !hasConflict;
    });

    // Also calculate overall restaurant capacity covers booked
    const totalBookedCovers = existingReservations
      .filter((r) => isTimeConflicting(r.date, r.time, date, time, 90))
      .reduce((sum, r) => sum + (r.guestCount || 0), 0);

    const partySizeSupported = guests <= maxPartySize;
    const isAvailable = partySizeSupported && availableTables.length > 0 &&
      currentCapacityAllows(restaurant, totalBookedCovers, guests);
    return res.status(200).json({
      success: true,
      available: isAvailable,
      maxPartySize,
      partySizeSupported,
      availableTablesCount: availableTables.length,
      estimatedCoversRemaining: Math.max(0, restaurant.capacity - totalBookedCovers),
      suggestedTableId: availableTables.length > 0 ? availableTables[0]._id : null,
      availableTables: availableTables.map(({ _id, tableNumber, capacity, location }) => ({ _id, tableNumber, capacity, location }))
    });
  } catch (err) {
    console.error("checkAvailability error:", err);
    return res.status(500).json({ error: "Failed to check availability" });
  }
};

/**
 * @desc Lookup hotel reservation for hotel guest linking
 * @route POST /api/restaurants/lookup-hotel-stay
 * @access Public
 */
exports.lookupHotelStay = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const { reservationNumber, email, phone, roomNumber } = req.body;
    if (typeof reservationNumber !== "string" || !reservationNumber.trim() ||
        typeof email !== "string" || !email.trim() || typeof phone !== "string" || !phone.trim()) {
      return res.status(400).json({ error: "Hotel reservation number, email and phone are required" });
    }
    const stay = await findVerifiedStay(propertyId, { reservationNumber: reservationNumber.trim().toUpperCase() },
      { email, phone, roomNumber });
    if (!stay) return res.status(404).json({ error: "Hotel stay could not be verified" });

    return res.json({
      success: true,
      data: { reservationId: stay._id, reservationNumber: stay.reservationNumber, roomNumber: stay.room?.roomNumber || "" }
    });
  } catch (err) {
    console.error("lookupHotelStay error:", err);
    return res.status(500).json({ error: "Failed to lookup hotel reservation" });
  }
};

/**
 * @desc Create a table reservation (Hotel Guest or Outside Customer)
 * @route POST /api/restaurants/:id/reservations
 * @access Public
 */
exports.createReservation = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const { id } = req.params;
    const {
      guestType = "Outside Guest",
      hotelReservationId,
      roomNumber,
      customerName,
      email,
      phone,
      date,
      time,
      guestCount,
      seatingPreference = "Any",
      tableId,
      diningType = "À la carte",
      buffetSessionId,
      offerId,
      occasion = "Casual Dining",
      specialRequests = ""
    } = req.body;

    // 1. Validation
    if (!customerName || !email || !phone || !date || !time) {
      return res.status(400).json({ error: "Customer name, email, phone, date, and time are required" });
    }
    if (parseDiningDateTime(date, time) === null) {
      return res.status(400).json({ error: "Enter a valid date and time" });
    }
    if (tableId !== undefined && !mongoose.isObjectIdOrHexString(tableId)) {
      return res.status(400).json({ error: "Select a valid table" });
    }

    const guests = Number(guestCount);
    if (!Number.isSafeInteger(guests) || guests < 1) {
      return res.status(400).json({ error: "Valid guest count (minimum 1) is required" });
    }

    // Validate restaurant
    const restQuery = mongoose.Types.ObjectId.isValid(id)
      ? { _id: id, property: propertyId }
      : { slug: id, property: propertyId };

    const restaurant = await Restaurant.findOne({ ...restQuery, active: true });
    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found in this property" });
    }

    const maxPartySize = await getMaxPartySize(propertyId, restaurant);
    if (!isGuestCountWithinCapacity(guests, maxPartySize)) {
      return res.status(400).json({ error: `Party size exceeds this restaurant's maximum table capacity of ${maxPartySize} guests` });
    }

    let selectedOffer = null;
    if (offerId) {
      if (!mongoose.Types.ObjectId.isValid(offerId)) return res.status(400).json({ error: "Invalid dining offer" });
      selectedOffer = await RestaurantOffer.findOne({ _id: offerId, property: propertyId, restaurant: restaurant._id, active: true });
      if (!selectedOffer) return res.status(400).json({ error: "Dining offer is unavailable at this restaurant or property" });
    }

    let selectedBuffet = null;
    if (buffetSessionId) {
      if (!mongoose.Types.ObjectId.isValid(buffetSessionId)) return res.status(400).json({ error: "Invalid buffet session" });
      selectedBuffet = await RestaurantBuffet.findOne({ _id: buffetSessionId, property: propertyId, restaurant: restaurant._id, active: true });
      if (!selectedBuffet) return res.status(400).json({ error: "Buffet session is unavailable at this restaurant or property" });
      if (Number.isSafeInteger(Number(selectedBuffet.capacity)) && guests > Number(selectedBuffet.capacity)) {
        return res.status(400).json({ error: `Guest count exceeds this buffet session's capacity of ${selectedBuffet.capacity}` });
      }
    }

    const pricing = resolveReservationPricing({
      restaurant: { ...restaurant.toObject(), reservationPriceCurrency: restaurant.reservationPriceCurrency || req.property?.currency || "LKR" },
      buffet: selectedBuffet,
      offer: selectedOffer,
      guestType,
      guestCount: guests
    });
    const { pricePerGuest, fixedPrice, pricingType, pricingSource, totalPrice: reservationTotalPrice, currency: reservationPriceCurrency } = pricing;

    // Re-verify the stay when linking it. A successful lookup or a stay ID is not sufficient on its own.
    let linkedHotelRes = null;
    if (guestType === "Hotel Guest") {
      if (typeof hotelReservationId !== "string" || !mongoose.isObjectIdOrHexString(hotelReservationId)) {
        return res.status(400).json({ error: "Verify your hotel stay before linking the reservation" });
      }
      linkedHotelRes = await findVerifiedStay(propertyId, { _id: hotelReservationId }, { email, phone, roomNumber });
      if (!linkedHotelRes) return res.status(404).json({ error: "Hotel stay could not be verified" });
    }
    const resolvedRoomNumber = linkedHotelRes?.room?.roomNumber || "";
    const guestManagementToken = req.user ? undefined : createGuestToken();

    const reservationData = {
      property: propertyId,
      restaurant: restaurant._id,
      guestType,
      hotelReservation: linkedHotelRes ? linkedHotelRes._id : undefined,
      roomNumber: resolvedRoomNumber,
      user: req.user?._id,
      guestManagementTokenHash: guestManagementToken ? hashGuestToken(guestManagementToken) : undefined,
      customerName: customerName.trim(),
      email: email.trim().toLowerCase(),

      phone: phone.trim(),
      date,
      time,
      guestCount: guests,
      pricePerGuest,
      pricingType,
      pricingSource,
      fixedPrice,
      reservationTotalPrice,
      reservationPriceCurrency,
      totalAmount: reservationTotalPrice,
      currency: reservationPriceCurrency,
      paymentStatus: "Unpaid",
      paidAmount: 0,
      seatingPreference,
      diningType,
      buffetSession: selectedBuffet?._id,
      offer: offerId && mongoose.Types.ObjectId.isValid(offerId) ? offerId : undefined,
      offerTitle: selectedOffer?.title || "",
      offerPrice: selectedOffer
        ? (selectedOffer.pricingType === "FREE" ? 0 : selectedOffer.pricingType === "FIXED" ? selectedOffer.fixedPrice ?? selectedOffer.price : selectedOffer.pricePerGuest ?? selectedOffer.price)
        : undefined,
      offerPricingType: selectedOffer ? selectedOffer.pricingType || "PER_GUEST" : undefined,
      offerPricePerGuest: selectedOffer && pricingSource === "OFFER" && pricingType === "PER_GUEST" ? pricePerGuest : undefined,
      offerFixedPrice: selectedOffer && pricingSource === "OFFER" && pricingType === "FIXED" ? fixedPrice : undefined,
      offerCurrency: selectedOffer?.currency || reservationPriceCurrency,
      occasion,
      specialRequests: specialRequests.trim(),
      status: "CONFIRMED"
    };

    const reservation = await mongoose.connection.transaction(async session => {
      const currentRestaurant = await Restaurant.findOneAndUpdate(
        { _id: restaurant._id, property: propertyId, active: true },
        { $inc: { reservationAllocationVersion: 1 } },
        { new: true, session }
      );
      if (!currentRestaurant) {
        throw Object.assign(new Error("Restaurant is no longer accepting reservations"), { statusCode: 404 });
      }

      const candidateTables = await RestaurantTable.find({
        property: propertyId,
        restaurant: restaurant._id,
        active: true,
        capacity: { $gte: guests },
        status: { $in: ["AVAILABLE", "RESERVED"] }
      }).sort({ capacity: 1 }).session(session);
      if (!candidateTables.length) {
        throw Object.assign(new Error("No table is available for this party size"), { statusCode: 409 });
      }

      const existingReservations = await RestaurantReservation.find({
        property: propertyId,
        restaurant: restaurant._id,
        date: { $gte: shiftDiningDate(date, -1), $lte: shiftDiningDate(date, 1) },
        status: { $in: ["PENDING", "CONFIRMED", "SEATED"] }
      }).session(session);
      const currentCovers = existingReservations
        .filter(row => isTimeConflicting(row.date, row.time, date, time, 90))
        .reduce((sum, row) => sum + row.guestCount, 0);
      if (!currentCapacityAllows(currentRestaurant, currentCovers, guests)) {
        throw Object.assign(new Error("Restaurant is fully booked for the selected date and time window. Please choose another time."), { statusCode: 409 });
      }

      const hasNoConflict = table => !existingReservations.some(row =>
        row.table && String(row.table) === String(table._id) &&
        isTimeConflicting(row.date, row.time, date, time, 90)
      );
      const preferredTable = seatingPreference && seatingPreference !== "Any"
        ? candidateTables.find(table => table.location === seatingPreference && hasNoConflict(table))
        : null;
      const selectedTable = tableId ? candidateTables.find(table => String(table._id) === String(tableId)) : null;
      if (tableId && (!selectedTable || !hasNoConflict(selectedTable) ||
          (seatingPreference && seatingPreference !== "Any" && selectedTable.location !== seatingPreference))) {
        throw Object.assign(new Error("The selected table is no longer available. Please choose another table."), { statusCode: 409 });
      }
      const assignedTable = selectedTable || preferredTable || candidateTables.find(hasNoConflict);
      if (!assignedTable) {
        throw Object.assign(new Error("No table is available for the selected date and time. Please choose another time."), { statusCode: 409 });
      }

      const reservation = new RestaurantReservation({ ...reservationData, table: assignedTable._id });
      await reservation.save({ session });
      return reservation;
    });

    const populatedReservation = await RestaurantReservation.findById(reservation._id)
      .populate("restaurant", "name slug location openingHours contactPhone")
      .populate("table", "tableNumber capacity location")
      .populate("buffetSession", "name theme startTime endTime adultPrice")
      .populate("offer", "title shortDescription price discount");

    return res.status(201).json({
      success: true,
      message: "Table reservation confirmed successfully",
      guestManagementToken,
      data: populatedReservation
    });
  } catch (err) {
    if (!err.statusCode && err.code !== 112) console.error("createReservation error:", err);
    const statusCode = err.statusCode || (err.code === 112 ? 409 : 500);
    return res.status(statusCode).json({
      error: err.statusCode ? err.message : err.code === 112
        ? "Reservation allocation changed. Please retry."
        : "Failed to create reservation"
    });
  }
};

/**
 * @desc Get reservation by confirmation reference
 * @route GET /api/restaurants/reservations/:ref
 * @access Authenticated owner or verified guest
 */
exports.getReservationByRef = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const { ref } = req.params;

    const token = req.get("X-Dining-Guest-Token");
    if (!req.user && !token) return res.status(401).json({ error: "Reservation verification required" });
    if (!propertyId) return res.status(404).json({ error: "Reservation not found in this property" });
    const reservation = await RestaurantReservation.findOne({
      property: propertyId,
      $or: [{ confirmationNumber: ref.toUpperCase() }, { _id: mongoose.Types.ObjectId.isValid(ref) ? ref : null }]
    }).select("+guestManagementTokenHash")
      .populate("restaurant", "name slug cuisine location contactPhone contactEmail heroImage")
      .populate("table", "tableNumber capacity location")
      .populate("buffetSession")
      .populate("offer")
      .populate("hotelReservation", "reservationNumber checkInDate checkOutDate");

    const guestVerified = reservation && !reservation.user && verifyGuestToken(token, reservation.guestManagementTokenHash);
    if (!reservation || (!canReadReservation(req.user, reservation) && !guestVerified)) {
      return res.status(404).json({ error: "Reservation not found in this property" });
    }

    const data = reservation.toObject();
    delete data.guestManagementTokenHash;
    return res.set("Cache-Control", "no-store").json({ success: true, data });
  } catch (err) {
    console.error("getReservationByRef error:", err);
    return res.status(500).json({ error: "Failed to fetch reservation" });
  }
};

/**
 * @desc Get authenticated customer's dining reservations
 * @route GET /api/restaurants/my-reservations
 * @access Private
 */
exports.getMyReservations = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const reservations = await RestaurantReservation.find({ user: req.user._id })
      .populate("restaurant", "name slug location contactPhone contactEmail heroImage cuisine openingHours")
      .populate("table", "tableNumber capacity location")
      .populate("buffetSession", "name theme startTime endTime adultPrice")
      .populate("offer", "title price discount")
      .populate("hotelReservation", "reservationNumber checkInDate checkOutDate")
      .sort({ date: -1, time: -1, createdAt: -1 }).lean();
    const paymentsByReservation = await getReservationPaymentsById(reservations);

    return res.json({
      success: true,
      data: reservations.map(reservation => ({
        ...reservation,
        ...summarizeReservationPayment(reservation, paymentsByReservation.get(String(reservation._id)) || [])
      }))
    });
  } catch (err) {
    console.error("getMyReservations error:", err);
    return res.status(500).json({ error: "Failed to fetch dining reservations" });
  }
};

/**
 * @desc Cancel reservation
 * @route PUT /api/restaurants/reservations/:ref/cancel
 * @access Authenticated owner or verified guest
 */
exports.cancelReservation = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const { ref } = req.params;
    const { reason = "Cancelled by guest", guestToken, email, phone } = req.body || {};
    if (!propertyId) return res.status(404).json({ error: "Reservation not found" });
    const reservation = await RestaurantReservation.findOne({
      property: propertyId,
      $or: [{ confirmationNumber: ref.toUpperCase() }, { _id: mongoose.isObjectIdOrHexString(ref) ? ref : null }]
    }).select("+guestManagementTokenHash");
    const guestVerified = reservation && !reservation.user &&
      (reservation.guestManagementTokenHash
        ? verifyGuestToken(guestToken, reservation.guestManagementTokenHash)
        : matchesContact(reservation, { email, phone }));
    if (!reservation || (!canReadReservation(req.user, reservation) && !guestVerified)) {
      return res.status(404).json({ error: "Reservation not found" });
    }
    if (typeof reason !== "string" || reason.length > 500) {
      return res.status(400).json({ error: "Invalid cancellation reason" });
    }
    const updated = await RestaurantReservation.findOneAndUpdate({
      _id: reservation._id, property: propertyId, status: { $in: ["PENDING", "CONFIRMED"] },
      arrivalStatus: { $ne: "ARRIVED" }
    }, { $set: { status: "CANCELLED", cancellationReason: reason } }, { new: true, runValidators: true });
    if (!updated) return res.status(409).json({ error: "This reservation cannot be cancelled" });
    return res.json({ success: true, message: "Reservation successfully cancelled", data: updated });
  } catch (err) {
    console.error("cancelReservation error:", err);
    return res.status(500).json({ error: "Failed to cancel reservation" });
  }
};


// ==========================================
// ADMIN / STAFF CONTROLLERS (PROTECTED)
// ==========================================

/**
 * @desc Get restaurant dashboard statistics
 * @route GET /api/restaurants/admin/dashboard-stats
 * @access Staff/Admin
 */
exports.getAdminDashboardStats = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const todayStr = new Date().toISOString().slice(0, 10);

    // Today's reservations
    const todayReservations = await RestaurantReservation.find({
      property: propertyId,
      date: todayStr,
      status: { $in: ["CONFIRMED", "SEATED", "COMPLETED", "PENDING"] }
    }).lean();

    const todayCovers = todayReservations.reduce((sum, r) => sum + (r.guestCount || 0), 0);

    // Tables
    const totalTables = await RestaurantTable.countDocuments({ property: propertyId, active: true });
    const availableTables = await RestaurantTable.countDocuments({
      property: propertyId,
      active: true,
      status: "AVAILABLE"
    });
    const occupiedTables = await RestaurantTable.countDocuments({
      property: propertyId,
      active: true,
      status: "OCCUPIED"
    });

    // Reservations by status
    const pendingReservations = await RestaurantReservation.countDocuments({
      property: propertyId,
      status: "PENDING"
    });

    // Upcoming buffets
    const upcomingBuffets = await RestaurantBuffet.countDocuments({
      property: propertyId,
      active: true
    });

    // Active offers
    const activeOffers = await RestaurantOffer.countDocuments({
      property: propertyId,
      active: true
    });

    // Total restaurants
    const totalRestaurants = await Restaurant.countDocuments({ property: propertyId });

    return res.status(200).json({
      success: true,
      data: {
        todayReservationsCount: todayReservations.length,
        todayCovers,
        totalTables,
        availableTables,
        occupiedTables,
        pendingReservations,
        upcomingBuffets,
        activeOffers,
        totalRestaurants
      }
    });
  } catch (err) {
    console.error("getAdminDashboardStats error:", err);
    return res.status(500).json({ error: "Failed to load restaurant dashboard stats" });
  }
};

/**
 * @desc Get all restaurants for admin (including inactive)
 * @route GET /api/restaurants/admin/restaurants
 * @access Staff/Admin
 */
exports.getAdminRestaurants = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    if (!propertyId) return res.status(400).json({ error: "Property context required" });
    const restaurants = await Restaurant.find({ property: propertyId }).sort({ sortOrder: 1, createdAt: -1 }).lean();
    const itemCounts = await RestaurantMenuItem.aggregate([
      { $match: { property: propertyId, restaurant: { $in: restaurants.map((row) => row._id) } } },
      { $group: { _id: "$restaurant", total: { $sum: 1 }, active: { $sum: { $cond: ["$available", 1, 0] } } } }
    ]);
    const countsByRestaurant = new Map(itemCounts.map((row) => [String(row._id), row]));
    const rows = restaurants.map((restaurant) => {
      const count = countsByRestaurant.get(String(restaurant._id));
      return { ...restaurant, menuItemCount: count?.total || 0, activeMenuItemCount: count?.active || 0,
        inactiveMenuItemCount: (count?.total || 0) - (count?.active || 0) };
    });

    return res.status(200).json({
      success: true,
      data: rows
    });
  } catch (err) {
    console.error("getAdminRestaurants error:", err);
    return res.status(500).json({ error: "Failed to fetch restaurants" });
  }
};

/**
 * @desc Create new restaurant
 * @route POST /api/restaurants/admin/restaurants
 * @access Admin/Manager
 */
exports.createRestaurant = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    if (!validateTagline(req.body)) return res.status(400).json({ error: "Tagline must be a string of at most 160 characters" });
    const allowedFields = ["name", "slug", "tagline", "description", "cuisine", "restaurantType", "location", "openingHours", "contactPhone", "contactEmail", "heroImage", "images", "capacity", "reservationPricePerGuest", "reservationPriceCurrency", "active"];
    const data = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowedFields.includes(key)));
    data.property = propertyId;

    if (!data.slug && data.name) {
      data.slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    }

    const restaurant = await Restaurant.create(data);

    return res.status(201).json({
      success: true,
      data: restaurant
    });
  } catch (err) {
    console.error("createRestaurant error:", err);
    return res.status(400).json({ error: err.message || "Failed to create restaurant" });
  }
};

/**
 * @desc Update restaurant
 * @route PUT /api/restaurants/admin/restaurants/:id
 * @access Admin/Manager
 */
exports.updateRestaurant = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const { id } = req.params;

    if (!validateTagline(req.body)) return res.status(400).json({ error: "Tagline must be a string of at most 160 characters" });
    const allowedFields = ["name", "slug", "tagline", "description", "cuisine", "restaurantType", "location", "openingHours", "contactPhone", "contactEmail", "heroImage", "images", "capacity", "reservationPricePerGuest", "reservationPriceCurrency", "active"];
    const updates = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowedFields.includes(key)));
    const restaurant = await Restaurant.findOneAndUpdate(
      { _id: id, property: propertyId },
      updates,
      { new: true, runValidators: true }
    );

    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    return res.status(200).json({
      success: true,
      data: restaurant
    });
  } catch (err) {
    console.error("updateRestaurant error:", err);
    return res.status(400).json({ error: err.message || "Failed to update restaurant" });
  }
};

/**
 * @desc Delete / toggle restaurant
 * @route DELETE /api/restaurants/admin/restaurants/:id
 * @access Admin/Manager
 */
exports.deleteRestaurant = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const { id } = req.params;

    const restaurant = await Restaurant.findOneAndUpdate(
      { _id: id, property: propertyId },
      { active: false },
      { new: true, runValidators: true }
    );
    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Restaurant deleted successfully"
    });
  } catch (err) {
    console.error("deleteRestaurant error:", err);
    return res.status(500).json({ error: "Failed to delete restaurant" });
  }
};

// ==========================================
// TABLES MANAGEMENT
// ==========================================

exports.getAdminTables = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const { restaurantId } = req.query;

    const query = { property: propertyId };
    if (restaurantId) query.restaurant = restaurantId;

    const tables = await RestaurantTable.find(query).populate("restaurant", "name").sort({ tableNumber: 1 });

    return res.status(200).json({ success: true, data: tables });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch tables" });
  }
};

exports.createTable = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const table = await RestaurantTable.create({ ...req.body, property: propertyId });
    return res.status(201).json({ success: true, data: table });
  } catch (err) {
    return res.status(400).json({ error: err.message || "Failed to create table" });
  }
};

exports.updateTable = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const { id } = req.params;
    const table = await RestaurantTable.findOneAndUpdate(
      { _id: id, property: propertyId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!table) return res.status(404).json({ error: "Table not found" });
    return res.status(200).json({ success: true, data: table });
  } catch (err) {
    return res.status(400).json({ error: err.message || "Failed to update table" });
  }
};

exports.deleteTable = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const { id } = req.params;
    const table = await RestaurantTable.findOneAndDelete({ _id: id, property: propertyId });
    if (!table) return res.status(404).json({ error: "Table not found" });
    return res.status(200).json({ success: true, message: "Table deleted successfully" });
  } catch (err) {
    return res.status(500).json({ error: "Failed to delete table" });
  }
};

// ==========================================
// MENU CATEGORIES & ITEMS MANAGEMENT
// ==========================================

function validMenuName(value) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 80;
}

async function ownedRestaurant(property, restaurantId) {
  if (!mongoose.Types.ObjectId.isValid(restaurantId)) return null;
  return Restaurant.findOne({ _id: restaurantId, property });
}

async function hasDuplicateCategory(property, restaurant, name, excludedId) {
  const rows = await RestaurantMenuCategory.find({ property, restaurant, ...(excludedId ? { _id: { $ne: excludedId } } : {}) })
    .select("name").lean();
  const normalized = name.trim().toLocaleLowerCase();
  return rows.some((row) => row.name.trim().toLocaleLowerCase() === normalized);
}

exports.getAdminMenuCategories = async (req, res) => {
  try {
    const property = req.propertyId;
    if (!property) return res.status(400).json({ error: "Property context required" });
    const { restaurantId } = req.query;
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId) || !(await ownedRestaurant(property, restaurantId))) {
      return res.status(404).json({ error: "Restaurant not found in current property" });
    }
    const categories = await RestaurantMenuCategory.find({ property, restaurant: restaurantId })
      .sort({ sortOrder: 1, name: 1 }).lean();
    return res.json({ success: true, data: categories });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch menu categories" });
  }
};

exports.createMenuCategory = async (req, res) => {
  try {
    const property = req.propertyId;
    const { restaurant: restaurantId, name, description = "", sortOrder = 0, active = true } = req.body || {};
    if (!property || !(await ownedRestaurant(property, restaurantId))) return res.status(404).json({ error: "Restaurant not found in current property" });
    if (!validMenuName(name)) return res.status(400).json({ error: "Category name is required and must be at most 80 characters" });
    if (await hasDuplicateCategory(property, restaurantId, name)) {
      return res.status(409).json({ error: "A category with this name already exists in this restaurant" });
    }
    const category = await RestaurantMenuCategory.create({ restaurant: restaurantId, name: name.trim(), description, sortOrder, active, property });
    return res.status(201).json({ success: true, data: category });
  } catch (err) {
    return res.status(err.code === 11000 ? 409 : 400).json({ error: err.code === 11000 ? "Category already exists" : err.message || "Failed to create menu category" });
  }
};

exports.updateMenuCategory = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const { id } = req.params;
    const category = await RestaurantMenuCategory.findOne({ _id: id, property: propertyId });
    if (!category) return res.status(404).json({ error: "Category not found" });
    const updates = {};
    if (req.body.name !== undefined) {
      if (!validMenuName(req.body.name)) return res.status(400).json({ error: "Category name is required and must be at most 80 characters" });
      const duplicate = await hasDuplicateCategory(propertyId, category.restaurant, req.body.name, id);
      if (duplicate) return res.status(409).json({ error: "A category with this name already exists in this restaurant" });
      updates.name = req.body.name.trim();
    }
    for (const key of ["description", "sortOrder", "active"]) if (req.body[key] !== undefined) updates[key] = req.body[key];
    category.set(updates);
    await category.save();
    return res.status(200).json({ success: true, data: category });
  } catch (err) {
    return res.status(400).json({ error: err.message || "Failed to update category" });
  }
};

exports.deleteMenuCategory = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const { id } = req.params;
    const cat = await RestaurantMenuCategory.findOne({ _id: id, property: propertyId });
    if (!cat) return res.status(404).json({ error: "Category not found" });
    const items = await RestaurantMenuItem.find({ category: id, property: propertyId }).select("_id").lean();
    if (items.length) return res.status(409).json({ error: "Move or delete all menu items before deleting this category" });
    await cat.deleteOne();
    return res.status(200).json({ success: true, message: "Category deleted" });
  } catch (err) {
    return res.status(500).json({ error: "Failed to delete category" });
  }
};

exports.getAdminMenuItems = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const { restaurantId, categoryId } = req.query;
    if (!propertyId) return res.status(400).json({ error: "Property context required" });
    const query = { property: propertyId };
    if (restaurantId) {
      if (!(await ownedRestaurant(propertyId, restaurantId))) return res.status(404).json({ error: "Restaurant not found in current property" });
      query.restaurant = restaurantId;
    }
    if (categoryId) {
      const category = await RestaurantMenuCategory.findOne({ _id: categoryId, property: propertyId, ...(restaurantId ? { restaurant: restaurantId } : {}) }).select("_id");
      if (!category) return res.status(404).json({ error: "Category not found in current restaurant/property" });
      query.category = categoryId;
    }

    const items = await RestaurantMenuItem.find(query)
      .populate("category", "name")
      .populate("restaurant", "name")
      .sort({ sortOrder: 1, name: 1 });

    return res.status(200).json({ success: true, data: items });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch menu items" });
  }
};

exports.createMenuItem = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const { restaurant: restaurantId, category: categoryId, name, price } = req.body || {};
    if (!propertyId || !(await ownedRestaurant(propertyId, restaurantId))) return res.status(404).json({ error: "Restaurant not found in current property" });
    if (!validMenuName(name)) return res.status(400).json({ error: "Item name is required and must be at most 80 characters" });
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return res.status(400).json({ error: "Price must be a positive number" });
    const category = await RestaurantMenuCategory.findOne({ _id: categoryId, property: propertyId, restaurant: restaurantId, active: true });
    if (!category) return res.status(400).json({ error: "Category must be active and belong to the selected restaurant" });
    const allowed = ["name", "description", "price", "currency", "image", "dietaryTags", "allergens", "available", "featured", "sortOrder"];
    const fields = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));
    const item = await RestaurantMenuItem.create({ ...fields, restaurant: restaurantId, category: categoryId, property: propertyId });
    return res.status(201).json({ success: true, data: item });
  } catch (err) {
    return res.status(400).json({ error: err.message || "Failed to create menu item" });
  }
};

exports.updateMenuItem = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const { id } = req.params;
    const item = await RestaurantMenuItem.findOne({ _id: id, property: propertyId });
    if (!item) return res.status(404).json({ error: "Menu item not found" });
    const allowed = ["name", "description", "price", "image", "dietaryTags", "allergens", "available", "featured", "sortOrder", "category"];
    const updates = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowed.includes(key)));
    if (updates.name !== undefined && !validMenuName(updates.name)) return res.status(400).json({ error: "Item name is required and must be at most 80 characters" });
    if (updates.price !== undefined && (typeof updates.price !== "number" || !Number.isFinite(updates.price) || updates.price <= 0)) return res.status(400).json({ error: "Price must be a positive number" });
    if (updates.category !== undefined) {
      const category = await RestaurantMenuCategory.findOne({ _id: updates.category, property: propertyId, restaurant: item.restaurant, active: true });
      if (!category) return res.status(400).json({ error: "Category must be active and belong to this item's restaurant" });
    }
    item.set(updates);
    await item.save();
    return res.status(200).json({ success: true, data: item });
  } catch (err) {
    return res.status(400).json({ error: err.message || "Failed to update menu item" });
  }
};

exports.deleteMenuItem = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const { id } = req.params;
    const item = await RestaurantMenuItem.findOne({ _id: id, property: propertyId });
    if (!item) return res.status(404).json({ error: "Menu item not found" });
    const referenced = await RestaurantOrder.exists({ property: propertyId, "items.menuItem": item._id });
    if (referenced) {
      item.available = false;
      await item.save();
      return res.status(200).json({ success: true, deactivated: true, message: "This item appears in order history, so it was made unavailable instead of deleted" });
    }
    await item.deleteOne();
    return res.status(200).json({ success: true, message: "Menu item deleted" });
  } catch (err) {
    return res.status(500).json({ error: "Failed to delete menu item" });
  }
};

// ==========================================
// BUFFETS MANAGEMENT
// ==========================================

exports.getAdminBuffets = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const { restaurantId } = req.query;
    const query = { property: propertyId };
    if (restaurantId) query.restaurant = restaurantId;

    const buffets = await RestaurantBuffet.find(query).populate("restaurant", "name").sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: buffets });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch buffets" });
  }
};

exports.createBuffet = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const buffet = await RestaurantBuffet.create({ ...req.body, property: propertyId });
    return res.status(201).json({ success: true, data: buffet });
  } catch (err) {
    return res.status(400).json({ error: err.message || "Failed to create buffet" });
  }
};

exports.updateBuffet = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const { id } = req.params;
    const buffet = await RestaurantBuffet.findOneAndUpdate(
      { _id: id, property: propertyId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!buffet) return res.status(404).json({ error: "Buffet not found" });
    return res.status(200).json({ success: true, data: buffet });
  } catch (err) {
    return res.status(400).json({ error: err.message || "Failed to update buffet" });
  }
};

exports.deleteBuffet = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const { id } = req.params;
    const buffet = await RestaurantBuffet.findOneAndDelete({ _id: id, property: propertyId });
    if (!buffet) return res.status(404).json({ error: "Buffet not found" });
    return res.status(200).json({ success: true, message: "Buffet deleted successfully" });
  } catch (err) {
    return res.status(500).json({ error: "Failed to delete buffet" });
  }
};

// ==========================================
// OFFERS MANAGEMENT
// ==========================================

exports.getAdminOffers = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const { restaurantId } = req.query;
    const query = { property: propertyId };
    if (restaurantId) query.restaurant = restaurantId;

    const offers = await RestaurantOffer.find(query).populate("restaurant", "name").sort({ sortOrder: 1, createdAt: -1 });
    return res.status(200).json({ success: true, data: offers });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch offers" });
  }
};

exports.getOfferRestaurants = async (req, res) => {
  try {
    const items = await Restaurant.find({ property: req.propertyId }).select("name active").sort({ name: 1 }).lean();
    return res.status(200).json({ success: true, data: items });
  } catch (error) {
    return res.status(500).json({ success: false, error: "Unable to load dining venues" });
  }
};

exports.createOffer = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const data = { ...req.body, property: propertyId };
    const pricingType = data.pricingType || "PER_GUEST";
    if (!["PER_GUEST", "FIXED", "FREE"].includes(pricingType)) {
      return res.status(400).json({ success: false, error: "Choose a valid offer pricing type" });
    }
    data.pricingType = pricingType;
    if (pricingType === "PER_GUEST") {
      data.pricePerGuest = data.pricePerGuest ?? data.price;
      data.price = data.pricePerGuest;
      data.fixedPrice = undefined;
    } else if (pricingType === "FIXED") {
      data.fixedPrice = data.fixedPrice ?? data.price;
      data.price = data.fixedPrice;
      data.pricePerGuest = undefined;
    } else {
      data.price = 0;
      data.pricePerGuest = undefined;
      data.fixedPrice = undefined;
    }
    if (!mongoose.Types.ObjectId.isValid(data.restaurant) || !await Restaurant.exists({ _id: data.restaurant, property: propertyId })) {
      return res.status(400).json({ success: false, error: "Select a dining venue at the assigned property" });
    }
    if (!data.slug && data.title) {
      data.slug = data.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    }
    const offer = await RestaurantOffer.create(data);
    return res.status(201).json({ success: true, data: offer });
  } catch (err) {
    return res.status(400).json({ error: err.message || "Failed to create offer" });
  }
};

exports.updateOffer = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const { id } = req.params;
    if (req.body.restaurant && (!mongoose.Types.ObjectId.isValid(req.body.restaurant) || !await Restaurant.exists({ _id: req.body.restaurant, property: propertyId }))) {
      return res.status(400).json({ success: false, error: "Select a dining venue at the assigned property" });
    }
    const currentOffer = await RestaurantOffer.findOne({ _id: id, property: propertyId });
    if (!currentOffer) return res.status(404).json({ error: "Offer not found" });
    const pricingType = req.body.pricingType || currentOffer.pricingType || "PER_GUEST";
    if (!["PER_GUEST", "FIXED", "FREE"].includes(pricingType)) {
      return res.status(400).json({ success: false, error: "Choose a valid offer pricing type" });
    }
    const updates = { ...req.body, property: propertyId, pricingType };
    if (pricingType === "PER_GUEST") {
      updates.pricePerGuest = req.body.pricePerGuest ?? req.body.price ?? currentOffer.pricePerGuest ?? currentOffer.price;
      updates.price = updates.pricePerGuest;
      updates.fixedPrice = null;
    } else if (pricingType === "FIXED") {
      updates.fixedPrice = req.body.fixedPrice ?? req.body.price ?? currentOffer.fixedPrice ?? currentOffer.price;
      updates.price = updates.fixedPrice;
      updates.pricePerGuest = null;
    } else {
      updates.price = 0;
      updates.pricePerGuest = null;
      updates.fixedPrice = null;
    }
    const offer = await RestaurantOffer.findOneAndUpdate(
      { _id: id, property: propertyId },
      updates,
      { new: true, runValidators: true }
    );
    if (!offer) return res.status(404).json({ error: "Offer not found" });
    return res.status(200).json({ success: true, data: offer });
  } catch (err) {
    return res.status(400).json({ error: err.message || "Failed to update offer" });
  }
};

exports.deleteOffer = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const { id } = req.params;
    const offer = await RestaurantOffer.findOneAndDelete({ _id: id, property: propertyId });
    if (!offer) return res.status(404).json({ error: "Offer not found" });
    return res.status(200).json({ success: true, message: "Offer deleted successfully" });
  } catch (err) {
    return res.status(500).json({ error: "Failed to delete offer" });
  }
};

// ==========================================
// RESERVATIONS MANAGEMENT & FOLIO CHARGE
// ==========================================

exports.getAdminReservations = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const { restaurantId, date, status, search, category } = req.query;

    const query = { property: propertyId };
    if (restaurantId) query.restaurant = restaurantId;
    if (date) query.date = date;
    if (status && status !== "ALL") query.status = status;
    if (category === "experience") query.offer = { $exists: true, $ne: null };
    if (category === "table") query.$and = [{ $or: [{ offer: { $exists: false } }, { offer: null }] }];

    if (search) {
      query.$or = [
        { customerName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { confirmationNumber: { $regex: search, $options: "i" } },
        { roomNumber: { $regex: search, $options: "i" } }
      ];
    }

    const reservations = await RestaurantReservation.find(query)
      .populate("restaurant", "name slug")
      .populate("table", "tableNumber capacity location")
      .populate("buffetSession", "name mealPeriod")
      .populate("offer", "title")
      .populate("hotelReservation", "reservationNumber checkInDate checkOutDate")
      .lean();

    const now = new Date();
    const sortReservations = (left, right) => {
      const leftDate = /^\d{4}-\d{2}-\d{2}$/.test(left.date || "") ? new Date(`${left.date}T${/^\d{2}:\d{2}$/.test(left.time || "") ? left.time : "00:00"}:00`) : new Date(NaN);
      const rightDate = /^\d{4}-\d{2}-\d{2}$/.test(right.date || "") ? new Date(`${right.date}T${/^\d{2}:\d{2}$/.test(right.time || "") ? right.time : "00:00"}:00`) : new Date(NaN);
      const leftValid = !Number.isNaN(leftDate.getTime());
      const rightValid = !Number.isNaN(rightDate.getTime());
      if (!leftValid && !rightValid) return String(left.confirmationNumber || "").localeCompare(String(right.confirmationNumber || ""));
      if (!leftValid) return 1;
      if (!rightValid) return -1;
      const leftUpcoming = leftDate.getTime() >= now.getTime();
      const rightUpcoming = rightDate.getTime() >= now.getTime();
      if (leftUpcoming !== rightUpcoming) return leftUpcoming ? -1 : 1;
      return leftUpcoming ? leftDate - rightDate : rightDate - leftDate;
    };

    const paymentsByReservation = await getReservationPaymentsById(reservations);
    const enrichedReservations = reservations
      .map(reservation => ({
        ...reservation,
        endTime: getReservationEndTime(reservation.time),
        ...summarizeReservationPayment(reservation, paymentsByReservation.get(String(reservation._id)) || []),
          type: "dining",
          source: "restaurant_dining"
      }))
      .sort(sortReservations);

    return res.status(200).json({
      success: true,
      count: enrichedReservations.length,
      data: enrichedReservations
    });
  } catch (err) {
    console.error("getAdminReservations error:", err);
    return res.status(500).json({ error: "Failed to fetch reservations" });
  }
};

exports.updateReservationStatus = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const { id } = req.params;
    const { status, tableId, notes } = req.body;
    const allowedStatuses = Object.keys(RESERVATION_TRANSITIONS);
    if (status && !allowedStatuses.includes(status)) return res.status(400).json({ error: "Invalid reservation status" });

    const reservation = await RestaurantReservation.findOne({ _id: id, property: propertyId });
    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found" });
    }

    if (status && !validReservationTransition(reservation.status, status)) {
      return res.status(409).json({ error: `Reservation cannot transition from ${reservation.status} to ${status}` });
    }

    if (status === "SEATED") {
      const seated = await seatReservation({
        property: propertyId, restaurant: reservation.restaurant,
        reservationId: reservation._id, userId: req.user.id
      });
      return res.status(200).json({ success: true, message: "Guest seated successfully", data: seated });
    }
    if (status === "COMPLETED" && reservation.status === "SEATED") {
      const completed = await completeReservation({ property: propertyId, reservationId: reservation._id });
      return res.status(200).json({ success: true, message: "Reservation completed successfully", data: completed });
    }

    const updates = {};
    if (status) updates.status = status;
    if (tableId !== undefined) {
      if (tableId && mongoose.Types.ObjectId.isValid(tableId)) {
        const assignedTable = await RestaurantTable.findOne({
          _id: tableId, property: propertyId, restaurant: reservation.restaurant, active: true
        }).select("_id").lean();
        if (!assignedTable) return res.status(404).json({ error: "Table not found for this restaurant" });
        updates.table = tableId;
      } else if (!tableId) {
        updates.table = undefined;
      }
    }

    if (notes !== undefined) {
      updates.notes = notes;
    }

    const updatedReservation = await RestaurantReservation.findOneAndUpdate(
      { _id: reservation._id, property: propertyId, status: reservation.status },
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!updatedReservation) {
      return res.status(409).json({ error: "Reservation changed while this update was being applied" });
    }

    const updated = await RestaurantReservation.findById(updatedReservation._id)
      .populate("restaurant", "name")
      .populate("table", "tableNumber capacity location");

    return res.status(200).json({
      success: true,
      message: "Reservation status updated successfully",
      data: updated
    });
  } catch (err) {
    console.error("updateReservationStatus error:", err);
    return res.status(err.statusCode || 400).json({ error: err.message || "Failed to update reservation" });
  }
};

/**
 * @desc Charge restaurant dining bill to hotel guest folio
 * @route POST /api/restaurants/admin/reservations/:id/charge-folio
 * @access Staff/Admin
 */
exports.chargeReservationToFolio = async (req, res) => {
  try {
    const { propertyId } = req;
    const { id } = req.params;
    const { amount, description, notes } = req.body;
    const reject = (statusCode, message) => { throw Object.assign(new Error(message), { statusCode }); };
    const result = await mongoose.connection.transaction(async session => {
      const reservation = await RestaurantReservation.findOne({ _id: id, property: propertyId })
        .populate("restaurant", "name").session(session);
      if (!reservation) reject(404, "Restaurant reservation not found");
      if (reservation.reservationTotalPrice == null) reject(400, "This historical reservation has no recorded price. No folio charge will be created.");
      const billAmount = Number(amount);
      if (!Number.isFinite(billAmount) || billAmount <= 0) reject(400, "Valid charge amount greater than 0 is required");
      if (Math.round(billAmount * 100) !== Math.round(reservation.reservationTotalPrice * 100)) {
        reject(400, "Folio amount must match the saved dining reservation total");
      }
      if (reservation.billedToFolio) reject(400, "This dining bill has already been charged to guest folio");
      if (["CANCELLED", "NO_SHOW"].includes(reservation.status)) reject(409, "This reservation cannot be charged to the folio");
      if (reservation.guestType !== "Hotel Guest" || !reservation.hotelReservation) {
        reject(400, "This reservation is not linked to a hotel stay");
      }
      const payments = await Payment.find(reservationPaymentQuery(reservation._id)).session(session);
      const balance = summarizeReservationPayment(reservation, payments);
      if (balance.paidAmount > 0 || balance.paymentReconciliationRequired ||
          payments.some(payment => ["pending", "processing"].includes(payment.paymentStatus))) {
        reject(409, "An online dining payment must be reconciled before posting to the folio");
      }
      const hotelStay = await Reservation.findOne({
        _id: reservation.hotelReservation, property: propertyId, status: "Checked-In"
      }).session(session);
      if (!hotelStay || !hotelStay.guest) reject(409, "A linked checked-in hotel stay is required");

      // This write serializes this charge with order folio posting and checkout across app instances.
      const lockedStay = await Reservation.updateOne({
        _id: hotelStay._id, property: propertyId, status: "Checked-In"
      }, { $inc: { __v: 1 } }, { session });
      if (!lockedStay.matchedCount) reject(409, "The linked hotel stay is no longer checked in");
      if (await Invoice.exists({ reservation: hotelStay._id }).session(session)) {
        reject(409, "The stay already has an invoice. No folio charge will be added.");
      }

      const expense = new GuestExpense({
        property: propertyId, reservation: hotelStay._id, guest: hotelStay.guest, expenseDate: new Date(),
        category: "Restaurant", quantity: 1, unitPrice: billAmount, amount: billAmount, totalAmount: billAmount,
        description: description || `${reservation.restaurant?.name || "Hotel Restaurant"} Dining (Ref: ${reservation.confirmationNumber})`,
        paymentStatus: "Added to Bill", addedBy: req.user._id,
        notes: notes || `Direct charge from Restaurant Management. Table reservation: ${reservation.confirmationNumber}`
      });
      await expense.save({ session });
      const postedReservation = await RestaurantReservation.findOneAndUpdate({
        _id: reservation._id,
        property: propertyId,
        billedToFolio: { $ne: true },
        status: { $nin: ["CANCELLED", "NO_SHOW"] }
      }, { $set: { billedToFolio: true, folioExpenseId: expense._id } }, {
        new: true, runValidators: true, session
      }).populate("restaurant", "name");
      if (!postedReservation) reject(409, "This dining bill has already been charged or is no longer eligible");
      return { reservation: postedReservation, folioExpense: expense, billAmount };
    });
    return res.json({
      success: true,
      message: `Successfully charged ${result.billAmount.toLocaleString()} to Guest Folio`,
      data: { reservation: result.reservation, folioExpense: result.folioExpense }
    });
  } catch (err) {
    if (!err.statusCode) console.error("chargeReservationToFolio error:", err);
    return res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : "Failed to post charge to guest folio" });
  }
};
