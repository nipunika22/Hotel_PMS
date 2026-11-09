// backend/config/seedData.js
const User = require("../models/User");
const Guest = require("../models/Guest");
const Room = require("../models/Room");
const HotelChain = require("../models/HotelChain");
const Property = require("../models/Property");

async function seedInitialData() {
  try {
    // 1. Ensure Hotel Chain exists
    let chain = await HotelChain.findOne({ code: "GHHG" });
    if (!chain) {
      chain = await HotelChain.create({
        name: "Grand Horizon Hospitality Group",
        code: "GHHG",
        status: "Active",
        description: "Premier hospitality brand operating luxury and boutique properties in South Asia."
      });
    }

    // 2. Ensure ONE active Sri Lankan Property exists
    let property = await Property.findOne({ code: "SL-MAIN" });
    if (!property) {
      property = await Property.create({
        chain: chain._id,
        name: "Sri Lanka Main Property",
        code: "SL-MAIN",
        country: "Sri Lanka",
        countryCode: "LK",
        city: "Colombo",
        address: "No. 42, Galle Face Promenade, Colombo 03, Sri Lanka",
        timezone: "Asia/Colombo",
        currency: "LKR",
        status: "Active",
        starRating: 5,
        email: "reservations@grandhorizon.lk",
        phone: "+94 11 234 5678"
      });
    }

    const defaultAccounts = [
      {
        name: "System Admin",
        email: "admin@hotel.com",
        password: "admin123",
        phone: "0771234567",
        role: "admin",
        address: "100 Executive Boulevard",
        property: property._id,
        allowedProperties: [property._id]
      },
      {
        name: "Hotel Staff",
        email: "staff@hotel.com",
        password: "Password123!",
        phone: "0771234568",
        role: "staff",
        address: "Front Desk Suite",
        property: property._id,
        allowedProperties: [property._id]
      },
      {
        name: "Guest Customer",
        email: "customer@hotel.com",
        password: "password123",
        phone: "0771234569",
        role: "customer",
        address: "123 Guest Way"
      },
      {
        name: "Financial Manager",
        email: "finance@hotel.com",
        password: "Password123!",
        phone: "0771234570",
        role: "finance",
        department: "Finance",
        jobTitle: "Head of Hotel Finance",
        address: "Executive Finance Wing",
        property: property._id,
        allowedProperties: [property._id]
      },
      {
        name: "Sir Arthur Wellington",
        email: "restart_persistent_guest@serendib.lk",
        password: "PersistentPass123!",
        phone: "+94 77 999 8888",
        role: "customer",
        address: "74 Heritage Lane, Galle"
      }
    ];

    for (const acc of defaultAccounts) {
      let existing = await User.findOne({ email: acc.email });
      if (!existing) {
        existing = await User.create(acc);
      } else if (acc.property && !existing.property) {
        existing.property = acc.property;
        if (!existing.allowedProperties || existing.allowedProperties.length === 0) {
          existing.allowedProperties = [acc.property];
        }
        await existing.save();
      }

      // If customer account, ensure a linked Guest profile exists
      if (existing.role === "customer") {
        let guest = await Guest.findOne({ email: existing.email });
        if (!guest) {
          guest = await Guest.create({
            firstName: "Guest",
            lastName: "Customer",
            email: existing.email,
            phone: existing.phone,
            user: existing._id,
            property: property._id,
            nationalIdType: "Passport",
            nationalIdNumber: "N1234567A",
            nationality: "Sri Lankan",
            address: { street: existing.address || "123 Guest Way", city: "Colombo", country: "Sri Lanka" },
            guestType: "VIP",
            totalStays: 2,
            totalSpent: 42000,
            loyaltyPoints: 350,
            status: "Active"
          });
        } else if (!guest.user) {
          guest.user = existing._id;
          await guest.save();
        }

        if (!existing.guest || existing.guest.toString() !== guest._id.toString()) {
          existing.guest = guest._id;
          await existing.save();
        }
      }
    }

    console.log("   ✅ Default accounts ready:");
    console.log("   Default demo accounts are ready.");

    const roomCount = await Room.countDocuments();
    if (roomCount === 0) {
      console.log("🌱 Seeding sample hotel rooms...");
      await Room.create([
        {
          property: property._id,
          roomNumber: "101",
          roomType: "Single",
          floor: 1,
          building: "Main",
          basePrice: 60,
          capacity: { maxAdults: 1, maxChildren: 0, maxOccupancy: 1 },
          bedConfiguration: "Single Bed",
          view: "Garden View",
          status: "Available"
        },
        {
          property: property._id,
          roomNumber: "102",
          roomType: "Double",
          floor: 1,
          building: "Main",
          basePrice: 95,
          capacity: { maxAdults: 2, maxChildren: 1, maxOccupancy: 3 },
          bedConfiguration: "Double Bed",
          view: "Pool View",
          status: "Available"
        },
        {
          property: property._id,
          roomNumber: "201",
          roomType: "Suite",
          floor: 2,
          building: "Main",
          basePrice: 180,
          capacity: { maxAdults: 2, maxChildren: 2, maxOccupancy: 4 },
          bedConfiguration: "King Bed",
          view: "Sea View",
          status: "Available"
        },
        {
          property: property._id,
          roomNumber: "202",
          roomType: "Deluxe",
          floor: 2,
          building: "Main",
          basePrice: 130,
          capacity: { maxAdults: 2, maxChildren: 1, maxOccupancy: 3 },
          bedConfiguration: "Queen Bed",
          view: "City View",
          status: "Available"
        }
      ]);
      console.log("   ✅ 4 sample rooms seeded (Rooms 101, 102, 201, 202).");
    }

    // 4. Seed luxury restaurants (Azure Tide and Spice & Silk)
    const seedRestaurantData = require("./restaurantSeed");
    await seedRestaurantData(property._id);

    // 5. Seed hotel event venues and curated events
    const seedEventData = require("./eventSeed");
    await seedEventData(property._id);
  } catch (err) {
    console.error("Seed notice (non-fatal):", err.message);
  }
}

module.exports = seedInitialData;
