// frontend/src/components/DestinationEscape.js
import React from 'react';
import { DESTINATIONS_LIST } from '../config/destinationData';
import { FaCheckCircle, FaLock } from 'react-icons/fa';

const DestinationEscape = ({ activeDestination, onSelectDestination }) => {
  return (
    <section className="dest-section dest-escape-section" id="destinations">
      <div className="dest-container">
        <div className="dest-section-header">
          <span className="dest-eyebrow">CHOOSE YOUR HORIZON</span>
          <h2 className="dest-heading">Where Would You Like to Escape?</h2>
          <p className="dest-lead">
            Select your sanctuary destination. Currently welcoming guests to our premier 
            island retreat in Sri Lanka, with new archipelago sanctuaries on the horizon.
          </p>
        </div>

        <div className="dest-escape-options">
          {DESTINATIONS_LIST.map((dest) => {
            const isActive = dest.status === 'active';
            const isSelected = activeDestination === dest.id;

            return (
              <div 
                key={dest.id}
                className={`dest-escape-card ${isSelected ? 'active' : ''} ${!isActive ? 'upcoming' : ''}`}
                onClick={() => {
                  if (isActive && onSelectDestination) {
                    onSelectDestination(dest.id);
                  }
                }}
                role="button"
                tabIndex={isActive ? 0 : -1}
                aria-disabled={!isActive}
              >
                <div className="dest-escape-flag">{dest.flag}</div>
                <div>
                  <h3 className="dest-escape-name">{dest.name}</h3>
                  <div className="dest-escape-status">
                    {isActive ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: 'var(--c-forest-deep)' }}>
                        <FaCheckCircle size={10} style={{ color: 'var(--c-brass)' }} /> Active Sanctuary &bull; 1 Property
                      </span>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: 'var(--c-text-muted)' }}>
                        <FaLock size={9} /> Coming Soon &bull; Future Expansion
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default DestinationEscape;
