// frontend/src/components/RestaurantGalleryLightbox.js
import React, { useEffect } from 'react';
import { FaTimes, FaChevronLeft, FaChevronRight } from 'react-icons/fa';

const RestaurantGalleryLightbox = ({ isOpen, onClose, images = [], activeIndex = 0, onNavigate }) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, activeIndex, images]);

  if (!isOpen || !images || images.length === 0) return null;

  const currentItem = images[activeIndex] || images[0];
  const total = images.length;

  const handlePrev = (e) => {
    if (e) e.stopPropagation();
    const nextIdx = (activeIndex - 1 + total) % total;
    onNavigate(nextIdx);
  };

  const handleNext = (e) => {
    if (e) e.stopPropagation();
    const nextIdx = (activeIndex + 1) % total;
    onNavigate(nextIdx);
  };

  return (
    <div className="rest-lightbox-overlay" onClick={onClose}>
      <button 
        type="button" 
        className="rest-modal-close-btn" 
        style={{ top: '2rem', right: '2rem' }}
        onClick={onClose}
        aria-label="Close Lightbox"
      >
        <FaTimes />
      </button>

      {total > 1 && (
        <button 
          type="button" 
          className="rest-lightbox-nav-btn rest-lightbox-prev"
          onClick={handlePrev}
          aria-label="Previous image"
        >
          <FaChevronLeft />
        </button>
      )}

      <div className="rest-lightbox-content" onClick={(e) => e.stopPropagation()}>
        <img 
          src={currentItem.url || currentItem} 
          alt={currentItem.caption || 'Hotel Restaurant Photography'} 
          className="rest-lightbox-img"
        />

        <div className="rest-lightbox-caption">
          {currentItem.caption && (
            <div style={{ fontWeight: 500, fontSize: '1.05rem', color: '#FFF' }}>
              {currentItem.caption}
            </div>
          )}
          <div style={{ fontSize: '0.82rem', color: 'var(--c-brass-light)', marginTop: '0.35rem' }}>
            {currentItem.category ? `${currentItem.category} • ` : ''}Photo {activeIndex + 1} of {total}
          </div>
        </div>
      </div>

      {total > 1 && (
        <button 
          type="button" 
          className="rest-lightbox-nav-btn rest-lightbox-next"
          onClick={handleNext}
          aria-label="Next image"
        >
          <FaChevronRight />
        </button>
      )}
    </div>
  );
};

export default RestaurantGalleryLightbox;
