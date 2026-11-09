// backend/routes/aiRoutes.js
const express = require("express");
const router = express.Router();
const aiConciergeController = require("../controllers/aiConciergeController");
const { optionalAuth } = require("../middleware/auth");
const { createRateLimiter } = require("../middleware/rateLimiter");

// Limit AI chat requests to 30 per minute per IP / user
const conciergeLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: "You have sent multiple concierge messages in a short time. Please wait a moment before sending another message."
});

// POST /api/ai/concierge/chat
router.post(
  "/concierge/chat",
  conciergeLimiter,
  optionalAuth,
  aiConciergeController.chat
);

module.exports = router;
