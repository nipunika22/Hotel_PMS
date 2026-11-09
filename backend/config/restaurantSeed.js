// backend/config/restaurantSeed.js
const Restaurant = require("../models/Restaurant");
const RestaurantTable = require("../models/RestaurantTable");
const RestaurantMenuCategory = require("../models/RestaurantMenuCategory");
const RestaurantMenuItem = require("../models/RestaurantMenuItem");
const RestaurantBuffet = require("../models/RestaurantBuffet");
const RestaurantOffer = require("../models/RestaurantOffer");

async function seedRestaurantData(propertyId) {
  try {
    if (!propertyId) return;

    // Check if restaurants already exist for this property
    const existing = await Restaurant.find({ property: propertyId });
    if (existing && existing.length > 0) {
      // Safely ensure all existing restaurant records have a valid slug
      for (const rest of existing) {
        if (!rest.slug && rest.name) {
          rest.slug = rest.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "");
          await rest.save();
          console.log(`   🔄 Updated missing slug for existing restaurant: ${rest.name} -> ${rest.slug}`);
        }
      }
      console.log("   ℹ️ Restaurants already exist for property. Preserving existing records.");
      return;
    }

    console.log("🍽️ Seeding luxury hotel restaurants for property...");

    // =========================================================================
    // 1. AZURE TIDE SEAFOOD RESTAURANT
    // =========================================================================
    const azureTide = await Restaurant.create({
      property: propertyId,
      name: "Azure Tide Seafood Restaurant",
      slug: "azure-tide",
      tagline: "Where the ocean meets the art of fine dining.",
      description: "An oceanfront culinary sanctuary celebrating the day's freshest catch from the Indian Ocean, masterfully prepared with contemporary finesse and coastal soul.",
      story: {
        concept: "A reverent celebration of the deep ocean, where line-caught seafood from artisanal coastal fisheries meets modern culinary craftsmanship.",
        atmosphere: "Gentle ocean breezes, flickering candlelight against polished teak, panoramic floor-to-ceiling vistas of the rolling surf, and an intimate open-flame grill station.",
        philosophy: "We honour the natural ocean harvest by applying minimalist techniques that elevate natural sweetness, salt-crust textures, and indigenous island spices.",
        signature: "Wood-fired jumbo rock lobsters, citrus-cured tuna carpaccio, and rich Ceylon bisque brewed with sweet swimmer crabs."
      },
      cuisine: "Fine Seafood & Coastal Cuisine",
      restaurantType: "Fine Dining",
      location: "Oceanfront Pavilion, Level G",
      openingHours: "Dinner: 18:30 – 23:00 (Daily)",
      hours: [
        { period: "Dinner Service", time: "18:30 – 23:00", days: "Daily" },
        { period: "Sunset Cocktails", time: "17:30 – 19:00", days: "Daily" }
      ],
      contactPhone: "+94 11 234 5680",
      contactEmail: "azuretide@serendibsanctuary.lk",
      dressCode: "Smart Casual / Resort Evening (Collared shirts recommended, no beachwear)",
      reservationPolicy: "Reservations strongly recommended for sunset and dinner seating. Outside guests welcomed.",
      capacity: 70,
      diningStyles: ["À la carte", "Chef Tasting Menu", "Oceanfront Terrace", "Private Wine Pavilion"],
      priceRange: "LKR 9,500 – 28,000 per person",
      heroImage: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1920&q=85",
      featuredImage: "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=1200&q=85",
      images: [
        "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1400&q=85",
        "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=1400&q=85",
        "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1400&q=85"
      ],
      gallery: [
        { url: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=85", caption: "Oceanfront Evening Dining Room", category: "Interior" },
        { url: "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=1200&q=85", caption: "Wood-Fired Jumbo Rock Lobster", category: "Food" },
        { url: "https://images.unsplash.com/photo-1579631542720-3a87824ff8a2?auto=format&fit=crop&w=1200&q=85", caption: "Citrus Yellowfin Tuna Tartare", category: "Food" },
        { url: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=85", caption: "Coastal Pavilion at Sunset", category: "Atmosphere" },
        { url: "https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=1200&q=85", caption: "Chef Plating Sea Bass", category: "Chef" },
        { url: "https://images.unsplash.com/photo-1541544741938-0af808871cc0?auto=format&fit=crop&w=1200&q=85", caption: "Private Table with Ocean View", category: "Table Settings" }
      ],
      chef: {
        name: "Chef Liam Vanderberg",
        title: "Executive Master of Seafood",
        bio: "With two decades along the Indian Ocean rim and Michelin-starred European coastal bistros, Chef Liam marries classical seafood gastronomy with Ceylon coastal ingredients.",
        specialty: "Salt-crust baked coral reef fish and wood-fired lobster glazes",
        image: "https://images.unsplash.com/photo-1577219491135-ce391730fb2c?auto=format&fit=crop&w=800&q=85"
      },
      featuredDishes: [
        {
          name: "Grilled Southern Ocean Lobster",
          description: "Whole live rock lobster, kaffir lime garlic butter, roasted fingerling potatoes, coastal sea asparagus.",
          price: 24500,
          currency: "LKR",
          image: "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=800&q=85",
          badge: "Signature Catch"
        },
        {
          name: "Hand-Dived King Scallops",
          description: "Pan-seared jumbo scallops, cauliflower purée, crispy prosciutto wafer, brown butter lemongrass emulsion.",
          price: 11500,
          currency: "LKR",
          image: "https://images.unsplash.com/photo-1532550907401-a500c9a57435?auto=format&fit=crop&w=800&q=85",
          badge: "Chef's Choice"
        },
        {
          name: "Yellowfin Tuna Crudo",
          description: "Sashimi-grade Mirissa tuna, finger lime pearls, avocado emulsion, infused coconut chili oil.",
          price: 9800,
          currency: "LKR",
          image: "https://images.unsplash.com/photo-1579631542720-3a87824ff8a2?auto=format&fit=crop&w=800&q=85",
          badge: "Artisanal Starter"
        }
      ],
      experiences: [
        {
          title: "Seafood Sunset Tasting",
          description: "A 5-course coastal journey paired with crisp coastal wines as the sun melts into the Indian Ocean horizon.",
          price: 29000,
          currency: "LKR",
          image: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=85",
          tag: "Sunset Pairing"
        },
        {
          title: "Private Ocean Pavilion Dining",
          description: "An exclusive beachfront deck with personal sommelier and chef crafting tailor-made ocean delicacies.",
          price: 65000,
          currency: "LKR",
          image: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=85",
          tag: "Bespoke Romance"
        }
      ],
      active: true,
      featured: true,
      sortOrder: 1
    });

    // Azure Tide Tables
    await RestaurantTable.create([
      { property: propertyId, restaurant: azureTide._id, tableNumber: "T-01 (Window)", capacity: 2, location: "Window", type: "Romantic Intimate", status: "AVAILABLE" },
      { property: propertyId, restaurant: azureTide._id, tableNumber: "T-02 (Window)", capacity: 2, location: "Window", type: "Romantic Intimate", status: "AVAILABLE" },
      { property: propertyId, restaurant: azureTide._id, tableNumber: "T-03 (Terrace)", capacity: 4, location: "Ocean Terrace", type: "Ocean View", status: "AVAILABLE" },
      { property: propertyId, restaurant: azureTide._id, tableNumber: "T-04 (Terrace)", capacity: 4, location: "Ocean Terrace", type: "Ocean View", status: "AVAILABLE" },
      { property: propertyId, restaurant: azureTide._id, tableNumber: "T-05 (Indoor)", capacity: 4, location: "Indoor", type: "Center Booth", status: "AVAILABLE" },
      { property: propertyId, restaurant: azureTide._id, tableNumber: "T-06 (Indoor)", capacity: 6, location: "Indoor", type: "Family Table", status: "AVAILABLE" },
      { property: propertyId, restaurant: azureTide._id, tableNumber: "T-07 (Pavilion)", capacity: 8, location: "Private Dining", type: "Private Wine Cellar", status: "AVAILABLE" }
    ]);

    // Azure Tide Menu Categories & Items
    const azStarters = await RestaurantMenuCategory.create({
      property: propertyId,
      restaurant: azureTide._id,
      name: "STARTERS & CRUDO",
      description: "Artisanal seafood preparations highlighting pristine freshness and vibrant citrus accents.",
      sortOrder: 1
    });

    const azMains = await RestaurantMenuCategory.create({
      property: propertyId,
      restaurant: azureTide._id,
      name: "OCEAN MAINS",
      description: "Prime line-caught seafood cooked over hardwood embers and delicate poached delicacies.",
      sortOrder: 2
    });

    const azDesserts = await RestaurantMenuCategory.create({
      property: propertyId,
      restaurant: azureTide._id,
      name: "DESSERTS",
      description: "Sensory finales crafted with single-origin cocoa and tropical fruits.",
      sortOrder: 3
    });

    const azBeverages = await RestaurantMenuCategory.create({
      property: propertyId,
      restaurant: azureTide._id,
      name: "BEVERAGES & CELLAR",
      description: "Curated wines, crisp coastal champagnes, and artisanal botanic concoctions.",
      sortOrder: 4
    });

    // Azure Tide Items
    await RestaurantMenuItem.create([
      {
        property: propertyId,
        restaurant: azureTide._id,
        category: azStarters._id,
        name: "Ceylon Blue Swimmer Crab Bisque",
        description: "Velvety ocean bisque, sweet crab meat, cognac drizzle, toasted sourdough croute with seaweed butter.",
        price: 5800,
        currency: "LKR",
        image: "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=600&q=80",
        dietaryTags: ["Seafood"],
        allergens: ["Shellfish", "Dairy", "Gluten"],
        featured: true,
        sortOrder: 1
      },
      {
        property: propertyId,
        restaurant: azureTide._id,
        category: azStarters._id,
        name: "Citrus Cured Yellowfin Tuna Tartare",
        description: "Fresh ocean yellowfin, avocado mousse, pickled shallots, white soy ponzu, lotus root crisps.",
        price: 6800,
        currency: "LKR",
        image: "https://images.unsplash.com/photo-1579631542720-3a87824ff8a2?auto=format&fit=crop&w=600&q=80",
        dietaryTags: ["Seafood", "Gluten-free"],
        allergens: ["Fish", "Soy"],
        featured: true,
        sortOrder: 2
      },
      {
        property: propertyId,
        restaurant: azureTide._id,
        category: azStarters._id,
        name: "Negombo Charred Baby Calamari",
        description: "Flash-grilled tender squid, chimichurri rojo, toasted garlic crumbs, lemon confit.",
        price: 5200,
        currency: "LKR",
        image: "https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?auto=format&fit=crop&w=600&q=80",
        dietaryTags: ["Seafood"],
        allergens: ["Molluscs"],
        featured: false,
        sortOrder: 3
      },
      // Mains
      {
        property: propertyId,
        restaurant: azureTide._id,
        category: azMains._id,
        name: "Wood-Fired Jumbo Rock Lobster",
        description: "Whole live rock lobster, kaffir lime garlic butter, crushed sea salt potatoes, ocean greens.",
        price: 24500,
        currency: "LKR",
        image: "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=600&q=80",
        dietaryTags: ["Seafood", "Chef's choice", "Gluten-free"],
        allergens: ["Shellfish", "Dairy"],
        featured: true,
        sortOrder: 1
      },
      {
        property: propertyId,
        restaurant: azureTide._id,
        category: azMains._id,
        name: "Pan-Seared Chilean Sea Bass",
        description: "Crispy skin sea bass, saffron fumet broth, baby fennel, clams, braised leeks.",
        price: 18500,
        currency: "LKR",
        image: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=600&q=80",
        dietaryTags: ["Seafood", "Gluten-free"],
        allergens: ["Fish", "Shellfish"],
        featured: true,
        sortOrder: 2
      },
      {
        property: propertyId,
        restaurant: azureTide._id,
        category: azMains._id,
        name: "Grilled Jumbo Tiger Prawns",
        description: "Wood-grilled head-on prawns, chili lemongrass glaze, coconut lime risotto, green mango salsa.",
        price: 16800,
        currency: "LKR",
        image: "https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?auto=format&fit=crop&w=600&q=80",
        dietaryTags: ["Seafood", "Spicy"],
        allergens: ["Shellfish", "Dairy"],
        featured: false,
        sortOrder: 3
      },
      {
        property: propertyId,
        restaurant: azureTide._id,
        category: azMains._id,
        name: "Catch of the Day in Herb Crust",
        description: "Daily fisherman's line catch, aromatic garden herb crust, crushed sweet potato, lemon caper beurre blanc.",
        price: 14500,
        currency: "LKR",
        image: "https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&w=600&q=80",
        dietaryTags: ["Seafood"],
        allergens: ["Fish", "Dairy", "Gluten"],
        featured: false,
        sortOrder: 4
      },
      // Desserts
      {
        property: propertyId,
        restaurant: azureTide._id,
        category: azDesserts._id,
        name: "Valrhona Warm Chocolate Fondant",
        description: "Warm molten molten dark chocolate cake, passionfruit coulis, Madagascar bourbon vanilla gelato.",
        price: 4200,
        currency: "LKR",
        image: "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=600&q=80",
        dietaryTags: ["Vegetarian"],
        allergens: ["Dairy", "Eggs", "Gluten"],
        featured: true,
        sortOrder: 1
      },
      {
        property: propertyId,
        restaurant: azureTide._id,
        category: azDesserts._id,
        name: "Serendib Tropical Fruit Composition",
        description: "Chilled rambutan, mangosteen, dragon fruit, passionfruit sorbet, coconut lemongrass gel.",
        price: 3600,
        currency: "LKR",
        image: "https://images.unsplash.com/photo-1505253716362-afaea1d3d1af?auto=format&fit=crop&w=600&q=80",
        dietaryTags: ["Vegan", "Gluten-free", "Organic"],
        allergens: [],
        featured: false,
        sortOrder: 2
      },
      // Beverages
      {
        property: propertyId,
        restaurant: azureTide._id,
        category: azBeverages._id,
        name: "Azure Tide Signature Coastal Tonic",
        description: "Botanical non-alcoholic infusion of blue pea flower, clarified lime, lemongrass, tonic reduction.",
        price: 2400,
        currency: "LKR",
        image: "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=600&q=80",
        dietaryTags: ["Vegan", "Organic"],
        allergens: [],
        featured: true,
        sortOrder: 1
      }
    ]);

    // Azure Tide Offers
    await RestaurantOffer.create([
      {
        property: propertyId,
        restaurant: azureTide._id,
        title: "Seafood Sunset Experience",
        slug: "seafood-sunset-experience",
        shortDescription: "An unforgettable sunset dinner with a generous coastal platter and sommelier selections.",
        description: "Celebrate twilight over the Indian Ocean with our celebrated Seafood Sunset Experience. Includes a tiered seafood tower with rock lobster, oysters, king prawns, and sea bass, preceded by signature sunset cocktails.",
        image: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=85",
        price: 38000,
        discount: "Includes 2 Complimentary Sunset Cocktails",
        currency: "LKR",
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 90 * 86400000),
        applicableDays: ["Daily"],
        inclusions: [
          "Tiered Indian Ocean Seafood Platter with Rock Lobster",
          "Two Signature Sunset Cocktails or Mocktails",
          "Guaranteed Front-Row Ocean Terrace Table",
          "Chef Liam's Signature Dessert Finale"
        ],
        terms: "Reservations required at least 4 hours in advance. Valid between 17:30 and 20:30."
      },
      {
        property: propertyId,
        restaurant: azureTide._id,
        title: "Romantic Dinner for Two",
        slug: "romantic-dinner-for-two",
        shortDescription: "Private candlelit table by the ocean waves with five courses of bespoke seafood.",
        description: "Immerse in intimate luxury with your personal table setting adorned with tropical orchids, soft candlelight, and five expertly timed courses paired with premium vintage selections.",
        image: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=85",
        price: 56000,
        discount: "Complimentary Bottle of Chilled Champagne",
        currency: "LKR",
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 180 * 86400000),
        applicableDays: ["Daily"],
        inclusions: [
          "Dedicated Private Dining Pavilion or Secluded Beach Table",
          "5-Course Curated Coastal Degustation Menu",
          "Chilled Bottle of Moët & Chandon Champagne",
          "Personal Table Butler & Custom Menu Card"
        ],
        terms: "24-hour advance booking required. Subject to weather conditions for beach seating."
      }
    ]);

    // =========================================================================
    // 2. SPICE & SILK ALL-DAY DINING
    // =========================================================================
    const spiceSilk = await Restaurant.create({
      property: propertyId,
      name: "Spice & Silk All-Day Dining",
      slug: "spice-and-silk",
      tagline: "An international table, from sunrise to starlight.",
      description: "A lively and sophisticated all-day culinary emporium celebrating authentic Sri Lankan heritage, rich Pan-Asian flavours, and classical Western culinary traditions across vibrant live cooking stations and expansive international buffets.",
      story: {
        concept: "Inspired by the ancient silk and spice maritime trade routes that connected Ceylon with the Mediterranean and the Orient.",
        atmosphere: "High sunlit ceilings, lush tropical indoor gardens, dramatic interactive open-theatre kitchens, and relaxed all-day luxury seating suitable for couples, families, and discerning travellers.",
        philosophy: "Authenticity without compromise. Our chefs craft heritage clay-pot curries alongside artisan hand-tossed pasta, wood-fired tandoor specialties, and delicate dim sum.",
        signature: "Clay-pot Jaffna crab curry, crispy egg hoppers with sambols, hand-pulled Singapore noodles, and the Grand Sunday International Buffet."
      },
      cuisine: "International All-Day Dining & Buffet",
      restaurantType: "All-Day Dining",
      location: "Grand Atrium, Level 1",
      openingHours: "Breakfast: 06:30 – 10:30 | Lunch: 12:30 – 15:00 | Dinner: 19:00 – 22:30",
      hours: [
        { period: "Breakfast Buffet & À la carte", time: "06:30 – 10:30", days: "Daily" },
        { period: "International Lunch Buffet", time: "12:30 – 15:00", days: "Daily" },
        { period: "International Dinner Buffet", time: "19:00 – 22:30", days: "Daily" },
        { period: "All-Day À la carte Dining", time: "11:00 – 23:00", days: "Daily" }
      ],
      contactPhone: "+94 11 234 5681",
      contactEmail: "spicesilk@serendibsanctuary.lk",
      dressCode: "Resort Casual (Cover-ups required, shirts and footwear mandatory)",
      reservationPolicy: "Walk-ins welcomed. Table reservations recommended for dinner buffet and large family gatherings.",
      capacity: 140,
      diningStyles: ["International Buffet", "À la carte", "Interactive Live Kitchens", "Terrace Dining"],
      priceRange: "LKR 4,500 – 16,500 per person",
      heroImage: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1920&q=85",
      featuredImage: "https://images.unsplash.com/photo-1541544741938-0af808871cc0?auto=format&fit=crop&w=1200&q=85",
      images: [
        "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1400&q=85",
        "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1400&q=85",
        "https://images.unsplash.com/photo-1541544741938-0af808871cc0?auto=format&fit=crop&w=1400&q=85"
      ],
      gallery: [
        { url: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=85", caption: "Expansive Atrium Dining Hall", category: "Interior" },
        { url: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=85", caption: "Lavish Buffet Presentation", category: "Buffet" },
        { url: "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=1200&q=85", caption: "Artisanal Salad & Antipasti Island", category: "Buffet" },
        { url: "https://images.unsplash.com/photo-1541544741938-0af808871cc0?auto=format&fit=crop&w=1200&q=85", caption: "Sunny Morning Breakfast Setting", category: "Table Settings" },
        { url: "https://images.unsplash.com/photo-1577219491135-ce391730fb2c?auto=format&fit=crop&w=1200&q=85", caption: "Live Kitchen Wok & Claypots", category: "Chef" },
        { url: "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=1200&q=85", caption: "Artisanal Dessert Showcase", category: "Food" }
      ],
      chef: {
        name: "Chef Ananya Senanayake",
        title: "Director of Culinary & All-Day Dining",
        bio: "Chef Ananya brings over 18 years across prestigious Asian luxury resorts, orchestrating world-class buffets with vibrant live stations and authentic island claypot recipes.",
        specialty: "Authentic Ceylon claypot curries and Asian wok gastronomy",
        image: "https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=800&q=85"
      },
      featuredDishes: [
        {
          name: "Jaffna Spiced Blue Crab Curry",
          description: "Fresh coastal swimmer crabs simmered in roasted Jaffna spices, coconut milk, drumstick leaves, served with steamed basmati.",
          price: 9800,
          currency: "LKR",
          image: "https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=800&q=85",
          badge: "Heritage Favourite"
        },
        {
          name: "Crispy Ceylon Egg Hopper Platter",
          description: "Crispy fermented rice flour hoppers with soft poached egg centres, served with pol sambol, seeni sambol, and lunumiris.",
          price: 4200,
          currency: "LKR",
          image: "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&fit=crop&w=800&q=85",
          badge: "Breakfast Star"
        },
        {
          name: "Wok-Tossed Singapore Chili Prawns",
          description: "Jumbo prawns in rich egg-ribbon sweet & spicy chili gravy with golden fried mantou buns.",
          price: 8900,
          currency: "LKR",
          image: "https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?auto=format&fit=crop&w=800&q=85",
          badge: "Asian Specialty"
        }
      ],
      experiences: [
        {
          title: "Weekend Grand International Buffet",
          description: "An extravagant feast featuring over 120 global dishes, carving stations, and decadent dessert displays.",
          price: 14500,
          currency: "LKR",
          image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=85",
          tag: "Buffet Extravaganza"
        },
        {
          title: "Family Sunday Silk Brunch",
          description: "Live acoustic melodies, unlimited international stations, chocolate fountain, and kid-friendly entertainment.",
          price: 15500,
          currency: "LKR",
          image: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=85",
          tag: "Family Celebration"
        }
      ],
      active: true,
      featured: true,
      sortOrder: 2
    });

    // Spice & Silk Tables
    await RestaurantTable.create([
      { property: propertyId, restaurant: spiceSilk._id, tableNumber: "SS-01 (Atrium)", capacity: 2, location: "Indoor", type: "Atrium Table", status: "AVAILABLE" },
      { property: propertyId, restaurant: spiceSilk._id, tableNumber: "SS-02 (Atrium)", capacity: 4, location: "Indoor", type: "Atrium Table", status: "AVAILABLE" },
      { property: propertyId, restaurant: spiceSilk._id, tableNumber: "SS-03 (Booth)", capacity: 4, location: "Indoor", type: "Plush Booth", status: "AVAILABLE" },
      { property: propertyId, restaurant: spiceSilk._id, tableNumber: "SS-04 (Booth)", capacity: 6, location: "Indoor", type: "Plush Booth", status: "AVAILABLE" },
      { property: propertyId, restaurant: spiceSilk._id, tableNumber: "SS-05 (Garden)", capacity: 4, location: "Garden", type: "Courtyard Garden", status: "AVAILABLE" },
      { property: propertyId, restaurant: spiceSilk._id, tableNumber: "SS-06 (Garden)", capacity: 6, location: "Garden", type: "Courtyard Garden", status: "AVAILABLE" },
      { property: propertyId, restaurant: spiceSilk._id, tableNumber: "SS-07 (Family)", capacity: 8, location: "Indoor", type: "Long Family Table", status: "AVAILABLE" },
      { property: propertyId, restaurant: spiceSilk._id, tableNumber: "SS-08 (Private)", capacity: 12, location: "Private Dining", type: "Silk Boardroom", status: "AVAILABLE" }
    ]);

    // Spice & Silk Buffet Sessions
    await RestaurantBuffet.create([
      {
        property: propertyId,
        restaurant: spiceSilk._id,
        name: "Sunrise International Breakfast Buffet",
        description: "A bright and energizing morning spread of artisan bakery viennoiserie, live egg and hopper stations, fresh tropical fruit juices, and wholesome continental delights.",
        schedule: "Daily",
        mealPeriod: "Breakfast",
        startTime: "06:30",
        endTime: "10:30",
        adultPrice: 6500,
        childPrice: 3200,
        hotelGuestPrice: 0, // Complimentary for booked hotel breakfast plans or special rate
        outsideGuestPrice: 6500,
        currency: "LKR",
        capacity: 140,
        theme: "Continental & Ceylon Plantation Breakfast",
        image: "https://images.unsplash.com/photo-1541544741938-0af808871cc0?auto=format&fit=crop&w=1000&q=80",
        highlights: [
          "Live Sri Lankan Hopper & Dosa Station",
          "Freshly Baked French Croissants & Danish Pastries",
          "Artisan Organic Ceylon Tea & Espresso Bar",
          "Freshly Squeezed Island Fruit Juices & Smoothies"
        ],
        active: true
      },
      {
        property: propertyId,
        restaurant: spiceSilk._id,
        name: "International Lunch Buffet",
        description: "An energizing midday banquet featuring wood-fired pizzas, Mediterranean antipasti, vibrant Asian noodle broths, and fresh Ceylon curries.",
        schedule: "Daily",
        mealPeriod: "Lunch",
        startTime: "12:30",
        endTime: "15:00",
        adultPrice: 9500,
        childPrice: 4800,
        hotelGuestPrice: 7500,
        outsideGuestPrice: 9500,
        currency: "LKR",
        capacity: 120,
        theme: "Pan-Asian & Mediterranean Showcase",
        image: "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=1000&q=80",
        highlights: [
          "Interactive Live Pasta & Risotto Station",
          "Salad Bar with 24 Gourmet Compositions",
          "Wood-Fired Pizza & Flatbreads",
          "Artisanal Gelato & Tropical Dessert Island"
        ],
        active: true
      },
      {
        property: propertyId,
        restaurant: spiceSilk._id,
        name: "Grand International Dinner Buffet",
        description: "Our signature evening showcase: expansive sushi & sashimi displays, live charcoal grill with premium meats and coastal seafood, authentic claypot curries, and an opulent dessert emporium.",
        schedule: "Daily (Special themed nights on weekends)",
        mealPeriod: "Dinner",
        startTime: "19:00",
        endTime: "22:30",
        adultPrice: 14500,
        childPrice: 7200,
        hotelGuestPrice: 11500,
        outsideGuestPrice: 14500,
        currency: "LKR",
        capacity: 150,
        theme: "World Culinary Journey & Seafood Grill",
        image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1000&q=80",
        highlights: [
          "Live Seafood & Charcoal Rotisserie Grill",
          "Authentic Clay-Pot Ceylon Curries & Sambols",
          "Japanese Sushi, Sashimi & Tempura Station",
          "Decadent Chocolate Fountain & Pastry Showcase"
        ],
        active: true
      }
    ]);

    // Spice & Silk Menu Categories & Items
    const spBreakfast = await RestaurantMenuCategory.create({
      property: propertyId,
      restaurant: spiceSilk._id,
      name: "BREAKFAST & BRUNCH",
      description: "Wholesome morning classics and Sri Lankan sunrise favourites.",
      sortOrder: 1
    });

    const spAsian = await RestaurantMenuCategory.create({
      property: propertyId,
      restaurant: spiceSilk._id,
      name: "ASIAN & WOK",
      description: "Fragrant stir-fries, noodle bowls, and silk-route culinary traditions.",
      sortOrder: 2
    });

    const spHeritage = await RestaurantMenuCategory.create({
      property: propertyId,
      restaurant: spiceSilk._id,
      name: "SRI LANKAN HERITAGE",
      description: "Time-honoured claypot curries and village spices.",
      sortOrder: 3
    });

    const spWestern = await RestaurantMenuCategory.create({
      property: propertyId,
      restaurant: spiceSilk._id,
      name: "WESTERN CLASSICS",
      description: "Prime steaks, handcrafted burgers, and artisan pastas.",
      sortOrder: 4
    });

    const spDesserts = await RestaurantMenuCategory.create({
      property: propertyId,
      restaurant: spiceSilk._id,
      name: "DESSERTS & SWEETS",
      description: "Artisanal desserts and homemade gelato.",
      sortOrder: 5
    });

    // Spice & Silk Items
    await RestaurantMenuItem.create([
      {
        property: propertyId,
        restaurant: spiceSilk._id,
        category: spBreakfast._id,
        name: "Ceylon Sunrise Egg Hopper Basket",
        description: "Four crisp hoppers with free-range egg centres, served with coconut pol sambol and sweet seeni sambol.",
        price: 3800,
        currency: "LKR",
        image: "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&fit=crop&w=600&q=80",
        dietaryTags: ["Vegetarian", "Gluten-free"],
        allergens: ["Eggs"],
        featured: true,
        sortOrder: 1
      },
      {
        property: propertyId,
        restaurant: spiceSilk._id,
        category: spBreakfast._id,
        name: "Avocado Sourdough & Poached Eggs",
        description: "Toasted artisan sourdough, smashed Hass avocado, poached organic eggs, feta cheese, chili flakes.",
        price: 4200,
        currency: "LKR",
        image: "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=600&q=80",
        dietaryTags: ["Vegetarian"],
        allergens: ["Gluten", "Eggs", "Dairy"],
        featured: false,
        sortOrder: 2
      },
      // Asian
      {
        property: propertyId,
        restaurant: spiceSilk._id,
        category: spAsian._id,
        name: "Thai Green Curry with Prawns",
        description: "Fragrant coconut curry broth, jumbo prawns, Thai eggplants, kaffir lime, served with steamed jasmine rice.",
        price: 6800,
        currency: "LKR",
        image: "https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?auto=format&fit=crop&w=600&q=80",
        dietaryTags: ["Seafood", "Spicy", "Gluten-free"],
        allergens: ["Shellfish"],
        featured: true,
        sortOrder: 1
      },
      {
        property: propertyId,
        restaurant: spiceSilk._id,
        category: spAsian._id,
        name: "Wok-Tossed Nasi Goreng Istimewa",
        description: "Indonesian spiced fried rice, grilled chicken satay with peanut sauce, fried egg, prawn crackers.",
        price: 5800,
        currency: "LKR",
        image: "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=600&q=80",
        dietaryTags: ["Halal"],
        allergens: ["Peanuts", "Eggs", "Shellfish"],
        featured: false,
        sortOrder: 2
      },
      // Heritage
      {
        property: propertyId,
        restaurant: spiceSilk._id,
        category: spHeritage._id,
        name: "Negombo Lagoon Prawn Curry",
        description: "Sweet river prawns simmered in Ceylon red curry spices, thick coconut gravy, served with basmati rice and accompaniments.",
        price: 7600,
        currency: "LKR",
        image: "https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=600&q=80",
        dietaryTags: ["Seafood", "Spicy", "Gluten-free"],
        allergens: ["Shellfish"],
        featured: true,
        sortOrder: 1
      },
      {
        property: propertyId,
        restaurant: spiceSilk._id,
        category: spHeritage._id,
        name: "Black Pepper Pork / Beef Claypot",
        description: "Tender slow-braised meat in roasted black curry powder, goraka, and fragrant curry leaves.",
        price: 6400,
        currency: "LKR",
        image: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80",
        dietaryTags: ["Spicy"],
        allergens: [],
        featured: false,
        sortOrder: 2
      },
      // Western
      {
        property: propertyId,
        restaurant: spiceSilk._id,
        category: spWestern._id,
        name: "Australian Angus Ribeye Steak (250g)",
        description: "Char-grilled grass-fed Angus ribeye, truffle potato puree, grilled asparagus, green peppercorn jus.",
        price: 18500,
        currency: "LKR",
        image: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80",
        dietaryTags: ["Chef's choice", "Gluten-free"],
        allergens: ["Dairy"],
        featured: true,
        sortOrder: 1
      },
      {
        property: propertyId,
        restaurant: spiceSilk._id,
        category: spWestern._id,
        name: "Handmade Fettuccine Wild Mushroom",
        description: "Fresh egg pasta, wild forest mushrooms, white wine parmesan cream, fresh thyme, white truffle oil.",
        price: 5200,
        currency: "LKR",
        image: "https://images.unsplash.com/photo-1621996346565-e3d5d6281699?auto=format&fit=crop&w=600&q=80",
        dietaryTags: ["Vegetarian"],
        allergens: ["Gluten", "Dairy", "Eggs"],
        featured: false,
        sortOrder: 2
      },
      // Desserts
      {
        property: propertyId,
        restaurant: spiceSilk._id,
        category: spDesserts._id,
        name: "Warm Ceylon Kithul Treacle Pudding",
        description: "Steamed jaggery sponge, pure Caryota urens treacle drizzle, homemade curd gelato.",
        price: 3200,
        currency: "LKR",
        image: "https://images.unsplash.com/photo-1587314168485-3236d6710814?auto=format&fit=crop&w=600&q=80",
        dietaryTags: ["Vegetarian"],
        allergens: ["Dairy", "Gluten", "Eggs"],
        featured: true,
        sortOrder: 1
      }
    ]);

    // Spice & Silk Offers
    await RestaurantOffer.create([
      {
        property: propertyId,
        restaurant: spiceSilk._id,
        title: "Weekend International Buffet",
        slug: "weekend-international-buffet",
        shortDescription: "Special rate for our signature Friday & Saturday dinner extravaganza with live grill stations.",
        description: "Experience the ultimate culinary journey with our celebrated weekend international dinner buffet. Enjoy over 120 global dishes, a dedicated seafood grill, pasta made to order, and our showstopping chocolate fountain.",
        image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=85",
        price: 13500,
        discount: "Special Rate: LKR 13,500 (Reg. LKR 14,500)",
        currency: "LKR",
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 120 * 86400000),
        applicableDays: ["Friday", "Saturday"],
        inclusions: [
          "Full Access to all 7 Interactive Buffet Stations",
          "Live Seafood & Charcoal Rotisserie Grill",
          "Complimentary Welcome Mocktail on Arrival",
          "Children Under 6 Dine Free"
        ],
        terms: "Applicable for Friday and Saturday dinner sessions from 19:00 to 22:30."
      },
      {
        property: propertyId,
        restaurant: spiceSilk._id,
        title: "Family Sunday Silk Brunch",
        slug: "family-sunday-brunch",
        shortDescription: "A relaxed, joyous Sunday family brunch with live acoustic music and endless delicacies.",
        description: "Make Sundays memorable with our lavish Sunday Silk Brunch. Free-flowing mocktails, an expansive oyster and seafood bar, roast prime rib carvery, and special activities for younger guests.",
        image: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=85",
        price: 14000,
        discount: "20% Discount for Hotel In-House Guests",
        currency: "LKR",
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 180 * 86400000),
        applicableDays: ["Sunday"],
        inclusions: [
          "Sunday Brunch Buffet (11:30 AM – 15:30 PM)",
          "Complimentary Free-Flowing Tropical Mocktails",
          "Live Acoustic Band Performance",
          "Dedicated Kids Pastry Corner"
        ],
        terms: "Reservations recommended for parties of 4 or more."
      }
    ]);

    console.log("   ✅ Luxury restaurants seeded successfully:");
    console.log("      - Azure Tide Seafood Restaurant (/restaurants/azure-tide)");
    console.log("      - Spice & Silk All-Day Dining (/restaurants/spice-and-silk)");
  } catch (err) {
    console.error("Restaurant seed notice (non-fatal):", err.message);
  }
}

module.exports = seedRestaurantData;
