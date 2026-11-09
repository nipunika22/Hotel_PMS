const { protect } = require("./auth");

function requireActiveSuperAdmin(req, res, next) {
  if (!req.user || req.user.role !== "super_admin") {
    return res.status(403).json({ error: "Super Admin access is required" });
  }
  if (req.user.status !== "Active") {
    return res.status(403).json({ error: "This Super Admin account is not active" });
  }
  return next();
}

module.exports = { protect, requireActiveSuperAdmin };
