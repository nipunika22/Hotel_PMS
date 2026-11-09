// backend/routes/authRoutes.js
const express = require("express");
const router = express.Router();
const { 
  register, 
  login, 
  logout,
  getMe, 
  updateProfile, 
  changePassword,
  createUser, 
  getUsers 
} = require("../controllers/authController");
const { protect, authorize } = require("../middleware/auth");
const rejectDepartmentAdmin = require("../middleware/rejectDepartmentAdmin");

// Public routes
router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);

// Authenticated user profile routes
router.get("/me", protect, getMe);
router.get("/profile", protect, getMe);
router.put("/profile", protect, updateProfile);
router.put("/password", protect, changePassword);
router.put("/change-password", protect, changePassword);

// Admin-only user management routes
router.post("/users", protect, authorize("admin"), rejectDepartmentAdmin, createUser);
router.get("/users", protect, authorize("admin"), rejectDepartmentAdmin, getUsers);

module.exports = router;
