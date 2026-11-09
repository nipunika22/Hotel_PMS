const { PERMISSIONS } = require("../config/departmentPermissions");

// Existing non-admin staff role checks remain in their route middleware. Legacy
// global admins stay compatible; Super Admin-created department admins are
// restricted to their explicitly assigned department/offer permissions.
module.exports = function requireDepartmentPermission(permission) {
  return (req, res, next) => {
    const required = Array.isArray(permission) ? permission : [permission];
    if (!required.length || required.some((item) => !PERMISSIONS.includes(item))) return res.status(500).json({ error: "Invalid department permission configuration" });
    if (req.user?.role === "super_admin") return next();
    if (req.user?.role !== "admin" || req.user.departmentAdmin !== true) return next();
    const grants = new Set([...(req.user.adminDepartments || []), ...(req.user.adminPermissions || [])]);
    if (!required.some((item) => grants.has(item))) return res.status(403).json({ error: "Your administrator account is not assigned to this department operation" });
    return next();
  };
};
