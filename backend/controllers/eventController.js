// backend/controllers/eventController.js
const mongoose = require("mongoose");
const EventVenue = require("../models/EventVenue");
const Event = require("../models/Event");
const EventBooking = require("../models/EventBooking");
const {
  withVenueLock,
  checkVenueConflict,
  isDateInFutureOrToday,
  sendEventNotification
} = require("../services/eventService");
const { buildPropertyFilter } = require("../middleware/propertyContext");

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
      ? buildPropertyFilter(req, { _id: idOrSlug })
      : buildPropertyFilter(req, { slug: idOrSlug });

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

    if (!isDateInFutureOrToday(date)) {
      return res.status(400).json({ error: "Requested date must be today or in the future" });
    }

    let resolvedVenueId = venueId;
    if (!resolvedVenueId && venueSlug) {
      const venueObj = await EventVenue.findOne(buildPropertyFilter(req, { slug: venueSlug }));
      if (venueObj) resolvedVenueId = venueObj._id;
    }

    if (!resolvedVenueId) {
      return res.status(400).json({ error: "Venue specification required" });
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
      specialRequests
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
    if (!effectiveDate) {
      return res.status(400).json({ error: "Event date is required" });
    }
    if (!isDateInFutureOrToday(effectiveDate)) {
      return res.status(400).json({ error: "Event date must be today or a future date" });
    }
    if (!effectiveStart || !effectiveEnd) {
      return res.status(400).json({ error: "Start and end times are required" });
    }
    if (effectiveEnd <= effectiveStart) {
      return res.status(400).json({ error: "End time must be strictly after start time" });
    }
    if (isNaN(effectiveGuests) || effectiveGuests < 1) {
      return res.status(400).json({ error: "Estimated guest count must be at least 1" });
    }

    // Resolve venue if provided
    let resolvedVenue = null;
    if (effectiveVenueRef) {
      const isObjectId = mongoose.Types.ObjectId.isValid(effectiveVenueRef);
      const venueQuery = isObjectId
        ? buildPropertyFilter(req, { _id: effectiveVenueRef })
        : buildPropertyFilter(req, { slug: effectiveVenueRef });

      resolvedVenue = await EventVenue.findOne(venueQuery);

      if (resolvedVenue) {
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
      }
    }

    // Price estimate calculation if package chosen
    let estimatedPrice = 0;
    const finalPackageName = selectedPackageName || selectedPackage || "";
    if (resolvedVenue && finalPackageName && resolvedVenue.packages) {
      const foundPkg = resolvedVenue.packages.find((p) => p.name === finalPackageName);
      if (foundPkg && foundPkg.price) {
        estimatedPrice = foundPkg.price;
      }
    }

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

    const newBooking = await EventBooking.create(bookingData);

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

    res.json(bookings);
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
      isActive
    } = req.body;

    if (!name || !max) {
      return res.status(400).json({ error: "Venue name and maximum capacity are required" });
    }
    if (min && max && Number(min) > Number(max)) {
      return res.status(400).json({ error: "Minimum capacity cannot exceed maximum capacity" });
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
    }
    if (req.query.venue) {
      filter.venue = req.query.venue;
    }
    if (req.query.eventType) {
      filter.eventType = req.query.eventType;
    }
    if (req.query.search) {
      filter.$or = [
        { customerName: { $regex: req.query.search, $options: "i" } },
        { email: { $regex: req.query.search, $options: "i" } },
        { phone: { $regex: req.query.search, $options: "i" } },
        { confirmationNumber: { $regex: req.query.search, $options: "i" } }
      ];
    }

    const bookings = await EventBooking.find(filter)
      .populate("venue", "name slug location type isActive")
      .populate("event", "title slug eventType startDate")
      .populate("user", "name email")
      .populate("confirmedBy", "name email")
      .sort({ createdAt: -1 });

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

    const booking = await EventBooking.findOne(buildPropertyFilter(req, { _id: id }));
    if (!booking) {
      return res.status(404).json({ error: "Booking request not found" });
    }

    const previousStatus = booking.status;

    // Status transition rules
    if (booking.status === "COMPLETED" && status !== "COMPLETED") {
      return res.status(400).json({ error: "Completed bookings cannot change status" });
    }
    if (booking.status === "CANCELLED" && status !== "CANCELLED") {
      return res.status(400).json({ error: "Cancelled bookings cannot be reopened" });
    }

    // If transitioning to CONFIRMED, execute with venue lock & conflict prevention
    if (status === "CONFIRMED" && booking.status !== "CONFIRMED") {
      if (booking.venue) {
        const venueDoc = await EventVenue.findById(booking.venue);
        if (venueDoc && !venueDoc.isActive) {
          return res.status(400).json({
            error: `Cannot confirm booking: Assigned venue "${venueDoc.name}" is currently inactive.`
          });
        }

        const conflict = await withVenueLock(booking.venue, async () => {
          return await checkVenueConflict({
            propertyId: req.propertyId,
            venueId: booking.venue,
            date: booking.date,
            startTime: booking.startTime,
            endTime: booking.endTime,
            excludeBookingId: booking._id
          });
        });

        if (conflict.hasConflict) {
          return res.status(409).json({
            error: "Cannot confirm booking: Conflicting confirmed booking exists for this venue and time slot",
            conflictingBooking: conflict.conflictingBooking
          });
        }
      }

      booking.confirmedBy = req.user ? req.user._id : undefined;
      booking.confirmedAt = new Date();
    }

    booking.status = status;
    if (rejectionReason) booking.rejectionReason = rejectionReason;
    if (cancellationReason) booking.cancellationReason = cancellationReason;
    if (notes !== undefined) booking.internalNotes = notes;

    const actionName = (notes && status === previousStatus)
      ? "INTERNAL_NOTES_UPDATED"
      : `STATUS_CHANGE_TO_${status}`;

    booking.auditLog.push({
      action: actionName,
      performedBy: req.user ? req.user._id : undefined,
      timestamp: new Date(),
      notes: notes || rejectionReason || cancellationReason || ""
    });

    await booking.save();

    // Send status update notification safely
    await sendEventNotification({
      type: `STATUS_${status}`,
      booking,
      recipientEmail: booking.email
    });

    res.json({ message: `Booking status updated to ${status}`, booking });
  } catch (err) {
    console.error("updateBookingStatus error:", err);
    res.status(500).json({ error: "Failed to update booking status" });
  }
};
