// backend/controllers/restaurantController.js
const mongoose = require("mongoose");
const Restaurant = require("../models/Restaurant");
const RestaurantTable = require("../models/RestaurantTable");
const RestaurantMenuCategory = require("../models/RestaurantMenuCategory");
const RestaurantMenuItem = require("../models/RestaurantMenuItem");
const RestaurantBuffet = require("../models/RestaurantBuffet");
const RestaurantOffer = require("../models/RestaurantOffer");
const RestaurantReservation = require("../models/RestaurantReservation");
const Reservation = require("../models/Reservation");
const GuestExpense = require("../models/GuestExpense");
const User = require("../models/User");
const Payment = require("../models/Payment");
const { isGuestCountWithinCapacity, resolveReservationPricing } = require("../utils/diningPricing");


// Helper to check time overlap (assuming 90 minute dining window)
function isTimeConflicting(time1, time2, windowMinutes = 90) {
  const [h1, m1] = time1.split(":").map(Number);
  const [h2, m2] = time2.split(":").map(Number);
  const min1 = h1 * 60 + m1;
  const min2 = h2 * 60 + m2;
  return Math.abs(min1 - min2) < windowMinutes;
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

    const restaurant = await Restaurant.findOne(query);
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

    const restaurant = await Restaurant.findOne(query);
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

    const restaurant = await Restaurant.findOne(query);
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

    const guests = Number(guestCount);
    if (!Number.isSafeInteger(guests) || guests < 1) {
      return res.status(400).json({ error: "Valid guestCount is required (minimum 1)" });
    }

    const query = mongoose.Types.ObjectId.isValid(id)
      ? { _id: id, property: propertyId }
      : { slug: id, property: propertyId };

    const restaurant = await Restaurant.findOne(query);
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
      status: { $ne: "OUT_OF_SERVICE" }
    };

    if (seatingPreference && seatingPreference !== "Any") {
      tableQuery.location = seatingPreference;
    }

    const candidateTables = await RestaurantTable.find(tableQuery).sort({ capacity: 1 }).lean();

    // Find existing non-cancelled reservations for this date
    const existingReservations = await RestaurantReservation.find({
      property: propertyId,
      restaurant: restaurant._id,
      date,
      status: { $in: ["PENDING", "CONFIRMED", "SEATED"] }
    }).lean();

    // Filter candidate tables that have no time conflict (+/- 90 mins)
    const availableTables = candidateTables.filter((table) => {
      const tableReservations = existingReservations.filter(
        (r) => r.table && r.table.toString() === table._id.toString()
      );
      const hasConflict = tableReservations.some((r) => isTimeConflicting(r.time, time, 90));
      return !hasConflict;
    });

    // Also calculate overall restaurant capacity covers booked
    const totalBookedCovers = existingReservations
      .filter((r) => isTimeConflicting(r.time, time, 90))
      .reduce((sum, r) => sum + (r.guestCount || 0), 0);

    const partySizeSupported = guests <= maxPartySize;
    const isAvailable = partySizeSupported && (availableTables.length > 0 || (restaurant.capacity - totalBookedCovers >= guests));

    return res.status(200).json({
      success: true,
      available: isAvailable,
      maxPartySize,
      partySizeSupported,
      availableTablesCount: availableTables.length,
      estimatedCoversRemaining: Math.max(0, restaurant.capacity - totalBookedCovers),
      suggestedTableId: availableTables.length > 0 ? availableTables[0]._id : null
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

    if (!reservationNumber && !email && !roomNumber) {
      return res.status(400).json({ error: "Reservation number, room number, or email required" });
    }

    const query = { property: propertyId, status: { $in: ["Confirmed", "Checked-In"] } };

    if (reservationNumber) {
      query.reservationNumber = reservationNumber.trim();
    }

    let hotelRes = await Reservation.findOne(query)
      .populate("guest", "name email phone")
      .populate("room", "roomNumber roomType")
      .lean();

    // If query by roomNumber or email
    if (!hotelRes && (roomNumber || email)) {
      const fallbackQuery = { property: propertyId, status: { $in: ["Confirmed", "Checked-In"] } };
      const matchingResList = await Reservation.find(fallbackQuery)
        .populate("guest", "name email phone")
        .populate("room", "roomNumber roomType")
        .lean();

      hotelRes = matchingResList.find((r) => {
        const matchesRoom = roomNumber && r.room && r.room.roomNumber.toString() === roomNumber.toString();
        const matchesEmail = email && r.guest && r.guest.email.toLowerCase() === email.toLowerCase();
        return matchesRoom || matchesEmail;
      });
    }

    if (!hotelRes) {
      return res.status(404).json({ error: "No active hotel reservation found with the provided details" });
    }

    return res.status(200).json({
      success: true,
      data: {
        reservationId: hotelRes._id,
        reservationNumber: hotelRes.reservationNumber,
        guestName: hotelRes.guest?.name || "Hotel Guest",
        email: hotelRes.guest?.email || "",
        phone: hotelRes.guest?.phone || "",
        roomNumber: hotelRes.room?.roomNumber || "Suite",
        roomType: hotelRes.roomType,
        checkInDate: hotelRes.checkInDate,
        checkOutDate: hotelRes.checkOutDate,
        status: hotelRes.status
      }
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

    const guests = Number(guestCount);
    if (!Number.isSafeInteger(guests) || guests < 1) {
      return res.status(400).json({ error: "Valid guest count (minimum 1) is required" });
    }

    // Validate restaurant
    const restQuery = mongoose.Types.ObjectId.isValid(id)
      ? { _id: id, property: propertyId }
      : { slug: id, property: propertyId };

    const restaurant = await Restaurant.findOne(restQuery);
    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found in this property" });
    }

    if (!restaurant.active) {
      return res.status(400).json({ error: "Restaurant is currently not accepting reservations" });
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

    // 2. Validate table capacity / double booking
    const tableQuery = {
      property: propertyId,
      restaurant: restaurant._id,
      active: true,
      capacity: { $gte: guests },
      status: { $ne: "OUT_OF_SERVICE" }
    };

    if (seatingPreference && seatingPreference !== "Any") {
      tableQuery.location = seatingPreference;
    }

    const candidateTables = await RestaurantTable.find(tableQuery).sort({ capacity: 1 });

    // Existing active reservations at the same date
    const existingReservations = await RestaurantReservation.find({
      property: propertyId,
      restaurant: restaurant._id,
      date,
      status: { $in: ["PENDING", "CONFIRMED", "SEATED"] }
    });

    // Check overall restaurant capacity
    const currentCovers = existingReservations
      .filter((r) => isTimeConflicting(r.time, time, 90))
      .reduce((sum, r) => sum + r.guestCount, 0);

    if (currentCovers + guests > restaurant.capacity * 1.2) {
      return res.status(400).json({
        error: "Restaurant is fully booked for the selected date and time window. Please choose another time."
      });
    }

    // Find first available unconflicted table
    let assignedTable = null;
    for (const table of candidateTables) {
      const tableBookings = existingReservations.filter(
        (r) => r.table && r.table.toString() === table._id.toString()
      );
      const conflict = tableBookings.some((r) => isTimeConflicting(r.time, time, 90));
      if (!conflict) {
        assignedTable = table;
        break;
      }
    }

    // If no exact preference matched, try any location
    if (!assignedTable && seatingPreference !== "Any") {
      const anyCandidateTables = await RestaurantTable.find({
        property: propertyId,
        restaurant: restaurant._id,
        active: true,
        capacity: { $gte: guests },
        status: { $ne: "OUT_OF_SERVICE" }
      }).sort({ capacity: 1 });

      for (const table of anyCandidateTables) {
        const tableBookings = existingReservations.filter(
          (r) => r.table && r.table.toString() === table._id.toString()
        );
        const conflict = tableBookings.some((r) => isTimeConflicting(r.time, time, 90));
        if (!conflict) {
          assignedTable = table;
          break;
        }
      }
    }

    // 3. Hotel guest linking
    let linkedHotelRes = null;
    let resolvedRoomNumber = roomNumber || "";
    if (guestType === "Hotel Guest" && hotelReservationId) {
      if (mongoose.Types.ObjectId.isValid(hotelReservationId)) {
        linkedHotelRes = await Reservation.findOne({
          _id: hotelReservationId,
          property: propertyId
        }).populate("room");
        if (linkedHotelRes && linkedHotelRes.room) {
          resolvedRoomNumber = linkedHotelRes.room.roomNumber || resolvedRoomNumber;
        }
      }
    }

    // 4. Create reservation record
    let resolvedUser = req.user ? req.user._id : undefined;
    if (!resolvedUser && email) {
      try {
        const foundUser = await User.findOne({ email: email.trim().toLowerCase() });
        if (foundUser) {
          resolvedUser = foundUser._id;
        }
      } catch (e) {
        // silent fallback
      }
    }

    const reservationData = {
      property: propertyId,
      restaurant: restaurant._id,
      table: assignedTable ? assignedTable._id : undefined,
      guestType,
      hotelReservation: linkedHotelRes ? linkedHotelRes._id : undefined,
      roomNumber: resolvedRoomNumber,
      user: resolvedUser,
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

    const reservation = await RestaurantReservation.create(reservationData);

    const populatedReservation = await RestaurantReservation.findById(reservation._id)
      .populate("restaurant", "name slug location openingHours contactPhone")
      .populate("table", "tableNumber capacity location")
      .populate("buffetSession", "name theme startTime endTime adultPrice")
      .populate("offer", "title shortDescription price discount");

    return res.status(201).json({
      success: true,
      message: "Table reservation confirmed successfully",
      data: populatedReservation
    });
  } catch (err) {
    console.error("createReservation error:", err);
    return res.status(500).json({ error: err.message || "Failed to create reservation" });
  }
};

/**
 * @desc Get reservation by confirmation reference
 * @route GET /api/restaurants/reservations/:ref
 * @access Public
 */
exports.getReservationByRef = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const { ref } = req.params;

    const reservation = await RestaurantReservation.findOne({
      property: propertyId,
      $or: [{ confirmationNumber: ref.toUpperCase() }, { _id: mongoose.Types.ObjectId.isValid(ref) ? ref : null }]
    })
      .populate("restaurant", "name slug cuisine location contactPhone contactEmail heroImage")
      .populate("table", "tableNumber capacity location")
      .populate("buffetSession")
      .populate("offer")
      .populate("hotelReservation", "reservationNumber checkInDate checkOutDate");

    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found in this property" });
    }

    return res.status(200).json({
      success: true,
      data: reservation
    });
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

    const email = req.user.email ? req.user.email.toLowerCase().trim() : "";
    const filter = {
      $or: [
        { user: req.user._id },
        ...(email ? [{ email }] : [])
      ]
    };

    const reservations = await RestaurantReservation.find(filter)
      .populate("restaurant", "name slug location contactPhone contactEmail heroImage cuisine openingHours")
      .populate("table", "tableNumber capacity location")
      .populate("buffetSession", "name theme startTime endTime adultPrice")
      .populate("offer", "title price discount")
      .populate("hotelReservation", "reservationNumber checkInDate checkOutDate")
      .sort({ date: -1, time: -1, createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: reservations
    });
  } catch (err) {
    console.error("getMyReservations error:", err);
    return res.status(500).json({ error: "Failed to fetch dining reservations" });
  }
};

/**
 * @desc Cancel reservation
 * @route PUT /api/restaurants/reservations/:ref/cancel
 * @access Public / Private
 */
exports.cancelReservation = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const { ref } = req.params;
    const { reason = "Cancelled by guest" } = req.body;

    const query = {
      $or: [
        { confirmationNumber: ref.toUpperCase() },
        { _id: mongoose.Types.ObjectId.isValid(ref) ? ref : null }
      ]
    };
    if (propertyId) {
      query.property = propertyId;
    }

    let reservation = await RestaurantReservation.findOne(query);

    // If not found with property scope, fallback to global lookup by confirmation number
    if (!reservation) {
      reservation = await RestaurantReservation.findOne({
        $or: [
          { confirmationNumber: ref.toUpperCase() },
          { _id: mongoose.Types.ObjectId.isValid(ref) ? ref : null }
        ]
      });
    }

    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found" });
    }

    if (reservation.status === "CANCELLED") {
      return res.status(400).json({ error: "Reservation is already cancelled" });
    }

    reservation.status = "CANCELLED";
    reservation.cancellationReason = reason;
    await reservation.save();

    return res.status(200).json({
      success: true,
      message: "Reservation successfully cancelled",
      data: reservation
    });
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
    const restaurants = await Restaurant.find({ property: propertyId }).sort({ sortOrder: 1, createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: restaurants
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
    const allowedFields = ["name", "slug", "description", "cuisine", "restaurantType", "location", "openingHours", "contactPhone", "contactEmail", "heroImage", "images", "capacity", "reservationPricePerGuest", "reservationPriceCurrency", "active"];
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

    const allowedFields = ["name", "slug", "description", "cuisine", "restaurantType", "location", "openingHours", "contactPhone", "contactEmail", "heroImage", "images", "capacity", "reservationPricePerGuest", "reservationPriceCurrency", "active"];
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

exports.createMenuCategory = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const category = await RestaurantMenuCategory.create({ ...req.body, property: propertyId });
    return res.status(201).json({ success: true, data: category });
  } catch (err) {
    return res.status(400).json({ error: err.message || "Failed to create menu category" });
  }
};

exports.updateMenuCategory = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const { id } = req.params;
    const category = await RestaurantMenuCategory.findOneAndUpdate(
      { _id: id, property: propertyId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!category) return res.status(404).json({ error: "Category not found" });
    return res.status(200).json({ success: true, data: category });
  } catch (err) {
    return res.status(400).json({ error: err.message || "Failed to update category" });
  }
};

exports.deleteMenuCategory = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const { id } = req.params;
    await RestaurantMenuItem.deleteMany({ category: id, property: propertyId });
    const cat = await RestaurantMenuCategory.findOneAndDelete({ _id: id, property: propertyId });
    if (!cat) return res.status(404).json({ error: "Category not found" });
    return res.status(200).json({ success: true, message: "Category and associated items deleted" });
  } catch (err) {
    return res.status(500).json({ error: "Failed to delete category" });
  }
};

exports.getAdminMenuItems = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const { restaurantId, categoryId } = req.query;
    const query = { property: propertyId };
    if (restaurantId) query.restaurant = restaurantId;
    if (categoryId) query.category = categoryId;

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
    const item = await RestaurantMenuItem.create({ ...req.body, property: propertyId });
    return res.status(201).json({ success: true, data: item });
  } catch (err) {
    return res.status(400).json({ error: err.message || "Failed to create menu item" });
  }
};

exports.updateMenuItem = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const { id } = req.params;
    const item = await RestaurantMenuItem.findOneAndUpdate(
      { _id: id, property: propertyId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!item) return res.status(404).json({ error: "Menu item not found" });
    return res.status(200).json({ success: true, data: item });
  } catch (err) {
    return res.status(400).json({ error: err.message || "Failed to update menu item" });
  }
};

exports.deleteMenuItem = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const { id } = req.params;
    const item = await RestaurantMenuItem.findOneAndDelete({ _id: id, property: propertyId });
    if (!item) return res.status(404).json({ error: "Menu item not found" });
    return res.status(200).json({ success: true, message: "Menu item deleted successfully" });
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

    const reservationIds = reservations.map((reservation) => reservation._id);
    const payments = reservationIds.length ? await Payment.find({
      property: propertyId,
      restaurantReservation: { $in: reservationIds }
    }).sort({ createdAt: -1 }).lean() : [];

    const paymentsByReservation = new Map();
    payments.forEach((payment) => {
      const key = String(payment.restaurantReservation);
      if (!paymentsByReservation.has(key)) paymentsByReservation.set(key, []);
      paymentsByReservation.get(key).push(payment);
    });

    const enrichedReservations = reservations
      .map((reservation) => {
        const relatedPayments = paymentsByReservation.get(String(reservation._id)) || [];
        const confirmedPayments = relatedPayments.filter((payment) => payment.paymentStatus === "completed");
        const amountPaid = confirmedPayments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
        const savedTotal = reservation.reservationTotalPrice != null
          ? Number(reservation.reservationTotalPrice)
          : (reservation.totalAmount != null && reservation.totalAmount > 0 ? Number(reservation.totalAmount) : null);
        const currency = reservation.reservationPriceCurrency || reservation.currency || "LKR";
        const outstandingBalance = savedTotal != null ? Math.max(0, savedTotal - amountPaid) : null;
        let paymentStatus = "Unpaid";
        if (savedTotal == null) paymentStatus = "Historical - price unavailable";
        else if (amountPaid >= savedTotal && savedTotal > 0) paymentStatus = "Paid";
        else if (confirmedPayments.length > 0 && amountPaid > 0) paymentStatus = "Partially Paid";
        else if (relatedPayments.some((payment) => payment.paymentStatus === "pending" || payment.paymentStatus === "processing")) paymentStatus = "Pending";
        else if (relatedPayments.some((payment) => payment.paymentStatus === "failed")) paymentStatus = "Failed";
        return {
          ...reservation,
          endTime: getReservationEndTime(reservation.time),
          savedReservationTotal: savedTotal,
          savedReservationCurrency: currency,
          amountPaid,
          outstandingBalance,
          paymentStatus,
          type: "dining",
          source: "restaurant_dining"
        };
      })
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
    const allowedStatuses = ["PENDING", "CONFIRMED", "SEATED", "COMPLETED", "CANCELLED", "NO_SHOW"];
    if (status && !allowedStatuses.includes(status)) return res.status(400).json({ error: "Invalid reservation status" });

    const reservation = await RestaurantReservation.findOne({ _id: id, property: propertyId });
    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found" });
    }

    if (status) {
      reservation.status = status;
    }

    if (tableId !== undefined) {
      if (tableId && mongoose.Types.ObjectId.isValid(tableId)) {
        reservation.table = tableId;
        // Optionally update table status if guest is seated
        if (status === "SEATED") {
          await RestaurantTable.findOneAndUpdate({ _id: tableId, property: propertyId }, { status: "OCCUPIED" });
        } else if (status === "COMPLETED") {
          await RestaurantTable.findOneAndUpdate({ _id: tableId, property: propertyId }, { status: "CLEANING" });
        }
      } else if (!tableId) {
        reservation.table = undefined;
      }
    }

    if (notes !== undefined) {
      reservation.notes = notes;
    }

    await reservation.save();

    const updated = await RestaurantReservation.findById(reservation._id)
      .populate("restaurant", "name")
      .populate("table", "tableNumber capacity location");

    return res.status(200).json({
      success: true,
      message: "Reservation status updated successfully",
      data: updated
    });
  } catch (err) {
    console.error("updateReservationStatus error:", err);
    return res.status(400).json({ error: err.message || "Failed to update reservation" });
  }
};

/**
 * @desc Charge restaurant dining bill to hotel guest folio
 * @route POST /api/restaurants/admin/reservations/:id/charge-folio
 * @access Staff/Admin
 */
exports.chargeReservationToFolio = async (req, res) => {
  try {
    const propertyId = req.propertyId;
    const { id } = req.params;
    const { amount, description, notes } = req.body;

    const reservation = await RestaurantReservation.findOne({ _id: id, property: propertyId })
      .populate("restaurant", "name");

    if (!reservation) {
      return res.status(404).json({ error: "Restaurant reservation not found" });
    }

    const savedTotal = reservation.reservationTotalPrice != null
      ? Number(reservation.reservationTotalPrice)
      : null;
    if (savedTotal == null) {
      return res.status(400).json({ error: "This historical reservation has no recorded price. No folio charge will be created." });
    }

    const billAmount = parseFloat(amount);
    if (!Number.isFinite(billAmount) || billAmount <= 0) {
      return res.status(400).json({ error: "Valid charge amount greater than 0 is required" });
    }
    if (Math.abs(billAmount - savedTotal) > 0.01) {
      return res.status(400).json({ error: "Folio amount must match the saved dining reservation total" });
    }

    if (reservation.billedToFolio) {
      return res.status(400).json({ error: "This dining bill has already been charged to guest folio" });
    }

    if (reservation.guestType !== "Hotel Guest" || !reservation.hotelReservation) {
      return res.status(400).json({
        error: "This reservation is not linked to an active hotel stay. Folio charging is only available for staying hotel guests."
      });
    }

    // Lookup hotel reservation
    const hotelStay = await Reservation.findOne({
      _id: reservation.hotelReservation,
      property: propertyId
    });

    if (!hotelStay) {
      return res.status(404).json({ error: "Linked hotel reservation could not be found in active property" });
    }

    // Create GuestExpense in folio
    const restaurantName = reservation.restaurant?.name || "Hotel Restaurant";
    const chargeDescription = description || `${restaurantName} Dining (Ref: ${reservation.confirmationNumber})`;

    const guestExpense = await GuestExpense.create({
      property: propertyId,
      reservation: hotelStay._id,
      guest: hotelStay.guest,
      expenseDate: new Date(),
      category: "Restaurant",
      description: chargeDescription,
      quantity: 1,
      unitPrice: billAmount,
      amount: billAmount,
      taxPercentage: 0,
      taxAmount: 0,
      totalAmount: billAmount,
      paymentStatus: "Added to Bill",
      addedBy: req.user._id,
      notes: notes || `Direct charge from Restaurant Management. Table reservation: ${reservation.confirmationNumber}`
    });

    // Update RestaurantReservation record
    reservation.billedToFolio = true;
    reservation.folioExpenseId = guestExpense._id;
    // Folio charges must use the existing reservation snapshot or an explicit
    // authorized charge amount, never replace a missing historical snapshot.
    if (reservation.reservationTotalPrice == null && reservation.totalAmount == null) {
      reservation.totalAmount = billAmount;
    }
    await reservation.save();

    return res.status(200).json({
      success: true,
      message: `Successfully charged ${billAmount.toLocaleString()} to Guest Folio (Room ${reservation.roomNumber || hotelStay.roomType})`,
      data: {
        reservation,
        folioExpense: guestExpense
      }
    });
  } catch (err) {
    console.error("chargeReservationToFolio error:", err);
    return res.status(500).json({ error: err.message || "Failed to post charge to guest folio" });
  }
};
