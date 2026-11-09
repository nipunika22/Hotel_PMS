// frontend/src/components/DestinationSearch.js
import React from 'react';
import { FaCalendarAlt, FaUsers, FaBed, FaSearch, FaMapMarkerAlt } from 'react-icons/fa';
import { format } from 'date-fns';

const DestinationSearch = ({
  checkInDate,
  setCheckInDate,
  checkOutDate,
  setCheckOutDate,
  guestsCount,
  setGuestsCount,
  selectedTypeFilter,
  setSelectedTypeFilter,
  onSubmit
}) => {
  return (
    <div className="dest-search-bar-wrap">
      <div className="dest-search-card">
        <form onSubmit={onSubmit} className="dest-search-form">
          {/* Destination Field */}
          <div className="dest-search-field">
            <label className="dest-search-label">
              <FaMapMarkerAlt size={11} /> Destination
            </label>
            <select className="dest-search-select" value="sri-lanka" disabled>
              <option value="sri-lanka">🇱🇰 Sri Lanka (Active)</option>
            </select>
          </div>

          {/* Check-In Date */}
          <div className="dest-search-field">
            <label className="dest-search-label" htmlFor="dest-check-in">
              <FaCalendarAlt size={11} /> Check-In
            </label>
            <input
              id="dest-check-in"
              type="date"
              className="dest-search-input"
              min={format(new Date(), 'yyyy-MM-dd')}
              value={checkInDate}
              onChange={(e) => setCheckInDate(e.target.value)}
              required
            />
          </div>

          {/* Check-Out Date */}
          <div className="dest-search-field">
            <label className="dest-search-label" htmlFor="dest-check-out">
              <FaCalendarAlt size={11} /> Check-Out
            </label>
            <input
              id="dest-check-out"
              type="date"
              className="dest-search-input"
              min={checkInDate || format(new Date(), 'yyyy-MM-dd')}
              value={checkOutDate}
              onChange={(e) => setCheckOutDate(e.target.value)}
              required
            />
          </div>

          {/* Guests Count */}
          <div className="dest-search-field">
            <label className="dest-search-label" htmlFor="dest-guests">
              <FaUsers size={11} /> Guests
            </label>
            <select
              id="dest-guests"
              className="dest-search-select"
              value={guestsCount}
              onChange={(e) => setGuestsCount(Number(e.target.value))}
            >
              <option value={1}>1 Guest</option>
              <option value={2}>2 Guests</option>
              <option value={3}>3 Guests</option>
              <option value={4}>4+ Guests</option>
            </select>
          </div>

          {/* Room Category */}
          <div className="dest-search-field">
            <label className="dest-search-label" htmlFor="dest-category">
              <FaBed size={11} /> Accommodation
            </label>
            <select
              id="dest-category"
              className="dest-search-select"
              value={selectedTypeFilter}
              onChange={(e) => setSelectedTypeFilter(e.target.value)}
            >
              <option value="All">All Suites & Rooms</option>
              <option value="Deluxe">Deluxe Room</option>
              <option value="Suite">Executive Suite</option>
              <option value="Double">Double Room</option>
              <option value="Single">Single Room</option>
            </select>
          </div>

          {/* Submit CTA */}
          <button type="submit" className="dest-search-submit">
            <FaSearch size={12} />
            <span>Search</span>
          </button>
        </form>
      </div>
    </div>
  );
};

export default DestinationSearch;
