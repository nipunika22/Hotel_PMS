// frontend/src/components/PropertyShowcase.js
import React from 'react';
import { 
  FaStar, 
  FaMapMarkerAlt, 
  FaCheckCircle, 
  FaArrowRight, 
  FaPhoneAlt, 
  FaEnvelope, 
  FaClock, 
  FaBed,
  FaShieldAlt
} from 'react-icons/fa';
import resortPhoto from '../assets/hotel-resort-cinematic.jpg';
import lobbyPhoto from '../assets/hotel-lobby-cinematic.jpg';

const PropertyShowcase = ({ property, onBookClick, onExploreRoomsClick }) => {
  const propertyName = property?.name || 'Sri Lanka Main Property';
  const propertyCity = property?.city || 'Colombo & Coastal Gateway';
  const propertyCountry = property?.country || 'Sri Lanka';
  const propertyAddress = property?.address ? `${property.address}, ${propertyCity}` : `${propertyCity}, ${propertyCountry}`;
  const starRating = property?.starRating || 5;

  const defaultAmenities = [
    'Oceanfront Infinity Pool & Sun Terraces',
    'Ayurvedic Botanical Spa & Wellness Sanctuary',
    '24/7 Dedicated Butler & Concierge Service',
    'Fine Ceylon Spice Dining & Artisan Cocktails',
    'High-Speed Complimentary Fiber Wi-Fi',
    'Private Chauffeur Airport Transfers'
  ];

  const amenities = (property?.amenities && property.amenities.length > 0) 
    ? property.amenities 
    : defaultAmenities;

  const handleBook = (e) => {
    e.preventDefault();
    if (onBookClick) onBookClick();
    else {
      const el = document.getElementById('rooms');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleExploreRooms = (e) => {
    e.preventDefault();
    if (onExploreRoomsClick) onExploreRoomsClick();
    else {
      const el = document.getElementById('rooms');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="dest-section dest-property-section" id="property">
      <div className="dest-container">
        <div className="dest-section-header">
          <span className="dest-eyebrow">OUR RESORT SANCTUARY</span>
          <h2 className="dest-heading">Stay With Us</h2>
          <p className="dest-lead">
            Experience authentic Sri Lankan luxury at our primary island property, 
            where ocean breezes meet personalized hospitality.
          </p>
        </div>

        <div className="dest-property-showcase">
          {/* Media Side */}
          <div className="dest-property-media">
            <img 
              src={resortPhoto} 
              alt={propertyName}
              className="dest-property-img"
              loading="lazy"
            />
            <div className="dest-property-badge-float">
              FLAGSHIP PROPERTY &bull; SRI LANKA
            </div>
          </div>

          {/* Content Side */}
          <div className="dest-property-content">
            <div className="dest-property-location">
              <FaMapMarkerAlt size={12} />
              <span>{propertyAddress}</span>
            </div>

            <h3 className="dest-property-title">{propertyName}</h3>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '1.25rem' }}>
              {Array.from({ length: starRating }).map((_, i) => (
                <FaStar key={i} style={{ color: 'var(--c-brass)', fontSize: '0.9rem' }} />
              ))}
              <span style={{ fontSize: '0.8rem', color: 'var(--c-text-muted)', marginLeft: '0.4rem', fontWeight: 500 }}>
                5-Star Verified Luxury Hospitality
              </span>
            </div>

            <p className="dest-property-desc">
              Situated in an idyllic sanctuary setting, our flagship Sri Lankan property offers 
              a seamless blend of colonial charm, contemporary comfort, and sweeping ocean and tropical garden views.
            </p>

            <div className="dest-property-amenities">
              {amenities.slice(0, 6).map((item, idx) => (
                <div key={idx} className="dest-property-amenity-item">
                  <FaCheckCircle size={13} />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <div className="dest-property-ctas">
              <a 
                href="#rooms" 
                className="dest-btn-explore-rooms"
                onClick={handleExploreRooms}
              >
                <FaBed size={13} />
                <span>Explore Available Rooms</span>
              </a>

              <a 
                href="#rooms" 
                className="dest-btn-property-details"
                onClick={handleBook}
              >
                <span>Book This Property</span>
                <FaArrowRight size={11} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PropertyShowcase;
