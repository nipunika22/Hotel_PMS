import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaUtensils, FaArrowRight, FaFish, FaGlobeAsia, FaClock, FaTag, FaCalendarAlt } from 'react-icons/fa';
import RestaurantReservationModal from './RestaurantReservationModal';
import { DEFAULT_RESTAURANTS } from '../config/restaurantData';

const azureTide = DEFAULT_RESTAURANTS.find((restaurant) => restaurant.slug === 'azure-tide');
const spiceSilk = DEFAULT_RESTAURANTS.find((restaurant) => restaurant.slug === 'spice-and-silk');

const diningPillars = [
  { id: azureTide.slug, title: 'Azure Tide', subtitle: azureTide.cuisine, tagline: azureTide.tagline, image: azureTide.heroImage, badge: 'Oceanfront Fine Dining', icon: <FaFish />, hours: azureTide.openingHours, link: '/restaurants/' + azureTide.slug, exploreText: 'Explore Azure Tide' },
  { id: spiceSilk.slug, title: 'Spice & Silk', subtitle: spiceSilk.cuisine, tagline: spiceSilk.tagline, image: spiceSilk.heroImage, badge: 'All-Day Dining & Buffet', icon: <FaGlobeAsia />, hours: spiceSilk.openingHours, link: '/restaurants/' + spiceSilk.slug, exploreText: 'Explore Spice & Silk' },
  { id: 'buffet', title: 'International Buffet', subtitle: 'Breakfast, Lunch & Dinner', tagline: 'Seven live cooking stations and world delicacies daily.', image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1000&q=85', badge: 'Daily Culinary Showcase', icon: <FaClock />, link: '/restaurants/spice-and-silk', exploreText: 'Explore Buffet' },
  { id: 'offers', title: 'Offers & Sunset Tastings', subtitle: 'Curated Experiences', tagline: 'Romantic candlelit dinners and weekend feasts.', image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1000&q=85', badge: 'Special Moments', icon: <FaTag />, link: '/dining', exploreText: 'Explore Offers' }
];

const DestinationDiningStory = () => {
  const [resModalOpen, setResModalOpen] = useState(false);
  return (
    <>
      <section className="dest-section dest-dining-section" id="dining" style={{ backgroundColor: '#FDFCF7' }}>
        <div className="dest-container">
          <div className="dest-section-header">
            <span className="dest-eyebrow">HAUTE GASTRONOMIE & CEYLON HARVEST</span>
            <h2 className="dest-heading">Discover Our Dining</h2>
            <p className="dest-lead">From the ocean’s freshest flavours to an international table inspired by the world, discover dining experiences designed to make your stay memorable.</p>
          </div>
          <div className="dest-dining-grid">
            {diningPillars.map((pillar) => (
              <Link key={pillar.id} to={pillar.link} className="dest-dining-card" aria-label={pillar.exploreText + ' at ' + pillar.title}>
                <div className="dest-dining-media">
                  <img src={pillar.image} alt={pillar.title} className="dest-dining-img" loading="lazy" onError={(event) => {
                    const fallback = 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1000&q=85';
                    if (event.currentTarget.src !== fallback) event.currentTarget.src = fallback;
                  }} />
                  <span className="dest-dining-badge">{pillar.badge}</span>
                </div>
                <div className="dest-dining-body">
                  <span className="dest-dining-type">{pillar.icon}<span>{pillar.subtitle}</span></span>
                  <h3 className="dest-dining-title">{pillar.title}</h3>
                  <p className="dest-dining-description">{pillar.tagline}</p>
                  {pillar.hours && <span className="dest-dining-hours"><FaClock aria-hidden="true" />{pillar.hours}</span>}
                  <span className="dest-dining-card-link">{pillar.exploreText}<FaArrowRight aria-hidden="true" /></span>
                </div>
              </Link>
            ))}
          </div>
          <div className="dest-dining-actions">
            <Link to="/dining" className="dest-hero-btn-primary dest-dining-all-link"><FaUtensils size={12} /><span>Explore All the Restaurants and Menus</span></Link>
            <button type="button" className="dest-btn-property-details" onClick={() => setResModalOpen(true)}><FaCalendarAlt size={12} /><span>Reserve a Table</span></button>
          </div>
        </div>
      </section>
      <RestaurantReservationModal isOpen={resModalOpen} onClose={() => setResModalOpen(false)} />
    </>
  );
};

export default DestinationDiningStory;
