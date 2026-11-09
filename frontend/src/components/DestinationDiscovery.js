// frontend/src/components/DestinationDiscovery.js
import React from 'react';

const DestinationDiscovery = ({ destinationData }) => {
  const pillars = destinationData?.discoveryPillars || [];

  return (
    <section className="dest-section" id="discovery">
      <div className="dest-container">
        <div className="dest-section-header">
          <span className="dest-eyebrow">DESTINATION DISCOVERY</span>
          <h2 className="dest-heading">Discover Sri Lanka</h2>
          <p className="dest-lead">
            An ancient island blessed with golden coastlines, emerald highlands, 
            roaming wildlife sanctuaries, and enduring cultural heritage.
          </p>
        </div>

        <div className="dest-discovery-grid">
          {pillars.map((pillar, index) => {
            // Asymmetric layout rhythm: 7-5, then 5-7 or 6-6
            let colClass = 'col-6';
            if (index === 0) colClass = 'col-7';
            else if (index === 1) colClass = 'col-5';
            else if (index === 2) colClass = 'col-5';
            else if (index === 3) colClass = 'col-7';

            return (
              <div 
                key={pillar.id || index} 
                className={`dest-discovery-card ${colClass}`}
              >
                <img 
                  src={pillar.image} 
                  alt={pillar.title} 
                  className="dest-discovery-bg"
                  loading="lazy"
                  onError={(e) => {
                    if (pillar.fallback && e.target.src !== pillar.fallback) {
                      e.target.src = pillar.fallback;
                    }
                  }}
                />
                <div className="dest-discovery-scrim" />
                <div className="dest-discovery-content">
                  <span className="dest-discovery-tag">{pillar.tag}</span>
                  <h3 className="dest-discovery-title">{pillar.title}</h3>
                  <p className="dest-discovery-desc">{pillar.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default DestinationDiscovery;
