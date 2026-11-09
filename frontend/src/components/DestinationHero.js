// frontend/src/components/DestinationHero.js
import React, { useState } from 'react';
import { FaCompass, FaCalendarAlt, FaArrowDown } from 'react-icons/fa';

const DestinationHero = ({ destinationData, onExploreClick, onBookClick }) => {
  const [imgSrc, setImgSrc] = useState(
    destinationData?.images?.hero || destinationData?.images?.heroFallback
  );

  const handleImageError = () => {
    if (destinationData?.images?.heroFallback && imgSrc !== destinationData.images.heroFallback) {
      setImgSrc(destinationData.images.heroFallback);
    }
  };

  const handleExplore = (e) => {
    e.preventDefault();
    if (onExploreClick) {
      onExploreClick();
    } else {
      const el = document.getElementById('discovery');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleBook = (e) => {
    e.preventDefault();
    if (onBookClick) {
      onBookClick();
    } else {
      const el = document.getElementById('rooms');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section 
      className="dest-hero"
      id="home"
      style={{ backgroundImage: `url(${imgSrc})` }}
    >
      {/* Hidden image element to listen for load errors and trigger fallback */}
      <img 
        src={imgSrc} 
        alt="" 
        onError={handleImageError} 
        style={{ display: 'none' }} 
        aria-hidden="true" 
      />

      <div className="dest-hero-content">
        <div className="dest-hero-badge">
          <span>🇱🇰</span>
          <span>{destinationData?.badge || 'CEYLON SANCTUARY &bull; ISLAND OF SERENDIB'}</span>
        </div>

        <h1 className="dest-hero-title">
          {destinationData?.heroHeadline || 'SRI LANKA'}
        </h1>

        <p className="dest-hero-subheadline">
          {destinationData?.tagline || 'Where every journey becomes a story.'}
        </p>

        <p className="dest-hero-desc">
          {destinationData?.heroDescription || 'Immerse yourself in a land sculpted by royal dynasties, wild coastal shores, and legendary island hospitality.'}
        </p>

        <div className="dest-hero-actions">
          <a 
            href="#discovery" 
            className="dest-hero-btn-primary"
            onClick={handleExplore}
          >
            <FaCompass size={14} />
            <span>Explore Sri Lanka</span>
          </a>

          <a 
            href="#rooms" 
            className="dest-hero-btn-secondary"
            onClick={handleBook}
          >
            <FaCalendarAlt size={14} />
            <span>Book Your Stay</span>
          </a>
        </div>
      </div>
    </section>
  );
};

export default DestinationHero;
