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


// Helper to check time overlap (assuming 90 minute dining window)
function isTimeConflicting(time1, time2, windowMinutes = 90) {
  const [h1, m1] = time1.split(":").map(Number);
  const [h2, m2] = time2.split(":").map(Number);
  const min1 = h1 * 60 + m1;
  const min2 = h2 * 60 + m2;
  return Math.abs(min1 - min2) < windowMinutes;
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
    restaurants = restaurants.map((rest) => {
      if (!rest.slug && rest.name) {
        rest.slug = rest.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      }
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

    return res.status(200).json({
      success: true,
      data: {
        ...restaurant,
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

    const guests = parseInt(guestCount, 10);
    if (isNaN(guests) || guests < 1) {
      return res.status(400).json({ error: "Valid guestCount is required (minimum 1)" });
    }

    const query = mongoose.Types.ObjectId.isValid(id)
      ? { _id: id, property: propertyId }
      : { slug: id, property: propertyId };

    const restaurant = await Restaurant.findOne(query);
    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

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

    const isAvailable = (availableTables.length > 0 || (restaurant.capacity - totalBookedCovers >= guests));

    return res.status(200).json({
      success: true,
      available: isAvailable,
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

    const guests = parseInt(guestCount, 10);
    if (isNaN(guests) || guests < 1) {
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
      seatingPreference,
      diningType,
      buffetSession: buffetSessionId && mongoose.Types.ObjectId.isValid(buffetSessionId) ? buffetSessionId : undefined,
      offer: offerId && mongoose.Types.ObjectId.isValid(offerId) ? offerId : undefined,
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
    const allowedFields = ["name", "slug", "description", "cuisine", "location", "openingHours", "contactPhone", "contactEmail", "heroImage", "images", "capacity", "active"];
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

    const allowedFields = ["name", "slug", "description", "cuisine", "location", "openingHours", "contactPhone", "contactEmail", "heroImage", "images", "capacity", "active"];
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
    const offer = await RestaurantOffer.findOneAndUpdate(
      { _id: id, property: propertyId },
        { ...req.body, property: propertyId },
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
    const { restaurantId, date, status, search } = req.query;

    const query = { property: propertyId };
    if (restaurantId) query.restaurant = restaurantId;
    if (date) query.date = date;
    if (status && status !== "ALL") query.status = status;

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
      .sort({ date: -1, time: -1 });

    return res.status(200).json({
      success: true,
      count: reservations.length,
      data: reservations
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
          await RestaurantTable.findByIdAndUpdate(tableId, { status: "OCCUPIED" });
        } else if (status === "COMPLETED") {
          await RestaurantTable.findByIdAndUpdate(tableId, { status: "CLEANING" });
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

    const billAmount = parseFloat(amount);
    if (isNaN(billAmount) || billAmount <= 0) {
      return res.status(400).json({ error: "Valid charge amount greater than 0 is required" });
    }

    const reservation = await RestaurantReservation.findOne({ _id: id, property: propertyId })
      .populate("restaurant", "name");

    if (!reservation) {
      return res.status(404).json({ error: "Restaurant reservation not found" });
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
    reservation.totalAmount = billAmount;
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
