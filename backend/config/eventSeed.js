// backend/config/eventSeed.js
const EventVenue = require("../models/EventVenue");
const Event = require("../models/Event");

async function seedEventData(propertyId) {
  try {
    if (!propertyId) return;

    // Check if venues already exist for this property
    const existingVenues = await EventVenue.find({ property: propertyId });
    if (existingVenues && existingVenues.length > 0) {
      // Venues already exist, check events
      const existingEvents = await Event.find({ property: propertyId });
      if (!existingEvents || existingEvents.length === 0) {
        await seedSampleEvents(propertyId, existingVenues[0]);
      }
      return;
    }

    console.log("🏛️ Seeding hotel event venues & spaces...");

    const venueDocs = [
      {
        property: propertyId,
        name: "Grand Ballroom",
        slug: "grand-ballroom",
        hotel: "Serendib Sanctuary · Flagship Property",
        location: "Colombo, Sri Lanka",
        type: "Indoor",
        area: 620,
        min: 80,
        max: 450,
        categories: ["weddings", "corporate", "office-parties", "private-celebrations"],
        seating: ["Banquet", "Theatre", "Classroom", "Reception"],
        facilities: ["Air conditioning", "Stage & lighting", "Sound system", "Projector", "Wi-Fi", "Catering service", "Parking"],
        image: "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1400&q=85",
        gallery: [
          "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1400&q=85",
          "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=1400&q=85"
        ],
        description: "A generous, light-filled ballroom designed to host celebrations and gatherings on a memorable scale.",
        packages: [
          {
            name: "Celebration Collection",
            event: "Weddings & occasions",
            includes: "Venue styling consultation, banquet seating and catering coordination",
            price: 750000,
            currency: "LKR"
          },
          {
            name: "Full-Day Conference",
            event: "Corporate events",
            includes: "Theatre or classroom setup, projector, screen, sound and refreshment breaks",
            price: 450000,
            currency: "LKR"
          }
        ],
        isActive: true
      },
      {
        property: propertyId,
        name: "Garden Terrace",
        slug: "garden-terrace",
        hotel: "Serendib Sanctuary · Flagship Property",
        location: "Colombo, Sri Lanka",
        type: "Outdoor",
        area: 340,
        min: 30,
        max: 180,
        categories: ["weddings", "office-parties", "private-celebrations"],
        seating: ["Banquet", "Reception", "Ceremony"],
        facilities: ["Garden setting", "Outdoor lighting", "Sound system", "Catering service", "Parking"],
        image: "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1400&q=85",
        gallery: [
          "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1400&q=85",
          "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=1400&q=85"
        ],
        description: "An open-air garden venue for relaxed receptions, intimate ceremonies and private celebrations.",
        packages: [
          {
            name: "Garden Gathering",
            event: "Private celebrations",
            includes: "Garden venue setup, reception seating and catering coordination",
            price: 320000,
            currency: "LKR"
          },
          {
            name: "Wedding Ceremony",
            event: "Weddings & occasions",
            includes: "Ceremony layout, seating and event coordination",
            price: 420000,
            currency: "LKR"
          }
        ],
        isActive: true
      },
      {
        property: propertyId,
        name: "Conference Suite",
        slug: "conference-suite",
        hotel: "Serendib Sanctuary · Flagship Property",
        location: "Colombo, Sri Lanka",
        type: "Indoor",
        area: 190,
        min: 12,
        max: 90,
        categories: ["corporate", "office-parties"],
        seating: ["Boardroom", "Theatre", "Classroom", "U-shape"],
        facilities: ["Air conditioning", "Projector", "Presentation screen", "Sound system", "Wi-Fi", "Catering service", "Parking"],
        image: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1400&q=85",
        gallery: [
          "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1400&q=85",
          "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=1400&q=85"
        ],
        description: "A quiet, adaptable suite equipped for productive meetings, workshops and smaller business events.",
        packages: [
          {
            name: "Half-Day Meeting",
            event: "Corporate events",
            includes: "Meeting room setup, presentation screen and refreshments",
            price: 180000,
            currency: "LKR"
          },
          {
            name: "Workshop Day",
            event: "Corporate events",
            includes: "Classroom setup, projector, Wi-Fi and catering coordination",
            price: 260000,
            currency: "LKR"
          }
        ],
        isActive: true
      },
      {
        property: propertyId,
        name: "Private Function Room",
        slug: "private-function-room",
        hotel: "Serendib Sanctuary · Flagship Property",
        location: "Colombo, Sri Lanka",
        type: "Indoor",
        area: 125,
        min: 10,
        max: 60,
        categories: ["office-parties", "private-celebrations", "weddings"],
        seating: ["Banquet", "Boardroom", "Reception"],
        facilities: ["Air conditioning", "Sound system", "Wi-Fi", "Catering service", "Parking"],
        image: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1400&q=85",
        gallery: [
          "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1400&q=85",
          "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1400&q=85"
        ],
        description: "A private, flexible room for smaller gatherings, birthdays and team celebrations.",
        packages: [
          {
            name: "Private Celebration",
            event: "Private celebrations",
            includes: "Private room setup, flexible seating and catering coordination",
            price: 150000,
            currency: "LKR"
          },
          {
            name: "Company Social",
            event: "Office parties",
            includes: "Reception seating, sound system and catering coordination",
            price: 210000,
            currency: "LKR"
          }
        ],
        isActive: true
      }
    ];

    const createdVenues = await EventVenue.insertMany(venueDocs);
    console.log(`   ✅ ${createdVenues.length} Event venues seeded successfully.`);

    // Seed sample curated hotel events
    await seedSampleEvents(propertyId, createdVenues[0]);

  } catch (err) {
    console.error("Event seed notice (non-fatal):", err.message);
  }
}

async function seedSampleEvents(propertyId, sampleVenue) {
  const existingEvents = await Event.countDocuments({ property: propertyId });
  if (existingEvents > 0) return;

  const sampleEvents = [
    {
      property: propertyId,
      title: "Annual Ceylon Gala & Charity Soirée",
      slug: "annual-ceylon-gala",
      eventType: "banquet",
      shortDescription: "An evening of haute cuisine, live string ensembles, and curated Ceylon tea pairings.",
      description: "Join international dignitaries and hotel guests for Serendib Sanctuary's annual charity gala held in the Grand Ballroom. Featuring a seven-course degustation menu prepared by master chefs.",
      coverImage: "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1400&q=85",
      gallery: [
        "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1400&q=85",
        "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=1400&q=85"
      ],
      venue: sampleVenue ? sampleVenue._id : undefined,
      startDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      endDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      startTime: "19:00",
      endTime: "23:30",
      minCapacity: 50,
      maxCapacity: 300,
      expectedGuestCount: 180,
      pricingModel: "Per Person",
      basePrice: 25000,
      currency: "LKR",
      status: "PUBLISHED",
      featured: true,
      termsAndConditions: "Formal black-tie attire required. Cancellations accepted up to 48 hours prior.",
      contactEmail: "events@serendibsanctuary.lk",
      contactPhone: "+94 11 234 5685"
    },
    {
      property: propertyId,
      title: "Island Hospitality & Tech Summit 2026",
      slug: "hospitality-tech-summit-2026",
      eventType: "corporate",
      shortDescription: "Exploring the next wave of sustainable tourism and intelligent hotel operations in South Asia.",
      description: "Keynote addresses from leading hospitality innovators, interactive roundtable sessions, and networking cocktails overlooking the Indian Ocean.",
      coverImage: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1400&q=85",
      gallery: [
        "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1400&q=85"
      ],
      venue: sampleVenue ? sampleVenue._id : undefined,
      startDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      endDate: new Date(Date.now() + 31 * 86400000).toISOString().slice(0, 10),
      startTime: "09:00",
      endTime: "17:00",
      minCapacity: 20,
      maxCapacity: 150,
      expectedGuestCount: 90,
      pricingModel: "Fixed Package",
      basePrice: 45000,
      currency: "LKR",
      status: "PUBLISHED",
      featured: true,
      termsAndConditions: "Includes full lunch and symposium materials.",
      contactEmail: "corporate@serendibsanctuary.lk",
      contactPhone: "+94 11 234 5686"
    }
  ];

  await Event.insertMany(sampleEvents);
  console.log("   ✅ Curated hotel events seeded successfully.");
}

module.exports = seedEventData;
