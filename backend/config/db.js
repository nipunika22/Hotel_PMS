// backend/config/db.js
const mongoose = require("mongoose");
const seedInitialData = require("./seedData");

let connectionPromise = null;

/**
 * Safely masks MongoDB connection string credentials for log outputs
 */
function sanitizeUri(uri) {
  if (!uri) return "";
  return uri.replace(/\/\/[^:]+:[^@]+@/, "//***:***@");
}

/**
 * Extracts database name from MongoDB URI, defaulting to 'hotel_pms'
 */
function getTargetDatabaseName(uri) {
  if (!uri) return "hotel_pms";
  try {
    const withoutProtocol = uri.split("://")[1] || uri;
    const afterSlash = withoutProtocol.split("/")[1];
    if (afterSlash) {
      const dbName = afterSlash.split("?")[0].trim();
      if (dbName && dbName !== "test") return dbName;
    }
  } catch (e) {
    // fallback to hotel_pms
  }
  return "hotel_pms";
}

/**
 * Main database connection entrypoint - MongoDB Atlas Exclusive
 */
const connectDB = async ({ skipInitialization = false } = {}) => {
  // If already connected, reuse existing connection
  if (mongoose.connection.readyState === 1) {
    return;
  }
  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    const rawMode = (process.env.DB_MODE || "").trim().toLowerCase();
    const isVercel = Boolean(process.env.VERCEL);
    const isTest = process.env.NODE_ENV === "test";

    // Prevent accidental local database configurations
    if (rawMode === "local" || process.env.USE_LOCAL_DB === "true") {
      throw new Error(
        "Invalid configuration: Local MongoDB mode is deprecated and removed. The application now connects exclusively to MongoDB Atlas. Please set DB_MODE=atlas in backend/.env."
      );
    }

    if (!rawMode && !isVercel && !isTest) {
      throw new Error(
        "Invalid configuration: DB_MODE environment variable is required and must be set to 'atlas'."
      );
    }

    if (rawMode && rawMode !== "atlas") {
      throw new Error(
        `Invalid configuration: DB_MODE='${rawMode}' is not supported. The application uses MongoDB Atlas exclusively. Please set DB_MODE=atlas.`
      );
    }

    if ((process.env.ALLOW_LOCAL_FALLBACK || "").trim().toLowerCase() === "true") {
      console.warn(
        "[DB WARN] ALLOW_LOCAL_FALLBACK is deprecated and permanently disabled. Local database fallback has been removed."
      );
    }

    const rawUri = process.env.MONGO_URI ? process.env.MONGO_URI.trim() : "";
    if (!rawUri) {
      throw new Error("Missing required MONGO_URI environment variable for MongoDB Atlas connection.");
    }

    const targetDbName = getTargetDatabaseName(rawUri);

    try {
      console.log(`[DB] Connecting to MongoDB Atlas (${sanitizeUri(rawUri)})...`);
      await mongoose.connect(rawUri, {
        dbName: targetDbName,
        serverSelectionTimeoutMS: 5000
      });

      console.log("[DB] MongoDB Atlas connected successfully.");
      console.log(`[DB] Active Database: ${mongoose.connection.name}`);

      if (!skipInitialization) {
        await seedInitialData();
      }
    } catch (err) {
      console.error(`[DB ERROR] MongoDB Atlas connection failed: ${err.message}`);
      throw err;
    }
  })();

  try {
    await connectionPromise;
  } finally {
    connectionPromise = null;
  }
};

// Graceful cleanup handlers
const cleanUp = async () => {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  } catch (e) {
    // Silent cleanup
  }
  process.exit(0);
};

process.on("SIGINT", cleanUp);
process.on("SIGTERM", cleanUp);

connectDB.stopDB = async () => {
  connectionPromise = null;
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
};

connectDB.getTargetDatabaseName = getTargetDatabaseName;
connectDB.sanitizeUri = sanitizeUri;

module.exports = connectDB;
