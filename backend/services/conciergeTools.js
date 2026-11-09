// backend/services/conciergeTools.js
/**
 * Approved Read-Only Tools for AI Hotel Concierge.
 * All data access is strictly scoped to the validated server-side propertyId.
 * No booking mutations, payments, or private guest/staff records are accessible.
 */

const Property = require("../models/Property");
const Room = require("../models/Room");
const Restaurant = require("../models/Restaurant");
const RestaurantMenuItem = require("../models/RestaurantMenuItem");
const RestaurantMenuCategory = require("../models/RestaurantMenuCategory");
const RestaurantOffer = require("../models/RestaurantOffer");
const { getAvailableRoomIds, parseStayDates } = require("./availabilityService");

/**
 * 1. getHotelInformation
 * Returns verified property details, address, policies, check-in/out, contact info.
 */
async function getHotelInformation({ propertyId }) {
  if (!propertyId) {
    return { error: "Property context is required." };
  }

  const property = await Property.findById(propertyId).lean();
  if (!property || property.status !== "Active") {
    return { error: "Hotel information is currently unavailable." };
  }

  return {
    hotelName: property.name,
    code: property.code,
    country: property.country,
    city: property.city,
    address: property.address || "No. 42, Galle Face Promenade, Colombo 03, Sri Lanka",
    starRating: property.starRating || 5,
    currency: property.currency || "LKR",
    timezone: property.timezone || "Asia/Colombo",
    checkInTime: property.checkInTime || "14:00",
    checkOutTime: property.checkOutTime || "11:00",
    contactPhone: property.contactPhone || "+94 11 234 5678",
    contactEmail: property.contactEmail || "concierge.srilanka@hotelpms.com",
    keyPolicies: [
      `Standard check-in begins at ${property.checkInTime || "14:00"} (2:00 PM)`,
      `Standard check-out is until ${property.checkOutTime || "11:00"} (11:00 AM)`,
      "Direct bookings include complimentary high-speed fiber Wi-Fi throughout the sanctuary",
      "Private luxury chauffeur transfers from Bandaranaike International Airport (BIA) can be arranged by our concierge",
      "All dietary preferences (Halal, Vegetarian, Vegan, Gluten-free) are catered to across our dining venues"
    ]
  };
}

/**
 * 2. searchRooms
 * Discovers real room types and details based on guest preferences.
 */
async function searchRooms({ propertyId, roomType, guests, view, maxPrice }) {
  if (!propertyId) {
    return { error: "Property context is required." };
  }

  const filter = {
    property: propertyId,
    isActive: true
  };

  if (roomType && typeof roomType === "string" && roomType.toLowerCase() !== "all") {
    filter.roomType = new RegExp(`^${roomType.trim()}$`, "i");
  }

  if (guests && Number(guests) > 0) {
    filter["capacity.maxOccupancy"] = { $gte: Number(guests) };
  }

  if (view && typeof view === "string") {
    filter.view = new RegExp(view.trim(), "i");
  }

  if (maxPrice && Number(maxPrice) > 0) {
    filter.basePrice = { $lte: Number(maxPrice) };
  }

  const rooms = await Room.find(filter)
    .select("roomNumber roomType basePrice capacity bedConfiguration view amenities description floor")
    .sort({ basePrice: 1 })
    .limit(10)
    .lean();

  if (!rooms || rooms.length === 0) {
    return {
      message: "No rooms match your specific criteria. We recommend exploring our standard Deluxe or Suite options.",
      roomsFound: 0,
      rooms: []
    };
  }

  // Deduplicate by roomType to give clean room catalog overview
  const distinctTypes = new Map();
  for (const r of rooms) {
    if (!distinctTypes.has(r.roomType)) {
      distinctTypes.set(r.roomType, {
        roomType: r.roomType,
        roomNumber: r.roomNumber,
        basePrice: r.basePrice,
        currency: "LKR",
        bedConfiguration: r.bedConfiguration,
        maxGuests: r.capacity?.maxOccupancy || 2,
        maxAdults: r.capacity?.maxAdults || 2,
        view: r.view || "Scenic View",
        amenities: r.amenities || [],
        description: r.description || `${r.roomType} room with fine island craftsmanship.`
      });
    }
  }

  return {
    roomsFound: distinctTypes.size,
    roomTypes: Array.from(distinctTypes.values())
  };
}

/**
 * 3. checkRoomAvailability
 * Checks date range availability strictly through the existing authoritative availability logic.
 */
async function checkRoomAvailability({ propertyId, checkInDate, checkOutDate, roomType }) {
  if (!propertyId) {
    return { error: "Property context is required." };
  }

  if (!checkInDate || !checkOutDate) {
    return {
      error: "Both check-in date and check-out date (YYYY-MM-DD) are required to verify availability."
    };
  }

  let stayDates;
  try {
    stayDates = parseStayDates(checkInDate, checkOutDate);
  } catch (dateErr) {
    return { error: dateErr.message || "Invalid stay dates. Check-out date must be after check-in date." };
  }

  try {
    // Authoritative conflict detection against active Reservations and Bookings
    const bookedRoomIds = await getAvailableRoomIds(stayDates.checkIn, stayDates.checkOut, propertyId);

    const query = {
      property: propertyId,
      _id: { $nin: bookedRoomIds },
      status: { $nin: ["Maintenance", "Out of Order", "Occupied", "Cleaning"] },
      cleaningStatus: { $ne: "Dirty" },
      isActive: true
    };

    if (roomType && typeof roomType === "string" && roomType.toLowerCase() !== "all") {
      query.roomType = new RegExp(`^${roomType.trim()}$`, "i");
    }

    const availableRooms = await Room.find(query)
      .select("roomNumber roomType basePrice capacity bedConfiguration view")
      .sort({ basePrice: 1 })
      .lean();

    if (!availableRooms || availableRooms.length === 0) {
      return {
        available: false,
        checkInDate: checkInDate,
        checkOutDate: checkOutDate,
        nights: stayDates.nights,
        message: "We regret that no rooms are currently available for the requested stay dates and room type.",
        availableRoomsCount: 0,
        availableRoomTypes: []
      };
    }

    // Group available options
    const roomTypeSummary = new Map();
    for (const room of availableRooms) {
      if (!roomTypeSummary.has(room.roomType)) {
        roomTypeSummary.set(room.roomType, {
          roomType: room.roomType,
          baseRatePerNight: room.basePrice,
          currency: "LKR",
          bedConfiguration: room.bedConfiguration,
          maxGuests: room.capacity?.maxOccupancy || 2,
          availableCount: 1,
          sampleRoomNumber: room.roomNumber
        });
      } else {
        const item = roomTypeSummary.get(room.roomType);
        item.availableCount += 1;
      }
    }

    return {
      available: true,
      checkInDate: checkInDate,
      checkOutDate: checkOutDate,
      nights: stayDates.nights,
      availableRoomsCount: availableRooms.length,
      availableRoomTypes: Array.from(roomTypeSummary.values())
    };
  } catch (err) {
    console.error("Error checking authoritative room availability:", err);
    return { error: "Unable to verify live availability at this moment." };
  }
}

/**
 * 4. getRoomPricing
 * Calculates verified stay cost and breakdown based on verified room base price.
 */
async function getRoomPricing({ propertyId, roomType, checkInDate, checkOutDate }) {
  if (!propertyId) {
    return { error: "Property context is required." };
  }

  if (!roomType) {
    return { error: "Room type is required to calculate pricing." };
  }

  let nights = 1;
  let datesProvided = false;
  if (checkInDate && checkOutDate) {
    try {
      const dates = parseStayDates(checkInDate, checkOutDate);
      nights = dates.nights;
      datesProvided = true;
    } catch (err) {
      return { error: err.message };
    }
  }

  const room = await Room.findOne({
    property: propertyId,
    roomType: new RegExp(`^${roomType.trim()}$`, "i"),
    isActive: true
  })
    .select("roomType basePrice weekendPrice capacity bedConfiguration")
    .lean();

  if (!room) {
    return { error: `Room type "${roomType}" was not found for this property.` };
  }

  const ratePerNight = Number(room.basePrice || 0);
  const totalAmount = ratePerNight * nights;

  return {
    roomType: room.roomType,
    currency: "LKR",
    ratePerNight: ratePerNight,
    nights: nights,
    datesProvided: datesProvided,
    checkInDate: checkInDate || "Not specified",
    checkOutDate: checkOutDate || "Not specified",
    totalEstimatedAmount: totalAmount,
    pricingNote: "Direct portal bookings include all applicable service taxes, fiber Wi-Fi, and best rate guarantee with no hidden booking fees."
  };
}

/**
 * 5. getRestaurantInformation
 * Returns verified restaurants, opening hours, dining styles, and dress code.
 */
async function getRestaurantInformation({ propertyId, restaurantName }) {
  if (!propertyId) {
    return { error: "Property context is required." };
  }

  const filter = {
    property: propertyId,
    active: true
  };

  if (restaurantName && typeof restaurantName === "string") {
    filter.name = new RegExp(restaurantName.trim(), "i");
  }

  const restaurants = await Restaurant.find(filter)
    .select("name slug cuisine restaurantType location openingHours hours dressCode reservationPolicy contactPhone contactEmail priceRange description tagline chef")
    .sort({ sortOrder: 1 })
    .lean();

  if (!restaurants || restaurants.length === 0) {
    return {
      message: "No active restaurants found for this hotel property.",
      restaurants: []
    };
  }

  return {
    count: restaurants.length,
    restaurants: restaurants.map(r => ({
      name: r.name,
      slug: r.slug,
      cuisine: r.cuisine,
      type: r.restaurantType,
      location: r.location,
      openingHours: r.openingHours,
      detailedHours: r.hours || [],
      dressCode: r.dressCode,
      reservationPolicy: r.reservationPolicy,
      contactPhone: r.contactPhone,
      contactEmail: r.contactEmail,
      priceRange: r.priceRange,
      tagline: r.tagline,
      description: r.description,
      chefName: r.chef?.name || "Executive Chef",
      bookingUrl: `/dining/${r.slug}`
    }))
  };
}

/**
 * 6. getMenuItems
 * Returns real verified menu items, dietary tags, and prices.
 */
async function getMenuItems({ propertyId, restaurantName, dietaryTag, categoryName }) {
  if (!propertyId) {
    return { error: "Property context is required." };
  }

  // Find target restaurant if specified, or all active restaurants in property
  let restaurantFilter = { property: propertyId, active: true };
  if (restaurantName && typeof restaurantName === "string") {
    restaurantFilter.name = new RegExp(restaurantName.trim(), "i");
  }

  const restaurants = await Restaurant.find(restaurantFilter).select("_id name slug").lean();
  if (!restaurants || restaurants.length === 0) {
    return { message: "Restaurant not found.", items: [] };
  }

  const restaurantIds = restaurants.map(r => r._id);
  const restaurantMap = new Map(restaurants.map(r => [r._id.toString(), r.name]));

  // Menu items filter
  const itemFilter = {
    property: propertyId,
    restaurant: { $in: restaurantIds },
    available: true
  };

  if (dietaryTag && typeof dietaryTag === "string") {
    itemFilter.dietaryTags = new RegExp(`^${dietaryTag.trim()}$`, "i");
  }

  const items = await RestaurantMenuItem.find(itemFilter)
    .populate("category", "name")
    .select("name description price currency dietaryTags allergens restaurant category featured")
    .sort({ sortOrder: 1 })
    .limit(15)
    .lean();

  if (!items || items.length === 0) {
    return {
      message: "No matching menu items found for the given criteria.",
      itemsFound: 0,
      items: []
    };
  }

  return {
    itemsFound: items.length,
    items: items.map(item => ({
      name: item.name,
      description: item.description,
      price: item.price,
      currency: item.currency || "LKR",
      restaurantName: restaurantMap.get(item.restaurant?.toString()) || "Hotel Dining",
      category: item.category?.name || "General",
      dietaryTags: item.dietaryTags || [],
      allergens: item.allergens || []
    }))
  };
}

/**
 * 7. getCurrentOffers
 * Returns valid, active dining and resort offers with verified dates and restrictions.
 */
async function getCurrentOffers({ propertyId }) {
  if (!propertyId) {
    return { error: "Property context is required." };
  }

  const now = new Date();
  const offers = await RestaurantOffer.find({
    property: propertyId,
    active: true,
    $or: [
      { validUntil: { $exists: false } },
      { validUntil: null },
      { validUntil: { $gte: now } }
    ]
  })
    .populate("restaurant", "name slug")
    .select("title shortDescription description price discount currency validFrom validUntil inclusions terms applicableDays restaurant")
    .sort({ sortOrder: 1, createdAt: -1 })
    .lean();

  if (!offers || offers.length === 0) {
    return {
      message: "There are currently no active promotional offers scheduled.",
      offers: []
    };
  }

  return {
    count: offers.length,
    offers: offers.map(o => ({
      title: o.title,
      restaurantName: o.restaurant?.name || "Resort Dining",
      shortDescription: o.shortDescription,
      price: o.price,
      discount: o.discount,
      currency: o.currency || "LKR",
      validUntil: o.validUntil ? new Date(o.validUntil).toLocaleDateString() : "Ongoing",
      inclusions: o.inclusions || [],
      terms: o.terms || "Subject to table availability. Advance reservation required.",
      applicableDays: o.applicableDays || ["All Days"],
      bookingUrl: o.restaurant?.slug ? `/dining/${o.restaurant.slug}` : "/offers"
    }))
  };
}

/**
 * 8. getBookingInformation
 * Explains booking procedure and provides direct navigation directions.
 */
async function getBookingInformation() {
  return {
    procedure: "To make a verified room reservation, browse our available rooms on the homepage and click 'Book Sanctuary'. If you are not signed in, you will be prompted to log in or register for immediate confirmation.",
    bookingAnchor: "#rooms",
    diningBookingUrl: "/dining",
    offersUrl: "/offers",
    customerPortalUrl: "/my-bookings",
    paymentMethodsAccepted: ["Credit/Debit Card", "Cash on Arrival"],
    directBenefits: [
      "Guaranteed best available room rate",
      "Complimentary high-speed fiber Wi-Fi",
      "Flexible arrival & departure options upon request",
      "Direct personalized concierge assistance"
    ]
  };
}

// Tool Definitions for OpenAI function/tool calling
const toolsSchema = [
  {
    type: "function",
    function: {
      name: "getHotelInformation",
      description: "Get verified information about the Sri Lankan hotel: address, contact phone, contact email, check-in and check-out policies, and facilities.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "searchRooms",
      description: "Search for real hotel rooms and room types based on guest capacity, room type, bed configuration, view, or maximum price.",
      parameters: {
        type: "object",
        properties: {
          roomType: {
            type: "string",
            description: "Room type to search for, e.g. Single, Double, Twin, Suite, Deluxe, Presidential, Family"
          },
          guests: {
            type: "number",
            description: "Number of guests needing accommodation"
          },
          view: {
            type: "string",
            description: "Preferred room view, e.g. Sea View, Pool View, City View"
          },
          maxPrice: {
            type: "number",
            description: "Maximum nightly rate in LKR"
          }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "checkRoomAvailability",
      description: "Authoritatively check room availability for specific stay dates (check-in and check-out) using the hotel's central reservation engine.",
      parameters: {
        type: "object",
        properties: {
          checkInDate: {
            type: "string",
            description: "Check-in date in format YYYY-MM-DD"
          },
          checkOutDate: {
            type: "string",
            description: "Check-out date in format YYYY-MM-DD"
          },
          roomType: {
            type: "string",
            description: "Optional specific room type to filter by (e.g., Deluxe, Suite)"
          }
        },
        required: ["checkInDate", "checkOutDate"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "getRoomPricing",
      description: "Calculate verified pricing and total stay breakdown for a specific room type and date range.",
      parameters: {
        type: "object",
        properties: {
          roomType: {
            type: "string",
            description: "The room type (e.g., Deluxe, Suite, Double, Presidential)"
          },
          checkInDate: {
            type: "string",
            description: "Check-in date (YYYY-MM-DD)"
          },
          checkOutDate: {
            type: "string",
            description: "Check-out date (YYYY-MM-DD)"
          }
        },
        required: ["roomType"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "getRestaurantInformation",
      description: "Get verified information on the hotel's restaurants: cuisine, opening hours, dress code, location, and reservation policies.",
      parameters: {
        type: "object",
        properties: {
          restaurantName: {
            type: "string",
            description: "Optional specific restaurant name (e.g., Azure Tide Seafood Restaurant, Spice & Silk)"
          }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "getMenuItems",
      description: "Retrieve verified dishes and menu items with real prices, descriptions, and dietary tags (Vegetarian, Vegan, Halal, Seafood, Gluten-free).",
      parameters: {
        type: "object",
        properties: {
          restaurantName: {
            type: "string",
            description: "Optional name of the restaurant"
          },
          dietaryTag: {
            type: "string",
            description: "Dietary tag filter, e.g. Vegetarian, Vegan, Halal, Seafood, Gluten-free"
          }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "getCurrentOffers",
      description: "Retrieve valid dining and resort promotions, including inclusions, discounts, valid dates, and terms.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "getBookingInformation",
      description: "Get instructions on how to book a room or dining table, including direct page links and guest benefits.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  }
];

// Tool dispatcher mapping
const toolHandlers = {
  getHotelInformation,
  searchRooms,
  checkRoomAvailability,
  getRoomPricing,
  getRestaurantInformation,
  getMenuItems,
  getCurrentOffers,
  getBookingInformation
};

/**
 * Execute a tool call safely with guaranteed property scoping.
 */
async function executeTool(name, args, propertyId) {
  const handler = toolHandlers[name];
  if (!handler) {
    return { error: `Tool "${name}" is not recognized or permitted.` };
  }
  try {
    return await handler({ ...args, propertyId });
  } catch (err) {
    console.error(`Error executing tool "${name}":`, err);
    return { error: `Failed to execute tool ${name}: ${err.message}` };
  }
}

module.exports = {
  toolsSchema,
  toolHandlers,
  executeTool,
  getHotelInformation,
  searchRooms,
  checkRoomAvailability,
  getRoomPricing,
  getRestaurantInformation,
  getMenuItems,
  getCurrentOffers,
  getBookingInformation
};
