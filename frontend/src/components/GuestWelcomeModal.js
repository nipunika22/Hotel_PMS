// frontend/src/components/GuestWelcomeModal.js
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowRight, FaTimes, FaCompass } from 'react-icons/fa';
import resortPhoto from '../assets/hotel-resort-cinematic.jpg';
import './GuestWelcomeModal.css';

/**
 * Premium Post-Login Guest Welcome Experience
 * Appears full-screen immediately following successful customer login/registration.
 * Uses real authenticated guest first name, authentic Sri Lankan hospitality aesthetic,
 * restrained Ceylon brass accents, and smooth accessible dismiss workflows.
 */
const GuestWelcomeModal = ({ user }) => {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const primaryBtnRef = useRef(null);

  // Fallback to localStorage in case auth context state is resolving synchronously
  const effectiveUser = user || (() => {
    try {
      const saved = localStorage.getItem('user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  })();

  const role = (effectiveUser?.role || '').toLowerCase().trim();

  useEffect(() => {
    const shouldShow = sessionStorage.getItem('serendib_show_login_welcome') === 'true';

    // Guard: Only show for verified customers, NEVER for staff or admin roles
    if (shouldShow) {
      if (role && role !== 'customer') {
        sessionStorage.removeItem('serendib_show_login_welcome');
        return;
      }

      // Immediately consume and clear the flag so it NEVER re-triggers on refresh or subsequent navigation
      sessionStorage.removeItem('serendib_show_login_welcome');
      setIsOpen(true);
    }
  }, [role]);

  // Handle keyboard ESC to dismiss
  useEffect(() => {
    if (!isOpen) return;

    // Focus primary button when modal opens
    if (primaryBtnRef.current) {
      primaryBtnRef.current.focus();
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleDismiss();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  // Extract clean first name if available; fallback gracefully to 'Valued Guest'
  const rawName = (effectiveUser?.name || '').trim();
  const firstName = rawName ? rawName.split(' ')[0] : '';
  const greetingName = firstName || 'Valued Guest';

  const handleDismiss = () => {
    setIsOpen(false);
  };

  const handleExploreStay = () => {
    setIsOpen(false);
    navigate('/#rooms');
    setTimeout(() => {
      const el = document.getElementById('rooms');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }, 120);
  };

  return (
    <div
      className="guest-welcome-overlay"
      style={{
        backgroundImage: `linear-gradient(135deg, rgba(22, 46, 36, 0.94) 0%, rgba(13, 30, 23, 0.90) 50%, rgba(22, 46, 36, 0.96) 100%), url(${resortPhoto})`
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="guest-welcome-heading"
      onClick={handleDismiss}
    >
      <div
        className="guest-welcome-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Dismiss Button */}
        <button
          type="button"
          className="guest-welcome-close-btn"
          onClick={handleDismiss}
          aria-label="Dismiss Welcome Overlay (ESC)"
          title="Dismiss"
        >
          <FaTimes size={15} />
        </button>

        {/* Sri Lankan Monogram Emblem */}
        <div className="guest-welcome-emblem" aria-hidden="true">
          <span>🇱🇰</span>
        </div>

        {/* Eyebrow */}
        <span className="guest-welcome-eyebrow">
          Ayubowan &bull; Welcome to Serendib Sanctuary
        </span>

        {/* Personalized Heading */}
        <h2 id="guest-welcome-heading" className="guest-welcome-title">
          Ayubowan, {greetingName}.
        </h2>

        {/* Subtitle */}
        <p className="guest-welcome-subtitle">
          Welcome to your personal sanctuary.
        </p>

        {/* Warm Description */}
        <p className="guest-welcome-quote">
          We are honored to welcome you back to our private coastal sanctuary. Where
          azure ocean breezes meet lush emerald tea terraces, your bespoke Sri Lankan
          retreat awaits.
        </p>

        {/* CTAs */}
        <div className="guest-welcome-actions">
          <button
            type="button"
            ref={primaryBtnRef}
            className="guest-welcome-btn-primary"
            onClick={handleExploreStay}
          >
            <FaCompass size={14} />
            <span>Explore Your Stay</span>
            <FaArrowRight size={12} />
          </button>

          <button
            type="button"
            className="guest-welcome-btn-secondary"
            onClick={handleDismiss}
          >
            <span>Continue to Website</span>
          </button>
        </div>

        {/* Brand Signature */}
        <div className="guest-welcome-signature" aria-hidden="true">
          <span>SERENDIB SANCTUARY</span>
          <span className="guest-welcome-dot">&bull;</span>
          <span>HOTELS &amp; RESORTS</span>
          <span className="guest-welcome-dot">&bull;</span>
          <span>SRI LANKA</span>
        </div>
      </div>
    </div>
  );
};

export default GuestWelcomeModal;
