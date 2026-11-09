// frontend/src/config/destinationData.js
/**
 * Centralized Destination & Editorial Content Architecture
 * 
 * All photographs, editorial copy, highlights, and experiences are defined here.
 * Future user-uploaded photographs can be updated in this single location without
 * modifying presentation components.
 * 
 * Supports graceful fallback to bundled high-resolution assets to guarantee
 * zero broken images even in offline or restricted environments.
 */

import resortPhoto from '../assets/hotel-resort-cinematic.jpg';
import lobbyPhoto from '../assets/hotel-lobby-cinematic.jpg';
import roomDeluxePhoto from '../assets/room-deluxe.jpg';
import roomSuitePhoto from '../assets/room-suite.jpg';

export const fallbackAssets = {
  hero: resortPhoto,
  lobby: lobbyPhoto,
  deluxeRoom: roomDeluxePhoto,
  suiteRoom: roomSuitePhoto
};

export const DESTINATIONS_LIST = [
  {
    id: 'sri-lanka',
    name: 'Sri Lanka',
    nativeName: 'ශ්‍රී ලංකා',
    country: 'Sri Lanka',
    countryCode: 'LK',
    currency: 'LKR',
    currencySymbol: 'Rs.',
    timezone: 'Asia/Colombo',
    timezoneOffset: 'GMT +5:30',
    climate: 'Tropical 28°C / 82°F',
    status: 'active',
    flag: '🇱🇰',
    shortDescription: 'An enchanted island of mist-crowned tea hills, sapphire waters, wildlife sanctuaries, and timeless warmth.'
  },
  {
    id: 'maldives',
    name: 'Maldives',
    nativeName: 'ދިވެހިރާއްޖެ',
    country: 'Maldives',
    countryCode: 'MV',
    currency: 'USD',
    currencySymbol: '$',
    timezone: 'Indian/Maldives',
    timezoneOffset: 'GMT +5:00',
    climate: 'Tropical 29°C',
    status: 'upcoming',
    flag: '🇲🇻',
    shortDescription: 'Upcoming sanctuary: Secluded overwater villas and tranquil coral atolls.'
  }
];

export const DESTINATION_DETAILS = {
  'sri-lanka': {
    id: 'sri-lanka',
    name: 'Sri Lanka',
    badge: 'CEYLON SANCTUARY &bull; ISLAND OF SERENDIB',
    tagline: 'Where every journey becomes a story.',
    heroHeadline: 'SRI LANKA',
    heroSubheadline: 'Where emerald tea terraces meet the warm tide of the Indian Ocean.',
    heroDescription: 'Immerse yourself in a land sculpted by royal dynasties, wild coastal shores, and legendary island hospitality. Awaken to birdsong over misty valleys and unwind to golden ocean sunsets.',
    
    // Central Image Assets for Sri Lanka
    images: {
      hero: 'https://images.unsplash.com/photo-1586861635167-e5223aadc9fe?auto=format&fit=crop&w=2000&q=85',
      heroFallback: resortPhoto,
      heroAlt: 'Scenic tropical Sri Lankan coastline with palm trees and ocean breakers at golden hour',
      
      storyMain: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?auto=format&fit=crop&w=1200&q=85',
      storySecondary: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?auto=format&fit=crop&w=800&q=85',
      storyTertiary: 'https://images.unsplash.com/photo-1588258524675-c6190ec31c16?auto=format&fit=crop&w=800&q=85',
      
      propertyHero: resortPhoto,
      propertyLobby: lobbyPhoto,
      
      discovery: {
        coast: 'https://images.unsplash.com/photo-1552465011-b4e21bf6e79a?auto=format&fit=crop&w=1000&q=85',
        mountains: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?auto=format&fit=crop&w=1000&q=85',
        wildlife: 'https://images.unsplash.com/photo-1581852017103-68ac6550407b?auto=format&fit=crop&w=1000&q=85',
        heritage: 'https://images.unsplash.com/photo-1588598198321-9735fd52455d?auto=format&fit=crop&w=1000&q=85',
        rivers: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1000&q=85'
      }
    },

    // Editorial Storytelling Pillars (Section 2 - Destination Discovery)
    discoveryPillars: [
      {
        id: 'coast',
        title: 'Tropical Coasts & Oceans',
        subtitle: 'Indian Ocean Horizons',
        description: 'Golden palm-fringed sands, rhythmic sapphire swells, and tranquil lagoons kissed by tropical sun.',
        image: 'https://images.unsplash.com/photo-1552465011-b4e21bf6e79a?auto=format&fit=crop&w=1000&q=85',
        fallback: resortPhoto,
        tag: 'Coast & Surf'
      },
      {
        id: 'mountains',
        title: 'Misty Highlands & Tea Trails',
        subtitle: 'The Central Valleys',
        description: 'Verdant peaks blanketed in morning mist, cascading waterfalls, and hand-plucked Ceylon tea estates.',
        image: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?auto=format&fit=crop&w=1000&q=85',
        fallback: lobbyPhoto,
        tag: 'Highlands'
      },
      {
        id: 'wildlife',
        title: 'Untamed Wildlife & Sanctuaries',
        subtitle: 'Elephants & Leopards',
        description: 'Roam through Yala and Minneriya where Asian elephants gather and elusive leopards tread ancient forests.',
        image: 'https://images.unsplash.com/photo-1581852017103-68ac6550407b?auto=format&fit=crop&w=1000&q=85',
        fallback: resortPhoto,
        tag: 'Safari & Wild'
      },
      {
        id: 'heritage',
        title: 'Living Heritage & Ancient Kingdoms',
        subtitle: '2,500 Years of Grace',
        description: 'From rock fortresses rising from jungle canopies to sacred lotus temples, timeless art endures.',
        image: 'https://images.unsplash.com/photo-1588598198321-9735fd52455d?auto=format&fit=crop&w=1000&q=85',
        fallback: lobbyPhoto,
        tag: 'Culture & Sacred'
      }
    ],

    // Curated Experiences (Section 4 - Experiences)
    experiences: [
      {
        id: 'beach-escapes',
        category: 'Beach & Ocean',
        title: 'Bespoke Coastal Escapes',
        description: 'Private catamaran sailing at sunset, secluded coves for quiet sea swims, and stilt-fisherman shorelines.',
        image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=85',
        fallback: resortPhoto,
        highlight: 'Private Sunset Sailing'
      },
      {
        id: 'tea-trails',
        category: 'Highlands',
        title: 'Ceylon Tea Masterclass & Trails',
        description: 'Wander historic highland plantations, learn artisanal leaf sorting, and taste rare single-origin vintages.',
        image: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?auto=format&fit=crop&w=800&q=85',
        fallback: lobbyPhoto,
        highlight: 'Private Estate Tasting'
      },
      {
        id: 'wildlife-safari',
        category: 'Nature & Wild',
        title: 'Dawn Safari & Elephant Gathering',
        description: 'Guided naturalists lead open-air dawn safaris through untouched scrublands to observe majestic herds in the wild.',
        image: 'https://images.unsplash.com/photo-1581852017103-68ac6550407b?auto=format&fit=crop&w=800&q=85',
        fallback: resortPhoto,
        highlight: 'Naturalist-Led Safaris'
      },
      {
        id: 'wellness-ayurveda',
        category: 'Wellness & Spa',
        title: 'Ancient Ayurvedic Rejuvenation',
        description: 'Centuries-old herbal therapy oils, guided sunrise meditation by the sea, and restorative forest bathing.',
        image: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=800&q=85',
        fallback: lobbyPhoto,
        highlight: 'Herbal Botanical Healing'
      },
      {
        id: 'gastronomy',
        category: 'Cuisine',
        title: 'Spice Island Culinary Journey',
        description: 'Infusions of fresh coconut milk, roasted Ceylon cinnamon, sweet lemongrass, and fresh reef catches.',
        image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=85',
        fallback: resortPhoto,
        highlight: 'Chef-Led Tasting Table'
      },
      {
        id: 'culture-craft',
        category: 'Arts & Craft',
        title: 'Artisanal Village Craftsmanship',
        description: 'Discover handloom textile weaving, brass carving, and lacquer artistry passed down through family generations.',
        image: 'https://images.unsplash.com/photo-1588258524675-c6190ec31c16?auto=format&fit=crop&w=800&q=85',
        fallback: lobbyPhoto,
        highlight: 'Master Artisan Visits'
      }
    ],

    // The Sri Lankan Story (Section 5 - The Spirit of Sri Lanka)
    story: {
      eyebrow: 'THE SPIRIT OF SRI LANKA',
      title: 'A Warm Welcome Sculpted by Land, Sea, and Soul',
      quote: '“In Sri Lanka, to receive a guest is to welcome family into your sanctuary.”',
      paragraphs: [
        'Rooted in the ancient concept of Serendib — where serendipitous beauty unfolds at every turn — Sri Lankan hospitality is guided by quiet sincerity, warm smiles, and deep reverence for the natural world.',
        'Here, mornings begin with the scent of wild cardamom and cinnamon on the breeze, afternoons linger under the shade of coastal coconut groves, and twilight gathers guests around firelit tables savoring freshly ground curries and tropical ocean breezes.',
        'At our sanctuary, we honor this heritage by pairing contemporary architectural comfort with the soulful generosity of authentic island living.'
      ],
      stats: [
        { label: 'Tropical Coastline', value: '1,340 km' },
        { label: 'Living Heritage', value: '2,500+ Yrs' },
        { label: 'Protected Sanctuaries', value: '26 Parks' },
        { label: 'Island Hospitality', value: '100% Genuine' }
      ]
    },

    // Default active property metadata (used alongside backend API)
    defaultProperty: {
      name: 'Sri Lanka Main Property',
      chainName: 'HotelPMS Luxury Chain',
      badge: 'FLAGSHIP RESORT &bull; SRI LANKA',
      location: 'Colombo & Coastal Gateway, Sri Lanka',
      headline: 'A Haven of Calming Spaces and Oceanfront Splendor',
      description: 'Nestled between the azure waters of the Indian Ocean and lush tropical landscapes, our flagship property serves as your serene gateway to Sri Lanka. Experience bespoke suites, fine dining infused with island spices, and intuitive concierge service.',
      checkInTime: '14:00',
      checkOutTime: '11:00',
      phone: '+94 11 234 5678',
      email: 'srilanka.reservations@hotelpms.com',
      starRating: 5,
      amenities: [
        'Oceanfront Infinity Pool',
        'Ayurvedic Wellness Spa',
        '24/7 Butler & Concierge',
        'Ceylon Spice Dining Lounge',
        'Complimentary High-Speed Wi-Fi',
        'Private Airport Chauffeur'
      ]
    }
  }
};

/**
 * Utility helper to retrieve destination content safely
 */
export const getDestinationData = (destinationId = 'sri-lanka') => {
  return DESTINATION_DETAILS[destinationId] || DESTINATION_DETAILS['sri-lanka'];
};
