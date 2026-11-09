// frontend/src/pages/CustomerHome.js
import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { 
  FaBed, 
  FaCalendarAlt, 
  FaUsers, 
  FaCheckCircle, 
  FaShieldAlt, 
  FaConciergeBell, 
  FaClock, 
  FaStar, 
  FaWifi, 
  FaTimes, 
  FaArrowRight, 
  FaSearch,
  FaPhoneAlt,
  FaCheck,
  FaMapMarkerAlt,
  FaLock,
  FaCreditCard,
  FaMoneyBillWave,
  FaGlobe
} from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import { roomAPI, bookingAPI, propertyAPI } from '../services/api';
import { toast } from 'react-toastify';
import { format, addDays } from 'date-fns';

import { getDestinationData } from '../config/destinationData';
import DestinationNavbar from '../components/DestinationNavbar';
import DestinationHero from '../components/DestinationHero';
import DestinationSearch from '../components/DestinationSearch';
import DestinationDiscovery from '../components/DestinationDiscovery';
import PropertyShowcase from '../components/PropertyShowcase';
import DestinationExperiences from '../components/DestinationExperiences';
import DestinationStory from '../components/DestinationStory';
import DestinationDiningStory from '../components/DestinationDiningStory';
import DestinationEscape from '../components/DestinationEscape';
import DestinationConcierge from '../components/DestinationConcierge';
import PaymentModal from '../components/PaymentModal';
import DestinationFooter from '../components/DestinationFooter';
import ScrollOfferPopup from '../components/ScrollOfferPopup';

import roomDeluxePhoto from '../assets/room-deluxe.jpg';
import roomSuitePhoto from '../assets/room-suite.jpg';
import resortPhoto from '../assets/hotel-resort-cinematic.jpg';
import lobbyPhoto from '../assets/hotel-lobby-cinematic.jpg';

import './LuxuryDestinationHome.css';
import './CustomerPortal.css';

const featureRoomCatalog = [
  {
    name: 'Deluxe King Room',
    type: 'Deluxe',
    image: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=85',
    galleryImages: [
      'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1600&q=85',
      'https://images.unsplash.com/photo-1595576508898-0ad5c879a061?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1564078516393-cf04bd966897?auto=format&fit=crop&w=1200&q=85'
    ],
    description: 'A refined sanctuary for couples and business travellers, pairing plush bedding with elegant island-inspired finishes.',
    roomSize: '35 m²',
    bedType: '1 King Bed',
    guestCapacity: '2 Guests',
    price: 185,
    facilities: ['Free Wi‑Fi', 'Air Conditioning', 'Smart TV', 'Private Bathroom', 'Breakfast', 'Room Service']
  },
  {
    name: 'Deluxe Twin Room',
    type: 'Twin',
    image: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1200&q=85',
    galleryImages: [
      'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1600&q=85',
      'https://images.unsplash.com/photo-1591088398332-8a7791972843?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1594563703937-fdc640497dcd?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=1200&q=85'
    ],
    description: 'Bright, practical, and beautifully styled for flexible stays with added workspace comfort and restful sleep.',
    roomSize: '34 m²',
    bedType: '2 Single Beds',
    guestCapacity: '2 Guests',
    price: 170,
    facilities: ['Free Wi‑Fi', 'Air Conditioning', 'Desk', 'Private Bathroom', 'Breakfast', 'City View']
  },
  {
    name: 'Executive Room',
    type: 'Executive',
    image: 'https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=1200&q=85',
    galleryImages: [
      'https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=1600&q=85',
      'https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1596436889106-be35e843f974?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1578774204375-826dc5d996ed?auto=format&fit=crop&w=1200&q=85'
    ],
    description: 'A polished executive hideaway with a priority feel, designed for short stays, meetings, and luxurious downtime.',
    roomSize: '42 m²',
    bedType: '1 King Bed',
    guestCapacity: '2 Guests',
    price: 225,
    facilities: ['Free Wi‑Fi', 'Air Conditioning', 'Work Desk', 'Smart TV', 'Breakfast', 'Mini Bar']
  },
  {
    name: 'Family Suite',
    type: 'Suite',
    image: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1200&q=85',
    galleryImages: [
      'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1600&q=85',
      'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1540518614846-7eded433c457?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=1200&q=85'
    ],
    description: 'Spacious and inviting, this suite balances family comfort with elegant finishes, flexible sleeping layouts, and timeless style.',
    roomSize: '58 m²',
    bedType: '1 King Bed + 1 Sofa Bed',
    guestCapacity: '4 Guests',
    price: 310,
    facilities: ['Free Wi‑Fi', 'Air Conditioning', 'Family Lounge', 'Private Bathroom', 'Breakfast', 'Room Service']
  },
  {
    name: 'Executive Suite',
    type: 'Suite',
    image: 'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?auto=format&fit=crop&w=1200&q=85',
    galleryImages: [
      'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?auto=format&fit=crop&w=1600&q=85',
      'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1200&q=85'
    ],
    description: 'An elevated suite for discerning guests seeking space, privacy, and a premium stay with refined island hospitality.',
    roomSize: '68 m²',
    bedType: '1 King Bed',
    guestCapacity: '3 Guests',
    price: 390,
    facilities: ['Free Wi‑Fi', 'Air Conditioning', 'Smart TV', 'Private Bathroom', 'Breakfast', 'Pool Access']
  },
  {
    name: 'Presidential Suite',
    type: 'Presidential',
    image: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=85',
    galleryImages: [
      'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1600&q=85',
      'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=1200&q=85',
      'https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1200&q=85'
    ],
    description: 'The signature residence of the property, designed for occasions, privacy, and indulgent coastal luxury in every detail.',
    roomSize: '95 m²',
    bedType: '1 King Bed + Lounge Area',
    guestCapacity: '4 Guests',
    price: 520,
    facilities: ['Free Wi‑Fi', 'Air Conditioning', 'Private Lounge', 'Smart TV', 'Breakfast', 'Butler Service']
  }
];

const fallbackRoomCatalog = featureRoomCatalog.map((room, index) => ({
  _id: `fallback-room-${index + 1}`,
  roomType: room.type,
  roomNumber: `${index + 101}`,
  basePrice: room.price,
  price: room.price,
  description: room.description,
  bedConfiguration: room.bedType,
  roomSize: room.roomSize,
  capacity: { maxOccupancy: Number(room.guestCapacity.replace(/\D/g, '')) || 2, maxAdults: Number(room.guestCapacity.replace(/\D/g, '')) || 2 },
  roomName: room.name,
  images: [room.image],
  name: room.name,
  featureImage: room.image,
  amenities: room.facilities,
  view: 'Scenic Coastal View',
  building: 'Main Pavilion',
  floor: 1 + index
}));

const getFeatureRoomProfile = (room, fallbackIndex = 0) => {
  const roomTypeKey = (room?.roomType || room?.name || room?.roomName || '').toLowerCase();
  const bedKey = (room?.bedConfiguration || '').toLowerCase();
  if (roomTypeKey.includes('presidential')) return featureRoomCatalog[5];
  if (roomTypeKey.includes('family')) return featureRoomCatalog[3];
  if (roomTypeKey.includes('executive') && roomTypeKey.includes('suite')) return featureRoomCatalog[4];
  if (roomTypeKey.includes('executive')) return featureRoomCatalog[2];
  if (roomTypeKey.includes('twin') || bedKey.includes('twin') || bedKey.includes('single')) return featureRoomCatalog[1];
  if (roomTypeKey.includes('deluxe')) return featureRoomCatalog[0];
  if (roomTypeKey.includes('suite')) return featureRoomCatalog[4];
  return featureRoomCatalog[fallbackIndex % featureRoomCatalog.length];
};

const CustomerHome = () => {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const handledStayNavigation = useRef(false);

  // Active Destination State (Defaults to Sri Lanka)
  const [activeDestination, setActiveDestination] = useState('sri-lanka');
  const destinationData = getDestinationData(activeDestination);

  // Property State (Fetched from backend)
  const [property, setProperty] = useState(null);

  // Search Parameters
  const [checkInDate, setCheckInDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [checkOutDate, setCheckOutDate] = useState(() => format(addDays(new Date(), 2), 'yyyy-MM-dd'));
  const [guestsCount, setGuestsCount] = useState(1);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState('All');

  // Rooms State
  const [rooms, setRooms] = useState(fallbackRoomCatalog);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [hasLoadedRooms, setHasLoadedRooms] = useState(false);

  // Selected Room for Details Modal
  const [selectedRoomDetails, setSelectedRoomDetails] = useState(null);
  const [roomGalleryIndex, setRoomGalleryIndex] = useState(0);
  const [showAllRooms, setShowAllRooms] = useState(false);

  // Reservation Flow Modal State
  const [bookingModalRoom, setBookingModalRoom] = useState(null);
  const [bookingFormData, setBookingFormData] = useState({
    checkInDate: format(new Date(), 'yyyy-MM-dd'),
    checkOutDate: format(addDays(new Date(), 2), 'yyyy-MM-dd'),
    numberOfGuests: 1,
    specialRequests: '',
    paymentMethod: 'Cash'
  });
  const [submittingBooking, setSubmittingBooking] = useState(false);
  const [confirmedReservation, setConfirmedReservation] = useState(null);

  // Auth Prompt Modal State (For unauthenticated guests who click Book Now)
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [paymentModalData, setPaymentModalData] = useState(null);

  useEffect(() => {
    fetchActiveProperty();
    fetchRooms();
  }, []);

  useEffect(() => {
    if (rooms.length === 0) {
      setRooms(fallbackRoomCatalog);
    }
  }, [rooms]);

  // Fetch the active property from the backend
  const fetchActiveProperty = async () => {
    try {
      const response = await propertyAPI.getCurrentProperty();
      if (response.data) {
        setProperty(response.data);
      }
    } catch (err) {
      // Graceful fallback to destination configured default property
      console.log('Using configured destination property defaults');
    }
  };

  // Fetch available rooms from existing backend API
  const fetchRooms = async (inDate = checkInDate, outDate = checkOutDate, type = selectedTypeFilter) => {
    try {
      setLoadingRooms(true);
      const typeParam = type === 'All' ? undefined : type;
      const response = await roomAPI.getAvailableRooms(inDate, outDate, typeParam);
      const roomsFromApi = response.data || [];
      if (roomsFromApi.length > 0) {
        setRooms(roomsFromApi);
      } else {
        setRooms(fallbackRoomCatalog.filter((room) => type === 'All' || room.roomType.toLowerCase().includes(type.toLowerCase())));
      }
    } catch (err) {
      console.error('Failed to load rooms', err);
      setRooms(fallbackRoomCatalog.filter((room) => type === 'All' || room.roomType.toLowerCase().includes(type.toLowerCase())));
      toast.error('Unable to fetch available rooms at this time');
    } finally {
      setLoadingRooms(false);
      setHasLoadedRooms(true);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (new Date(checkInDate) >= new Date(checkOutDate)) {
      toast.error('Check-out date must be after check-in date');
      return;
    }
    fetchRooms(checkInDate, checkOutDate, selectedTypeFilter);
    toast.success('Updated room availability for Sri Lanka Main Property');
    const roomsEl = document.getElementById('rooms');
    if (roomsEl) {
      roomsEl.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleFilterClick = (type) => {
    setSelectedTypeFilter(type);
    fetchRooms(checkInDate, checkOutDate, type);
  };

  // Open booking modal for a specific room
  const handleOpenBookingModal = (room) => {
    if (!isAuthenticated) {
      setShowAuthPrompt(true);
      return;
    }

    setSelectedRoomDetails(null); // Close details modal if open
    setBookingModalRoom(room);
    setConfirmedReservation(null);
    setBookingFormData({
      checkInDate,
      checkOutDate,
      numberOfGuests: Math.min(guestsCount, room.capacity?.maxOccupancy || 2),
      specialRequests: '',
      paymentMethod: 'Cash'
    });
  };

  useEffect(() => {
    const requestedRoomId = searchParams.get('roomId');
    const shouldChooseRoom = searchParams.get('chooseRoom') === '1';
    if (handledStayNavigation.current || (!requestedRoomId && !shouldChooseRoom) || loadingRooms || !hasLoadedRooms) return;

    handledStayNavigation.current = true;
    setShowAllRooms(true);
    document.getElementById('rooms')?.scrollIntoView({ behavior: 'smooth' });

    if (requestedRoomId) {
      const matchingRoom = rooms.find((room) => String(room._id) === requestedRoomId);
      if (matchingRoom) handleOpenBookingModal(matchingRoom);
    } else if (shouldChooseRoom && rooms.length > 0) {
      handleOpenBookingModal(rooms[0]);
    }
  }, [hasLoadedRooms, loadingRooms, rooms, searchParams]);

  // Calculate pricing breakdown (strictly aligned with backend pricing)
  const calculateTotal = (room, inDate, outDate) => {
    if (!room) return { days: 1, rate: 0, total: 0 };
    const start = new Date(inDate);
    const end = new Date(outDate);
    const days = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
    const rate = Number(room.basePrice || room.price || 0);
    return {
      days,
      rate,
      total: days * rate
    };
  };

  // Submit Reservation using existing canonical backend flow
  const handleConfirmReservation = async (e) => {
    e.preventDefault();
    if (!bookingModalRoom) return;

    if (new Date(bookingFormData.checkInDate) >= new Date(bookingFormData.checkOutDate)) {
      toast.error('Check-out date must be after check-in date');
      return;
    }

    try {
      setSubmittingBooking(true);
      const payload = {
        roomId: bookingModalRoom._id,
        checkInDate: bookingFormData.checkInDate,
        checkOutDate: bookingFormData.checkOutDate,
        numberOfGuests: Number(bookingFormData.numberOfGuests) || 1,
        specialRequests: bookingFormData.specialRequests,
        paymentMethod: bookingFormData.paymentMethod
      };

      const response = await bookingAPI.createBooking(payload);
      setConfirmedReservation(response.data);
      toast.success('Reservation successfully confirmed at Serendib Sanctuary!');
      // Refresh room list
      fetchRooms(checkInDate, checkOutDate, selectedTypeFilter);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to complete reservation');
    } finally {
      setSubmittingBooking(false);
    }
  };

  const getRoomPhoto = (room) => {
    if (room?.images && room.images.length > 0 && room.images[0]) {
      return room.images[0];
    }

    if (room?.featureImage) {
      return room.featureImage;
    }

    const type = (room?.roomType || '').toLowerCase();
    const featureProfile = getFeatureRoomProfile(room);

    if (type.includes('suite') || room?.name?.toLowerCase().includes('suite')) {
      return featureProfile.image;
    }
    if (type.includes('deluxe') || room?.name?.toLowerCase().includes('deluxe')) {
      return featureProfile.image;
    }
    if (type.includes('presidential')) {
      return featureProfile.image;
    }
    if (room?.name?.toLowerCase().includes('family')) {
      return featureProfile.image;
    }
    if (room?.name?.toLowerCase().includes('executive')) {
      return featureProfile.image;
    }
    return featureProfile.image || roomDeluxePhoto;
  };

  const pricing = bookingModalRoom
    ? calculateTotal(bookingModalRoom, bookingFormData.checkInDate, bookingFormData.checkOutDate)
    : { days: 1, rate: 0, total: 0 };

  const scrollToRooms = () => {
    const el = document.getElementById('rooms');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToDiscovery = () => {
    const el = document.getElementById('discovery');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="dest-page-root">
      {/* ============================================================
          Navigation Header with Drawer
          ============================================================ */}
      <DestinationNavbar 
        destinationData={destinationData}
        onBookNowClick={scrollToRooms}
      />

      {/* ============================================================
          SECTION 1 — HERO
          ============================================================ */}
      <DestinationHero 
        destinationData={destinationData}
        onExploreClick={scrollToDiscovery}
        onBookClick={scrollToRooms}
      />

      {/* Floating Availability Search Bar */}
      <DestinationSearch 
        checkInDate={checkInDate}
        setCheckInDate={setCheckInDate}
        checkOutDate={checkOutDate}
        setCheckOutDate={setCheckOutDate}
        guestsCount={guestsCount}
        setGuestsCount={setGuestsCount}
        selectedTypeFilter={selectedTypeFilter}
        setSelectedTypeFilter={setSelectedTypeFilter}
        onSubmit={handleSearchSubmit}
      />

      {/* ============================================================
          SECTION 2 — DESTINATION DISCOVERY (Sri Lanka)
          ============================================================ */}
      <DestinationDiscovery destinationData={destinationData} />

      {/* ============================================================
          SECTION 3 — OUR PROPERTY (Stay With Us)
          ============================================================ */}
      <PropertyShowcase 
        property={property || destinationData.defaultProperty}
        onBookClick={scrollToRooms}
        onExploreRoomsClick={scrollToRooms}
      />

      {/* ============================================================
          SECTION 4 — EXPERIENCES
          ============================================================ */}
      <DestinationExperiences destinationData={destinationData} />

      {/* ============================================================
          SECTION 5 — SRI LANKAN STORY (The Spirit of Sri Lanka)
          ============================================================ */}
      <DestinationStory destinationData={destinationData} />

      {/* ============================================================
          SECTION 5B — DISCOVER OUR DINING (Haute Gastronomie & Ceylon Harvest)
          ============================================================ */}
      <DestinationDiningStory />

      {/* ============================================================
          SECTION 6 — ROOMS & STAYS (Database-Driven Accommodations)
          ============================================================ */}
      <section className="dest-section" id="rooms" style={{ backgroundColor: 'var(--c-ivory-light)' }}>
        <div className="dest-container">
          <div className="dest-section-header">
            <span className="dest-eyebrow">SANCTUARY ACCOMMODATIONS</span>
            <h2 className="dest-heading">Suites & Stays</h2>
            <p className="dest-lead">
              Carefully curated accommodations at Sri Lanka Main Property, offering bespoke 
              comfort, authentic artisanal furnishings, and serene coastal breezes.
            </p>
          </div>

          {/* Category Filter Pills */}
          <div className="dest-rooms-filter">
            {['All', 'Deluxe', 'Suite', 'Double', 'Single'].map((type) => (
              <button
                key={type}
                type="button"
                className={`dest-filter-btn ${selectedTypeFilter === type ? 'active' : ''}`}
                onClick={() => handleFilterClick(type)}
              >
                {type === 'All' ? 'All Accommodations' : `${type} Rooms`}
              </button>
            ))}
          </div>

          {/* Rooms Grid */}
          {loadingRooms ? (
            <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--c-text-muted)' }}>
              <div className="spinner" style={{ margin: '0 auto 1rem auto' }} />
              <p>Inquiring room availability for Sri Lanka Main Property...</p>
            </div>
          ) : rooms.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '4rem 2rem', 
              background: '#FFFFFF', 
              borderRadius: '1.25rem', 
              border: '1px solid var(--c-border-light)',
              boxShadow: 'var(--shadow-soft)',
              maxWidth: '680px',
              margin: '0 auto'
            }}>
              <FaBed size={40} style={{ color: 'var(--c-sand)', marginBottom: '1rem' }} />
              <h3 style={{ color: 'var(--c-forest-deep)', marginBottom: '0.5rem', fontWeight: 400 }}>
                No rooms available for the selected dates
              </h3>
              <p style={{ color: 'var(--c-text-secondary)', margin: '0.5rem auto 1.5rem auto', lineHeight: 1.6 }}>
                Please adjust your check-in and check-out dates, or select "All Accommodations" to explore other available options.
              </p>
              <button 
                type="button" 
                className="dest-hero-btn-primary"
                onClick={() => handleFilterClick('All')}
                style={{ padding: '0.75rem 1.75rem', fontSize: '0.8rem' }}
              >
                Show All Available Rooms
              </button>
            </div>
          ) : (
            <div className="dest-rooms-grid">
              {rooms.slice(0, showAllRooms ? rooms.length : 3).map((room, roomIndex) => {
                const roomProfile = getFeatureRoomProfile(room, roomIndex);
                const photo = roomProfile.image;
                const maxAdults = room.capacity?.maxAdults || 2;
                const maxOcc = room.capacity?.maxOccupancy || 2;
                const displayName = roomProfile.name;
                const displayPrice = Number(room.basePrice || room.price || roomProfile.price || 0);
                const displaySize = room.roomSize || roomProfile.roomSize;
                const displayBed = room.bedConfiguration || roomProfile.bedType;
                const guestInfo = room.capacity ? `Up to ${maxOcc} Guests (${maxAdults} Adults)` : roomProfile.guestCapacity;
                const displayFacilities = (room.amenities && room.amenities.length > 0 ? room.amenities : roomProfile.facilities).slice(0, 6);

                return (
                  <div key={room._id} className="dest-room-card">
                    <div className="dest-room-media">
                      <img 
                        src={photo} 
                        alt={displayName} 
                        className="dest-room-img" 
                        loading="lazy"
                      />
                      <div className="dest-room-tag">
                        {room.roomType || roomProfile.type}
                      </div>
                      <div className="dest-room-avail-badge">
                        Available
                      </div>
                    </div>

                    <div className="dest-room-body">
                      <div className="dest-room-header">
                        <h3 className="dest-room-name">
                          {displayName}
                        </h3>
                        <div className="dest-room-price">
                          <span className="dest-room-price-val">
                            Rs. {displayPrice.toLocaleString()}
                          </span>
                          <span className="dest-room-price-sub"> / night</span>
                        </div>
                      </div>

                      <p className="dest-room-desc">
                        {room.description || roomProfile.description}
                      </p>

                      <div className="dest-room-specs">
                        <div className="dest-room-spec-item">
                          <span className="dest-room-spec-label">Size</span>
                          <span>{displaySize}</span>
                        </div>
                        <div className="dest-room-spec-item">
                          <span className="dest-room-spec-label">Bed</span>
                          <span>{displayBed}</span>
                        </div>
                        <div className="dest-room-spec-item">
                          <span className="dest-room-spec-label">Guests</span>
                          <span>{guestInfo}</span>
                        </div>
                      </div>

                      <div className="dest-room-feature-list">
                        {displayFacilities.map((facility, index) => (
                          <span key={`${room._id}-${facility}-${index}`} className="dest-room-feature-item">
                            <FaCheck /> {facility}
                          </span>
                        ))}
                      </div>

                      <div className="dest-room-actions">
                        <button
                          type="button"
                          className="dest-room-btn-details"
                          onClick={() => {
                            setRoomGalleryIndex(0);
                            setSelectedRoomDetails({
                            ...room,
                            name: displayName,
                            roomType: displayName,
                            roomNumber: room.roomNumber || 'N/A',
                            description: room.description || roomProfile.description,
                            bedConfiguration: displayBed,
                            roomSize: displaySize,
                            price: displayPrice,
                            basePrice: displayPrice,
                            capacity: {
                              maxOccupancy: maxOcc,
                              maxAdults: maxAdults,
                              ...room.capacity
                            },
                            amenities: displayFacilities,
                            featureImage: photo,
                            galleryImages: roomProfile.galleryImages
                            });
                          }}
                        >
                          View Details
                        </button>
                        <button
                          type="button"
                          className="dest-room-btn-reserve"
                          onClick={() => handleOpenBookingModal({
                            ...room,
                            name: displayName,
                            roomType: displayName,
                            price: displayPrice,
                            basePrice: displayPrice,
                            bedConfiguration: displayBed,
                            roomSize: displaySize
                          })}
                        >
                          Book Now
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {!loadingRooms && rooms.length > 3 && (
            <div className="dest-rooms-more-wrap">
              <button type="button" className="dest-rooms-more-btn" onClick={() => setShowAllRooms((expanded) => !expanded)}>{showAllRooms ? 'Show Less' : 'More Rooms'}</button>
            </div>
          )}
        </div>
      </section>

      {/* ============================================================
          SECTION 8 — DESTINATION SELECTION EXPERIENCE
          ============================================================ */}
      <DestinationEscape 
        activeDestination={activeDestination}
        onSelectDestination={(id) => {
          setActiveDestination(id);
          toast.info(`Switched destination to ${id === 'sri-lanka' ? 'Sri Lanka' : id}`);
        }}
      />

      {/* ============================================================
          SECTION 9 — SUBTLE HOSPITALITY CONCIERGE ASSISTANT
          ============================================================ */}
      <DestinationConcierge property={property || destinationData.defaultProperty} />

      {/* ============================================================
          SECTION 10 — LUXURY DESTINATION FOOTER
          ============================================================ */}
      <DestinationFooter property={property || destinationData.defaultProperty} />

      {/* ============================================================
          MODAL 1: ROOM DETAILS MODAL
          ============================================================ */}
      {selectedRoomDetails && (
        <div className="portal-modal-backdrop" onClick={() => setSelectedRoomDetails(null)}>
          <div className="portal-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="portal-modal-header" style={{ borderBottom: '1px solid var(--c-border-light)' }}>
              <h3 className="portal-modal-title" style={{ color: 'var(--c-forest-deep)', fontWeight: 500 }}>
                {selectedRoomDetails.roomType} &bull; Room {selectedRoomDetails.roomNumber}
              </h3>
              <button 
                type="button" 
                className="portal-modal-close"
                onClick={() => setSelectedRoomDetails(null)}
                aria-label="Close"
              >
                <FaTimes />
              </button>
            </div>

            <div className="portal-modal-body">
              <div className="room-gallery-main">
                <img src={selectedRoomDetails.galleryImages?.[roomGalleryIndex] || getRoomPhoto(selectedRoomDetails)} alt={selectedRoomDetails.roomType} />
                <button type="button" className="room-gallery-arrow previous" aria-label="Previous room photo" onClick={() => setRoomGalleryIndex((index) => (index - 1 + selectedRoomDetails.galleryImages.length) % selectedRoomDetails.galleryImages.length)}>‹</button>
                <button type="button" className="room-gallery-arrow next" aria-label="Next room photo" onClick={() => setRoomGalleryIndex((index) => (index + 1) % selectedRoomDetails.galleryImages.length)}>›</button>
              </div>
              <div className="room-gallery-thumbnails">
                {(selectedRoomDetails.galleryImages || [getRoomPhoto(selectedRoomDetails)]).map((image, index) => (
                  <button type="button" key={image} className={`room-gallery-thumb ${index === roomGalleryIndex ? 'active' : ''}`} onClick={() => setRoomGalleryIndex(index)} aria-label={`Show room photo ${index + 1}`}><img src={image} alt={`${selectedRoomDetails.roomType} view ${index + 1}`} /></button>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem' }}>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--c-brass)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.1em' }}>
                    {selectedRoomDetails.building || 'Main Pavilion'} &bull; Floor {selectedRoomDetails.floor || 1}
                  </span>
                  <div style={{ fontSize: '1.1rem', fontWeight: 500, color: 'var(--c-forest-deep)', marginTop: '0.2rem' }}>
                    {selectedRoomDetails.bedConfiguration || 'Double Bed'}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--c-forest-deep)' }}>
                    Rs. {Number(selectedRoomDetails.basePrice || selectedRoomDetails.price || 0).toLocaleString()}
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--c-text-muted)' }}>per night (taxes included)</span>
                </div>
              </div>

              <p style={{ color: 'var(--c-text-secondary)', lineHeight: 1.7, marginBottom: '1.5rem' }}>
                {selectedRoomDetails.description || 'Chic sanctuary guestroom featuring artisanal furnishings, ergonomic workspace, and peaceful tropical views.'}
              </p>

              {/* Room Specifications Table */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 1fr', 
                gap: '0.75rem', 
                padding: '1rem', 
                background: 'var(--c-sand-subtle)', 
                borderRadius: '0.75rem', 
                border: '1px solid var(--c-border-light)',
                marginBottom: '1.5rem',
                fontSize: '0.875rem'
              }}>
                <div><strong>Max Occupancy:</strong> {selectedRoomDetails.capacity?.maxOccupancy || 2} Guests</div>
                <div><strong>Max Adults:</strong> {selectedRoomDetails.capacity?.maxAdults || 2} Adults</div>
                <div><strong>View:</strong> {selectedRoomDetails.view || 'Scenic Tropical View'}</div>
                <div><strong>Room Size:</strong> {selectedRoomDetails.roomSize || 'Standard'}</div>
              </div>

              {/* Amenities */}
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--c-forest-deep)' }}>
                  Room Amenities & Inclusions
                </h4>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {(selectedRoomDetails.amenities && selectedRoomDetails.amenities.length > 0) ? (
                    selectedRoomDetails.amenities.map((item, idx) => (
                      <span key={idx} className="portal-amenity-pill">
                        &bull; {item}
                      </span>
                    ))
                  ) : (
                    <>
                      <span className="portal-amenity-pill">&bull; High-Speed Wi-Fi</span>
                      <span className="portal-amenity-pill">&bull; Smart Entertainment</span>
                      <span className="portal-amenity-pill">&bull; Climate Control</span>
                      <span className="portal-amenity-pill">&bull; En-suite Rainfall Shower</span>
                      <span className="portal-amenity-pill">&bull; Daily Housekeeping</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="portal-modal-footer">
              <button
                type="button"
                className="dest-btn-property-details"
                onClick={() => setSelectedRoomDetails(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="dest-hero-btn-primary"
                style={{ padding: '0.75rem 1.6rem', fontSize: '0.8rem' }}
                onClick={() => handleOpenBookingModal(selectedRoomDetails)}
              >
                Reserve This Room
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          MODAL 2: CANONICAL RESERVATION FLOW MODAL
          ============================================================ */}
      {bookingModalRoom && (
        <div className="portal-modal-backdrop" onClick={() => !submittingBooking && setBookingModalRoom(null)}>
          <div className="portal-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="portal-modal-header" style={{ borderBottom: '1px solid var(--c-border-light)' }}>
              <h3 className="portal-modal-title" style={{ color: 'var(--c-forest-deep)', fontWeight: 500 }}>
                {confirmedReservation ? 'Reservation Confirmed' : `Reserve ${bookingModalRoom.roomType} Room ${bookingModalRoom.roomNumber}`}
              </h3>
              {!submittingBooking && (
                <button 
                  type="button" 
                  className="portal-modal-close"
                  onClick={() => setBookingModalRoom(null)}
                  aria-label="Close"
                >
                  <FaTimes />
                </button>
              )}
            </div>

            <div className="portal-modal-body">
              {confirmedReservation ? (
                /* Success Confirmation View */
                <div className="portal-success-card">
                  <div className="portal-success-icon" style={{ background: 'var(--c-sand-subtle)', color: 'var(--c-brass)' }}>
                    <FaCheck />
                  </div>
                  <h3 style={{ fontSize: '1.45rem', fontWeight: 500, color: 'var(--c-forest-deep)', marginBottom: '0.5rem' }}>
                    Sanctuary Reservation Confirmed!
                  </h3>
                  <p style={{ color: 'var(--c-text-secondary)', marginBottom: '1.25rem' }}>
                    Your stay at Sri Lanka Main Property is guaranteed. A confirmation record is available in your profile.
                  </p>

                  <div className="portal-success-num" style={{ background: 'var(--c-sand-subtle)', borderColor: 'var(--c-sand)', color: 'var(--c-forest-deep)' }}>
                    Reservation #: {confirmedReservation.reservationNumber || `RES-${confirmedReservation._id.slice(-6).toUpperCase()}`}
                  </div>

                  <div style={{ 
                    textAlign: 'left', 
                    background: '#FFFFFF', 
                    border: '1px solid var(--c-border-light)', 
                    borderRadius: '0.75rem', 
                    padding: '1.25rem',
                    marginBottom: '1.5rem',
                    fontSize: '0.9rem',
                    lineHeight: 1.8
                  }}>
                    <div><strong>Sanctuary:</strong> Sri Lanka Main Property (Serendib Sanctuary)</div>
                    <div><strong>Accommodation:</strong> {bookingModalRoom.roomType} (Room {bookingModalRoom.roomNumber})</div>
                    <div><strong>Check-In:</strong> {format(new Date(confirmedReservation.checkInDate), 'EEEE, MMMM d, yyyy')} (14:00)</div>
                    <div><strong>Check-Out:</strong> {format(new Date(confirmedReservation.checkOutDate), 'EEEE, MMMM d, yyyy')} (11:00)</div>
                    <div><strong>Guests:</strong> {confirmedReservation.numberOfGuests} Guest(s)</div>
                    <div><strong>Total Amount:</strong> Rs. {confirmedReservation.totalPrice?.toLocaleString()}</div>
                    <div><strong>Status:</strong> <span className="badge badge-success" style={{ textTransform: 'capitalize' }}>{confirmedReservation.bookingStatus || 'Confirmed'}</span></div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="dest-hero-btn-primary"
                      style={{ padding: '0.75rem 1.5rem', fontSize: '0.8rem', background: 'var(--c-brass, #B68C48)', borderColor: 'var(--c-brass, #B68C48)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                      onClick={() => {
                        const targetBooking = confirmedReservation;
                        const savedRoom = bookingModalRoom;
                        setBookingModalRoom(null);
                        setPaymentModalData({
                          purpose: 'room_booking',
                          targetId: targetBooking._id,
                          itemSummary: {
                            title: `${savedRoom?.roomType || 'Room'} ${savedRoom?.roomNumber || ''}`,
                            subtitle: `Reservation: ${targetBooking.reservationNumber || 'Serendib Stay'}`,
                            dates: `${format(new Date(targetBooking.checkInDate), 'EEE, MMM d')} → ${format(new Date(targetBooking.checkOutDate), 'EEE, MMM d')}`,
                            guests: `${targetBooking.numberOfGuests} Guest(s)`
                          }
                        });
                      }}
                    >
                      <FaCreditCard size={12} /> Pay with PayHere Now
                    </button>
                    <Link to="/my-bookings" className="dest-btn-property-details" style={{ padding: '0.75rem 1.5rem', fontSize: '0.8rem', textDecoration: 'none' }} onClick={() => setBookingModalRoom(null)}>
                      View in My Reservations
                    </Link>
                    <button 
                      type="button" 
                      className="dest-btn-property-details" 
                      onClick={() => setBookingModalRoom(null)}
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                /* Step-by-Step Reservation Form */
                <form className="booking-reservation-form" onSubmit={handleConfirmReservation}>
                  <div className="booking-form-heading">
                    <span className="booking-form-eyebrow">YOUR STAY, YOUR WAY</span>
                    <h3>Complete Your Reservation</h3>
                    <p>Provide your stay details to continue.</p>
                  </div>

                  {/* Room Overview Strip */}
                  <div className="booking-room-summary" style={{ 
                    display: 'flex', 
                    gap: '1rem', 
                    alignItems: 'center', 
                    background: 'var(--c-sand-subtle)', 
                    padding: '0.75rem 1rem', 
                    borderRadius: '0.75rem', 
                    marginBottom: '1.25rem',
                    border: '1px solid var(--c-border-light)'
                  }}>
                    <img 
                      src={getRoomPhoto(bookingModalRoom)} 
                      alt={bookingModalRoom.roomType}
                      style={{ width: '70px', height: '55px', objectFit: 'cover', borderRadius: '0.5rem' }} 
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: 'var(--c-forest-deep)' }}>
                        {bookingModalRoom.roomType} Room {bookingModalRoom.roomNumber}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--c-text-muted)' }}>
                        {bookingModalRoom.bedConfiguration || 'Double Bed'} &bull; Rs. {pricing.rate.toLocaleString()} / night
                      </div>
                    </div>
                  </div>

                  {/* Dates Selection */}
                  <div className="booking-dates-grid">
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label"><FaCalendarAlt aria-hidden="true" /> Check-In Date *</label>
                      <input 
                        type="date"
                        className="form-input"
                        min={format(new Date(), 'yyyy-MM-dd')}
                        value={bookingFormData.checkInDate}
                        onChange={(e) => setBookingFormData({ ...bookingFormData, checkInDate: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label"><FaCalendarAlt aria-hidden="true" /> Check-Out Date *</label>
                      <input 
                        type="date"
                        className="form-input"
                        min={bookingFormData.checkInDate || format(new Date(), 'yyyy-MM-dd')}
                        value={bookingFormData.checkOutDate}
                        onChange={(e) => setBookingFormData({ ...bookingFormData, checkOutDate: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  {/* Guests Count & Payment Method */}
                  <div className="booking-choice-grid">
                    <section className="booking-choice-section" aria-labelledby="booking-guests-heading">
                      <div className="booking-section-heading">
                        <label id="booking-guests-heading" className="form-label">Number of Guests *</label>
                        <span>Select everyone staying</span>
                      </div>
                      <div className="booking-guest-options" role="group" aria-labelledby="booking-guests-heading">
                        {Array.from({ length: bookingModalRoom.capacity?.maxOccupancy || 2 }).map((_, i) => {
                          const value = String(i + 1);
                          const selected = bookingFormData.numberOfGuests === value;
                          return (
                            <button
                              key={value}
                              type="button"
                              className={`booking-guest-option${selected ? ' is-selected' : ''}`}
                              aria-pressed={selected}
                              onClick={() => setBookingFormData({ ...bookingFormData, numberOfGuests: value })}
                            >
                              <FaUsers aria-hidden="true" />
                              <span>{value} {i === 0 ? 'Guest' : 'Guests'}</span>
                            </button>
                          );
                        })}
                      </div>
                    </section>

                    <section className="booking-choice-section" aria-labelledby="booking-payment-heading">
                      <div className="booking-section-heading">
                        <label id="booking-payment-heading" className="form-label">Payment Option</label>
                        <span>Choose how you would like to pay</span>
                      </div>
                      <div className="booking-payment-options" role="group" aria-labelledby="booking-payment-heading">
                        {[
                          { value: 'Cash', title: 'Pay at Front Desk', detail: 'Cash', Icon: FaMoneyBillWave },
                          { value: 'Card', title: 'Pay at Front Desk', detail: 'Card', Icon: FaCreditCard },
                          { value: 'Online', title: 'Online Authorization', detail: 'Secure authorization', Icon: FaGlobe }
                        ].map(({ value, title, detail, Icon }) => {
                          const selected = bookingFormData.paymentMethod === value;
                          return (
                            <button
                              key={value}
                              type="button"
                              className={`booking-payment-option${selected ? ' is-selected' : ''}`}
                              aria-pressed={selected}
                              onClick={() => setBookingFormData({ ...bookingFormData, paymentMethod: value })}
                            >
                              <Icon aria-hidden="true" />
                              <span className="booking-payment-copy"><strong>{title}</strong><small>{detail}</small></span>
                              <span className="booking-option-check" aria-hidden="true"><FaCheck /></span>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  </div>

                  {/* Special Requests */}
                  <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                    <label className="form-label">Special Inquiries (Optional)</label>
                    <textarea
                      className="form-textarea"
                      rows={2}
                      placeholder="Airport chauffeur, ocean view preference, dietary requests, etc."
                      value={bookingFormData.specialRequests}
                      onChange={(e) => setBookingFormData({ ...bookingFormData, specialRequests: e.target.value })}
                    />
                  </div>

                  {/* Guest Information Review */}
                  <div style={{ 
                    padding: '0.875rem 1rem', 
                    background: 'var(--c-sand-subtle)', 
                    borderRadius: '0.625rem', 
                    fontSize: '0.875rem',
                    marginBottom: '1.25rem',
                    border: '1px solid var(--c-border-light)'
                  }}>
                    <div style={{ fontWeight: 600, color: 'var(--c-forest-deep)', marginBottom: '0.35rem' }}>
                      Guest Information (from Profile)
                    </div>
                    <div style={{ color: 'var(--c-text-secondary)' }}>
                      <span><strong>Guest Name:</strong> {user?.name} &bull; </span>
                      <span><strong>Email:</strong> {user?.email} &bull; </span>
                      <span><strong>Phone:</strong> {user?.phone || 'Not provided'}</span>
                    </div>
                  </div>

                  {/* Price Calculation Summary */}
                  <div style={{ 
                    padding: '1rem', 
                    background: '#FFFFFF', 
                    border: '1px solid var(--c-border-medium)', 
                    borderRadius: '0.75rem',
                    marginBottom: '1.25rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', fontSize: '0.9rem' }}>
                      <span>Nightly Sanctuary Rate:</span>
                      <span>Rs. {pricing.rate.toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                      <span>Duration of Stay:</span>
                      <span>{pricing.days} Night(s)</span>
                    </div>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      paddingTop: '0.5rem', 
                      borderTop: '1px solid var(--c-border-light)', 
                      fontWeight: 600, 
                      fontSize: '1.15rem', 
                      color: 'var(--c-forest-deep)' 
                    }}>
                      <span>Total Estimated Cost:</span>
                      <span>Rs. {pricing.total.toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="portal-modal-footer">
                    <button
                      type="button"
                      className="dest-btn-property-details"
                      disabled={submittingBooking}
                      onClick={() => setBookingModalRoom(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="dest-hero-btn-primary"
                      style={{ padding: '0.8rem 1.8rem', fontSize: '0.825rem' }}
                      disabled={submittingBooking}
                    >
                      {submittingBooking ? 'Reserving...' : 'Confirm Reservation'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          MODAL 3: AUTH PROMPT MODAL (Unauthenticated Guest Booking)
          ============================================================ */}
      {showAuthPrompt && (
        <div className="portal-modal-backdrop" onClick={() => setShowAuthPrompt(false)}>
          <div className="portal-modal-card" style={{ maxWidth: '460px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div className="portal-modal-header" style={{ justifyContent: 'flex-end', border: 'none', paddingBottom: 0 }}>
              <button 
                type="button" 
                className="portal-modal-close"
                onClick={() => setShowAuthPrompt(false)}
                aria-label="Close"
              >
                <FaTimes />
              </button>
            </div>

            <div className="portal-modal-body" style={{ paddingTop: 0 }}>
              <div style={{ 
                width: '60px', 
                height: '60px', 
                borderRadius: '50%', 
                background: 'var(--c-sand-subtle)', 
                color: 'var(--c-brass)', 
                display: 'inline-flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                fontSize: '1.5rem',
                marginBottom: '1.25rem'
              }}>
                <FaLock />
              </div>

              <h3 style={{ fontSize: '1.35rem', fontWeight: 500, color: 'var(--c-forest-deep)', marginBottom: '0.75rem' }}>
                Guest Sign In Required
              </h3>

              <p style={{ color: 'var(--c-text-secondary)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '1.75rem' }}>
                Please sign in to your guest account to complete your guaranteed reservation at Serendib Sanctuary Sri Lanka.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <Link 
                  to="/login" 
                  className="dest-hero-btn-primary"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => setShowAuthPrompt(false)}
                >
                  Sign In to Reserve
                </Link>

                <Link 
                  to="/register" 
                  className="dest-btn-property-details"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => setShowAuthPrompt(false)}
                >
                  Create New Account
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cinematic Luxury Promotional Offer Popup on Scroll */}
      <ScrollOfferPopup />

      {/* Unified PayHere Payment Modal */}
      {paymentModalData && (
        <PaymentModal
          isOpen={Boolean(paymentModalData)}
          onClose={() => setPaymentModalData(null)}
          purpose={paymentModalData.purpose}
          targetId={paymentModalData.targetId}
          itemSummary={paymentModalData.itemSummary}
          onPaymentSuccess={() => {
            fetchRooms(checkInDate, checkOutDate, selectedTypeFilter);
          }}
        />
      )}
    </div>
  );
};

export default CustomerHome;
