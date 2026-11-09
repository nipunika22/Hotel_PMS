module.exports = function rejectDepartmentAdmin(req, res, next) {
  if (req.user?.role === "admin" && req.user.departmentAdmin === true) {
    return res.status(403).json({ error: "Department administrators cannot access this account or management operation" });
  }
  return next();
};