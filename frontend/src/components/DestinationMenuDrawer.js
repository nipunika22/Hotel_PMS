import React, { useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { 
  FaTimes, 
  FaCalendarAlt, 
  FaUser, 
  FaSignOutAlt, 
  FaLock, 
  FaUserPlus, 
  FaCalendarCheck 
} from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';

const DestinationMenuDrawer = ({ isOpen, onClose, destinationData }) => {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isHomeActive = location.pathname === '/' && !location.hash;
  const isRoomsActive = location.hash === '#rooms';
  const isDiningActive = location.pathname.startsWith('/dining') || location.pathname.startsWith('/restaurants');
  const isEventsActive = location.pathname.startsWith('/events');
  const isOffersActive = location.pathname.startsWith('/offers');
  const isExperiencesActive = location.hash === '#experiences';

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleLinkClick = () => {
    onClose();
  };

  const handleBookNow = () => {
    onClose();
    if (window.location.pathname === '/' || window.location.pathname === '/customer-home') {
      const el = document.getElementById('rooms');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    } else {
      navigate('/#rooms');
    }
  };

  return (
    <div 
      className={`dest-drawer-overlay ${isOpen ? 'open' : ''}`}
      onClick={onClose}
      aria-hidden={!isOpen}
    >
      <div 
        className="dest-drawer-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Hotel Navigation Menu"
      >
        <div className="dest-drawer-header">
          <Link to="/" className="dest-brand-link" onClick={handleLinkClick}>
            <span className="dest-brand-title" style={{ color: 'var(--c-forest-deep)' }}>
              Serendib Sanctuary
            </span>
            <span className="dest-brand-sub" style={{ color: 'var(--c-brass)' }}>
              Sri Lanka &bull; Luxury Collection
            </span>
          </Link>
          <button 
            type="button" 
            className="dest-drawer-close" 
            onClick={onClose}
            aria-label="Close menu"
          >
            <FaTimes />
          </button>
        </div>

        <div className="dest-drawer-body">
          <div>
            <ul className="dest-drawer-menu">
              <li className="dest-drawer-item">
                <Link to="/" className={`dest-drawer-link ${isHomeActive ? 'active' : ''}`} onClick={handleLinkClick}>
                  Sanctuary Home
                </Link>
              </li>
              <li className="dest-drawer-item">
                <a href="/#discovery" className="dest-drawer-link" onClick={handleLinkClick}>
                  Discover Sri Lanka
                </a>
              </li>
              <li className="dest-drawer-item">
                <a href="/#property" className="dest-drawer-link" onClick={handleLinkClick}>
                  Our Flagship Property
                </a>
              </li>
              <li className="dest-drawer-item">
                <a href="/#rooms" className={`dest-drawer-link ${isRoomsActive ? 'active' : ''}`} onClick={handleLinkClick}>
                  Suites & Stays
                </a>
              </li>
              <li className="dest-drawer-item">
                <Link to="/dining" className={`dest-drawer-link dest-dining-drawer-link ${isDiningActive ? 'active' : ''}`} onClick={handleLinkClick}>
                  Dining & Restaurants
                </Link>
              </li>
              <li className="dest-drawer-item">
                <Link to="/events" className={`dest-drawer-link ${isEventsActive ? 'active' : ''}`} onClick={handleLinkClick}>
                  Events
                </Link>
              </li>
              <li className="dest-drawer-item">
                <Link to="/offers" className={`dest-drawer-link ${isOffersActive ? 'active' : ''}`} onClick={handleLinkClick}>
                  Hotel Offers
                </Link>
              </li>
              <li className="dest-drawer-item">
                <a href="/#experiences" className={`dest-drawer-link ${isExperiencesActive ? 'active' : ''}`} onClick={handleLinkClick}>
                  Curated Experiences
                </a>
              </li>
              <li className="dest-drawer-item">
                <a href="/#story" className="dest-drawer-link" onClick={handleLinkClick}>
                  The Spirit of Sri Lanka
                </a>
              </li>

              {/* Authenticated Links */}
              {isAuthenticated ? (
                <>
                  <li className="dest-drawer-item">
                    <Link to="/my-bookings" className="dest-drawer-link" onClick={handleLinkClick} style={{ color: 'var(--c-forest-deep)', fontWeight: 500 }}>
                      My Reservations
                    </Link>
                  </li>
                  <li className="dest-drawer-item">
                    <Link to="/profile" className="dest-drawer-link" onClick={handleLinkClick}>
                      My Account &amp; Profile
                    </Link>
                  </li>
                </>
              ) : (
                <>
                  <li className="dest-drawer-item">
                    <Link to="/login" className="dest-drawer-link" onClick={handleLinkClick} style={{ color: 'var(--c-brass)' }}>
                      Login
                    </Link>
                  </li>
                  <li className="dest-drawer-item">
                    <Link to="/register" className="dest-drawer-link" onClick={handleLinkClick}>
                      Sign Up
                    </Link>
                  </li>
                </>
              )}
            </ul>

            {/* Prominent Drawer Book Now Button */}
            <div style={{ marginTop: '1.25rem' }}>
              <button 
                type="button" 
                className="dest-hero-btn-primary" 
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={handleBookNow}
              >
                <FaCalendarAlt size={13} />
                <span>Book Your Stay</span>
              </button>
            </div>
          </div>

          <div>
            {/* Sri Lanka Destination Snapshot Card */}
            <div className="dest-drawer-card">
              <div className="dest-drawer-card-badge">
                Selected Destination &bull; 🇱🇰 Sri Lanka
              </div>
              <div className="dest-drawer-card-title">
                {destinationData?.name || 'Sri Lanka'}
              </div>
              <p className="dest-drawer-card-desc">
                {destinationData?.tagline || 'Where emerald tea terraces meet the warm tide of the Indian Ocean.'}
              </p>
              <div className="dest-drawer-facts">
                <div className="dest-drawer-fact-item">
                  <span>Currency</span>
                  <strong>{destinationData?.currency || 'LKR'}</strong>
                </div>
                <div className="dest-drawer-fact-item">
                  <span>Timezone</span>
                  <strong>GMT +5:30</strong>
                </div>
                <div className="dest-drawer-fact-item">
                  <span>Climate</span>
                  <strong>28°C Tropical</strong>
                </div>
              </div>
            </div>

            {/* Authenticated user pill / Sign Out */}
            {isAuthenticated && (
              <div style={{ marginTop: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'var(--c-sand-subtle)', borderRadius: '0.75rem', border: '1px solid var(--c-border-light)' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--c-forest-deep)' }}>
                  Signed in as <strong>{user?.name}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => { logout(); onClose(); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--c-forest-deep)',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}
                >
                  <FaSignOutAlt /> Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DestinationMenuDrawer;
