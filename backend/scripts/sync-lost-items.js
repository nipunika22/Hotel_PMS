// backend/scripts/sync-lost-items.js
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const HousekeepingTask = require("../models/HousekeepingTask");
const { syncFromHousekeepingTask } = require("../services/lostItemService");

async function runBackfill() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB for Lost & Found backfill.");

    const tasks = await HousekeepingTask.find({
      "lostItems.0": { $exists: true }
    });

    console.log(`Found ${tasks.length} housekeeping tasks with embedded lost items.`);
    let totalSynced = 0;

    for (const task of tasks) {
      const items = await syncFromHousekeepingTask(task, task.createdBy);
      totalSynced += items.length;
    }

    console.log(`Synchronization complete. Total items processed/synced: ${totalSynced}`);
  } catch (err) {
    console.error("Backfill failed:", err);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runBackfill();
}

module.exports = runBackfill;
