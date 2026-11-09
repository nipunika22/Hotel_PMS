// frontend/src/components/CustomerNavbar.js
import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  FaBars, 
  FaCalendarAlt, 
  FaUser, 
  FaSignOutAlt, 
  FaCalendarCheck,
  FaChevronDown
} from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import DestinationMenuDrawer from './DestinationMenuDrawer';
import GuestWelcomeModal from './GuestWelcomeModal';
import NotificationBell from './NotificationBell';
import { getDestinationData } from '../config/destinationData';
import './CustomerNavbar.css';

/**
 * Disciplined Luxury Customer Navigation Bar
 * 
 * Layout:
 * - Left: Serendib Sanctuary Brand Wordmark
 * - Center: Primary Navigation (Home, Stay & Suites, Dining, Events, Offers)
 * - Right: Customer Actions (Compact User Dropdown + Primary "Book Your Stay" CTA + Mobile Hamburger)
 */
const CustomerNavbar = ({ variant = 'transparent', onBookNowClick }) => {
  const { user, isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [scrolled, setScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  const destinationData = getDestinationData('sri-lanka');
  const isHomePage = location.pathname === '/' || location.pathname === '/customer-home';
  const effectiveVariant = variant;

  // Handle scroll threshold for translucent header transition
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 35) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close user dropdown menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close user menu on route change
  useEffect(() => {
    setUserMenuOpen(false);
    setDrawerOpen(false);
  }, [location.pathname, location.hash]);

  const handleBookNow = (e) => {
    if (e) e.preventDefault();
    setUserMenuOpen(false);
    setDrawerOpen(false);

    if (onBookNowClick && isHomePage) {
      onBookNowClick();
    } else {
      navigate('/#rooms');
      setTimeout(() => {
        const el = document.getElementById('rooms');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      }, 120);
    }
  };

  const handleAnchorNav = (e, targetId) => {
    if (isHomePage) {
      e.preventDefault();
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
        window.history.pushState(null, '', `#${targetId}`);
      }
    } else {
      navigate(`/#${targetId}`);
    }
  };

  const handleLogout = () => {
    setUserMenuOpen(false);
    logout();
    navigate('/');
  };

  const isNavScrolled = effectiveVariant === 'solid' || scrolled;

  // Active state indicators
  const isHomeActive = location.pathname === '/' && !location.hash;
  const isRoomsActive = location.hash === '#rooms';
  const isDiningActive = location.pathname.startsWith('/dining') || location.pathname.startsWith('/restaurants');
  const isEventsActive = location.pathname.startsWith('/events');
  const isOffersActive = location.pathname.startsWith('/offers');

  // Customer identity
  const fullName = (user?.name || '').trim();
  const firstName = fullName ? fullName.split(' ')[0] : 'Guest';
  const avatarInitial = firstName.charAt(0).toUpperCase() || 'G';

  return (
    <>
      <header className={`dest-nav ${isNavScrolled ? 'scrolled' : ''}`}>
        <div className="dest-nav-container">
          {/* =======================================================
              Left: Luxury Brand Wordmark
             ======================================================= */}
          <div className="dest-nav-left">
            <Link to="/" className="dest-brand-link" aria-label="Serendib Sanctuary Home">
              <span className="dest-brand-title">Serendib Sanctuary</span>
              <span className="dest-brand-sub">Hotels &amp; Resorts &bull; Sri Lanka</span>
            </Link>
          </div>

          {/* =======================================================
              Center: Focused Main Navigation (Desktop)
             ======================================================= */}
          <nav className="dest-nav-center" aria-label="Main Navigation">
            <Link 
              to="/" 
              className={`dest-nav-link ${isHomeActive ? 'active' : ''}`}
              onClick={(e) => {
                if (location.pathname === '/' && !location.hash) {
                  e.preventDefault();
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }}
            >
              Home
            </Link>

            <a 
              href="/#rooms" 
              className={`dest-nav-link ${isRoomsActive ? 'active' : ''}`}
              onClick={(e) => handleAnchorNav(e, 'rooms')}
            >
              Stay &amp; Suites
            </a>

            <Link 
              to="/dining" 
              className={`dest-nav-link ${isDiningActive ? 'active' : ''}`}
            >
              Dining
            </Link>

            <Link 
              to="/events" 
              className={`dest-nav-link ${isEventsActive ? 'active' : ''}`}
            >
              Events
            </Link>

            <Link 
              to="/offers" 
              className={`dest-nav-link ${isOffersActive ? 'active' : ''}`}
            >
              Offers
            </Link>
          </nav>

          {/* =======================================================
              Right: Customer Actions & Primary CTA
             ======================================================= */}
          <div className="dest-nav-right">
            {isAuthenticated ? (
              <>
                <NotificationBell />
                {/* Compact Authenticated Customer Menu */}
                <div className="dest-user-menu-wrapper" ref={userMenuRef}>
                <button
                  type="button"
                  className={`dest-user-menu-trigger ${userMenuOpen ? 'open' : ''}`}
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  aria-expanded={userMenuOpen}
                  aria-haspopup="true"
                  aria-label="Guest Account Menu"
                >
                  <span className="dest-user-avatar-initial" aria-hidden="true">
                    {avatarInitial}
                  </span>
                  <span className="dest-user-name-label">
                    {firstName}
                  </span>
                  <FaChevronDown 
                    className={`dest-chevron-icon ${userMenuOpen ? 'rotated' : ''}`} 
                    size={10} 
                  />
                </button>

                {/* Dropdown Menu */}
                {userMenuOpen && (
                  <div className="dest-user-dropdown" role="menu">
                    <div className="dest-dropdown-header">
                      <div className="dest-dropdown-avatar">{avatarInitial}</div>
                      <div className="dest-dropdown-user-info">
                        <strong className="dest-dropdown-user-name">{fullName || 'Valued Guest'}</strong>
                        <span className="dest-dropdown-user-email">{user?.email}</span>
                        <span className="dest-dropdown-badge">Serendib Guest</span>
                      </div>
                    </div>

                    <div className="dest-dropdown-divider" />

                    <Link 
                      to="/my-bookings" 
                      className="dest-dropdown-item" 
                      role="menuitem"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <FaCalendarCheck className="dest-dropdown-item-icon" />
                      <div className="dest-dropdown-item-text">
                        <span>My Reservations</span>
                        <small>View &amp; manage your stays</small>
                      </div>
                    </Link>

                    <Link 
                      to="/profile" 
                      className="dest-dropdown-item" 
                      role="menuitem"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <FaUser className="dest-dropdown-item-icon" />
                      <div className="dest-dropdown-item-text">
                        <span>Account &amp; Profile</span>
                        <small>Personal details &amp; preferences</small>
                      </div>
                    </Link>

                    <div className="dest-dropdown-divider" />

                    <button
                      type="button"
                      className="dest-dropdown-item dest-dropdown-signout"
                      role="menuitem"
                      onClick={handleLogout}
                    >
                      <FaSignOutAlt className="dest-dropdown-item-icon" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                )}
              </div>
              </>
            ) : (
              /* Unauthenticated Guest Actions */
              <div className="dest-auth-guest-links">
                <Link to="/login" className="dest-auth-link">
                  Sign In
                </Link>
                <Link to="/register" className="dest-auth-link dest-auth-signup">
                  Sign Up
                </Link>
              </div>
            )}

            {/* Primary Action: Book Your Stay */}
            <a 
              href="#rooms" 
              className="dest-book-btn"
              onClick={handleBookNow}
            >
              <FaCalendarAlt size={12} />
              <span>Book Your Stay</span>
            </a>

            {/* Mobile Hamburger Drawer Trigger (< 1024px) */}
            <button 
              type="button" 
              className="dest-mobile-menu-btn"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open Navigation Menu"
            >
              <FaBars size={17} />
            </button>
          </div>
        </div>
      </header>

      {/* Post-Login Immersive Guest Welcome Overlay */}
      <GuestWelcomeModal user={user} />

      {/* Slide-in Luxury Menu Drawer (Mobile & Tablet) */}
      <DestinationMenuDrawer 
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        destinationData={destinationData}
        onBookNowClick={handleBookNow}
      />
    </>
  );
};

export default CustomerNavbar;
