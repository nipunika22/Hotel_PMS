// backend/middleware/auth.js
const jwt = require("jsonwebtoken");
const User = require("../models/User");

exports.protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({ error: "Not authorized to access this route" });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select("-password");
      
      if (!req.user) {
        return res.status(401).json({ error: "User not found" });
      }

      if (req.user.status && req.user.status !== "Active") {
        return res.status(403).json({ error: "This account is not active" });
      }

      next();
    } catch (err) {
      return res.status(401).json({ error: "Invalid token" });
    }
  } catch (err) {
    res.status(500).json({ error: "Server error in authentication" });
  }
};

exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: "Not authorized to access this route" 
      });
    }

    if (req.user.role === "super_admin") return next();
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: `User role ${req.user.role} is not authorized to access this route` 
      });
    }
    next();
  };
};

// Optional authentication middleware - attaches req.user if valid token present, but does not block
exports.optionalAuth = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = await User.findById(decoded.id).select("-password");
      } catch (err) {
        // Token invalid or expired - proceed as unauthenticated
      }
    }
    next();
  } catch (err) {
    next();
  }
};

// Standard aliases for authorization middleware
exports.requireAuth = exports.protect;
exports.requireRole = exports.authorize;
exports.requirePermission = exports.authorize;
