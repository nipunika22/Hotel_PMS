const express = require("express");
const router = express.Router();
const operations = require("../controllers/restaurantOperationsController");
const restaurantController = require("../controllers/restaurantController");
const { protect, authorize, optionalAuth } = require("../middleware/auth");
const { createRateLimiter } = require("../middleware/rateLimiter");
const requireDepartmentPermission = require("../middleware/requireDepartmentPermission");

const verifyDiningGuest = createRateLimiter({
  namespace: "dining-verification", max: 20, windowMs: 60_000,
  message: "Too many dining verification requests. Try again shortly."
});
const STAFF_ROLES = ["admin", "manager", "staff", "finance"];

router.use("/admin", protect, (req, res, next) => {
  const url = String(req.originalUrl || "").split("?")[0];
  const permission = /\/admin\/offers(?:\/|$)/.test(url) ? ["dining", "offers.dining"] : "dining";
  return requireDepartmentPermission(permission)(req, res, next);
});

// ==========================================
// PUBLIC / GUEST DINING ROUTES
// ==========================================

// Discover all active restaurants
router.get("/", restaurantController.getRestaurants);

// Hotel guest lookup (to link stay)
router.post("/lookup-hotel-stay", optionalAuth, verifyDiningGuest, restaurantController.lookupHotelStay);

// Authenticated customer dining reservations (placed before /:slug)
router.get("/my-reservations", protect, restaurantController.getMyReservations);

// Single reservation lookup & cancellation by confirmation reference
router.get("/reservations/:ref", optionalAuth, verifyDiningGuest, restaurantController.getReservationByRef);
router.put("/reservations/:ref/cancel", optionalAuth, verifyDiningGuest, restaurantController.cancelReservation);


// ==========================================
// ADMIN / STAFF MANAGEMENT ROUTES (PROTECTED)
// ==========================================
const operationsPath = "/admin/operations/:restaurantId";
const operationsAccess = authorize(...STAFF_ROLES);
router.get("/admin/operations", operationsAccess, operations.dashboard);
router.get(`${operationsPath}/reservations`, operationsAccess, operations.reservations);
router.put(`${operationsPath}/reservations/:reservationId/arrival`, operationsAccess, operations.arrive);
router.put(`${operationsPath}/reservations/:reservationId/seat`, operationsAccess, operations.seat);
router.get(`${operationsPath}/menu`, operationsAccess, operations.menu);
router.post(`${operationsPath}/reservations/:reservationId/order`, operationsAccess, operations.createOrder);
router.put(`${operationsPath}/reservations/:reservationId/order`, operationsAccess, operations.updateOrder);
router.get(`${operationsPath}/orders/:orderId`, operationsAccess, operations.bill);
router.post(`${operationsPath}/orders/:orderId/payment`, operationsAccess, operations.pay);
router.get(`${operationsPath}/sales`, operationsAccess, operations.sales);

// Note: Placed before /:slug so "admin" is not captured as slug!

router.get(
  "/admin/dashboard-stats",
  protect,
  authorize(...STAFF_ROLES),
  restaurantController.getAdminDashboardStats
);

// Admin restaurant CRUD
router.get(
  "/admin/restaurants",
  protect,
  authorize(...STAFF_ROLES),
  restaurantController.getAdminRestaurants
);
router.post(
  "/admin/restaurants",
  protect,
  authorize("admin", "manager"),
  restaurantController.createRestaurant
);
router.put(
  "/admin/restaurants/:id",
  protect,
  authorize("admin", "manager"),
  restaurantController.updateRestaurant
);
router.delete(
  "/admin/restaurants/:id",
  protect,
  authorize("admin", "manager"),
  restaurantController.deleteRestaurant
);

// Admin tables CRUD
router.get(
  "/admin/tables",
  protect,
  authorize(...STAFF_ROLES),
  restaurantController.getAdminTables
);
router.post(
  "/admin/tables",
  protect,
  authorize("admin", "manager", "staff"),
  restaurantController.createTable
);
router.put(
  "/admin/tables/:id",
  protect,
  authorize("admin", "manager", "staff"),
  restaurantController.updateTable
);
router.delete(
  "/admin/tables/:id",
  protect,
  authorize("admin", "manager"),
  restaurantController.deleteTable
);

// Admin menu categories
router.get(
  "/admin/categories",
  protect,
  authorize(...STAFF_ROLES),
  restaurantController.getAdminMenuCategories
);
router.post(
  "/admin/categories",
  protect,
  authorize("admin", "manager", "staff"),
  restaurantController.createMenuCategory
);
router.put(
  "/admin/categories/:id",
  protect,
  authorize("admin", "manager", "staff"),
  restaurantController.updateMenuCategory
);
router.delete(
  "/admin/categories/:id",
  protect,
  authorize("admin", "manager"),
  restaurantController.deleteMenuCategory
);

// Admin menu items
router.get(
  "/admin/menu-items",
  protect,
  authorize(...STAFF_ROLES),
  restaurantController.getAdminMenuItems
);
router.post(
  "/admin/menu-items",
  protect,
  authorize("admin", "manager", "staff"),
  restaurantController.createMenuItem
);
router.put(
  "/admin/menu-items/:id",
  protect,
  authorize("admin", "manager", "staff"),
  restaurantController.updateMenuItem
);
router.delete(
  "/admin/menu-items/:id",
  protect,
  authorize("admin", "manager"),
  restaurantController.deleteMenuItem
);

// Admin buffets
router.get(
  "/admin/buffets",
  protect,
  authorize(...STAFF_ROLES),
  restaurantController.getAdminBuffets
);
router.post(
  "/admin/buffets",
  protect,
  authorize("admin", "manager", "staff"),
  restaurantController.createBuffet
);
router.put(
  "/admin/buffets/:id",
  protect,
  authorize("admin", "manager", "staff"),
  restaurantController.updateBuffet
);
router.delete(
  "/admin/buffets/:id",
  protect,
  authorize("admin", "manager"),
  restaurantController.deleteBuffet
);

// Admin offers
router.get(
  "/admin/offers/restaurants",
  protect,
  authorize(...STAFF_ROLES),
  restaurantController.getOfferRestaurants
);
router.get(
  "/admin/offers",
  protect,
  authorize(...STAFF_ROLES),
  restaurantController.getAdminOffers
);
router.post(
  "/admin/offers",
  protect,
  authorize("admin", "manager", "staff"),
  restaurantController.createOffer
);
router.put(
  "/admin/offers/:id",
  protect,
  authorize("admin", "manager", "staff"),
  restaurantController.updateOffer
);
router.delete(
  "/admin/offers/:id",
  protect,
  authorize("admin", "manager"),
  restaurantController.deleteOffer
);

// Admin reservations
router.get(
  "/admin/reservations",
  protect,
  authorize(...STAFF_ROLES),
  restaurantController.getAdminReservations
);
router.put(
  "/admin/reservations/:id/status",
  protect,
  authorize(...STAFF_ROLES),
  restaurantController.updateReservationStatus
);

// Post restaurant bill to hotel guest folio
router.post(
  "/admin/reservations/:id/charge-folio",
  protect,
  authorize(...STAFF_ROLES),
  restaurantController.chargeReservationToFolio
);

// ==========================================
// PUBLIC DYNAMIC RESTAURANT SLUG ROUTES
// ==========================================

router.get("/:slug", restaurantController.getRestaurantBySlug);
router.get("/:id/menu", restaurantController.getRestaurantMenu);
router.get("/:id/buffets", restaurantController.getRestaurantBuffets);
router.get("/:id/offers", restaurantController.getRestaurantOffers);
router.get("/:id/availability", restaurantController.checkAvailability);
router.post("/:id/reservations", optionalAuth, (req, res, next) =>
  req.body?.guestType === "Hotel Guest" ? verifyDiningGuest(req, res, next) : next(), restaurantController.createReservation);

module.exports = router;

