// backend/controllers/eventController.js
const mongoose = require("mongoose");
const EventVenue = require("../models/EventVenue");
const Event = require("../models/Event");
const EventBooking = require("../models/EventBooking");
const Payment = require("../models/Payment");
const {
  withVenueLock,
  withVenueScheduleTransaction,
  checkVenueConflict,
  isDateInFutureOrToday,
  sendEventNotification
} = require("../services/eventService");
const { buildPropertyFilter } = require("../middleware/propertyContext");

const isValidISODate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const isValidTimeRange = (startTime, endTime) =>
  /^([01]\d|2[0-3]):[0-5]\d$/.test(startTime || "") &&
  /^([01]\d|2[0-3]):[0-5]\d$/.test(endTime || "") && endTime > startTime;

// =============================================================================
// PUBLIC / GUEST ENDPOINTS
// =============================================================================

/**
 * GET /api/events
 * Discover published hotel events
 */
exports.getEvents = async (req, res) => {
  try {
    const filter = buildPropertyFilter(req, { status: "PUBLISHED" });

    if (req.query.eventType) {
      filter.eventType = req.query.eventType;
    }
    if (req.query.featured === "true") {
      filter.featured = true;
    }
    if (req.query.search) {
      filter.$or = [
        { title: { $regex: req.query.search, $options: "i" } },
        { shortDescription: { $regex: req.query.search, $options: "i" } },
        { description: { $regex: req.query.search, $options: "i" } }
      ];
    }

    const events = await Event.find(filter)
      .populate("venue", "name slug location type capacity min max")
      .sort({ startDate: 1 });

    res.json(events);
  } catch (err) {
    console.error("getEvents error:", err);
    res.status(500).json({ error: "Failed to fetch events" });
  }
};

/**
 * GET /api/events/featured
 * Get featured published events
 */
exports.getFeaturedEvents = async (req, res) => {
  try {
    const filter = buildPropertyFilter(req, { status: "PUBLISHED", featured: true });
    const events = await Event.find(filter)
      .populate("venue", "name slug location")
      .sort({ startDate: 1 })
      .limit(6);

    res.json(events);
  } catch (err) {
    console.error("getFeaturedEvents error:", err);
    res.status(500).json({ error: "Failed to fetch featured events" });
  }
};

/**
 * GET /api/events/types
 * List configurable event types / categories
 */
exports.getEventTypes = async (req, res) => {
  try {
    const defaultCategories = [
      {
        slug: "weddings",
        title: "Weddings & Occasions",
        short: "A setting as meaningful as the moment.",
        description: "Elegant settings and thoughtful details for wedding ceremonies, receptions, engagements, anniversaries and milestone occasions.",
        image: "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1400&q=85"
      },
      {
        slug: "corporate",
        title: "Corporate Events",
        short: "Ideas deserve an inspiring room.",
        description: "Focused, flexible spaces for conferences, meetings, seminars, workshops and presentations.",
        image: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1400&q=85"
      },
      {
        slug: "office-parties",
        title: "Office Parties",
        short: "Bring your people together.",
        description: "Versatile spaces for company celebrations, annual parties, team gatherings and staff events.",
        image: "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1400&q=85"
      },
      {
        slug: "private-celebrations",
        title: "Private Celebrations",
        short: "Make room for a little more joy.",
        description: "Intimate and welcoming spaces for birthdays, family gatherings, graduations and anniversaries.",
        image: "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=1400&q=85"
      }
    ];

    res.json(defaultCategories);
  } catch (err) {
    console.error("getEventTypes error:", err);
    res.status(500).json({ error: "Failed to fetch event types" });
  }
};

/**
 * GET /api/events/venues
 * Discover active venues and event halls
 */
exports.getVenues = async (req, res) => {
  try {
    const filter = buildPropertyFilter(req, { isActive: true });

    if (req.query.category) {
      filter.categories = req.query.category;
    }
    if (req.query.type && req.query.type !== "All venues") {
      filter.type = req.query.type;
    }
    if (req.query.capacity) {
      const cap = Number(req.query.capacity);
      if (!isNaN(cap) && cap > 0) {
        filter.max = { $gte: cap };
      }
    }
    if (req.query.location) {
      filter.location = { $regex: req.query.location, $options: "i" };
    }

    const venues = await EventVenue.find(filter).sort({ name: 1 });
    res.json(venues);
  } catch (err) {
    console.error("getVenues error:", err);
    res.status(500).json({ error: "Failed to fetch venues" });
  }
};

/**
 * GET /api/events/venues/:idOrSlug
 * Single venue by ID or slug
 */
exports.getVenueByIdOrSlug = async (req, res) => {
  try {
    const { idOrSlug } = req.params;
    const isObjectId = mongoose.Types.ObjectId.isValid(idOrSlug);

    const query = isObjectId
      ? buildPropertyFilter(req, { _id: idOrSlug, isActive: true })
      : buildPropertyFilter(req, { slug: idOrSlug, isActive: true });

    const venue = await EventVenue.findOne(query);
    if (!venue) {
      return res.status(404).json({ error: "Event venue not found" });
    }

    res.json(venue);
  } catch (err) {
    console.error("getVenueByIdOrSlug error:", err);
    res.status(500).json({ error: "Failed to fetch venue details" });
  }
};

/**
 * GET /api/events/availability
 * Check if a venue is available for a date & time range
 */
exports.checkAvailability = async (req, res) => {
  try {
    const { venueId, venue: venueSlug, date, startTime, endTime } = req.query;

    if (!date || !startTime || !endTime) {
      return res.status(400).json({ error: "Date, startTime, and endTime are required" });
    }

    if (!isValidISODate(date) || !isValidTimeRange(startTime, endTime)) {
      return res.status(400).json({ error: "A valid date and time range are required" });
    }

    if (!isDateInFutureOrToday(date)) {
      return res.status(400).json({ error: "Requested date must be today or in the future" });
    }

    let resolvedVenueId = venueId;
    if (!resolvedVenueId && venueSlug) {
      const venueObj = await EventVenue.findOne(buildPropertyFilter(req, { slug: venueSlug, isActive: true }));
      if (venueObj) resolvedVenueId = venueObj._id;
    }

    if (!resolvedVenueId) {
      return res.status(400).json({ error: "Venue specification required" });
    }

    if (!mongoose.Types.ObjectId.isValid(resolvedVenueId)) {
      return res.status(400).json({ error: "Valid venue specification required" });
    }
    const activeVenue = await EventVenue.findOne(buildPropertyFilter(req, { _id: resolvedVenueId, isActive: true }));
    if (!activeVenue) {
      return res.status(404).json({ error: "Venue not found or inactive for this property" });
    }

    const conflictResult = await checkVenueConflict({
      propertyId: req.propertyId,
      venueId: resolvedVenueId,
      date,
      startTime,
      endTime
    });

    res.json({
      available: !conflictResult.hasConflict,
      conflict: conflictResult.hasConflict,
      date,
      startTime,
      endTime,
      message: conflictResult.hasConflict
        ? "Venue has an existing confirmed booking during this time slot."
        : "Venue is available for the requested time slot."
    });
  } catch (err) {
    console.error("checkAvailability error:", err);
    res.status(500).json({ error: "Failed to check venue availability" });
  }
};

/**
 * POST /api/events/bookings (also handles /enquiries)
 * Customer creates an event booking request / enquiry
 */
exports.createBooking = async (req, res) => {
  try {
    const {
      name,
      customerName,
      email,
      phone,
      category,
      eventType,
      hotel,
      hall,
      venue,
      date,
      start,
      startTime,
      end,
      endTime,
      guests,
      guestCount,
      seating,
      seatingArrangement,
      package: selectedPackageName,
      selectedPackage,
      catering,
      cateringRequirements,
      decorations,
      decorationRequirements,
      equipment,
      equipmentRequirements,
      notes,
      specialRequests,
      selectedServices,
      additionalServices
    } = req.body;

    const effectiveName = (customerName || name || "").trim();
    const effectiveEmail = (email || "").trim().toLowerCase();
    const effectivePhone = (phone || "").trim();
    const effectiveCategory = (eventType || category || "").trim();
    const effectiveDate = (date || "").trim();
    const effectiveStart = (startTime || start || "").trim();
    const effectiveEnd = (endTime || end || "").trim();
    const effectiveGuests = Number(guestCount || guests);
    const effectiveVenueRef = hall || venue;

    // Field validations
    if (!effectiveName) {
      return res.status(400).json({ error: "Customer name is required" });
    }
    if (!effectiveEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(effectiveEmail)) {
      return res.status(400).json({ error: "Valid email address is required" });
    }
    if (!effectivePhone || !/^[+0-9()\s-]{7,25}$/.test(effectivePhone)) {
      return res.status(400).json({ error: "Valid contact phone number is required" });
    }
    if (!effectiveCategory) {
      return res.status(400).json({ error: "Event category is required" });
    }
    if (!effectiveDate || !isValidISODate(effectiveDate)) {
      return res.status(400).json({ error: "A valid event date is required" });
    }
    if (!isDateInFutureOrToday(effectiveDate)) {
      return res.status(400).json({ error: "Event date must be today or a future date" });
    }
    if (!isValidTimeRange(effectiveStart, effectiveEnd)) {
      return res.status(400).json({ error: "Valid start and end times are required; end time must be later" });
    }
    if (isNaN(effectiveGuests) || effectiveGuests < 1) {
      return res.status(400).json({ error: "Estimated guest count must be at least 1" });
    }
    if (!effectiveVenueRef) {
      return res.status(400).json({ error: "An event venue is required" });
    }

    // Resolve venue if provided
    let resolvedVenue = null;
    const isObjectId = mongoose.Types.ObjectId.isValid(effectiveVenueRef);
    const venueQuery = isObjectId
      ? buildPropertyFilter(req, { _id: effectiveVenueRef })
      : buildPropertyFilter(req, { slug: effectiveVenueRef });

    resolvedVenue = await EventVenue.findOne(venueQuery);
    if (!resolvedVenue) {
      return res.status(404).json({ error: "Selected event venue was not found in this property" });
    }
    if (!resolvedVenue.isActive) {
      return res.status(400).json({
        error: `Selected venue (${resolvedVenue.name}) is currently inactive and cannot accept bookings.`
      });
    }
    if (effectiveGuests < resolvedVenue.min) {
      return res.status(400).json({
        error: `Guest count (${effectiveGuests}) is below venue minimum capacity (${resolvedVenue.min})`
      });
    }
    if (effectiveGuests > resolvedVenue.max) {
      return res.status(400).json({
        error: `Guest count (${effectiveGuests}) exceeds venue maximum capacity (${resolvedVenue.max})`
      });
    }

    // Server-side price snapshot: fixed package replaces the venue base price;
    // otherwise the venue base price is used. Additional active services are additive.
    const finalPackageName = selectedPackageName || selectedPackage || "";
    let selectedPackageRecord = null;
    if (finalPackageName) {
      selectedPackageRecord = (resolvedVenue.packages || []).find(
        (pkg) => pkg.name === finalPackageName && pkg.isActive !== false
      );
      if (!selectedPackageRecord) {
        return res.status(400).json({ error: "Selected package does not belong to this venue or is unavailable" });
      }
    }
    const requestedServiceNames = Array.isArray(selectedServices)
      ? selectedServices
      : (Array.isArray(additionalServices) ? additionalServices : []);
    const activeAdditionalServices = resolvedVenue.additionalServices || [];
    const selectedServiceRecords = [];
    for (const name of requestedServiceNames) {
      const service = activeAdditionalServices.find((item) => item.name === name && item.isActive !== false);
      if (!service) {
        return res.status(400).json({ error: `Selected additional service "${name}" is unavailable for this venue` });
      }
      if (!selectedServiceRecords.some((existing) => existing.name === service.name)) {
        selectedServiceRecords.push(service);
      }
    }

    const venueBasePrice = Number(resolvedVenue.basePrice) || 0;
    const packagePrice = selectedPackageRecord ? (Number(selectedPackageRecord.price) || 0) : 0;
    const basePriceSnapshot = selectedPackageRecord ? 0 : venueBasePrice;
    const packagePriceSnapshot = selectedPackageRecord ? packagePrice : 0;
    const additionalServiceTotal = selectedServiceRecords.reduce(
      (sum, service) => sum + (Number(service.price) || 0),
      0
    );
    const estimatedPrice = basePriceSnapshot + packagePriceSnapshot + additionalServiceTotal;
    const currency = selectedPackageRecord?.currency
      || selectedServiceRecords.find((service) => service.currency)?.currency
      || resolvedVenue.currency
      || "LKR";

    const bookingData = {
      property: req.propertyId,
      customerName: effectiveName,
      email: effectiveEmail,
      phone: effectivePhone,
      eventType: effectiveCategory,
      venue: resolvedVenue ? resolvedVenue._id : undefined,
      venueName: resolvedVenue ? resolvedVenue.name : (hotel || ""),
      date: effectiveDate,
      startTime: effectiveStart,
      endTime: effectiveEnd,
      guestCount: effectiveGuests,
      seatingArrangement: seatingArrangement || seating || "",
      selectedPackage: finalPackageName,
      cateringRequirements: cateringRequirements || catering || "",
      decorationRequirements: decorationRequirements || decorations || "",
      equipmentRequirements: equipmentRequirements || equipment || "",
      specialRequests: specialRequests || notes || "",
      status: "PENDING",
      estimatedPrice,
      basePriceSnapshot,
      packagePriceSnapshot,
      additionalServiceNames: selectedServiceRecords.map((service) => service.name),
      additionalServiceTotal,
      currency,
      paymentStatus: "UNPAID",
      paidAmount: 0,
      user: req.user ? req.user._id : undefined,
      auditLog: [
        {
          action: "ENQUIRY_CREATED",
          performedBy: req.user ? req.user._id : undefined,
          timestamp: new Date(),
          notes: "Customer enquiry submitted via online portal"
        }
      ]
    };
    let newBooking;
    await withVenueLock(resolvedVenue._id, async () => {
      const conflict = await checkVenueConflict({
        propertyId: req.propertyId,
        venueId: resolvedVenue._id,
        date: effectiveDate,
        startTime: effectiveStart,
        endTime: effectiveEnd
      });
      if (conflict.hasConflict) {
        const err = new Error("Venue is unavailable for the selected date and time");
        err.statusCode = 409;
        err.conflict = conflict.conflictingBooking;
        throw err;
      }
      newBooking = await EventBooking.create(bookingData);
    }).catch((err) => {
      err.createBookingConflict = true;
      throw err;
    });

    // Send confirmation notification safely
    await sendEventNotification({
      type: "ENQUIRY_RECEIVED",
      booking: newBooking,
      recipientEmail: effectiveEmail
    });

    res.status(201).json({
      message: "Event request submitted successfully",
      booking: newBooking
    });
  } catch (err) {
    console.error("createBooking error:", err);
    if (err.statusCode === 409) {
      return res.status(409).json({
        error: err.message,
        conflictingBooking: err.conflict
      });
    }
    res.status(500).json({ error: "Failed to submit event request" });
  }
};

/**
 * GET /api/events/bookings/:ref
 * Customer lookup of event booking by confirmation reference
 */
exports.getBookingByRef = async (req, res) => {
  try {
    const { ref } = req.params;
    const booking = await EventBooking.findOne(
      buildPropertyFilter(req, { confirmationNumber: ref })
    ).populate("venue", "name slug location type image");

    if (!booking) {
      return res.status(404).json({ error: "Event booking not found" });
    }

    // Sanitize internal staff notes from public customer view
    const safeBooking = booking.toObject();
    delete safeBooking.internalNotes;

    res.json(safeBooking);
  } catch (err) {
    console.error("getBookingByRef error:", err);
    res.status(500).json({ error: "Failed to retrieve booking" });
  }
};

/**
 * GET /api/events/my-bookings
 * Authenticated customer views their own event requests and bookings
 */
exports.getMyBookings = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const filter = buildPropertyFilter(req, {
      $or: [
        { user: req.user._id },
        { email: req.user.email ? req.user.email.toLowerCase() : "" }
      ]
    });

    const bookings = await EventBooking.find(filter)
      .populate("venue", "name slug location type image")
      .sort({ createdAt: -1 });
    const bookingIds = bookings.map((booking) => booking._id);
    const payments = await Payment.find({
      property: req.propertyId,
      eventBooking: { $in: bookingIds },
      paymentStatus: { $in: ["pending", "processing", "completed", "failed", "cancelled"] }
    }).sort({ createdAt: -1 }).lean();
    const byBooking = new Map();
    payments.forEach((payment) => {
      const key = String(payment.eventBooking);
      if (!byBooking.has(key)) byBooking.set(key, []);
      byBooking.get(key).push(payment);
    });
    const enriched = bookings.map((booking) => {
      const related = byBooking.get(String(booking._id)) || [];
      const completed = related.filter((payment) => payment.paymentStatus === "completed");
      const paidAmount = completed.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
      const outstandingBalance = Math.max(0, (Number(booking.estimatedPrice) || 0) - paidAmount);
      let paymentStatus = "UNPAID";
      if (completed.length && paidAmount >= (Number(booking.estimatedPrice) || 0) && booking.estimatedPrice > 0) paymentStatus = "PAID";
      else if (completed.length) paymentStatus = "PARTIALLY_PAID";
      else if (related.some((payment) => payment.paymentStatus === "pending" || payment.paymentStatus === "processing")) paymentStatus = "PENDING";
      else if (related.some((payment) => payment.paymentStatus === "failed")) paymentStatus = "FAILED";
      return {
        ...booking.toObject(),
        paymentStatus,
        paidAmount,
        outstandingBalance
      };
    });
    res.json(enriched);
  } catch (err) {
    console.error("getMyBookings error:", err);
    res.status(500).json({ error: "Failed to fetch your bookings" });
  }
};

/**
 * PUT /api/events/my-bookings/:id/cancel
 * Customer cancels their own pending event booking
 */
exports.cancelMyBooking = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { id } = req.params;
    const booking = await EventBooking.findOne(
      buildPropertyFilter(req, {
        _id: id,
        $or: [{ user: req.user._id }, { email: req.user.email.toLowerCase() }]
      })
    );

    if (!booking) {
      return res.status(404).json({ error: "Booking not found or unauthorized" });
    }

    if (booking.status === "CANCELLED") {
      return res.status(400).json({ error: "Booking is already cancelled" });
    }
    if (booking.status === "COMPLETED") {
      return res.status(400).json({ error: "Completed bookings cannot be cancelled" });
    }

    booking.status = "CANCELLED";
    booking.cancellationReason = req.body.reason || "Cancelled by customer";
    booking.auditLog.push({
      action: "CANCELLED_BY_CUSTOMER",
      performedBy: req.user._id,
      timestamp: new Date(),
      notes: booking.cancellationReason
    });

    await booking.save();
    res.json({ message: "Booking cancelled successfully", booking });
  } catch (err) {
    console.error("cancelMyBooking error:", err);
    res.status(500).json({ error: "Failed to cancel booking" });
  }
};

/**
 * GET /api/events/:slug
 * Public event details by slug
 */
exports.getEventBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const filter = buildPropertyFilter(req, { slug, status: "PUBLISHED" });

    const event = await Event.findOne(filter)
      .populate("venue", "name slug location type area min max facilities seating packages image gallery");

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }
    if (req.body.venue !== undefined && req.body.venue) {
      if (!mongoose.Types.ObjectId.isValid(req.body.venue) || !await EventVenue.exists(buildPropertyFilter(req, { _id: req.body.venue }))) {
        return res.status(400).json({ error: "Selected venue does not belong to this property" });
      }
    }

    res.json(event);
  } catch (err) {
    console.error("getEventBySlug error:", err);
    res.status(500).json({ error: "Failed to fetch event" });
  }
};

// =============================================================================
// ADMIN / STAFF MANAGEMENT ENDPOINTS (PROTECTED)
// =============================================================================

/**
 * GET /api/events/admin/dashboard-stats
 * Aggregated metrics for Staff Event Operations Control Center
 */
exports.getAdminDashboardStats = async (req, res) => {
  try {
    const propFilter = buildPropertyFilter(req, {});
    const todayStr = new Date().toISOString().slice(0, 10);

    const [
      totalEvents,
      publishedEvents,
      draftEvents,
      upcomingEvents,
      totalVenues,
      pendingBookings,
      confirmedBookings,
      recentBookings
    ] = await Promise.all([
      Event.countDocuments(propFilter),
      Event.countDocuments({ ...propFilter, status: "PUBLISHED" }),
      Event.countDocuments({ ...propFilter, status: "DRAFT" }),
      Event.countDocuments({ ...propFilter, status: "PUBLISHED", startDate: { $gte: todayStr } }),
      EventVenue.countDocuments({ ...propFilter, isActive: true }),
      EventBooking.countDocuments({ ...propFilter, status: "PENDING" }),
      EventBooking.countDocuments({ ...propFilter, status: "CONFIRMED" }),
      EventBooking.find(propFilter).sort({ createdAt: -1 }).limit(5)
    ]);

    res.json({
      totalEvents,
      publishedEvents,
      draftEvents,
      upcomingEvents,
      totalVenues,
      pendingBookings,
      confirmedBookings,
      recentBookings
    });
  } catch (err) {
    console.error("getAdminDashboardStats error:", err);
    res.status(500).json({ error: "Failed to fetch dashboard stats" });
  }
};

/**
 * GET /api/events/admin/events
 * Staff event catalog listing (including drafts, archived)
 */
exports.getAdminEvents = async (req, res) => {
  try {
    const filter = buildPropertyFilter(req, {});

    if (req.query.status && req.query.status !== "ALL") {
      filter.status = req.query.status;
    }
    if (req.query.eventType) {
      filter.eventType = req.query.eventType;
    }
    if (req.query.search) {
      filter.$or = [
        { title: { $regex: req.query.search, $options: "i" } },
        { shortDescription: { $regex: req.query.search, $options: "i" } }
      ];
    }

    const events = await Event.find(filter)
      .populate("venue", "name slug location")
      .populate("createdBy", "name email")
      .sort({ startDate: -1 });

    res.json(events);
  } catch (err) {
    console.error("getAdminEvents error:", err);
    res.status(500).json({ error: "Failed to fetch admin events" });
  }
};

/**
 * POST /api/events/admin/events
 * Staff creates a new event
 */
exports.createEvent = async (req, res) => {
  try {
    const {
      title,
      eventType,
      shortDescription,
      description,
      venue,
      coverImage,
      gallery,
      startDate,
      endDate,
      startTime,
      endTime,
      minCapacity,
      maxCapacity,
      expectedGuestCount,
      pricingModel,
      basePrice,
      currency,
      status,
      featured,
      termsAndConditions,
      contactEmail,
      contactPhone
    } = req.body;

    if (!title || !startDate) {
      return res.status(400).json({ error: "Title and startDate are required" });
    }

    // Auto-generate slug
    let slug = (req.body.slug || title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    // Ensure unique slug within property
    const existing = await Event.findOne(buildPropertyFilter(req, { slug }));
    if (existing) {
      slug = `${slug}-${Math.floor(100 + Math.random() * 900)}`;
    }
    if (venue) {
      if (!mongoose.Types.ObjectId.isValid(venue) || !await EventVenue.exists(buildPropertyFilter(req, { _id: venue }))) {
        return res.status(400).json({ error: "Selected venue does not belong to this property" });
      }
    }

    const event = await Event.create({
      property: req.propertyId,
      title,
      slug,
      eventType: eventType || "weddings",
      shortDescription: shortDescription || "",
      description: description || "",
      venue: venue || undefined,
      coverImage: coverImage || "",
      gallery: gallery || [],
      startDate,
      endDate: endDate || startDate,
      startTime: startTime || "09:00",
      endTime: endTime || "17:00",
      minCapacity: Number(minCapacity) || 10,
      maxCapacity: Number(maxCapacity) || 200,
      expectedGuestCount: Number(expectedGuestCount) || 50,
      pricingModel: pricingModel || "Fixed Package",
      basePrice: Number(basePrice) || 0,
      currency: currency || "LKR",
      status: status || "PUBLISHED",
      featured: Boolean(featured),
      termsAndConditions: termsAndConditions || "",
      contactEmail: contactEmail || "",
      contactPhone: contactPhone || "",
      createdBy: req.user ? req.user._id : undefined
    });

    res.status(201).json({ message: "Event created successfully", event });
  } catch (err) {
    console.error("createEvent error:", err);
    res.status(500).json({ error: "Failed to create event" });
  }
};

/**
 * GET /api/events/admin/events/:id
 * Staff view event by ID
 */
exports.getAdminEventById = async (req, res) => {
  try {
    const { id } = req.params;
    const event = await Event.findOne(buildPropertyFilter(req, { _id: id }))
      .populate("venue")
      .populate("createdBy", "name email");

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    res.json(event);
  } catch (err) {
    console.error("getAdminEventById error:", err);
    res.status(500).json({ error: "Failed to fetch event" });
  }
};

/**
 * PUT /api/events/admin/events/:id
 * Staff updates an existing event
 */
exports.updateEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const event = await Event.findOne(buildPropertyFilter(req, { _id: id }));

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    const allowedFields = [
      "title",
      "eventType",
      "shortDescription",
      "description",
      "venue",
      "coverImage",
      "gallery",
      "startDate",
      "endDate",
      "startTime",
      "endTime",
      "minCapacity",
      "maxCapacity",
      "expectedGuestCount",
      "pricingModel",
      "basePrice",
      "currency",
      "status",
      "featured",
      "termsAndConditions",
      "contactEmail",
      "contactPhone"
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        event[field] = req.body[field];
      }
    });

    if (req.user) {
      event.updatedBy = req.user._id;
    }

    await event.save();
    res.json({ message: "Event updated successfully", event });
  } catch (err) {
    console.error("updateEvent error:", err);
    res.status(500).json({ error: "Failed to update event" });
  }
};

/**
 * DELETE /api/events/admin/events/:id
 * Safely archive or remove an event
 */
exports.deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const event = await Event.findOne(buildPropertyFilter(req, { _id: id }));

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    // Check if bookings reference this event
    const bookingsCount = await EventBooking.countDocuments({ event: event._id });
    if (bookingsCount > 0) {
      // Archive instead of destructive delete to protect booking audit trail
      event.status = "ARCHIVED";
      await event.save();
      return res.json({ message: "Event has existing bookings. Safely archived instead of deleted.", event });
    }

    await Event.deleteOne({ _id: event._id });
    res.json({ message: "Event removed successfully" });
  } catch (err) {
    console.error("deleteEvent error:", err);
    res.status(500).json({ error: "Failed to delete event" });
  }
};

/**
 * PUT /api/events/admin/events/:id/publish
 * Toggle publish / draft
 */
exports.toggleEventPublish = async (req, res) => {
  try {
    const { id } = req.params;
    const event = await Event.findOne(buildPropertyFilter(req, { _id: id }));

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    event.status = event.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
    if (req.user) event.updatedBy = req.user._id;
    await event.save();

    res.json({ message: `Event status changed to ${event.status}`, event });
  } catch (err) {
    console.error("toggleEventPublish error:", err);
    res.status(500).json({ error: "Failed to update publish status" });
  }
};

/**
 * GET /api/events/admin/venues
 * List all venues for property
 */
exports.getAdminVenues = async (req, res) => {
  try {
    const filter = buildPropertyFilter(req, {});
    const venues = await EventVenue.find(filter).sort({ name: 1 });
    res.json(venues);
  } catch (err) {
    console.error("getAdminVenues error:", err);
    res.status(500).json({ error: "Failed to fetch admin venues" });
  }
};

/**
 * POST /api/events/admin/venues
 * Staff creates a new venue
 */
exports.createVenue = async (req, res) => {
  try {
    const {
      name,
      hotel,
      location,
      type,
      area,
      min,
      max,
      categories,
      seating,
      facilities,
      image,
      gallery,
      description,
      packages,
      basePrice,
      currency,
      termsAndConditions,
      additionalServices,
      isActive
    } = req.body;

    if (!name || !max) {
      return res.status(400).json({ error: "Venue name and maximum capacity are required" });
    }
    if (min && max && Number(min) > Number(max)) {
      return res.status(400).json({ error: "Minimum capacity cannot exceed maximum capacity" });
    }
    if (basePrice !== undefined && (!Number.isFinite(Number(basePrice)) || Number(basePrice) < 0)) {
      return res.status(400).json({ error: "Base venue price cannot be negative" });
    }
    if (Array.isArray(packages)) {
      for (const pkg of packages) {
        if (!pkg.name || !String(pkg.name).trim()) return res.status(400).json({ error: "Package name is required" });
        if (!Number.isFinite(Number(pkg.price)) || Number(pkg.price) < 0) return res.status(400).json({ error: "Package prices cannot be negative" });
      }
    }
    if (Array.isArray(additionalServices)) {
      for (const service of additionalServices) {
        if (!service.name || !String(service.name).trim()) return res.status(400).json({ error: "Additional service name is required" });
        if (!Number.isFinite(Number(service.price)) || Number(service.price) < 0) return res.status(400).json({ error: "Additional service prices cannot be negative" });
      }
    }

    let slug = (req.body.slug || name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    const existing = await EventVenue.findOne(buildPropertyFilter(req, { slug }));
    if (existing) {
      slug = `${slug}-${Math.floor(100 + Math.random() * 900)}`;
    }

    const venue = await EventVenue.create({
      property: req.propertyId,
      name,
      slug,
      hotel: hotel || "Serendib Sanctuary · Flagship Property",
      location: location || "Colombo, Sri Lanka",
      type: type || "Indoor",
      area: Number(area) || 100,
      min: Number(min) || 1,
      max: Number(max),
      categories: categories || ["weddings", "corporate", "office-parties", "private-celebrations"],
      seating: seating || ["Banquet", "Reception"],
      facilities: facilities || ["Air conditioning", "Sound system", "Wi-Fi"],
      image: image || "",
      gallery: gallery || [],
      description: description || "",
      packages: packages || [],
      basePrice: Number(basePrice) || 0,
      currency: currency || "LKR",
      termsAndConditions: termsAndConditions || "",
      additionalServices: Array.isArray(additionalServices) ? additionalServices : [],
      isActive: isActive !== undefined ? isActive : true
    });

    res.status(201).json({ message: "Venue created successfully", venue });
  } catch (err) {
    console.error("createVenue error:", err);
    res.status(500).json({ error: "Failed to create venue" });
  }
};

/**
 * PUT /api/events/admin/venues/:id
 * Staff updates an existing venue
 */
exports.updateVenue = async (req, res) => {
  try {
    const { id } = req.params;
    const venue = await EventVenue.findOne(buildPropertyFilter(req, { _id: id }));

    if (!venue) {
      return res.status(404).json({ error: "Venue not found" });
    }

    const effectiveMin = req.body.min !== undefined ? Number(req.body.min) : venue.min;
    const effectiveMax = req.body.max !== undefined ? Number(req.body.max) : venue.max;
    if (effectiveMin > effectiveMax) {
      return res.status(400).json({ error: "Minimum capacity cannot exceed maximum capacity" });
    }
    if (req.body.basePrice !== undefined && (!Number.isFinite(Number(req.body.basePrice)) || Number(req.body.basePrice) < 0)) {
      return res.status(400).json({ error: "Base venue price cannot be negative" });
    }
    if (Array.isArray(req.body.packages)) {
      for (const pkg of req.body.packages) {
        if (!pkg.name || !String(pkg.name).trim()) return res.status(400).json({ error: "Package name is required" });
        if (!Number.isFinite(Number(pkg.price)) || Number(pkg.price) < 0) return res.status(400).json({ error: "Package prices cannot be negative" });
      }
    }
    if (Array.isArray(req.body.additionalServices)) {
      for (const service of req.body.additionalServices) {
        if (!service.name || !String(service.name).trim()) return res.status(400).json({ error: "Additional service name is required" });
        if (!Number.isFinite(Number(service.price)) || Number(service.price) < 0) return res.status(400).json({ error: "Additional service prices cannot be negative" });
      }
    }

    const allowedFields = [
      "name",
      "hotel",
      "location",
      "type",
      "area",
      "min",
      "max",
      "categories",
      "seating",
      "facilities",
      "image",
      "gallery",
      "description",
      "packages",
      "basePrice",
      "currency",
      "termsAndConditions",
      "additionalServices",
      "isActive"
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        venue[field] = req.body[field];
      }
    });

    await venue.save();
    res.json({ message: "Venue updated successfully", venue });
  } catch (err) {
    console.error("updateVenue error:", err);
    res.status(500).json({ error: "Failed to update venue" });
  }
};

/**
 * DELETE /api/events/admin/venues/:id
 * Soft delete / deactivate venue
 */
exports.deleteVenue = async (req, res) => {
  try {
    const { id } = req.params;
    const venue = await EventVenue.findOne(buildPropertyFilter(req, { _id: id }));

    if (!venue) {
      return res.status(404).json({ error: "Venue not found" });
    }

    // Always toggle active or check if bookings exist
    const bookingsCount = await EventBooking.countDocuments({ venue: venue._id });
    if (bookingsCount > 0) {
      venue.isActive = false;
      await venue.save();
      return res.json({ message: "Venue has historical bookings. Safely deactivated.", venue });
    }

    await EventVenue.deleteOne({ _id: venue._id });
    res.json({ message: "Venue deleted successfully" });
  } catch (err) {
    console.error("deleteVenue error:", err);
    res.status(500).json({ error: "Failed to delete venue" });
  }
};

/**
 * GET /api/events/admin/bookings
 * Staff view of all customer bookings & enquiries
 */
exports.getAdminBookings = async (req, res) => {
  try {
    const filter = buildPropertyFilter(req, {});

    if (req.query.status && req.query.status !== "ALL") {
      filter.status = req.query.status;
    }
    if (req.query.date) {
      filter.date = req.query.date;
    } else if (req.query.dateFrom || req.query.dateTo) {
      const { dateFrom, dateTo } = req.query;
      if ((dateFrom && !isValidISODate(dateFrom)) || (dateTo && !isValidISODate(dateTo)) || (dateFrom && dateTo && dateFrom > dateTo)) {
        return res.status(400).json({ error: "Invalid booking date range" });
      }
      filter.date = {};
      if (dateFrom) filter.date.$gte = dateFrom;
      if (dateTo) filter.date.$lte = dateTo;
    }
    if (req.query.venue) {
      filter.venue = req.query.venue;
    }
    if (req.query.eventType) {
      filter.eventType = req.query.eventType;
    }
    if (req.query.search) {
      const searchTerm = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { customerName: { $regex: searchTerm, $options: "i" } },
        { email: { $regex: searchTerm, $options: "i" } },
        { phone: { $regex: searchTerm, $options: "i" } },
        { confirmationNumber: { $regex: searchTerm, $options: "i" } },
        { venueName: { $regex: searchTerm, $options: "i" } }
      ];
    }

    const bookings = await EventBooking.find(filter)
      .populate("venue", "name slug location type isActive max min basePrice currency packages additionalServices")
      .populate("event", "title slug eventType startDate")
      .populate("user", "name email")
      .populate("confirmedBy", "name email")
      .lean();

    const now = new Date();
    bookings.sort((left, right) => {
      const leftDate = /^\d{4}-\d{2}-\d{2}$/.test(left.date || "")
        ? new Date(`${left.date}T${/^\d{2}:\d{2}$/.test(left.startTime || "") ? left.startTime : "00:00"}:00`)
        : new Date(NaN);
      const rightDate = /^\d{4}-\d{2}-\d{2}$/.test(right.date || "")
        ? new Date(`${right.date}T${/^\d{2}:\d{2}$/.test(right.startTime || "") ? right.startTime : "00:00"}:00`)
        : new Date(NaN);
      const leftValid = !Number.isNaN(leftDate.getTime());
      const rightValid = !Number.isNaN(rightDate.getTime());
      if (!leftValid && !rightValid) return String(left.confirmationNumber || "").localeCompare(String(right.confirmationNumber || ""));
      if (!leftValid) return 1;
      if (!rightValid) return -1;
      const leftUpcoming = leftDate.getTime() >= now.getTime();
      const rightUpcoming = rightDate.getTime() >= now.getTime();
      if (leftUpcoming !== rightUpcoming) return leftUpcoming ? -1 : 1;
      return leftUpcoming ? leftDate - rightDate : rightDate - leftDate;
    });
    res.json(bookings);
  } catch (err) {
    console.error("getAdminBookings error:", err);
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
};

/**
 * PUT /api/events/admin/bookings/:id/status
 * Transition booking status (CONFIRMED, REJECTED, CANCELLED, COMPLETED)
 * Enforces venue conflict checking when confirming!
 */
exports.updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, rejectionReason, cancellationReason } = req.body;

    const validStatuses = ["PENDING", "CONFIRMED", "REJECTED", "CANCELLED", "COMPLETED"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status: ${status}` });
    }

    let booking = await EventBooking.findOne(buildPropertyFilter(req, { _id: id }));
    if (!booking) {
      return res.status(404).json({ error: "Booking request not found" });
    }

    // Status transition rules
    if (booking.status === "COMPLETED" && status !== "COMPLETED") {
      return res.status(400).json({ error: "Completed bookings cannot change status" });
    }
    if (booking.status === "CANCELLED" && status !== "CANCELLED") {
      return res.status(400).json({ error: "Cancelled bookings cannot be reopened" });
    }

    // Confirmation and conflict check commit atomically. Updating the venue
    // revision makes concurrent confirmations contend even across app workers.
    if (status === "CONFIRMED" && booking.status !== "CONFIRMED") {
      if (booking.venue) {
        const transactionResult = await withVenueScheduleTransaction(booking.venue, async (session) => {
          const currentBooking = await EventBooking.findOne(buildPropertyFilter(req, { _id: id })).session(session);
          if (!currentBooking) {
            const error = new Error("Booking request not found");
            error.statusCode = 404;
            throw error;
          }
          if (currentBooking.status === "COMPLETED" && status !== "COMPLETED") {
            const error = new Error("Completed bookings cannot change status");
            error.statusCode = 400;
            throw error;
          }
          if (currentBooking.status === "CANCELLED" && status !== "CANCELLED") {
            const error = new Error("Cancelled bookings cannot be reopened");
            error.statusCode = 400;
            throw error;
          }
          if (currentBooking.status === "CONFIRMED") return { booking: currentBooking };

          const venueDoc = await EventVenue.findOne({ _id: currentBooking.venue, property: req.propertyId }).session(session);
          if (!venueDoc || !venueDoc.isActive) {
            const error = new Error(`Cannot confirm booking: Assigned venue${venueDoc ? ` "${venueDoc.name}"` : ""} is missing or inactive.`);
            error.statusCode = 400;
            throw error;
          }
          const conflict = await checkVenueConflict({
            propertyId: req.propertyId,
            venueId: currentBooking.venue,
            date: currentBooking.date,
            startTime: currentBooking.startTime,
            endTime: currentBooking.endTime,
            excludeBookingId: currentBooking._id,
            session
          });
          if (conflict.hasConflict) {
            const error = new Error("Cannot confirm booking: Conflicting confirmed booking exists for this venue and time slot");
            error.statusCode = 409;
            error.conflictingBooking = conflict.conflictingBooking;
            throw error;
          }
          await applyBookingStatusUpdate(currentBooking, status, notes, rejectionReason, cancellationReason, req, session);
          return { booking: currentBooking };
        });
        booking = transactionResult.booking;
      } else {
        await applyBookingStatusUpdate(booking, status, notes, rejectionReason, cancellationReason, req, null);
      }
    } else {
      await applyBookingStatusUpdate(booking, status, notes, rejectionReason, cancellationReason, req, null);
    }

    // Send status update notification safely
    await sendEventNotification({
      type: `STATUS_${status}`,
      booking,
      recipientEmail: booking.email
    });

    res.json({ message: `Booking status updated to ${status}`, booking });
  } catch (err) {
    console.error("updateBookingStatus error:", err);
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : "Failed to update booking status", ...(err.conflictingBooking ? { conflictingBooking: err.conflictingBooking } : {}) });
  }
};

async function applyBookingStatusUpdate(booking, status, notes, rejectionReason, cancellationReason, req, session) {
  const previousStatus = booking.status;
  if (status === "CONFIRMED" && previousStatus !== "CONFIRMED") {
    booking.confirmedBy = req.user ? req.user._id : undefined;
    booking.confirmedAt = new Date();
  }
  booking.status = status;
  if (rejectionReason) booking.rejectionReason = rejectionReason;
  if (cancellationReason) booking.cancellationReason = cancellationReason;
  if (notes !== undefined) booking.internalNotes = notes;
  const actionName = (notes && status === previousStatus) ? "INTERNAL_NOTES_UPDATED" : `STATUS_CHANGE_TO_${status}`;
  booking.auditLog.push({
    action: actionName,
    performedBy: req.user ? req.user._id : undefined,
    timestamp: new Date(),
    notes: notes || rejectionReason || cancellationReason || ""
  });
  await booking.save(session ? { session } : undefined);
}
