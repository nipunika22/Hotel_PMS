// frontend/src/components/RestaurantOfferModal.js
import React from 'react';
import { FaTimes, FaCheck, FaCalendarAlt, FaTag, FaClock, FaMapMarkerAlt, FaUtensils } from 'react-icons/fa';

const RestaurantOfferModal = ({ isOpen, onClose, offer, onReserveOffer, restaurantInfo }) => {
  if (!isOpen || !offer) return null;

  const offerRestaurant = typeof offer.restaurant === 'object' ? offer.restaurant : null;
  const venueName = offer.venue || offerRestaurant?.name || restaurantInfo?.name;
  const venueLocation = offer.location || restaurantInfo?.location;
  const offerTime = offer.time || [offer.startTime, offer.endTime].filter(Boolean).join(' – ');
  const offerDate = offer.date || offer.eventDate || offer.validFrom;
  const offerDateLabel = offerDate ? (() => { const date = new Date(offerDate); return Number.isNaN(date.getTime()) ? String(offerDate) : date.toLocaleDateString(); })() : '';
  const offerPrice = Number(offer.price);
  const experienceType = offer.experienceType;
  const suitableFor = offer.suitableFor || offer.occasion;
  const highlightItems = offer.highlights || offer.inclusions;
  const availabilityLabel = typeof offer.availability === 'string' || typeof offer.availability === 'number'
    ? String(offer.availability)
    : Array.isArray(offer.availability) ? offer.availability.join(', ')
    : offer.availability && typeof offer.availability === 'object' ? Object.values(offer.availability).filter((value) => typeof value === 'string' || typeof value === 'number').join(', ') : '';

  const handleReserveClick = () => {
    if (offer.frontendOnly) return;
    onClose();
    if (onReserveOffer) {
      onReserveOffer(offer);
    }
  };

  return (
    <div className="rest-modal-backdrop" onClick={onClose}>
      <div 
        className="rest-offer-modal-panel" 
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={offer.title}
      >
        <button 
          type="button" 
          className="rest-modal-close-btn" 
          onClick={onClose}
          aria-label="Close offer details"
        >
          <FaTimes />
        </button>

        {/* Large Cinematic Offer Image */}
        <div className="rest-offer-modal-media">
          <img 
            src={offer.image || offer._displayImageFallback || 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=85'} 
            alt={offer.title}
            onError={(event) => {
              const fallback = offer._displayImageFallback;
              if (fallback && event.currentTarget.src !== fallback) event.currentTarget.src = fallback;
              else event.currentTarget.style.display = 'none';
            }} 
          />
          {offer.discount && (
            <div className="rest-offer-discount-pill">
              <FaTag style={{ marginRight: '0.35rem' }} />
              {offer.discount}
            </div>
          )}
        </div>

        {/* Editorial Body */}
        <div className="rest-offer-modal-body">
          <span className="rest-badge-pill" style={{ marginBottom: '0.75rem' }}>
            {offer.frontendOnly ? 'DINING EXPERIENCE' : 'CURATED DINING EXPERIENCE'}
          </span>

          <h2 style={{ fontSize: '2.2rem', fontWeight: 600, color: 'var(--c-forest-deep)', margin: '0.25rem 0 0.5rem 0' }}>
            {offer.title}
          </h2>

          {offerPrice > 0 && (
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--c-brass)', marginBottom: '1.25rem' }}>
              From {offer.currency || 'LKR'} {offerPrice.toLocaleString()}
              <span style={{ fontSize: '0.85rem', fontWeight: 400, color: 'var(--c-text-muted)', marginLeft: '0.5rem' }}>
                per couple / experience
              </span>
            </div>
          )}

          <p style={{ fontSize: '1rem', color: 'var(--c-text-secondary)', lineHeight: 1.7, marginBottom: '1.5rem' }}>
            {offer.description || offer.shortDescription}
          </p>

          {(venueName || venueLocation || experienceType || suitableFor || offerDate || offerTime || offer.duration || availabilityLabel) && (
            <div className="rest-offer-modal-details">
              {venueName && <span><FaUtensils aria-hidden="true" />{venueName}</span>}
              {venueLocation && <span><FaMapMarkerAlt aria-hidden="true" />{venueLocation}</span>}
              {experienceType && <span><FaUtensils aria-hidden="true" />{experienceType}</span>}
              {suitableFor && <span>{suitableFor}</span>}
              {offerDateLabel && <span><FaCalendarAlt aria-hidden="true" />{offerDateLabel}</span>}
              {offerTime && <span><FaClock aria-hidden="true" />{offerTime}</span>}
              {offer.duration && <span><FaClock aria-hidden="true" />{offer.duration}</span>}
              {availabilityLabel && <span>{availabilityLabel}</span>}
            </div>
          )}

          {/* Inclusions Checklist */}
          {highlightItems && highlightItems.length > 0 && (
            <div>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--c-forest-deep)' }}>
                {offer.frontendOnly ? 'Experience Highlights' : 'Experience Inclusions'}
              </span>
              <ul className="rest-inclusions-list">
                {highlightItems.map((item, idx) => (
                  <li key={idx}>
                    <FaCheck size={13} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Applicable days & Validity */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', flexWrap: 'wrap', fontSize: '0.86rem', color: 'var(--c-text-muted)', marginBottom: '2rem' }}>
            {offer.applicableDays && offer.applicableDays.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <FaClock color="var(--c-brass)" />
                <span>Available: {offer.applicableDays.join(', ')}</span>
              </div>
            )}
            {offer.validUntil && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <FaCalendarAlt color="var(--c-brass)" />
                <span>Valid through: {new Date(offer.validUntil).toLocaleDateString()}</span>
              </div>
            )}
          </div>

          {offer.terms && (
            <p style={{ fontSize: '0.78rem', color: 'var(--c-text-muted)', fontStyle: 'italic', marginBottom: '2rem' }}>
              * Terms: {offer.terms}
            </p>
          )}

          {/* Action CTAs */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '1rem' }}>
            <button 
              type="button" 
              className="rest-btn-secondary"
              style={{ color: 'var(--c-forest-deep)', borderColor: 'var(--c-border-medium)' }}
              onClick={onClose}
            >
              Close
            </button>
            {!offer.frontendOnly && (
              <button
                type="button"
                className="rest-btn-primary"
                onClick={handleReserveClick}
              >
                Reserve Experience
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RestaurantOfferModal;
