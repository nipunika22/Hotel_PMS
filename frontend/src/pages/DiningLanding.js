// frontend/src/pages/DiningLanding.js
import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { 
  FaCalendarAlt, 
  FaClock, 
  FaMapMarkerAlt, 
  FaUtensils, 
  FaArrowRight, 
  FaStar, 
  FaWineGlassAlt, 
  FaFish, 
  FaGlobeAsia, 
  FaPercent,
  FaCheckCircle,
  FaConciergeBell
} from 'react-icons/fa';
import CustomerLayout from '../components/CustomerLayout';
import RestaurantReservationModal from '../components/RestaurantReservationModal';
import RestaurantOfferModal from '../components/RestaurantOfferModal';
import { restaurantAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import './RestaurantExperience.css';
import { DEFAULT_RESTAURANTS } from '../config/restaurantData';
import { DINING_PROMOTIONAL_EXPERIENCES } from '../config/diningExperiences';

const DINING_OFFER_IMAGES = [
  { match: /sunset|romantic|private|candle/i, image: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=1200&q=85' },
  { match: /tea|afternoon/i, image: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=1200&q=85' },
  { match: /seafood|ocean|coastal|fish/i, image: 'https://images.unsplash.com/photo-1515003197210-e0cd7184f8b5?auto=format&fit=crop&w=1200&q=85' },
  { match: /chef|tasting|fine dining|gourmet/i, image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=85' },
  { match: /buffet|family|feast/i, image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=85' },
];

const getOfferFallbackImage = (offer, index = 0) => {
  const offerText = [offer?.title, offer?.shortDescription, offer?.description].filter(Boolean).join(' ');
  return DINING_OFFER_IMAGES.find(({ match }) => match.test(offerText))?.image
    || DINING_OFFER_IMAGES[index % DINING_OFFER_IMAGES.length].image;
};

const formatOfferDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
};





const getOfferCategory = (offer) => {
  if (offer.category) return offer.category;
  const title = [offer.title, offer.name, offer.slug, offer.tag].filter(Boolean).join(' ').toLowerCase();
  if (/sunset/.test(title)) return 'sunset';
  if (/romantic|candlelit/.test(title)) return 'romantic';
  if (/afternoon tea|tea service/.test(title)) return 'tea';
  if (/chef.*signature|signature.*chef|chef-led/.test(title)) return 'chef';
  if (/private.*(ocean|beach|pavilion)|beach.*dining|beachfront/.test(title)) return 'beach';
  if (/family.*(brunch|dining)|family-friendly/.test(title)) return 'family';
  if (/weekend.*buffet|international buffet/.test(title)) return 'buffet';
  return null;
};

const DiningLanding = () => {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);

  // Reservation Modal State
  const [resModalOpen, setResModalOpen] = useState(false);
  const [selectedRestForRes, setSelectedRestForRes] = useState(null);
  const [selectedDiningTypeForRes, setSelectedDiningTypeForRes] = useState('À la carte');
  const [selectedBuffetIdForRes, setSelectedBuffetIdForRes] = useState(null);
  const [selectedOfferIdForRes, setSelectedOfferIdForRes] = useState(null);

  // Offer Modal State
  const [activeOfferModal, setActiveOfferModal] = useState(null);
  const [offersList, setOffersList] = useState([]);

  useEffect(() => {
    fetchDiningData();
  }, []);

  useEffect(() => {
    if (loading || searchParams.get('book') !== '1') return;
    const restaurantId = searchParams.get('restaurantId');
    const restaurant = restaurants.find((item) => item._id === restaurantId || item.slug === restaurantId) || restaurants[0];
    if (restaurant) handleOpenReservation(restaurant, 'Offer / Experience', null, searchParams.get('offerId') || null);
  }, [loading, restaurants, searchParams]);

  const fetchDiningData = async () => {
    try {
      setLoading(true);
      const res = await restaurantAPI.getRestaurants();
      if (res.data?.data && res.data.data.length > 0) {
        setRestaurants(res.data.data);

        // Load offers for every restaurant displayed on this page.
        const offerResponses = await Promise.all(res.data.data.map(async (restaurant) => {
          if (!restaurant._id) return [];
          try {
            const offersRes = await restaurantAPI.getRestaurantOffers(restaurant._id);
            return Array.isArray(offersRes.data?.data) ? offersRes.data.data : [];
          } catch (offerError) {
            console.error('Failed to load offers for ' + restaurant.name, offerError);
            return [];
          }
        }));
        setOffersList(offerResponses.flat());
      } else {
        setRestaurants(DEFAULT_RESTAURANTS);
      }
    } catch (err) {
      console.error('Failed to load dining page data', err);
      setRestaurants(DEFAULT_RESTAURANTS);
    } finally {
      setLoading(false);
    }
  };

  const handleCardClick = (e, rest) => {
    // If the click is on an interactive child that handled itself, don't double navigate
    if (e.target.closest('button')) {
      return;
    }
    const targetSlug = rest.slug || rest._id;
    navigate(`/restaurants/${targetSlug}`);
  };

  const handleCardKeyDown = (e, rest) => {
    if (e.key === 'Enter' || e.key === ' ') {
      if (e.target.closest('button')) {
        return;
      }
      e.preventDefault();
      const targetSlug = rest.slug || rest._id;
      navigate(`/restaurants/${targetSlug}`);
    }
  };

  const handleOpenReservation = (restaurant, diningType = 'À la carte', buffetId = null, offerId = null) => {
    setSelectedRestForRes(restaurant);
    setSelectedDiningTypeForRes(diningType);
    setSelectedBuffetIdForRes(buffetId);
    setSelectedOfferIdForRes(offerId);
    setResModalOpen(true);
  };

  const handleReserveFromOffer = (offer) => {
    const matchedRest = restaurants.find(r => r._id === offer.restaurant) || restaurants[0];
    handleOpenReservation(matchedRest, 'Offer / Experience', null, offer._id);
  };

  const bookableOffers = offersList.map((offer) => ({ ...offer, frontendOnly: false }));
  const bookableCategories = new Set(bookableOffers.map(getOfferCategory).filter(Boolean));
  const bookableTitles = new Set(bookableOffers.map((offer) => (offer.title || '').trim().toLowerCase()));
  const restaurantExperiences = restaurants.flatMap((restaurant) =>
    (Array.isArray(restaurant.experiences) ? restaurant.experiences : []).map((experience, index) => ({
      ...experience,
      id: experience._id || ('restaurant-experience-' + (restaurant._id || restaurant.slug || 'venue') + '-' + index),
      title: experience.title || experience.name,
      shortDescription: experience.description,
      restaurant: { _id: restaurant._id, name: restaurant.name },
      venue: restaurant.name,
      location: restaurant.location,
      experienceType: experience.tag || 'Restaurant experience',
      category: getOfferCategory(experience),
      frontendOnly: true
    }))
  );
  const includedCategories = new Set(bookableCategories);
  const supplementaryExperiences = restaurantExperiences.filter((experience) => {
    const title = (experience.title || '').trim().toLowerCase();
    const category = getOfferCategory(experience);
    if (bookableTitles.has(title) || (category && includedCategories.has(category))) return false;
    if (category) includedCategories.add(category);
    return true;
  });
  const includedTitles = new Set([...bookableTitles, ...supplementaryExperiences.map((offer) => (offer.title || '').trim().toLowerCase())]);
  const promotionalOffers = DINING_PROMOTIONAL_EXPERIENCES.filter((offer) =>
    !includedTitles.has((offer.title || '').trim().toLowerCase()) && !includedCategories.has(offer.category)
  );
  const displayOffers = [...bookableOffers, ...supplementaryExperiences, ...promotionalOffers];

  return (
    <CustomerLayout variant="transparent">
      <div className="rest-page-root">
        
        {/* ============================================================
           1. CINEMATIC HERO SECTION (Requirement 3)
           ============================================================ */}
        <section 
          className="rest-hero-cinema"
          style={{
            backgroundImage: 'url("https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=2000&q=85")'
          }}
        >
          <div className="rest-hero-overlay" />
          <div className="rest-hero-content">
            <span className="rest-badge-pill">
              <FaUtensils size={11} /> HAUTE GASTRONOMIE & CEYLON HARVEST
            </span>

            <h1 className="rest-hero-title">
              Exceptional Dining
            </h1>

            <p className="rest-hero-subtitle">
              Two distinctive culinary experiences, one unforgettable stay. From the ocean’s freshest coastal catches to an international table inspired by the silk routes.
            </p>

            <div className="rest-hero-actions">
              <a href="#showcase" className="rest-btn-primary">
                Explore Restaurants
              </a>
              <button 
                type="button" 
                className="rest-btn-secondary"
                onClick={() => handleOpenReservation(restaurants[0])}
              >
                <FaCalendarAlt /> Reserve a Table
              </button>
            </div>
          </div>
        </section>

        {/* ============================================================
           2. LOGGED-IN CUSTOMER GENTLE GREETING (Requirement 28)
           ============================================================ */}
        {isAuthenticated && (
          <div className="rest-guest-welcome-bar">
            <div className="rest-welcome-inner">
              <div className="rest-welcome-text">
                <FaConciergeBell color="var(--c-brass-light)" />
                <span>
                  Welcome back, <strong>{user?.name || 'Valued Guest'}</strong>. Enjoy priority dining reservations and seamless room-folio settlement throughout your stay.
                </span>
                <span className="rest-welcome-badge">Hotel Resident</span>
              </div>
              <button 
                type="button"
                className="rest-btn-secondary"
                style={{ padding: '0.45rem 1.1rem', fontSize: '0.78rem', borderColor: 'var(--c-brass)' }}
                onClick={() => handleOpenReservation(restaurants[0])}
              >
                Book Your Table
              </button>
            </div>
          </div>
        )}

        {/* ============================================================
           3. RESTAURANT SHOWCASE SECTION (Requirement 4 & 15)
           ============================================================ */}
        <section id="showcase" className="rest-showcase-section">
          <div className="rest-section-header">
            <span className="rest-section-badge">Discover Our Dining</span>
            <h2 className="rest-section-title">
              Two Distinctive Culinary Sanctuaries
            </h2>
            <p className="rest-section-desc">
              From the ocean's freshest flavours to an international table inspired by the world, discover dining experiences designed to make your stay memorable.
            </p>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '4rem 0' }}>
              <div className="spinner" />
              <p style={{ color: 'var(--c-text-muted)', marginTop: '1rem' }}>Curating our culinary venues...</p>
            </div>
          ) : (
            restaurants.map((rest, idx) => {
              const isEven = idx % 2 === 1;
              const isSeafood = rest.slug === 'azure-tide' || (rest.name && rest.name.toLowerCase().includes('azure'));
              const targetSlug = rest.slug || rest._id;

              return (
                <article 
                  key={rest._id || targetSlug} 
                  className={`rest-card-split ${isEven ? 'reverse' : ''}`}
                  tabIndex={0}
                  role="button"
                  aria-label={`View ${rest.name} details and menu`}
                  onClick={(e) => handleCardClick(e, rest)}
                  onKeyDown={(e) => handleCardKeyDown(e, rest)}
                >
                  {/* Visual Split */}
                  <div 
                    className="rest-card-image-wrap"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/restaurants/${targetSlug}`);
                    }}
                    title={`Explore ${rest.name}`}
                  >
                    <img 
                      src={rest.heroImage || rest.featuredImage || 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=85'} 
                      alt={rest.name}
                      className="rest-card-img"
                    />
                    <div className="rest-card-tag">
                      {isSeafood ? <><FaFish style={{ marginRight: '0.35rem' }} /> Oceanfront Dining</> : <><FaGlobeAsia style={{ marginRight: '0.35rem' }} /> International Table</>}
                    </div>
                  </div>

                  {/* Editorial Body */}
                  <div className="rest-card-body">
                    <div className="rest-card-meta">
                      <span>{rest.restaurantType || 'Luxury Dining'}</span>
                      <span>&bull;</span>
                      <span>{rest.cuisine}</span>
                    </div>

                    <h3 
                      className="rest-card-name"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/restaurants/${targetSlug}`);
                      }}
                    >
                      <Link 
                        to={`/restaurants/${targetSlug}`} 
                        className="rest-card-name-link"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {rest.name}
                      </Link>
                    </h3>

                    {rest.tagline && (
                      <p className="rest-card-tagline">
                        "{rest.tagline}"
                      </p>
                    )}

                    <p className="rest-card-desc">
                      {rest.description || rest.story?.concept}
                    </p>

                    {/* Operational Highlights */}
                    <div className="rest-card-specs">
                      <div className="rest-spec-item">
                        <FaClock className="rest-spec-icon" />
                        <div>
                          <strong>Opening Hours</strong>
                          <span>{rest.openingHours}</span>
                        </div>
                      </div>

                      <div className="rest-spec-item">
                        <FaMapMarkerAlt className="rest-spec-icon" />
                        <div>
                          <strong>Location</strong>
                          <span>{rest.location}</span>
                        </div>
                      </div>

                      <div className="rest-spec-item">
                        <FaUtensils className="rest-spec-icon" />
                        <div>
                          <strong>Dining Style</strong>
                          <span>{rest.diningStyles?.join(' & ') || 'À la carte & Tasting'}</span>
                        </div>
                      </div>

                      <div className="rest-spec-item">
                        <FaStar className="rest-spec-icon" />
                        <div>
                          <strong>Price Range</strong>
                          <span>{rest.priceRange || 'LKR 8,000 – 25,000'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Action CTAs */}
                    <div className="rest-card-actions">
                      <Link 
                        to={`/restaurants/${targetSlug}`} 
                        className="rest-btn-primary"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span>Explore Restaurant</span>
                        <FaArrowRight size={12} />
                      </Link>

                      <button 
                        type="button" 
                        className="rest-btn-secondary"
                        style={{ color: 'var(--c-forest-deep)', borderColor: 'var(--c-border-medium)' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenReservation(rest);
                        }}
                      >
                        Reserve a Table
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </section>

        {/* ============================================================
           4. INTERNATIONAL BUFFET TEASER SECTION (Requirement 8)
           ============================================================ */}
        <section className="rest-buffet-section">
          <div className="rest-buffet-container">
            <div className="rest-buffet-hero-banner">
              <div>
                <span className="rest-badge-pill">INTERNATIONAL BUFFET</span>
                <h2 style={{ fontSize: '2.5rem', fontWeight: 600, color: '#FFF', margin: '0.5rem 0 1rem 0' }}>
                  A World of Flavours, Served Daily
                </h2>
                <p style={{ color: 'rgba(253, 252, 247, 0.85)', fontSize: '1.05rem', lineHeight: 1.7, marginBottom: '2rem' }}>
                  At Spice & Silk All-Day Dining, breakfast through dinner is an interactive celebration. Discover over 120 global dishes, seven live theatre cooking stations, dedicated seafood grills, authentic Ceylon claypot curries, and an opulent dessert bar.
                </p>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <Link 
                    to="/restaurants/spice-and-silk#buffet" 
                    className="rest-btn-primary"
                  >
                    View Buffet Sessions
                  </Link>
                  <button 
                    type="button"
                    className="rest-btn-secondary"
                    onClick={() => {
                      const spice = restaurants.find(r => r.slug === 'spice-and-silk') || restaurants[1];
                      handleOpenReservation(spice, 'Buffet');
                    }}
                  >
                    Reserve Buffet Experience
                  </button>
                </div>
              </div>

              <div>
                <img 
                  src="https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1000&q=85" 
                  alt="International Buffet Spread"
                  style={{ width: '100%', borderRadius: '12px', boxShadow: '0 20px 50px rgba(0,0,0,0.4)', objectFit: 'cover', height: '360px' }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================
           5. OFFERS & EXPERIENCES SECTION (Requirement 13 & 14)
           ============================================================ */}
        <section className="rest-offers-section">
          <div className="rest-section-header">
            <span className="rest-section-badge">Curated Moments</span>
            <h2 className="rest-section-title">
              Special Dining Offers & Experiences
            </h2>
            <p className="rest-section-desc">
              Discover memorable dining experiences crafted for every occasion.
            </p>
          </div>

          <div className="rest-offers-grid">
            {displayOffers.map((offer, index) => {
              const offerRestaurantId = typeof offer.restaurant === 'object' ? offer.restaurant?._id : offer.restaurant;
              const offerRestaurant = restaurants.find((restaurant) => restaurant._id === offerRestaurantId || restaurant.slug === offerRestaurantId)
                || (typeof offer.restaurant === 'object' ? offer.restaurant : null);
              const fallbackImage = getOfferFallbackImage(offer, index);
              const offerImage = offer.image || fallbackImage;
              const offerTime = offer.time || [offer.startTime, offer.endTime].filter(Boolean).join(' – ');
              const offerDate = offer.date || offer.eventDate || offer.validFrom;
              const availabilityText = typeof offer.availability === 'string' || typeof offer.availability === 'number'
                ? String(offer.availability)
                : Array.isArray(offer.availability) ? offer.availability.join(', ')
                : offer.availability && typeof offer.availability === 'object'
                  ? Object.values(offer.availability).filter((value) => typeof value === 'string' || typeof value === 'number').join(', ')
                  : '';

              return (
                <button
                  key={offer._id || offer.id || offer.title}
                  type="button"
                  className={offer.frontendOnly ? 'rest-offer-card rest-offer-card-promotional' : 'rest-offer-card'}
                  onClick={() => setActiveOfferModal({ ...offer, image: offerImage, _displayImageFallback: fallbackImage })}
                  aria-label={(offer.frontendOnly ? 'View experience ' : 'View details for ') + offer.title}
                >
                  <div className="rest-offer-card-media">
                    <img
                      src={offerImage}
                      alt={offer.title}
                      className="rest-offer-card-img"
                      loading="lazy"
                      onError={(event) => {
                        if (event.currentTarget.dataset.fallbackApplied !== 'true' && fallbackImage !== offerImage) {
                          event.currentTarget.dataset.fallbackApplied = 'true';
                          event.currentTarget.src = fallbackImage;
                        }
                      }}
                    />
                    {offer.discount && <div className="rest-offer-discount-pill">{offer.discount}</div>}
                    {offer.frontendOnly && <span className="rest-offer-concept-badge">Dining Experience</span>}
                  </div>
                  <div className="rest-offer-card-body">
                    <h3 className="rest-offer-card-title">{offer.title}</h3>
                    <p className="rest-offer-card-desc">{offer.shortDescription || offer.description}</p>
                    <div className="rest-offer-card-details">
                      {(offerRestaurant?.name || offer.venue) && <span><FaUtensils aria-hidden="true" />{offerRestaurant?.name || offer.venue}</span>}
                      {(offer.location || offerRestaurant?.location) && <span><FaMapMarkerAlt aria-hidden="true" />{offer.location || offerRestaurant.location}</span>}
                      {offer.experienceType && <span><FaStar aria-hidden="true" />{offer.experienceType}</span>}
                      {offerDate && <span><FaCalendarAlt aria-hidden="true" />{formatOfferDate(offerDate)}</span>}
                      {offerTime && <span><FaClock aria-hidden="true" />{offerTime}</span>}
                      {offer.duration && <span><FaClock aria-hidden="true" />{offer.duration}</span>}
                      {offer.applicableDays?.length > 0 && <span><FaCalendarAlt aria-hidden="true" />{offer.applicableDays.join(', ')}</span>}
                      {offer.validUntil && <span><FaCalendarAlt aria-hidden="true" />Valid through {formatOfferDate(offer.validUntil)}</span>}
                      {availabilityText && <span><FaCheckCircle aria-hidden="true" />{availabilityText}</span>}
                      {offer.suitableFor && <span><FaCheckCircle aria-hidden="true" />{offer.suitableFor}</span>}
                    </div>
                    {offer.terms && <p className="rest-offer-card-terms">Terms: {offer.terms}</p>}
                    <div className="rest-offer-card-footer">
                      {Number(offer.price) > 0
                        ? <div><span className="rest-offer-price-label">From</span><span className="rest-offer-card-price">{offer.currency || 'LKR'} {Number(offer.price).toLocaleString()}</span></div>
                        : <span />}
                      <span className="rest-offer-view-details">
                        {offer.frontendOnly ? 'View Experience' : 'View Details'} <FaArrowRight aria-hidden="true" />
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Offer Details Large Modal Popup (Requirement 14) */}
        <RestaurantOfferModal 
          isOpen={!!activeOfferModal}
          onClose={() => setActiveOfferModal(null)}
          offer={activeOfferModal}
          onReserveOffer={handleReserveFromOffer}
          restaurantInfo={restaurants.find((restaurant) => {
            const offerRestaurantId = typeof activeOfferModal?.restaurant === 'object' ? activeOfferModal.restaurant?._id : activeOfferModal?.restaurant;
            return restaurant._id === offerRestaurantId || restaurant.slug === offerRestaurantId;
          })}
        />

        {/* Table Reservation Flow Modal (Requirement 10, 11, 12) */}
        <RestaurantReservationModal 
          isOpen={resModalOpen}
          onClose={() => setResModalOpen(false)}
          preselectedRestaurant={selectedRestForRes}
          preselectedDiningType={selectedDiningTypeForRes}
          preselectedBuffetId={selectedBuffetIdForRes}
          preselectedOfferId={selectedOfferIdForRes}
          restaurantsList={restaurants}
        />

      </div>
    </CustomerLayout>
  );
};

export default DiningLanding;
