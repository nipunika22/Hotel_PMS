// backend/middleware/propertyContext.js
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Property = require("../models/Property");

// In-memory cache for default active property to avoid redundant DB roundtrips
let cachedDefaultProperty = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 60000; // 1 minute

/**
 * Resolves the primary active property (Sri Lanka Main Property).
 */
async function getActiveProperty() {
  const now = Date.now();
  if (cachedDefaultProperty && (now - lastCacheTime < CACHE_TTL_MS)) {
    return cachedDefaultProperty;
  }

  // 1. Look for SL-MAIN property
  let property = await Property.findOne({ code: "SL-MAIN", status: "Active" });
  
  // 2. Fallback to any active property
  if (!property) {
    property = await Property.findOne({ status: "Active" });
  }

  // 3. Fallback to any property in the system
  if (!property) {
    property = await Property.findOne({});
  }

  if (property) {
    cachedDefaultProperty = property;
    lastCacheTime = now;
  }

  return property;
}

/**
 * Returns the ObjectId of the active property.
 */
async function getActivePropertyId() {
  const prop = await getActiveProperty();
  return prop ? prop._id : null;
}

/**
 * Property Context Middleware
 * Enforces server-side property context validation and tenancy isolation.
 * Attaches req.property and req.propertyId.
 */
async function propertyContext(req, res, next) {
  try {
    // Opportunistically decode JWT if present and req.user not already populated
    if (!req.user && req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      const token = req.headers.authorization.split(" ")[1];
      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          req.user = await User.findById(decoded.id).select("-password");
        } catch (e) {
          // Token invalid or expired - ignore here, protect middleware will handle if route is protected
        }
      }
    }

    // 1. Extract requested property ID from header, query param, or request body
    const requestedId =
      req.headers["x-property-id"] ||
      req.query.propertyId ||
      req.query.property ||
      (req.body && (req.body.propertyId || req.body.property));

    let resolvedProperty = null;

    if (requestedId) {
      if (!mongoose.Types.ObjectId.isValid(requestedId) && typeof requestedId !== "string") {
        return res.status(400).json({ error: "Invalid property ID format" });
      }

      // Check if property exists
      const query = mongoose.Types.ObjectId.isValid(requestedId)
        ? { _id: requestedId }
        : { code: requestedId.toUpperCase() };

      resolvedProperty = await Property.findOne(query);

      if (!resolvedProperty) {
        return res.status(404).json({ error: "Specified property not found" });
      }

      if (resolvedProperty.status !== "Active") {
        return res.status(403).json({ error: "Property is currently inactive" });
      }

      // Customers, Super Admins, and legacy global Admins use the existing
      // property selection policy. Every other staff account needs an explicit
      // assignment, including when requesting a property directly.
      if (req.user && req.user.role !== "customer" && req.user.role !== "super_admin" && req.user.role !== "admin") {
        const assignments = [req.user.property, ...(req.user.allowedProperties || [])]
          .filter(Boolean).map((item) => String(item._id || item));
        if (!assignments.includes(String(resolvedProperty._id))) {
          return res.status(403).json({ error: "Access denied: You are not assigned to the selected property" });
        }
      }
      if (req.user?.role === "admin" && req.user.departmentAdmin === true) {
        const assignments = [req.user.property, ...(req.user.allowedProperties || [])]
          .filter(Boolean).map((item) => String(item._id || item));
        if (!assignments.includes(String(resolvedProperty._id))) {
          return res.status(403).json({ error: "Access denied: this department administrator is not assigned to the selected property" });
        }
      }
    } else {
      const restrictedStaff = req.user && req.user.role !== "customer" && req.user.role !== "super_admin" && req.user.role !== "admin";
      const scopedDepartmentAdmin = req.user?.role === "admin" && req.user.departmentAdmin === true;
      if (restrictedStaff || scopedDepartmentAdmin) {
        if (req.user.property) {
          resolvedProperty = await Property.findById(req.user.property);
        } else {
          const ids = [...new Set((req.user.allowedProperties || []).map((item) => String(item._id || item)))];
          if (ids.length === 1) resolvedProperty = await Property.findById(ids[0]);
          else if (ids.length > 1) return res.status(400).json({ error: "Select one of your assigned properties" });
          else return res.status(403).json({ error: scopedDepartmentAdmin ? "This department administrator has no assigned property" : "An explicit property assignment is required" });
        }
        if (!resolvedProperty) return res.status(403).json({ error: "The assigned property is unavailable" });
        if (resolvedProperty.status !== "Active") return res.status(403).json({ error: "The assigned property is currently inactive" });
      }

      if (!resolvedProperty) {
        resolvedProperty = await getActiveProperty();
      }
    }

    if (resolvedProperty) {
      req.property = resolvedProperty;
      req.propertyId = resolvedProperty._id;
    }

    next();
  } catch (err) {
    console.error("Property context error:", err);
    return res.status(500).json({ error: "Failed to establish property context" });
  }
}

/**
 * Middleware that strictly requires a valid property context
 */
function requirePropertyAccess(req, res, next) {
  if (!req.propertyId) {
    return res.status(400).json({ error: "Active property context required" });
  }
  next();
}

/**
 * Helper to build an operational query filter scoped to current property
 */
function buildPropertyFilter(req, baseFilter = {}) {
  if (req && req.propertyId) {
    return { ...baseFilter, property: req.propertyId };
  }
  return baseFilter;
}

module.exports = {
  propertyContext,
  requirePropertyAccess,
  buildPropertyFilter,
  getActiveProperty,
  getActivePropertyId
};
