// frontend/src/components/DestinationExperiences.js
import React, { useState } from 'react';
import { FaCompass, FaArrowRight } from 'react-icons/fa';

const DestinationExperiences = ({ destinationData }) => {
  const experiences = destinationData?.experiences || [];
  const [selectedCategory, setSelectedCategory] = useState('All');

  const categories = ['All', ...new Set(experiences.map(exp => exp.category))];

  const filteredExperiences = selectedCategory === 'All' 
    ? experiences 
    : experiences.filter(exp => exp.category === selectedCategory);

  return (
    <section className="dest-section" id="experiences">
      <div className="dest-container">
        <div className="dest-section-header">
          <span className="dest-eyebrow">CURATED ISLAND JOURNEYS</span>
          <h2 className="dest-heading">Sri Lankan Experiences</h2>
          <p className="dest-lead">
            From secluded dawn catamarans to artisanal Ceylon tea tastings and wildlife safaris, 
            discover curated adventures that linger in memory.
          </p>
        </div>

        {/* Category Pills */}
        <div className="dest-rooms-filter" style={{ marginBottom: '2.5rem' }}>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`dest-filter-btn ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Experiences Grid */}
        <div className="dest-exp-grid">
          {filteredExperiences.map((exp) => (
            <div key={exp.id} className="dest-exp-card">
              <div className="dest-exp-thumb">
                <img 
                  src={exp.image} 
                  alt={exp.title} 
                  className="dest-exp-img"
                  loading="lazy"
                  onError={(e) => {
                    if (exp.fallback && e.target.src !== exp.fallback) {
                      e.target.src = exp.fallback;
                    }
                  }}
                />
                <span className="dest-exp-cat">{exp.category}</span>
              </div>
              <div className="dest-exp-body">
                <h3 className="dest-exp-title">{exp.title}</h3>
                <p className="dest-exp-desc">{exp.description}</p>
                <div className="dest-exp-highlight">
                  <FaCompass size={12} />
                  <span>{exp.highlight}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default DestinationExperiences;
