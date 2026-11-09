// frontend/src/components/DestinationStory.js
import React from 'react';
import lobbyPhoto from '../assets/hotel-lobby-cinematic.jpg';
import resortPhoto from '../assets/hotel-resort-cinematic.jpg';

const DestinationStory = ({ destinationData }) => {
  const story = destinationData?.story || {};
  const stats = story.stats || [];

  return (
    <section className="dest-story-section" id="story">
      <div className="dest-container">
        <div className="dest-story-grid">
          {/* Asymmetric Image Composition */}
          <div className="dest-story-media-composition">
            <img 
              src={destinationData?.images?.storyMain || resortPhoto} 
              alt="Sri Lankan hospitality and natural landscape" 
              className="dest-story-img-main"
              loading="lazy"
              onError={(e) => {
                if (e.target.src !== resortPhoto) e.target.src = resortPhoto;
              }}
            />
            <img 
              src={destinationData?.images?.storySecondary || lobbyPhoto} 
              alt="Serene resort interiors and heritage design" 
              className="dest-story-img-sub"
              loading="lazy"
              onError={(e) => {
                if (e.target.src !== lobbyPhoto) e.target.src = lobbyPhoto;
              }}
            />
          </div>

          {/* Editorial Narrative Content */}
          <div className="dest-story-content">
            <span className="dest-story-eyebrow">
              {story.eyebrow || 'THE SPIRIT OF SRI LANKA'}
            </span>
            <h2 className="dest-story-title">
              {story.title || 'A Warm Welcome Sculpted by Land, Sea, and Soul'}
            </h2>

            {story.quote && (
              <div className="dest-story-quote">
                {story.quote}
              </div>
            )}

            {(story.paragraphs || []).map((paragraph, index) => (
              <p key={index} className="dest-story-p">
                {paragraph}
              </p>
            ))}

            {/* Heritage Statistics Bar */}
            {stats.length > 0 && (
              <div className="dest-story-stats">
                {stats.map((stat, idx) => (
                  <div key={idx}>
                    <div className="dest-story-stat-val">{stat.value}</div>
                    <div className="dest-story-stat-lbl">{stat.label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default DestinationStory;
