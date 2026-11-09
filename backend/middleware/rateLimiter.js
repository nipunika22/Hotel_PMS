// backend/middleware/rateLimiter.js
/**
 * In-memory sliding-window rate limiter for AI Concierge requests.
 * Tracks requests per IP address or authenticated user ID.
 */

const rateLimitBuckets = new Map();

/**
 * Creates an in-memory rate limiting middleware.
 * @param {Object} options
 * @param {number} options.windowMs - Time window in milliseconds (default: 60,000ms = 1 min)
 * @param {number} options.max - Max allowed requests per window (default: 25)
 * @param {string} options.message - Error message on limit exceed
 */
function createRateLimiter(options = {}) {
  const windowMs = options.windowMs || 60 * 1000;
  const max = options.max || 25;
  const message = options.message || "Too many concierge requests. Please wait a moment before trying again.";

  // Periodic cleanup of stale bucket records every 2 minutes
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of rateLimitBuckets.entries()) {
      const valid = timestamps.filter(t => now - t < windowMs);
      if (valid.length === 0) {
        rateLimitBuckets.delete(key);
      } else {
        rateLimitBuckets.set(key, valid);
      }
    }
  }, 2 * 60 * 1000);

  // Unref interval to not block Node process exit during testing
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return function rateLimiter(req, res, next) {
    const now = Date.now();
    // Identifier prioritizes authenticated user ID, fallback to client IP
    const clientKey = (req.user && req.user._id)
      ? `user:${req.user._id.toString()}`
      : `ip:${req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown"}`;

    const timestamps = rateLimitBuckets.get(clientKey) || [];
    const windowStart = now - windowMs;
    const recentRequests = timestamps.filter(t => t > windowStart);

    if (recentRequests.length >= max) {
      const oldestInWindow = recentRequests[0];
      const resetTimeMs = Math.ceil((oldestInWindow + windowMs - now) / 1000);
      res.setHeader("Retry-After", resetTimeMs > 0 ? resetTimeMs : 1);
      return res.status(429).json({
        success: false,
        error: message,
        retryAfterSeconds: resetTimeMs > 0 ? resetTimeMs : 1
      });
    }

    recentRequests.push(now);
    rateLimitBuckets.set(clientKey, recentRequests);
    next();
  };
}

// Reset rate limits (useful for testing)
function resetRateLimits() {
  rateLimitBuckets.clear();
}

module.exports = {
  createRateLimiter,
  resetRateLimits
};
