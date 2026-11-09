// backend/routes/eventRoutes.js
const express = require("express");
const router = express.Router();
const eventController = require("../controllers/eventController");
const { protect, authorize } = require("../middleware/auth");
const requireDepartmentPermission = require("../middleware/requireDepartmentPermission");

const STAFF_ROLES = ["admin", "manager", "staff", "finance"];

router.use("/admin", protect, requireDepartmentPermission("events"));

// ==========================================
// PUBLIC & GUEST EVENT ROUTES
// ==========================================

// Discover all published events
router.get("/", eventController.getEvents);

// Featured events
router.get("/featured", eventController.getFeaturedEvents);

// Event categories / types
router.get("/types", eventController.getEventTypes);

// Discover venues & halls
router.get("/venues", eventController.getVenues);
router.get("/venues/:idOrSlug", eventController.getVenueByIdOrSlug);

// Venue availability check
router.get("/availability", eventController.checkAvailability);

// Submit event booking / enquiry
router.post("/bookings", eventController.createBooking);
router.post("/enquiries", eventController.createBooking);

// Lookup booking by confirmation reference
router.get("/bookings/:ref", eventController.getBookingByRef);

// Authenticated customer my-bookings routes
router.get("/my-bookings", protect, eventController.getMyBookings);
router.put("/my-bookings/:id/cancel", protect, eventController.cancelMyBooking);

// ==========================================
// ADMIN / STAFF MANAGEMENT ROUTES (PROTECTED)
// ==========================================
// Note: Placed BEFORE /:slug so "admin" is not captured as slug!

router.get(
  "/admin/dashboard-stats",
  protect,
  authorize(...STAFF_ROLES),
  eventController.getAdminDashboardStats
);

// Admin Event CRUD
router.get(
  "/admin/events",
  protect,
  authorize(...STAFF_ROLES),
  eventController.getAdminEvents
);
router.post(
  "/admin/events",
  protect,
  authorize("admin", "manager", "staff"),
  eventController.createEvent
);
router.get(
  "/admin/events/:id",
  protect,
  authorize(...STAFF_ROLES),
  eventController.getAdminEventById
);
router.put(
  "/admin/events/:id",
  protect,
  authorize("admin", "manager", "staff"),
  eventController.updateEvent
);
router.delete(
  "/admin/events/:id",
  protect,
  authorize("admin", "manager"),
  eventController.deleteEvent
);
router.put(
  "/admin/events/:id/publish",
  protect,
  authorize("admin", "manager", "staff"),
  eventController.toggleEventPublish
);

// Admin Venues CRUD
router.get(
  "/admin/venues",
  protect,
  authorize(...STAFF_ROLES),
  eventController.getAdminVenues
);
router.post(
  "/admin/venues",
  protect,
  authorize("admin", "manager", "staff"),
  eventController.createVenue
);
router.put(
  "/admin/venues/:id",
  protect,
  authorize("admin", "manager", "staff"),
  eventController.updateVenue
);
router.delete(
  "/admin/venues/:id",
  protect,
  authorize("admin", "manager"),
  eventController.deleteVenue
);

// Admin Bookings Management
router.get(
  "/admin/bookings",
  protect,
  authorize(...STAFF_ROLES),
  eventController.getAdminBookings
);
router.put(
  "/admin/bookings/:id/status",
  protect,
  authorize("admin", "manager", "staff"),
  eventController.updateBookingStatus
);

// ==========================================
// PUBLIC SINGLE EVENT BY SLUG (Wildcard - placed last!)
// ==========================================
router.get("/:slug", eventController.getEventBySlug);

module.exports = router;
