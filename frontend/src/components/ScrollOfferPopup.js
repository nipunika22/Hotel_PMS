// frontend/src/components/ScrollOfferPopup.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  FaTimes, 
  FaArrowRight, 
  FaStar, 
  FaAward 
} from 'react-icons/fa';
import { restaurantAPI } from '../services/api';
import resortPhoto from '../assets/hotel-resort-cinematic.jpg';
import './ScrollOfferPopup.css';

const SCROLL_THRESHOLD = 0.38; // 38% scroll progress (within 35–45% range)
const TRIGGER_DELAY_MS = 450; // 450ms delay after scroll threshold (within 300–600ms range)
const EXIT_ANIMATION_MS = 380;
const LEGACY_STORAGE_KEY = 'serendib_offer_popup_seen';

const ScrollOfferPopup = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [isOpen, setIsOpen] = useState(false);
  const [isEnterActive, setIsEnterActive] = useState(false);
  const [isExitActive, setIsExitActive] = useState(false);

  // Default authentic editorial luxury campaign (matching required brand copy)
  const [offerData, setOfferData] = useState({
    isRealOffer: false,
    title: 'Your Next Extraordinary Escape',
    eyebrow: 'AN EXCLUSIVE HOTEL EXPERIENCE',
    description: 'Discover exceptional stays, unforgettable dining, and thoughtfully curated experiences across Sri Lanka’s finest coastal sanctuary.',
    image: resortPhoto,
    badge: 'EXCLUSIVE STAY OFFER',
    perk: 'Complimentary tropical afternoon tea & priority ocean-view booking',
    ctaText: 'Discover Offers',
    ctaUrl: '/offers'
  });

  // Visit-scoped tracking refs: active strictly for the duration of the current homepage visit
  const hasTriggeredThisVisitRef = useRef(false);
  const isDismissedThisVisitRef = useRef(false);
  const scrollTimerRef = useRef(null);
  const exitTimerRef = useRef(null);
  const animFrameRef = useRef(null);
  const modalRef = useRef(null);

  // Clean up legacy persistent storage key on initialization so returning users are not permanently blocked
  useEffect(() => {
    try {
      sessionStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch (e) {
      // Storage access safety
    }
  }, []);

  // 1. Fetch real active offers from existing hotel restaurant/promotional API
  useEffect(() => {
    let isSubscribed = true;

    const loadRealOffer = async () => {
      try {
        const restRes = await restaurantAPI.getRestaurants();
        const restaurants = Array.isArray(restRes?.data?.data) ? restRes.data.data : [];

        if (restaurants.length > 0) {
          const offersAggregator = [];

          for (const rest of restaurants) {
            if (!rest._id) continue;
            try {
              const offerRes = await restaurantAPI.getRestaurantOffers(rest._id);
              const offers = Array.isArray(offerRes?.data?.data) ? offerRes.data.data : [];
              for (const off of offers) {
                offersAggregator.push({
                  ...off,
                  restaurantName: rest.name,
                  restaurantSlug: rest.slug
                });
              }
            } catch (err) {
              // Ignore individual restaurant fetch errors
            }
          }

          if (isSubscribed && offersAggregator.length > 0) {
            // Find active offer with image and title (e.g. Seafood Sunset Experience)
            const chosen = offersAggregator.find(o => o.image && o.title) || offersAggregator[0];

            if (chosen && chosen.title) {
              setOfferData({
                isRealOffer: true,
                title: chosen.title,
                eyebrow: chosen.restaurantName 
                  ? `EXCLUSIVE AT ${chosen.restaurantName.toUpperCase()}` 
                  : 'AN EXCLUSIVE HOTEL EXPERIENCE',
                description: chosen.shortDescription || chosen.description || 'Celebrate unforgettable moments with curated cuisine and panoramic ocean views.',
                image: chosen.image || resortPhoto,
                badge: chosen.discount ? 'SPECIAL INCLUSION' : 'EXCLUSIVE DINING OFFER',
                perk: chosen.discount || (chosen.inclusions && chosen.inclusions[0]) || (chosen.price ? `LKR ${Number(chosen.price).toLocaleString()} per experience` : null),
                ctaText: 'Discover Offers',
                ctaUrl: chosen.restaurantSlug ? `/restaurants/${chosen.restaurantSlug}` : '/offers'
              });
            }
          }
        }
      } catch (e) {
        // Fallback to neutral editorial campaign smoothly without breaking
      }
    };

    loadRealOffer();

    return () => {
      isSubscribed = false;
    };
  }, []);

  // Gracefully close and mark current homepage visit as dismissed
  const handleClose = useCallback(() => {
    isDismissedThisVisitRef.current = true;
    hasTriggeredThisVisitRef.current = true;

    setIsExitActive(true);
    setIsEnterActive(false);

    exitTimerRef.current = setTimeout(() => {
      setIsOpen(false);
      setIsExitActive(false);
    }, EXIT_ANIMATION_MS);
  }, []);

  // CTA Click: Mark visit as dismissed, close, and navigate
  const handleCtaClick = (e) => {
    e.preventDefault();
    isDismissedThisVisitRef.current = true;
    hasTriggeredThisVisitRef.current = true;

    handleClose();
    navigate(offerData.ctaUrl);
  };

  // 2. Scroll detection effect scoped per homepage visit
  useEffect(() => {
    // Only execute on public homepage
    if (location.pathname !== '/' && location.pathname !== '/customer-home') {
      return;
    }

    // Reset visit state if arriving on a new navigation to the homepage
    hasTriggeredThisVisitRef.current = false;
    isDismissedThisVisitRef.current = false;

    const checkScrollProgress = () => {
      // If already triggered or dismissed during this visit, do nothing
      if (hasTriggeredThisVisitRef.current || isDismissedThisVisitRef.current) return;

      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;

      if (scrollHeight <= 0) return;

      const progress = scrollTop / scrollHeight;

      if (progress >= SCROLL_THRESHOLD) {
        hasTriggeredThisVisitRef.current = true;
        window.removeEventListener('scroll', throttledScroll);

        // Delay popup trigger gracefully (300-600ms requirement)
        scrollTimerRef.current = setTimeout(() => {
          // Verify user has not dismissed in the interim
          if (isDismissedThisVisitRef.current) return;

          setIsOpen(true);

          // Trigger entrance animation next tick
          requestAnimationFrame(() => {
            setIsEnterActive(true);
          });
        }, TRIGGER_DELAY_MS);
      }
    };

    const throttledScroll = () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      animFrameRef.current = requestAnimationFrame(checkScrollProgress);
    };

    window.addEventListener('scroll', throttledScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', throttledScroll);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    };
  }, [location.pathname, location.key]);

  // 3. Body scroll locking and Escape key navigation
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleClose]);

  if (!isOpen) {
    return null;
  }

  const animationClass = isExitActive 
    ? 'popup-exit-active' 
    : isEnterActive 
      ? 'popup-enter-active' 
      : '';

  return (
    <div 
      className={`cinematic-popup-backdrop ${animationClass}`}
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cinematic-popup-heading"
      aria-describedby="cinematic-popup-text"
    >
      <div 
        ref={modalRef}
        className="cinematic-popup-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Accessible Top-Right Close Button */}
        <button
          type="button"
          className="cinematic-popup-close-btn"
          onClick={handleClose}
          aria-label="Close promotional popup"
        >
          <FaTimes />
        </button>

        {/* Visual Media Column */}
        <div className="cinematic-popup-visual">
          <img 
            src={offerData.image} 
            alt={offerData.title}
            className="cinematic-popup-image"
            onError={(e) => {
              if (e.target.src !== resortPhoto) {
                e.target.src = resortPhoto;
              }
            }}
          />
          <div className="cinematic-popup-visual-overlay" />

          {/* Genuine Offer Badge / Sanctuary Tag */}
          <div className="cinematic-popup-visual-tag">
            <FaStar />
            <span>{offerData.badge}</span>
          </div>
        </div>

        {/* Editorial Content Column */}
        <div className="cinematic-popup-content">
          <span className="cinematic-popup-eyebrow">
            {offerData.eyebrow}
          </span>

          <h2 id="cinematic-popup-heading" className="cinematic-popup-title">
            {offerData.title}
          </h2>

          <div className="cinematic-popup-divider" />

          <p id="cinematic-popup-desc" className="cinematic-popup-description">
            {offerData.description}
          </p>

          {/* Authentic Offer Highlight / Perk */}
          {offerData.perk && (
            <div className="cinematic-popup-perk-box">
              <FaAward className="cinematic-popup-perk-icon" />
              <div className="cinematic-popup-perk-text">
                <strong>Featured Inclusion:</strong> {offerData.perk}
              </div>
            </div>
          )}

          {/* Interactive CTAs */}
          <div className="cinematic-popup-actions">
            <button
              type="button"
              className="cinematic-popup-btn-secondary"
              onClick={handleClose}
            >
              Maybe Later
            </button>

            <button
              type="button"
              className="cinematic-popup-btn-primary"
              onClick={handleCtaClick}
            >
              <span>{offerData.ctaText}</span>
              <FaArrowRight />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScrollOfferPopup;
