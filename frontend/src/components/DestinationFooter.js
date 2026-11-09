// frontend/src/components/DestinationFooter.js
import React from 'react';
import { Link } from 'react-router-dom';
import { FaShieldAlt, FaPhoneAlt, FaEnvelope, FaMapMarkerAlt, FaGlobeAsia } from 'react-icons/fa';

const DestinationFooter = ({ property }) => {
  const propertyName = property?.name || 'Sri Lanka Main Property';
  const propertyCity = property?.city || 'Colombo & Coastal Gateway';
  const phone = property?.contactPhone || '+94 11 234 5678';
  const email = property?.contactEmail || 'reservations.srilanka@hotelpms.com';

  return (
    <footer className="dest-footer">
      <div className="dest-footer-grid">
        {/* Brand & Narrative */}
        <div>
          <h4 className="dest-footer-brand-title">Serendib Sanctuary</h4>
          <div className="dest-footer-brand-sub">Sri Lanka &bull; Luxury Collection</div>
          <p className="dest-footer-brand-desc">
            A boutique luxury hospitality sanctuary inspired by the timeless beauty, 
            rich cultural tapestry, and warmth of Sri Lanka. Where every stay is a curated memory.
          </p>
          <div style={{ marginTop: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--c-sand)' }}>
            <FaShieldAlt style={{ color: 'var(--c-brass-light)' }} />
            <span>Guaranteed Direct Best Rate &bull; Instant Confirmation</span>
          </div>
        </div>

        {/* Destination Navigation */}
        <div className="dest-footer-col">
          <h5>Sanctuary</h5>
          <ul>
            <li><Link to="/">Sanctuary Home</Link></li>
            <li><a href="/#discovery">Discover Sri Lanka</a></li>
            <li><a href="/#property">Our Flagship Property</a></li>
            <li><a href="/#rooms">Suites & Stays</a></li>
            <li><Link to="/dining">Dining & Restaurants</Link></li>
            <li><Link to="/events">Events & Celebrations</Link></li>
            <li><Link to="/offers">Special Offers</Link></li>
            <li><a href="/#experiences">Curated Experiences</a></li>
            <li><a href="/#story">The Spirit of Sri Lanka</a></li>
          </ul>
        </div>

        {/* Guest Services & Portal */}
        <div className="dest-footer-col">
          <h5>Guest Services</h5>
          <ul>
            <li><Link to="/my-bookings">My Reservations</Link></li>
            <li><Link to="/profile">Guest Profile</Link></li>
            <li><Link to="/login">Guest Sign In</Link></li>
            <li><Link to="/register">Register Account</Link></li>
            <li>Check-in: 14:00 &bull; Check-out: 11:00</li>
          </ul>
        </div>

        {/* Destination Reception Desk */}
        <div className="dest-footer-col">
          <h5>Resort Reception</h5>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
              <FaMapMarkerAlt style={{ color: 'var(--c-brass-light)', marginTop: '0.2rem', flexShrink: 0 }} />
              <span>{propertyName}, {propertyCity}, Sri Lanka</span>
            </li>
            <li style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <FaPhoneAlt style={{ color: 'var(--c-brass-light)', flexShrink: 0 }} />
              <span>{phone}</span>
            </li>
            <li style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <FaEnvelope style={{ color: 'var(--c-brass-light)', flexShrink: 0 }} />
              <span>{email}</span>
            </li>
            <li style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <FaGlobeAsia style={{ color: 'var(--c-brass-light)', flexShrink: 0 }} />
              <span>Timezone: Asia/Colombo (GMT +5:30)</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="dest-footer-bottom">
        <div>
          &copy; {new Date().getFullYear()} Serendib Sanctuary &bull; Hotel Property Management System. All rights reserved.
        </div>
        <div>
          Sri Lanka Primary Destination &bull; ISO 27001 Protocol &bull; 256-Bit SSL Encrypted
        </div>
      </div>
    </footer>
  );
};

export default DestinationFooter;
