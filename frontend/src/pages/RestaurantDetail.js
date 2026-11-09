// frontend/src/pages/RestaurantDetail.js
import React, { useState, useEffect } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { 
  FaCalendarAlt,
  FaArrowLeft, 
  FaClock, 
  FaMapMarkerAlt, 
  FaPhone, 
  FaEnvelope, 
  FaUtensils, 
  FaStar, 
  FaLeaf, 
  FaPepperHot, 
  FaFish, 
  FaCheck, 
  FaCamera, 
  FaAward, 
  FaShieldAlt, 
  FaInfoCircle
} from 'react-icons/fa';
import CustomerLayout from '../components/CustomerLayout';
import RestaurantReservationModal from '../components/RestaurantReservationModal';
import RestaurantOfferModal from '../components/RestaurantOfferModal';
import RestaurantGalleryLightbox from '../components/RestaurantGalleryLightbox';
import { restaurantAPI } from '../services/api';
import { DEFAULT_RESTAURANTS } from '../config/restaurantData';
import './RestaurantExperience.css';

const DIETARY_FILTERS = [
  { label: 'All Dishes', value: 'ALL' },
  { label: 'Seafood', value: 'Seafood', icon: <FaFish /> },
  { label: 'Vegetarian', value: 'Vegetarian', icon: <FaLeaf /> },
  { label: 'Spicy', value: 'Spicy', icon: <FaPepperHot /> },
  { label: 'Gluten-Free', value: 'Gluten-free' },
  { label: "Chef's Choice", value: "Chef's choice", icon: <FaStar /> }
];

const RestaurantDetail = () => {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Active Menu Category Filter
  const [activeCategoryTab, setActiveCategoryTab] = useState(null);
  const [selectedDietaryTag, setSelectedDietaryTag] = useState('ALL');

  // Reservation Modal State
  const [resModalOpen, setResModalOpen] = useState(false);
  const [selectedDiningTypeForRes, setSelectedDiningTypeForRes] = useState('À la carte');
  const [selectedBuffetIdForRes, setSelectedBuffetIdForRes] = useState(null);
  const [selectedOfferIdForRes, setSelectedOfferIdForRes] = useState(null);

  // Offer Modal State
  const [activeOfferModal, setActiveOfferModal] = useState(null);

  // Gallery Lightbox State
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [activeGalleryIndex, setActiveGalleryIndex] = useState(0);

  useEffect(() => {
    if (window.location.hash) {
      setTimeout(() => {
        const el = document.querySelector(window.location.hash);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 300);
    } else {
      window.scrollTo(0, 0);
    }
    fetchRestaurantDetails();
  }, [slug]);

  useEffect(() => {
    if (loading || searchParams.get('book') !== '1' || !restaurant) return;
    handleOpenReservation('Offer / Experience', null, searchParams.get('offerId') || null);
  }, [loading, restaurant, searchParams]);

  const fetchRestaurantDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const targetSlug = slug || 'azure-tide';
      const fallbackRestaurant = DEFAULT_RESTAURANTS.find((item) => item.slug === targetSlug);
      const res = await restaurantAPI.getRestaurantBySlug(targetSlug);
      if (res.data?.data) {
        setRestaurant(res.data.data);
        if (res.data.data.menuCategories && res.data.data.menuCategories.length > 0) {
          setActiveCategoryTab(res.data.data.menuCategories[0]._id);
        }
      } else if (fallbackRestaurant) {
        setRestaurant(fallbackRestaurant);
        setError(null);
      } else {
        setError('The requested dining venue is currently unavailable.');
      }
    } catch (err) {
      console.error('Failed to load restaurant details', err);
      const fallbackRestaurant = DEFAULT_RESTAURANTS.find((item) => item.slug === slug);
      if (fallbackRestaurant) {
        setRestaurant(fallbackRestaurant);
        setError(null);
      } else {
        setError('Restaurant could not be found or is unavailable.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOpenReservation = (diningType = 'À la carte', buffetId = null, offerId = null) => {
    setSelectedDiningTypeForRes(diningType);
    setSelectedBuffetIdForRes(buffetId);
    setSelectedOfferIdForRes(offerId);
    setResModalOpen(true);
  };

  const handleReserveFromOffer = (offer) => {
    handleOpenReservation('Offer / Experience', null, offer._id);
  };

  const handleOpenLightbox = (index) => {
    setActiveGalleryIndex(index);
    setLightboxOpen(true);
  };

  if (loading) {
    return (
      <CustomerLayout variant="solid">
        <div className="rest-page-root" style={{ minHeight: '80vh', padding: '6rem 2rem' }}>
          <div style={{ maxWidth: '1240px', margin: '0 auto' }}>
            <div style={{ 
              height: '380px', 
              background: 'linear-gradient(135deg, #162E24 0%, #203E50 100%)', 
              borderRadius: '12px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              flexDirection: 'column', 
              gap: '1.25rem', 
              color: '#FFF',
              boxShadow: '0 20px 48px rgba(22, 46, 36, 0.15)'
            }}>
              <div className="spinner" />
              <p style={{ color: 'var(--c-brass-light)', fontSize: '1.1rem', letterSpacing: '0.05em' }}>
                Curating culinary experience...
              </p>
            </div>
          </div>
        </div>
      </CustomerLayout>
    );
  }

  if (error || !restaurant) {
    return (
      <CustomerLayout variant="solid">
        <div style={{ textAlign: 'center', padding: '10rem 2rem', maxWidth: '640px', margin: '0 auto', minHeight: '70vh' }}>
          <h2 style={{ color: 'var(--c-forest-deep)', fontSize: '2.4rem', marginBottom: '0.75rem' }}>
            Restaurant Not Found
          </h2>
          <p style={{ color: 'var(--c-text-muted)', margin: '1rem 0 2rem 0', fontSize: '1.05rem', lineHeight: 1.6 }}>
            {error || 'The requested dining venue could not be found or is currently unavailable.'}
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button 
              type="button" 
              onClick={() => fetchRestaurantDetails()} 
              className="rest-btn-secondary"
              style={{ color: 'var(--c-forest-deep)', borderColor: 'var(--c-border-medium)' }}
            >
              Try Again
            </button>
            <Link to="/dining" className="rest-btn-primary">
              Back to Dining
            </Link>
          </div>
        </div>
      </CustomerLayout>
    );
  }

  // Active Menu Items filtered by Category & Dietary Tag
  const activeCategory = restaurant.menuCategories?.find(c => c._id === activeCategoryTab);
  const rawItems = activeCategory?.items || [];
  const filteredMenuItems = rawItems.filter(item => {
    if (selectedDietaryTag === 'ALL') return true;
    return item.dietaryTags?.includes(selectedDietaryTag);
  });

  const hasBuffets = restaurant.buffets && restaurant.buffets.length > 0;
  const isSpiceAndSilk = restaurant.slug === 'spice-and-silk' || restaurant.name.toLowerCase().includes('spice');

  return (
    <CustomerLayout variant="transparent">
      <div className="rest-page-root">

        {/* ============================================================
           1. CINEMATIC DETAIL HERO (Requirement 5)
           ============================================================ */}
        <section 
          className="rest-detail-header"
          style={{
            backgroundImage: `url("${restaurant.heroImage || restaurant.featuredImage || 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=2000&q=85'}")`
          }}
        >
          <div className="rest-detail-header-overlay" />
          <div className="rest-detail-header-content">
            <span className="rest-badge-pill">
              {restaurant.restaurantType || 'Fine Dining'} &bull; {restaurant.cuisine}
            </span>

            <h1 style={{ fontSize: 'clamp(2.4rem, 5vw, 4.2rem)', fontWeight: 600, color: '#FFF', margin: '0.25rem 0 0.75rem 0', lineHeight: 1.15 }}>
              {restaurant.name}
            </h1>

            <p style={{ fontSize: 'clamp(1.05rem, 2vw, 1.3rem)', color: 'rgba(253, 252, 247, 0.9)', fontStyle: 'italic', maxWidth: '780px', marginBottom: '2rem' }}>
              "{restaurant.tagline || 'Crafted for unforgettable evenings overlooking the Indian Ocean.'}"
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
              <Link to="/dining" className="rest-btn-secondary"><FaArrowLeft /> Back to Dining</Link>
              <button 
                type="button" 
                className="rest-btn-primary"
                onClick={() => handleOpenReservation('À la carte')}
              >
                <FaCalendarAlt /> Reserve a Table
              </button>
              <a href="#menu" className="rest-btn-secondary">
                <FaUtensils /> View À la Carte Menu
              </a>
              {hasBuffets && (
                <a href="#buffet" className="rest-btn-secondary">
                  Explore International Buffet
                </a>
              )}
            </div>
          </div>
        </section>

        {/* ============================================================
           2. STICKY ANCHOR NAVIGATION BAR
           ============================================================ */}
        <nav className="rest-anchor-bar">
          <div className="rest-anchor-inner">
            <ul className="rest-anchor-links">
              <li><a href="#story" className="rest-anchor-link">Story & Concept</a></li>
              {restaurant.chef?.name && <li><a href="#chef" className="rest-anchor-link">Our Chef</a></li>}
              <li><a href="#menu" className="rest-anchor-link">À la Carte Menu</a></li>
              {hasBuffets && <li><a href="#buffet" className="rest-anchor-link">International Buffet</a></li>}
              {restaurant.offers?.length > 0 && <li><a href="#offers" className="rest-anchor-link">Special Offers</a></li>}
              {restaurant.gallery?.length > 0 && <li><a href="#gallery" className="rest-anchor-link">Photo Gallery</a></li>}
              <li><a href="#info" className="rest-anchor-link">Venue Information</a></li>
            </ul>

            <button 
              type="button" 
              className="rest-btn-primary"
              style={{ padding: '0.55rem 1.4rem', fontSize: '0.82rem' }}
              onClick={() => handleOpenReservation('À la carte')}
            >
              Book Table
            </button>
          </div>
        </nav>

        {/* ============================================================
           3. RESTAURANT STORY & CHEF PHILOSOPHY (Requirement 5 & 17)
           ============================================================ */}
        <section id="story" className="rest-story-grid">
          <div>
            <span className="rest-section-badge">Culinary Concept & Philosophy</span>
            <h2 style={{ fontSize: '2.5rem', fontWeight: 600, color: 'var(--c-forest-deep)', margin: '0.5rem 0 1.5rem 0', lineHeight: 1.25 }}>
              The Story of {restaurant.name}
            </h2>

            {restaurant.story?.concept && (
              <p className="rest-story-quote">
                "{restaurant.story.concept}"
              </p>
            )}

            <p style={{ fontSize: '1rem', color: 'var(--c-text-secondary)', lineHeight: 1.8, marginBottom: '1.5rem' }}>
              {restaurant.description}
            </p>

            {restaurant.story?.atmosphere && (
              <div style={{ marginBottom: '1.5rem' }}>
                <strong style={{ display: 'block', fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--c-forest-deep)', marginBottom: '0.25rem' }}>
                  The Ambiance
                </strong>
                <p style={{ fontSize: '0.94rem', color: 'var(--c-text-secondary)', lineHeight: 1.7 }}>
                  {restaurant.story.atmosphere}
                </p>
              </div>
            )}

            {restaurant.story?.philosophy && (
              <div>
                <strong style={{ display: 'block', fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--c-forest-deep)', marginBottom: '0.25rem' }}>
                  Chef Philosophy
                </strong>
                <p style={{ fontSize: '0.94rem', color: 'var(--c-text-secondary)', lineHeight: 1.7 }}>
                  {restaurant.story.philosophy}
                </p>
              </div>
            )}
          </div>

          <div id="chef">
            {/* Chef Spotlight Card */}
            {restaurant.chef?.name ? (
              <div className="rest-chef-card" style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '2.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1.25rem' }}>
                  <img 
                    src={restaurant.chef.image || 'https://images.unsplash.com/photo-1577219491135-ce391730fb2c?auto=format&fit=crop&w=400&q=85'} 
                    alt={restaurant.chef.name}
                    className="rest-chef-avatar"
                  />
                  <div>
                    <span style={{ fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--c-brass)', fontWeight: 700 }}>
                      Meet Our Culinary Leader
                    </span>
                    <h3 style={{ fontSize: '1.4rem', fontWeight: 600, color: 'var(--c-forest-deep)', margin: '0.2rem 0' }}>
                      {restaurant.chef.name}
                    </h3>
                    <div style={{ fontSize: '0.85rem', color: 'var(--c-text-muted)' }}>
                      {restaurant.chef.title || 'Executive Master Chef'}
                    </div>
                  </div>
                </div>

                <p style={{ fontSize: '0.92rem', color: 'var(--c-text-secondary)', lineHeight: 1.7, marginBottom: '1rem' }}>
                  {restaurant.chef.bio}
                </p>

                {restaurant.chef.specialty && (
                  <div style={{ background: 'rgba(182, 140, 72, 0.1)', padding: '0.75rem 1rem', borderRadius: '6px', width: '100%', fontSize: '0.84rem', color: 'var(--c-forest-deep)' }}>
                    <strong>Culinary Speciality:</strong> {restaurant.chef.specialty}
                  </div>
                )}
              </div>
            ) : (
              <img 
                src={restaurant.images?.[0] || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1000&q=85'} 
                alt="Restaurant Interior"
                style={{ width: '100%', borderRadius: '12px', boxShadow: '0 20px 48px rgba(0,0,0,0.1)' }}
              />
            )}
          </div>
        </section>

        {/* ============================================================
           4. À LA CARTE MENU SECTION (Requirement 6 & 7)
           ============================================================ */}
        <section id="menu" className="rest-menu-section">
          <div className="rest-menu-container">
            <div className="rest-section-header">
              <span className="rest-section-badge">Crafted with Precision</span>
              <h2 className="rest-section-title rest-menu-heading">À la Carte Dining Menu</h2>
              <p className="rest-section-desc">
                Seasonal ocean harvests and time-honoured specialties prepared à la minute by our master brigade.
              </p>
            </div>

            {/* Category Tabs */}
            {restaurant.menuCategories && restaurant.menuCategories.length > 0 && (
              <div className="rest-category-tabs" role="group" aria-label="Menu categories">
                {restaurant.menuCategories.map((cat) => (
                  <button
                    key={cat._id}
                    type="button"
                    className={`rest-cat-tab-btn ${activeCategoryTab === cat._id ? 'active' : ''}`}
                    aria-pressed={activeCategoryTab === cat._id}
                    onClick={() => setActiveCategoryTab(cat._id)}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            )}

            {/* Dietary Filter Bar */}
            <div className="rest-dietary-filter-bar" role="group" aria-label="Filter menu by dietary information">
              <span style={{ fontWeight: 600, color: 'var(--c-text-muted)', marginRight: '0.5rem' }}>Filter by:</span>
              {DIETARY_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  className={`rest-dietary-pill ${selectedDietaryTag === f.value ? 'active' : ''}`}
                  onClick={() => setSelectedDietaryTag(f.value)}
                >
                  {f.icon && <span style={{ marginRight: '0.35rem' }}>{f.icon}</span>}
                  {f.label}
                </button>
              ))}
            </div>

            {/* Category Description */}
            {activeCategory?.description && (
              <div style={{ textAlign: 'center', marginBottom: '2.5rem', color: 'var(--c-earth)', fontStyle: 'italic', fontSize: '0.95rem' }}>
                — {activeCategory.description} —
              </div>
            )}

            {/* Menu Items Grid */}
            {filteredMenuItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--c-text-muted)' }}>
                No dishes matching the selected dietary filter in this section.
              </div>
            ) : (
              <div className="rest-menu-grid">
                {filteredMenuItems.map((item) => (
                  <div key={item._id} className="rest-menu-item-card">
                    {item.image && (
                      <img src={item.image} alt={item.name} className="rest-menu-item-image" loading="lazy" />
                    )}
                    <div className="rest-menu-item-content">
                      <div className="rest-menu-item-header">
                        <div className="rest-menu-item-name-wrap"><h4 className="rest-menu-item-name">{item.name}</h4><span className="rest-menu-item-category">{activeCategory?.name}</span></div>
                        <span className="rest-menu-item-price">
                          {item.currency || 'LKR'} {item.price?.toLocaleString()}
                        </span>
                      </div>

                      <p className="rest-menu-item-desc">{item.description}</p>

                      <div className="rest-menu-item-tags">
                        {item.dietaryTags?.map((tag) => (
                          <span key={tag} className="rest-tag-pill">{tag}</span>
                        ))}
                        {item.allergens && item.allergens.length > 0 && (
                          <span className="rest-tag-pill" style={{ background: 'rgba(198, 40, 40, 0.08)', color: '#C62828' }}>
                            Contains: {item.allergens.join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ============================================================
           5. INTERNATIONAL BUFFET SECTION (Requirement 8)
           ============================================================ */}
        {hasBuffets && (
          <section id="buffet" className="rest-buffet-section">
            <div className="rest-buffet-container">
              <div className="rest-section-header" style={{ marginBottom: '3.5rem' }}>
                <span className="rest-badge-pill">DAILY CULINARY SHOWCASE</span>
                <h2 style={{ fontSize: '2.5rem', fontWeight: 600, color: '#FFF', margin: '0.5rem 0' }}>
                  International Buffet Experience
                </h2>
                <p style={{ color: 'rgba(253, 252, 247, 0.8)', fontSize: '1.05rem', maxWidth: '720px', margin: '0 auto' }}>
                  A world of flavours served across interactive live kitchens, fresh salad displays, wok specialties, and grand dessert tables.
                </p>
              </div>

              <div className="rest-buffet-sessions-grid">
                {restaurant.buffets.map((session) => (
                  <div key={session._id} className="rest-buffet-card">
                    {session.image && (
                      <img src={session.image} alt={session.name} className="rest-buffet-card-img" />
                    )}
                    <div className="rest-buffet-card-body">
                      <div className="rest-buffet-period-badge">
                        {session.mealPeriod} Buffet &bull; {session.theme || 'Global Flavours'}
                      </div>

                      <h3 className="rest-buffet-title">{session.name}</h3>

                      <div className="rest-buffet-time">
                        <FaClock />
                        <span>{session.startTime} — {session.endTime} ({session.schedule || 'Daily'})</span>
                      </div>

                      <p style={{ fontSize: '0.88rem', color: 'rgba(253, 252, 247, 0.8)', lineHeight: 1.6, marginBottom: '1rem' }}>
                        {session.description}
                      </p>

                      {/* Pricing Grid */}
                      <div className="rest-buffet-prices">
                        <div className="rest-buffet-price-row">
                          <span>Adults</span>
                          <strong>{session.currency || 'LKR'} {session.adultPrice?.toLocaleString()}</strong>
                        </div>
                        <div className="rest-buffet-price-row">
                          <span>Children (6-12)</span>
                          <strong>{session.currency || 'LKR'} {session.childPrice?.toLocaleString()}</strong>
                        </div>
                        <div className="rest-buffet-price-row">
                          <span>Hotel Guests</span>
                          <strong>
                            {session.hotelGuestPrice === 0 
                              ? 'Included in Stay' 
                              : session.hotelGuestPrice 
                                ? `${session.currency || 'LKR'} ${session.hotelGuestPrice.toLocaleString()}` 
                                : 'Special Rate'}
                          </strong>
                        </div>
                        <div className="rest-buffet-price-row">
                          <span>Outside Visitors</span>
                          <strong>{session.currency || 'LKR'} {(session.outsideGuestPrice || session.adultPrice)?.toLocaleString()}</strong>
                        </div>
                      </div>

                      {/* Session Highlights */}
                      {session.highlights && session.highlights.length > 0 && (
                        <ul className="rest-buffet-highlights">
                          {session.highlights.map((h, i) => (
                            <li key={i}>{h}</li>
                          ))}
                        </ul>
                      )}

                      <button
                        type="button"
                        className="rest-btn-primary"
                        style={{ marginTop: 'auto', width: '100%', justifyContent: 'center' }}
                        onClick={() => handleOpenReservation('Buffet', session._id)}
                      >
                        Reserve Buffet Table
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ============================================================
           6. OFFERS & EXPERIENCES SECTION (Requirement 13 & 14)
           ============================================================ */}
        {restaurant.offers && restaurant.offers.length > 0 && (
          <section id="offers" className="rest-offers-section">
            <div className="rest-section-header">
              <span className="rest-section-badge">Exclusive Invitations</span>
              <h2 className="rest-section-title">Offers & Bespoke Experiences</h2>
              <p className="rest-section-desc">
                Specially curated packages designed to celebrate milestones, ocean sunsets, and sensory indulgence.
              </p>
            </div>

            <div className="rest-offers-grid">
              {restaurant.offers.map((offer) => (
                <div 
                  key={offer._id} 
                  className="rest-offer-card"
                  onClick={() => setActiveOfferModal(offer)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') setActiveOfferModal(offer); }}
                >
                  <div className="rest-offer-card-media">
                    <img src={offer.image} alt={offer.title} className="rest-offer-card-img" />
                    {offer.discount && (
                      <div className="rest-offer-discount-pill">
                        {offer.discount}
                      </div>
                    )}
                  </div>

                  <div className="rest-offer-card-body">
                    <h3 className="rest-offer-card-title">{offer.title}</h3>
                    <p className="rest-offer-card-desc">{offer.shortDescription}</p>

                    <div className="rest-offer-card-footer">
                      <div>
                        <span style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--c-text-muted)', display: 'block' }}>From</span>
                        <span className="rest-offer-card-price">
                          {offer.currency || 'LKR'} {offer.price?.toLocaleString()}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.86rem', color: 'var(--c-brass)', fontWeight: 600 }}>
                        View Details &rarr;
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ============================================================
           7. PHOTO GALLERY (Requirement 16)
           ============================================================ */}
        {restaurant.gallery && restaurant.gallery.length > 0 && (
          <section id="gallery" className="rest-gallery-section">
            <div className="rest-section-header">
              <span className="rest-section-badge">Atmosphere & Artistry</span>
              <h2 className="rest-section-title">The Visual Gallery</h2>
              <p className="rest-section-desc">
                Glimpses into our dining pavilions, ocean horizons, and artisanal plating. Click any photograph to view in full resolution.
              </p>
            </div>

            <div className="rest-gallery-grid">
              {restaurant.gallery.map((item, idx) => (
                <div 
                  key={idx}
                  className={`rest-gallery-item ${idx === 0 ? 'featured' : ''}`}
                  onClick={() => handleOpenLightbox(idx)}
                >
                  <img src={item.url} alt={item.caption || restaurant.name} className="rest-gallery-img" loading="lazy" />
                  <div className="rest-gallery-overlay">
                    <div>
                      <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--c-brass-light)' }}>
                        {item.category || 'Gallery'}
                      </span>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{item.caption}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ============================================================
           8. VENUE INFORMATION SECTION (Requirement 18)
           ============================================================ */}
        <section id="info" style={{ padding: '5rem 2rem', background: 'var(--c-sand-subtle)', borderTop: '1px solid var(--c-border-light)' }}>
          <div style={{ maxWidth: '1240px', margin: '0 auto' }}>
            <div className="rest-section-header" style={{ marginBottom: '3.5rem' }}>
              <span className="rest-section-badge">Essential Details</span>
              <h2 className="rest-section-title">Venue Information & Policies</h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
              <div style={{ background: '#FFF', padding: '2rem', borderRadius: '8px', border: '1px solid var(--c-border-light)' }}>
                <h4 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--c-forest-deep)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FaClock color="var(--c-brass)" /> Hours of Operation
                </h4>
                <p style={{ fontSize: '0.92rem', color: 'var(--c-text-secondary)', lineHeight: 1.7 }}>
                  {restaurant.openingHours}
                </p>
              </div>

              <div style={{ background: '#FFF', padding: '2rem', borderRadius: '8px', border: '1px solid var(--c-border-light)' }}>
                <h4 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--c-forest-deep)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FaMapMarkerAlt color="var(--c-brass)" /> Location & Dress Code
                </h4>
                <p style={{ fontSize: '0.92rem', color: 'var(--c-text-secondary)', lineHeight: 1.7 }}>
                  <strong>Location:</strong> {restaurant.location}
                  <br />
                  <strong>Dress Code:</strong> {restaurant.dressCode || 'Smart Casual'}
                </p>
              </div>

              {restaurant.diningStyles?.length > 0 && (
                <div style={{ background: '#FFF', padding: '2rem', borderRadius: '8px', border: '1px solid var(--c-border-light)' }}>
                  <h4 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--c-forest-deep)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <FaUtensils color="var(--c-brass)" /> Dining Options
                  </h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {restaurant.diningStyles.map((style) => <span key={style} className="rest-tag-pill">{style}</span>)}
                  </div>
                  {restaurant.priceRange && <p style={{ fontSize: '0.86rem', color: 'var(--c-text-secondary)', marginTop: '1rem', marginBottom: 0 }}>{restaurant.priceRange}</p>}
                </div>
              )}

              {((restaurant.amenities && restaurant.amenities.length > 0) || (restaurant.facilities && restaurant.facilities.length > 0)) && (
                <div style={{ background: '#FFF', padding: '2rem', borderRadius: '8px', border: '1px solid var(--c-border-light)' }}>
                  <h4 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--c-forest-deep)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <FaCheck color="var(--c-brass)" /> Venue Features
                  </h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {(restaurant.amenities && restaurant.amenities.length > 0 ? restaurant.amenities : restaurant.facilities || []).map((feature) => <span key={feature} className="rest-tag-pill">{feature}</span>)}
                  </div>
                </div>
              )}

              <div style={{ background: '#FFF', padding: '2rem', borderRadius: '8px', border: '1px solid var(--c-border-light)' }}>
                <h4 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--c-forest-deep)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FaPhone color="var(--c-brass)" /> Contact & Reservations
                </h4>
                <p style={{ fontSize: '0.92rem', color: 'var(--c-text-secondary)', lineHeight: 1.7 }}>
                  <strong>Phone:</strong> {restaurant.contactPhone}
                  <br />
                  <strong>Email:</strong> {restaurant.contactEmail}
                  <br />
                  <strong>Policy:</strong> {restaurant.reservationPolicy}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Sticky Mobile "Reserve Table" Bar (Requirement 30) */}
        <div className="rest-mobile-sticky-bar">
          <div>
            <div style={{ color: '#FFF', fontWeight: 600, fontSize: '0.95rem' }}>{restaurant.name}</div>
            <div style={{ color: 'var(--c-brass-light)', fontSize: '0.78rem' }}>Reservations Open</div>
          </div>
          <button 
            type="button" 
            className="rest-btn-primary"
            style={{ padding: '0.65rem 1.25rem', fontSize: '0.85rem' }}
            onClick={() => handleOpenReservation('À la carte')}
          >
            Reserve Table
          </button>
        </div>

        {/* Modals */}
        <RestaurantOfferModal 
          isOpen={!!activeOfferModal}
          onClose={() => setActiveOfferModal(null)}
          offer={activeOfferModal}
          onReserveOffer={handleReserveFromOffer}
          restaurantInfo={restaurant}
        />

        <RestaurantGalleryLightbox 
          isOpen={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          images={restaurant.gallery || []}
          activeIndex={activeGalleryIndex}
          onNavigate={(newIdx) => setActiveGalleryIndex(newIdx)}
        />

        <RestaurantReservationModal 
          isOpen={resModalOpen}
          onClose={() => setResModalOpen(false)}
          preselectedRestaurant={restaurant}
          preselectedDiningType={selectedDiningTypeForRes}
          preselectedBuffetId={selectedBuffetIdForRes}
          preselectedOfferId={selectedOfferIdForRes}
          restaurantsList={[restaurant]}
        />

      </div>
    </CustomerLayout>
  );
};

export default RestaurantDetail;
