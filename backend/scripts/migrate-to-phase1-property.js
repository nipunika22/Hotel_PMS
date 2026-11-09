// backend/scripts/migrate-to-phase1-property.js
/**
 * Phase 1 Hotel Chain & Property Data Migration Script
 * 
 * Safely associates all existing single-property operational data with:
 * - Exactly ONE Hotel Chain: "Grand Horizon Hospitality Group" (code: "GHHG")
 * - Exactly ONE Active Sri Lankan Property: "Sri Lanka Main Property" (code: "SL-MAIN")
 * 
 * Idempotent: safe to run multiple times with zero data duplication.
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const mongoose = require("mongoose");

const HotelChain = require("../models/HotelChain");
const Property = require("../models/Property");
const Room = require("../models/Room");
const Reservation = require("../models/Reservation");
const Booking = require("../models/Booking");
const HousekeepingTask = require("../models/HousekeepingTask");
const MaintenanceTicket = require("../models/MaintenanceTicket");
const LostItem = require("../models/LostItem");
const Invoice = require("../models/Invoice");
const Payment = require("../models/Payment");
const GuestExpense = require("../models/GuestExpense");
const User = require("../models/User");

async function runMigration() {
  console.log("\n============================================================");
  console.log("  PHASE 1: HOTEL CHAIN & SRI LANKAN PROPERTY MIGRATION");
  console.log("============================================================\n");

  const results = {
    chain: null,
    property: null,
    roomsMigrated: 0,
    reservationsMigrated: 0,
    bookingsMigrated: 0,
    housekeepingTasksMigrated: 0,
    maintenanceTicketsMigrated: 0,
    lostItemsMigrated: 0,
    invoicesMigrated: 0,
    paymentsMigrated: 0,
    guestExpensesMigrated: 0,
    staffUsersMigrated: 0,
    indexesUpdated: false
  };

  // 1. Find or create Hotel Chain
  let chain = await HotelChain.findOne({ code: "GHHG" });
  if (!chain) {
    chain = await HotelChain.create({
      name: "Grand Horizon Hospitality Group",
      code: "GHHG",
      description: "Premier luxury hospitality group and hotel chain foundation",
      status: "Active"
    });
    console.log(`✅ Created default Hotel Chain: "${chain.name}" [${chain.code}]`);
  } else {
    console.log(`ℹ️ Existing Hotel Chain verified: "${chain.name}" [${chain.code}]`);
  }
  results.chain = chain;

  // 2. Find or create the ONE active Sri Lankan Property
  let property = await Property.findOne({ code: "SL-MAIN" });
  if (!property) {
    property = await Property.create({
      chain: chain._id,
      name: "Sri Lanka Main Property",
      code: "SL-MAIN",
      country: "Sri Lanka",
      countryCode: "LK",
      city: "Colombo",
      address: "100 Galle Face Promenade, Colombo 03, Sri Lanka",
      timezone: "Asia/Colombo",
      currency: "LKR",
      status: "Active",
      contactPhone: "+94 11 234 5678",
      contactEmail: "info@srilankamain.hotel.com",
      starRating: 5
    });
    console.log(`✅ Created active Sri Lankan Property: "${property.name}" [${property.code}]`);
  } else {
    console.log(`ℹ️ Existing active Property verified: "${property.name}" [${property.code}]`);
  }
  results.property = property;

  const propertyId = property._id;

  // 3. Migrate Rooms
  const roomsToUpdate = await Room.updateMany(
    { $or: [{ property: { $exists: false } }, { property: null }] },
    { $set: { property: propertyId } }
  );
  results.roomsMigrated = roomsToUpdate.modifiedCount;
  console.log(`🏠 Rooms: ${results.roomsMigrated} migrated to property.`);

  // 4. Safely migrate Room indexes: drop legacy global roomNumber_1 if exists
  try {
    const roomIndexes = await Room.collection.indexes();
    const legacyRoomNumberIndex = roomIndexes.find(
      (idx) => idx.name === "roomNumber_1" && idx.unique === true
    );
    if (legacyRoomNumberIndex) {
      console.log("⚠️ Found legacy global unique index 'roomNumber_1'. Dropping...");
      await Room.collection.dropIndex("roomNumber_1");
      console.log("✅ Successfully dropped legacy global unique index 'roomNumber_1'.");
    }
    // Ensure compound index exists
    await Room.syncIndexes();
    results.indexesUpdated = true;
    console.log("✅ Room collection indexes synchronized: compound unique { property: 1, roomNumber: 1 } active.");
  } catch (idxErr) {
    console.warn("Notice while synchronizing Room indexes (non-fatal):", idxErr.message);
  }

  // 5. Migrate Reservations
  const reservationsToUpdate = await Reservation.updateMany(
    { $or: [{ property: { $exists: false } }, { property: null }] },
    { $set: { property: propertyId } }
  );
  results.reservationsMigrated = reservationsToUpdate.modifiedCount;
  console.log(`📅 Reservations: ${results.reservationsMigrated} migrated to property.`);

  // 6. Migrate Bookings (legacy compatibility projection)
  const bookingsToUpdate = await Booking.updateMany(
    { $or: [{ property: { $exists: false } }, { property: null }] },
    { $set: { property: propertyId } }
  );
  results.bookingsMigrated = bookingsToUpdate.modifiedCount;
  console.log(`📑 Bookings: ${results.bookingsMigrated} migrated to property.`);

  // 7. Migrate Housekeeping Tasks
  const hkTasksToUpdate = await HousekeepingTask.updateMany(
    { $or: [{ property: { $exists: false } }, { property: null }] },
    { $set: { property: propertyId } }
  );
  results.housekeepingTasksMigrated = hkTasksToUpdate.modifiedCount;
  console.log(`🧹 Housekeeping Tasks: ${results.housekeepingTasksMigrated} migrated to property.`);

  // 8. Migrate Maintenance Tickets
  const ticketsToUpdate = await MaintenanceTicket.updateMany(
    { $or: [{ property: { $exists: false } }, { property: null }] },
    { $set: { property: propertyId } }
  );
  results.maintenanceTicketsMigrated = ticketsToUpdate.modifiedCount;
  console.log(`🔧 Maintenance Tickets: ${results.maintenanceTicketsMigrated} migrated to property.`);

  // 9. Migrate Lost Items
  const itemsToUpdate = await LostItem.updateMany(
    { $or: [{ property: { $exists: false } }, { property: null }] },
    { $set: { property: propertyId } }
  );
  results.lostItemsMigrated = itemsToUpdate.modifiedCount;
  console.log(`📦 Lost & Found Items: ${results.lostItemsMigrated} migrated to property.`);

  // 10. Migrate Invoices
  const invoicesToUpdate = await Invoice.updateMany(
    { $or: [{ property: { $exists: false } }, { property: null }] },
    { $set: { property: propertyId } }
  );
  results.invoicesMigrated = invoicesToUpdate.modifiedCount;
  console.log(`💳 Invoices: ${results.invoicesMigrated} migrated to property.`);

  // 11. Migrate Payments
  const paymentsToUpdate = await Payment.updateMany(
    { $or: [{ property: { $exists: false } }, { property: null }] },
    { $set: { property: propertyId } }
  );
  results.paymentsMigrated = paymentsToUpdate.modifiedCount;
  console.log(`💵 Payments: ${results.paymentsMigrated} migrated to property.`);

  // 12. Migrate Guest Expenses
  const expensesToUpdate = await GuestExpense.updateMany(
    { $or: [{ property: { $exists: false } }, { property: null }] },
    { $set: { property: propertyId } }
  );
  results.guestExpensesMigrated = expensesToUpdate.modifiedCount;
  console.log(`🍽️ Guest Expenses: ${results.guestExpensesMigrated} migrated to property.`);

  // 13. Migrate Staff / Admin Users
  const staffToUpdate = await User.updateMany(
    { 
      role: { $in: ["admin", "staff", "manager", "finance", "housekeeping", "maintenance"] },
      $or: [{ property: { $exists: false } }, { property: null }]
    },
    { 
      $set: { 
        property: propertyId,
        allowedProperties: [propertyId]
      } 
    }
  );
  results.staffUsersMigrated = staffToUpdate.modifiedCount;
  console.log(`👥 Staff/Admin Accounts: ${results.staffUsersMigrated} assigned to property.`);

  console.log("\n============================================================");
  console.log("  MIGRATION COMPLETE — ZERO DATA DELETED — IDEMPOTENT");
  console.log("============================================================\n");

  return results;
}

if (require.main === module) {
  (async () => {
    try {
      const connectDB = require("../config/db");
      await connectDB();
      await runMigration();
      process.exit(0);
    } catch (err) {
      console.error("Migration failed:", err);
      process.exit(1);
    }
  })();
}

module.exports = runMigration;
