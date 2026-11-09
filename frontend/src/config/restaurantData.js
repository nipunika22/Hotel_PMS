// Existing frontend restaurant fallback data shared by the dining list and detail routes.
export const DEFAULT_RESTAURANTS = [
  {
    _id: 'default-azure-tide',
    name: 'Azure Tide Seafood Restaurant',
    slug: 'azure-tide',
    tagline: 'Where the ocean meets the art of fine dining.',
    description: "An oceanfront culinary sanctuary celebrating the day's freshest catch from the Indian Ocean, masterfully prepared with contemporary finesse and coastal soul.",
    cuisine: 'Fine Seafood & Coastal Cuisine',
    restaurantType: 'Fine Dining',
    location: 'Oceanfront Pavilion, Level G',
    openingHours: 'Dinner: 18:30 – 23:00 (Daily)',
    diningStyles: ['À la carte', 'Chef Tasting Menu', 'Oceanfront Terrace'],
    priceRange: 'LKR 9,500 – 28,000 per person',
    heroImage: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=85',
    images: ['https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1000&q=85'],
    gallery: [
      { url: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1400&q=85', caption: 'Fresh seafood from the Indian Ocean', category: 'Signature cuisine' },
      { url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1000&q=85', caption: 'An intimate oceanfront dining room', category: 'Restaurant ambiance' }
    ]
  },
  {
    _id: 'default-spice-silk',
    name: 'Spice & Silk All-Day Dining',
    slug: 'spice-and-silk',
    tagline: 'An international table, from sunrise to starlight.',
    description: 'A lively and sophisticated all-day culinary emporium celebrating authentic Sri Lankan heritage, rich Pan-Asian flavours, and classical Western culinary traditions across vibrant live cooking stations and expansive international buffets.',
    cuisine: 'International All-Day Dining & Buffet',
    restaurantType: 'All-Day Dining',
    location: 'Grand Atrium, Level 1',
    openingHours: 'Breakfast: 06:30 – 10:30 | Lunch: 12:30 – 15:00 | Dinner: 19:00 – 22:30',
    diningStyles: ['International Buffet', 'À la carte', 'Interactive Live Kitchens'],
    priceRange: 'LKR 4,500 – 16,500 per person',
    heroImage: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=85',
    images: ['https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1000&q=85'],
    gallery: [
      { url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1400&q=85', caption: 'The Spice & Silk dining room', category: 'Restaurant ambiance' },
      { url: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1000&q=85', caption: 'A table of international favourites', category: 'Dining experience' }
    ]
  }
];
