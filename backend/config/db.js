// backend/config/db.js
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const seedInitialData = require("./seedData");

let mongoServer = null;
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
 * Migrates legacy records from 'test' database to 'hotel_pms' if target is newly initialized
 */
async function migrateLegacyTestDataIfNeeded(connection, targetDbName) {
  try {
    if (targetDbName === "test") return;
    const admin = connection.db.admin();
    const dbs = await admin.listDatabases();
    const hasTest = dbs.databases.some((d) => d.name === "test");
    if (!hasTest) return;

    const targetDb = connection.client.db(targetDbName);
    const targetUserCount = await targetDb.collection("users").countDocuments();

    // If target database already has user documents, no migration needed
    if (targetUserCount > 0) return;

    const sourceDb = connection.client.db("test");
    const sourceCollections = await sourceDb.listCollections().toArray();
    console.log(`[DB MIGRATION] Migrating legacy documents from 'test' to '${targetDbName}'...`);

    for (const col of sourceCollections) {
      const count = await sourceDb.collection(col.name).countDocuments();
      if (count > 0) {
        const docs = await sourceDb.collection(col.name).find({}).toArray();
        const existingInTarget = await targetDb.collection(col.name).countDocuments();
        if (existingInTarget === 0) {
          await targetDb.collection(col.name).insertMany(docs);
          console.log(`[DB MIGRATION] Migrated ${count} document(s) in collection: ${col.name}`);
        }
      }
    }
    console.log(`[DB MIGRATION] Migration to '${targetDbName}' completed successfully.`);
  } catch (err) {
    console.warn(`[DB MIGRATION] Notice (non-fatal): ${err.message}`);
  }
}

/**
 * Connects to local persistent MongoDB using WiredTiger on disk (backend/.mongo-data)
 */
async function connectLocalPersistentDB(targetDbName) {
  const persistentDbPath = path.resolve(__dirname, "../.mongo-data");
  if (!fs.existsSync(persistentDbPath)) {
    fs.mkdirSync(persistentDbPath, { recursive: true });
  }

  const activeUriFile = path.join(persistentDbPath, ".active-uri");

  // If another process is already running mongod on persistentDbPath, attach to it
  if (fs.existsSync(activeUriFile)) {
    try {
      const savedUri = fs.readFileSync(activeUriFile, "utf-8").trim();
      if (savedUri) {
        // Build URI for targetDbName from saved base URI
        const baseUri = savedUri.split("?")[0].replace(/\/([^\/]*)$/, `/${targetDbName}`);
        const testConn = await mongoose.createConnection(baseUri, {
          serverSelectionTimeoutMS: 2000,
          connectTimeoutMS: 2000
        }).asPromise();

        await testConn.close();
        await mongoose.connect(baseUri);
        console.log(`[DB] Attached to running Local Persistent MongoDB at ${sanitizeUri(baseUri)}`);
        console.log(`[DB] Active Database: ${mongoose.connection.name}`);
        await migrateLegacyTestDataIfNeeded(mongoose.connection, targetDbName);
        return;
      }
    } catch (err) {
      // Stale active-uri file, remove it safely
      try { fs.unlinkSync(activeUriFile); } catch (e) {}
    }
  }

  // Prevent multiple MongoMemoryServer instances in the same process
  if (!mongoServer) {
    mongoServer = await MongoMemoryServer.create({
      instance: {
        dbPath: persistentDbPath,
        storageEngine: "wiredTiger",
        dbName: targetDbName
      }
    });
  }

  const memoryUri = mongoServer.getUri(targetDbName);
  try {
    fs.writeFileSync(activeUriFile, memoryUri, "utf-8");
  } catch (e) {}

  await mongoose.connect(memoryUri);

  console.log(`[DB] Connected to Local Persistent MongoDB (WiredTiger at ${persistentDbPath})`);
  console.log(`[DB] Active Database: ${mongoose.connection.name}`);

  await migrateLegacyTestDataIfNeeded(mongoose.connection, targetDbName);
  await seedInitialData();
}

/**
 * Main database connection entrypoint
 */
const connectDB = async ({ skipInitialization = false } = {}) => {
  // If already connected, return existing connection
  if (mongoose.connection.readyState === 1) {
    return;
  }
  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    const rawUri = process.env.MONGO_URI ? process.env.MONGO_URI.trim() : "";
    const targetDbName = getTargetDatabaseName(rawUri);

    const rawMode = (process.env.DB_MODE || "").trim().toLowerCase();
    const isExplicitLocal =
      rawMode === "local" ||
      (process.env.USE_IN_MEMORY_DB || "").trim().toLowerCase() === "true" ||
      (process.env.USE_LOCAL_DB || "").trim().toLowerCase() === "true";
    const isVercel = Boolean(process.env.VERCEL);

    if (isVercel && (!rawUri || isExplicitLocal)) {
      throw new Error("Vercel requires MONGO_URI and cannot use local or in-memory database mode");
    }

    // Mode 1: Explicit Local Persistent Database
    if (isExplicitLocal) {
      console.log("[DB] DB_MODE=local configured. Connecting to local persistent storage...");
      await connectLocalPersistentDB(targetDbName);
      return;
    }

    // Mode 2: Remote MongoDB Atlas (or explicit URI)
    if (rawUri && !rawUri.includes("localhost") && !rawUri.includes("127.0.0.1")) {
      try {
        console.log(`[DB] Connecting to MongoDB Atlas (${sanitizeUri(rawUri)})...`);
        await mongoose.connect(rawUri, { serverSelectionTimeoutMS: 5000 });
        console.log(`[DB] MongoDB Atlas connected successfully. Active Database: ${mongoose.connection.name}`);
        if (!skipInitialization) {
          await seedInitialData();
        }
        return;
      } catch (err) {
        console.error(`[DB ERROR] MongoDB Atlas connection failed: ${err.message}`);

        const allowFallback = (process.env.ALLOW_LOCAL_FALLBACK || "").trim().toLowerCase() === "true";
        if (isVercel || !allowFallback) {
          console.error("[DB ERROR] Silent database switching is disabled to prevent data loss.");
          console.error("[DB ERROR] To run locally with full persistence, set DB_MODE=local in backend/.env.");
          throw err;
        }

        console.warn("[DB WARN] ALLOW_LOCAL_FALLBACK=true. Falling back to local persistent MongoDB...");
        await connectLocalPersistentDB(targetDbName);
        return;
      }
    }

    // Mode 3: Local MongoDB Server instance (localhost/127.0.0.1)
    if (rawUri && (rawUri.includes("localhost") || rawUri.includes("127.0.0.1"))) {
      try {
        console.log(`[DB] Connecting to local MongoDB instance (${sanitizeUri(rawUri)})...`);
        await mongoose.connect(rawUri, { serverSelectionTimeoutMS: 4000 });
        console.log(`[DB] Local MongoDB connected successfully. Active Database: ${mongoose.connection.name}`);
        if (!skipInitialization) {
          await seedInitialData();
        }
        return;
      } catch (err) {
        console.error(`[DB ERROR] Local MongoDB instance connection failed: ${err.message}`);
        throw err;
      }
    }

    if (isVercel) {
      throw new Error("Vercel requires a reachable MongoDB URI in MONGO_URI");
    }

    // Mode 4: Default fallback when no URI is provided
    console.log("[DB] No remote MONGO_URI configured. Initializing local persistent MongoDB...");
    await connectLocalPersistentDB(targetDbName);
  })();

  try {
    await connectionPromise;
  } finally {
    connectionPromise = null;
  }
};

// Graceful cleanup
const cleanUp = async () => {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (mongoServer) {
      await mongoServer.stop();
      mongoServer = null;
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
  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null;
  }
};

connectDB.getTargetDatabaseName = getTargetDatabaseName;
connectDB.sanitizeUri = sanitizeUri;

module.exports = connectDB;