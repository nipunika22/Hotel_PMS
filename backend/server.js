const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const mongoose = require("mongoose");
const connectDB = require("./config/db");

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Vercel imports the Express app instead of executing this file as the main module.
// Establish and reuse the remote database connection before property lookups run.
if (process.env.VERCEL) {
  app.use(async (req, res, next) => {
    try {
      await connectDB({ skipInitialization: true });
      return next();
    } catch (err) {
      console.error("[DB ERROR] Vercel request connection failed:", err.message);
      return res.status(503).json({ error: "Database service is temporarily unavailable. Please try again shortly." });
    }
  });
}

// Database connection readiness guard: ensure database is connected before handling requests
app.use((req, res, next) => {
  if (req.path === "/api/health" || req.path === "/") return next();
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ error: "Database service is temporarily unavailable. Please try again shortly." });
  }
  next();
});

// Property Context / Multi-Tenant Tenancy Isolation Middleware
const { propertyContext } = require("./middleware/propertyContext");
app.use(propertyContext);


// Routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/properties", require("./routes/propertyRoutes"));
app.use("/api/rooms", require("./routes/roomRoutes"));
app.use("/api/bookings", require("./routes/bookingRoutes"));
app.use("/api/payments", require("./routes/paymentRoutes"));

app.use("/api/guests", require("./routes/guestRoutes"));
app.use("/api/travel-agents", require("./routes/travelAgentRoutes"));
app.use("/api/reservations", require("./routes/reservationRoutes"));
app.use("/api/guest-expenses", require("./routes/guestExpenseRoutes"));
app.use("/api/invoices", require("./routes/invoiceRoutes"));
app.use("/api/housekeeping", require("./routes/housekeepingRoutes"));
app.use("/api/maintenance", require("./routes/maintenanceRoutes"));
app.use("/api/lost-items", require("./routes/lostItemRoutes"));
app.use("/api/restaurants", require("./routes/restaurantRoutes"));
app.use("/api/events", require("./routes/eventRoutes"));
app.use("/api/notifications", require("./routes/notificationRoutes"));
app.use("/api/ai", require("./routes/aiRoutes"));
app.use("/api/super-admin", require("./routes/superAdminRoutes"));
app.use("/api/attendance", require("./routes/attendanceRoutes"));

// Health check route
app.get("/", (req, res) => {
  res.json({ message: "Hotel Booking System API is running" });
});

// Health check
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'Server is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  connectDB().then(() => {
    const server = app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });

    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(`Port ${PORT} is already in use. Kill the running process or choose another port.`);
      } else {
        console.error("Server error:", err);
      }
      process.exit(1);
    });
  });
}

module.exports = app;
