import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  FaTimes, 
  FaCalendarAlt, 
  FaClock, 
  FaUsers, 
  FaUtensils, 
  FaCheck, 
  FaHotel, 
  FaUser, 
  FaPhone, 
  FaEnvelope, 
  FaSearch, 
  FaCalendarPlus,
  FaChair,
  FaGlassCheers
} from 'react-icons/fa';
import { restaurantAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import { format, addDays } from 'date-fns';


const SEATING_OPTIONS = [
  'Any',
  'Window',
  'Ocean Terrace',
  'Indoor',
  'Private Dining',
  'Garden'
];

const OCCASIONS = [
  'Casual Dining',
  'Birthday',
  'Anniversary',
  'Romantic Dinner',
  'Business Dinner',
  'Family Gathering',
  'Celebration',
  'Other'
];

const RestaurantReservationModal = ({ 
  isOpen, 
  onClose, 
  preselectedRestaurant = null, 
  preselectedDiningType = 'À la carte',
  preselectedBuffetId = null,
  preselectedOfferId = null,
  restaurantsList = []
}) => {
  const [restaurants, setRestaurants] = useState(restaurantsList);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState('');
  
  // Form fields
  const [date, setDate] = useState(() => format(addDays(new Date(), 1), 'yyyy-MM-dd'));
  const [time, setTime] = useState('19:30');
  const [guestCount, setGuestCount] = useState(2);
  const [seatingPreference, setSeatingPreference] = useState('Any');
  const [diningType, setDiningType] = useState(preselectedDiningType);
  const [occasion, setOccasion] = useState('Casual Dining');
  const [specialRequests, setSpecialRequests] = useState('');

  const { user } = useAuth();

  // Guest details
  const [guestType, setGuestType] = useState('Outside Guest');
  const [customerName, setCustomerName] = useState(() => (user?.name || ''));
  const [email, setEmail] = useState(() => (user?.email || ''));
  const [phone, setPhone] = useState(() => (user?.phone || ''));
  const [roomNumber, setRoomNumber] = useState('');
  const [hotelReservationId, setHotelReservationId] = useState(null);

  // Sync user details if user logs in or changes
  useEffect(() => {
    if (user) {
      setCustomerName((prev) => prev || user.name || '');
      setEmail((prev) => prev || user.email || '');
      setPhone((prev) => prev || user.phone || '');
    }
  }, [user]);


  // Hotel lookup state
  const [hotelLookupQuery, setHotelLookupQuery] = useState('');
  const [lookingUpStay, setLookingUpStay] = useState(false);
  const [linkedStayDetails, setLinkedStayDetails] = useState(null);

  // Real-time availability state
  const [checkingAvail, setCheckingAvail] = useState(false);
  const [availabilityData, setAvailabilityData] = useState(null);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [confirmedReservation, setConfirmedReservation] = useState(null);

  // Initial load
  useEffect(() => {
    if (restaurantsList && restaurantsList.length > 0) {
      setRestaurants(restaurantsList);
      if (!selectedRestaurantId) {
        setSelectedRestaurantId(preselectedRestaurant?._id || restaurantsList[0]._id);
      }
    } else {
      loadRestaurants();
    }
  }, [restaurantsList, preselectedRestaurant]);

  useEffect(() => {
    if (preselectedRestaurant?._id) {
      setSelectedRestaurantId(preselectedRestaurant._id);
    }
    if (preselectedDiningType) {
      setDiningType(preselectedDiningType);
    }
  }, [preselectedRestaurant, preselectedDiningType]);

  const loadRestaurants = async () => {
    try {
      const res = await restaurantAPI.getRestaurants();
      if (res.data?.data) {
        setRestaurants(res.data.data);
        if (res.data.data.length > 0 && !selectedRestaurantId) {
          setSelectedRestaurantId(preselectedRestaurant?._id || res.data.data[0]._id);
        }
      }
    } catch (err) {
      console.error('Failed to load restaurants list', err);
    }
  };

  // Check table availability on date/time/guest count changes
  useEffect(() => {
    if (!selectedRestaurantId || !date || !time) return;

    let isMounted = true;
    const checkSlot = async () => {
      try {
        setCheckingAvail(true);
        const res = await restaurantAPI.checkAvailability(selectedRestaurantId, {
          date,
          time,
          guestCount,
          seatingPreference
        });
        if (isMounted) {
          setAvailabilityData(res.data);
        }
      } catch (err) {
        // Non-blocking
      } finally {
        if (isMounted) setCheckingAvail(false);
      }
    };

    const timeout = setTimeout(checkSlot, 300);
    return () => {
      isMounted = false;
      clearTimeout(timeout);
    };
  }, [selectedRestaurantId, date, time, guestCount, seatingPreference]);

  // Hotel Stay Lookup handler
  const handleHotelStayLookup = async (e) => {
    e.preventDefault();
    if (!hotelLookupQuery.trim()) {
      toast.warn('Please enter a reservation number, room number, or email');
      return;
    }

    try {
      setLookingUpStay(true);
      const res = await restaurantAPI.lookupHotelStay({
        reservationNumber: hotelLookupQuery.trim(),
        roomNumber: hotelLookupQuery.trim(),
        email: hotelLookupQuery.trim()
      });

      if (res.data?.data) {
        const stay = res.data.data;
        setLinkedStayDetails(stay);
        setHotelReservationId(stay.reservationId);
        setRoomNumber(stay.roomNumber);
        if (stay.guestName) setCustomerName(stay.guestName);
        if (stay.email) setEmail(stay.email);
        if (stay.phone) setPhone(stay.phone);
        toast.success(`Verified stay for ${stay.guestName} (Room ${stay.roomNumber})`);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not locate an active hotel reservation with those details');
      setLinkedStayDetails(null);
    } finally {
      setLookingUpStay(false);
    }
  };

  // Submit reservation
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!customerName || !email || !phone) {
      toast.error('Please provide your name, email, and phone number');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        guestType,
        hotelReservationId: guestType === 'Hotel Guest' ? hotelReservationId : undefined,
        roomNumber: guestType === 'Hotel Guest' ? roomNumber : undefined,
        customerName,
        email,
        phone,
        date,
        time,
        guestCount,
        seatingPreference,
        diningType,
        buffetSessionId: preselectedBuffetId || undefined,
        offerId: preselectedOfferId || undefined,
        occasion,
        specialRequests
      };

      const res = await restaurantAPI.createReservation(selectedRestaurantId, payload);
      if (res.data?.success) {
        setConfirmedReservation(res.data.data);
        toast.success('Your table has been reserved successfully!');
      }
    } catch (err) {
      console.error('Reservation error', err);
      toast.error(err.response?.data?.error || 'Failed to complete reservation. Please select another slot.');
    } finally {
      setSubmitting(false);
    }
  };

  // Generate .ics calendar download
  const handleDownloadCalendar = () => {
    if (!confirmedReservation) return;

    const startIso = `${confirmedReservation.date}T${confirmedReservation.time.replace(':', '')}00`;
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Serendib Sanctuary//Dining Experience//EN',
      'BEGIN:VEVENT',
      `SUMMARY:Dinner at ${confirmedReservation.restaurant?.name || 'Serendib Sanctuary'}`,
      `DESCRIPTION:Table Reservation Ref: ${confirmedReservation.confirmationNumber}. Party of ${confirmedReservation.guestCount}. Seating: ${confirmedReservation.seatingPreference}.`,
      `LOCATION:${confirmedReservation.restaurant?.location || 'Serendib Sanctuary, Sri Lanka'}`,
      `DTSTART:${startIso.replace(/-/g, '')}`,
      'DURATION:PT2H',
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `Table-Reservation-${confirmedReservation.confirmationNumber}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleResetAndClose = () => {
    setConfirmedReservation(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="rest-modal-backdrop" onClick={handleResetAndClose}>
      <div 
        className="rest-res-modal-panel" 
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <button 
          type="button" 
          className="rest-modal-close-btn" 
          onClick={handleResetAndClose}
          aria-label="Close reservation modal"
        >
          <FaTimes />
        </button>

        {confirmedReservation ? (
          /* =========================================
             CONFIRMATION SCREEN
             ========================================= */
          <div className="rest-confirmation-screen">
            <div className="rest-confirmation-icon">
              <FaCheck />
            </div>

            <span className="rest-badge-pill" style={{ background: 'rgba(34, 66, 52, 0.1)', color: 'var(--c-forest-deep)' }}>
              RESERVATION CONFIRMED
            </span>

            <h2 style={{ fontSize: '2rem', fontWeight: 600, color: 'var(--c-forest-deep)', margin: '0.75rem 0 0.5rem 0' }}>
              Your Table is Reserved
            </h2>

            <p style={{ color: 'var(--c-text-muted)', fontSize: '0.95rem' }}>
              We look forward to welcoming you for an exceptional culinary journey.
            </p>

            <div className="rest-confirmation-ref">
              Reference: {confirmedReservation.confirmationNumber}
            </div>

            <div className="rest-confirmation-details-box">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.9rem' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--c-text-muted)' }}>Restaurant</span>
                  <div style={{ fontWeight: 600, color: 'var(--c-forest-deep)' }}>
                    {confirmedReservation.restaurant?.name || 'Hotel Restaurant'}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--c-text-muted)' }}>Date & Time</span>
                  <div style={{ fontWeight: 600, color: 'var(--c-forest-deep)' }}>
                    {confirmedReservation.date} at {confirmedReservation.time}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--c-text-muted)' }}>Guests</span>
                  <div style={{ fontWeight: 600, color: 'var(--c-forest-deep)' }}>
                    {confirmedReservation.guestCount} Guests ({confirmedReservation.seatingPreference} Seating)
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--c-text-muted)' }}>Lead Guest</span>
                  <div style={{ fontWeight: 600, color: 'var(--c-forest-deep)' }}>
                    {confirmedReservation.customerName}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.85rem', flexWrap: 'wrap', marginTop: '1.5rem' }}>
              <button 
                type="button" 
                className="rest-btn-primary"
                onClick={handleDownloadCalendar}
              >
                <FaCalendarPlus /> Add to Calendar (.ics)
              </button>
              <Link
                to="/my-bookings?tab=dining"
                className="rest-btn-secondary"
                style={{
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  backgroundColor: '#0F172A',
                  color: '#FFFFFF',
                  borderColor: '#0F172A',
                  padding: '0.75rem 1.25rem',
                  borderRadius: '0.5rem',
                  fontWeight: 600,
                  fontSize: '0.9rem'
                }}
                onClick={handleResetAndClose}
              >
                <FaUtensils /> View in My Reservations
              </Link>
              <button 
                type="button" 
                className="rest-btn-secondary"
                style={{ color: 'var(--c-forest-deep)', borderColor: 'var(--c-border-medium)' }}
                onClick={handleResetAndClose}
              >
                Back to Dining
              </button>
            </div>

          </div>
        ) : (
          /* =========================================
             RESERVATION INPUT FORM
             ========================================= */
          <>
            <div className="rest-res-modal-header">
              <span className="rest-badge-pill" style={{ marginBottom: '0.5rem' }}>
                TABLE RESERVATION
              </span>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 600, margin: 0, color: '#FFF' }}>
                Reserve Your Dining Table
              </h2>
              <p style={{ margin: '0.35rem 0 0 0', color: 'rgba(253, 252, 247, 0.8)', fontSize: '0.88rem' }}>
                Open to in-house hotel residents and outside visitors alike.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="rest-res-modal-body">
              {/* 1. Restaurant Selector */}
              <div className="rest-form-group">
                <label className="rest-form-label">Select Restaurant</label>
                <select 
                  className="rest-form-select"
                  value={selectedRestaurantId}
                  onChange={(e) => setSelectedRestaurantId(e.target.value)}
                  required
                >
                  {restaurants.map((rest) => (
                    <option key={rest._id} value={rest._id}>
                      {rest.name} &bull; {rest.cuisine}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Date, Time & Guest Count Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="rest-form-group" style={{ margin: 0 }}>
                  <label className="rest-form-label">
                    <FaCalendarAlt style={{ marginRight: '0.35rem' }} /> Date
                  </label>
                  <input 
                    type="date"
                    className="rest-form-input"
                    value={date}
                    min={format(new Date(), 'yyyy-MM-dd')}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>

                <div className="rest-form-group" style={{ margin: 0 }}>
                  <label className="rest-form-label">
                    <FaClock style={{ marginRight: '0.35rem' }} /> Time Slot
                  </label>
                  <select 
                    className="rest-form-select"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    required
                  >
                    <option value="07:00">07:00 AM (Breakfast)</option>
                    <option value="08:30">08:30 AM (Breakfast)</option>
                    <option value="12:30">12:30 PM (Lunch)</option>
                    <option value="13:30">01:30 PM (Lunch)</option>
                    <option value="18:30">06:30 PM (Sunset / Dinner)</option>
                    <option value="19:00">07:00 PM (Dinner)</option>
                    <option value="19:30">07:30 PM (Dinner)</option>
                    <option value="20:00">08:00 PM (Dinner)</option>
                    <option value="20:30">08:30 PM (Dinner)</option>
                    <option value="21:00">09:00 PM (Late Dinner)</option>
                  </select>
                </div>

                <div className="rest-form-group" style={{ margin: 0 }}>
                  <label className="rest-form-label">
                    <FaUsers style={{ marginRight: '0.35rem' }} /> Guests
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button
                      type="button"
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '6px',
                        border: '1px solid var(--c-border-medium)',
                        background: 'var(--c-sand-subtle)',
                        fontSize: '1.2rem',
                        cursor: 'pointer'
                      }}
                      onClick={() => setGuestCount((g) => Math.max(1, g - 1))}
                    >
                      -
                    </button>
                    <input 
                      type="number"
                      min="1"
                      max="30"
                      className="rest-form-input"
                      style={{ textAlign: 'center', fontWeight: 600 }}
                      value={guestCount}
                      onChange={(e) => setGuestCount(parseInt(e.target.value) || 1)}
                    />
                    <button
                      type="button"
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '6px',
                        border: '1px solid var(--c-border-medium)',
                        background: 'var(--c-sand-subtle)',
                        fontSize: '1.2rem',
                        cursor: 'pointer'
                      }}
                      onClick={() => setGuestCount((g) => g + 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Real-time availability indicator */}
              {availabilityData && (
                <div style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '6px',
                  background: availabilityData.available ? 'rgba(46, 125, 50, 0.08)' : 'rgba(198, 40, 40, 0.08)',
                  color: availabilityData.available ? '#2E7D32' : '#C62828',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '1.5rem',
                  border: `1px solid ${availabilityData.available ? 'rgba(46, 125, 50, 0.2)' : 'rgba(198, 40, 40, 0.2)'}`
                }}>
                  <FaChair />
                  <span>
                    {availabilityData.available 
                      ? `Tables available for ${guestCount} guests on this date and time.`
                      : 'High demand slot: table availability is limited.'}
                  </span>
                </div>
              )}

              {/* 3. Seating Preference & Occasion */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="rest-form-group" style={{ margin: 0 }}>
                  <label className="rest-form-label">
                    <FaChair style={{ marginRight: '0.35rem' }} /> Seating Preference
                  </label>
                  <select 
                    className="rest-form-select"
                    value={seatingPreference}
                    onChange={(e) => setSeatingPreference(e.target.value)}
                  >
                    {SEATING_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt} Seating</option>
                    ))}
                  </select>
                </div>

                <div className="rest-form-group" style={{ margin: 0 }}>
                  <label className="rest-form-label">
                    <FaGlassCheers style={{ marginRight: '0.35rem' }} /> Dining Occasion
                  </label>
                  <select 
                    className="rest-form-select"
                    value={occasion}
                    onChange={(e) => setOccasion(e.target.value)}
                  >
                    {OCCASIONS.map((occ) => (
                      <option key={occ} value={occ}>{occ}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 4. Guest Type Toggle (Hotel Guest vs Outside Customer) */}
              <div className="rest-form-group">
                <label className="rest-form-label">Guest Accommodation Type</label>
                <div className="rest-guest-type-toggle">
                  <div 
                    className={`rest-guest-type-option ${guestType === 'Hotel Guest' ? 'selected' : ''}`}
                    onClick={() => setGuestType('Hotel Guest')}
                  >
                    <FaHotel size={18} color="var(--c-brass)" />
                    <div>
                      <strong style={{ display: 'block', fontSize: '0.88rem' }}>Staying at the Hotel</strong>
                      <span style={{ fontSize: '0.74rem', color: 'var(--c-text-muted)' }}>Link to room or reservation folio</span>
                    </div>
                  </div>

                  <div 
                    className={`rest-guest-type-option ${guestType === 'Outside Guest' ? 'selected' : ''}`}
                    onClick={() => {
                      setGuestType('Outside Guest');
                      setLinkedStayDetails(null);
                      setHotelReservationId(null);
                    }}
                  >
                    <FaUser size={18} color="var(--c-brass)" />
                    <div>
                      <strong style={{ display: 'block', fontSize: '0.88rem' }}>Outside Guest</strong>
                      <span style={{ fontSize: '0.74rem', color: 'var(--c-text-muted)' }}>Visiting for dining experience only</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Hotel Guest Lookup Box */}
              {guestType === 'Hotel Guest' && (
                <div className="rest-hotel-lookup-box">
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--c-forest-deep)', display: 'block', marginBottom: '0.5rem' }}>
                    Find Your Hotel Stay
                  </span>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input 
                      type="text"
                      className="rest-form-input"
                      placeholder="Enter room number, reservation number, or email..."
                      value={hotelLookupQuery}
                      onChange={(e) => setHotelLookupQuery(e.target.value)}
                    />
                    <button
                      type="button"
                      className="rest-btn-primary"
                      style={{ padding: '0.7rem 1.25rem', whiteSpace: 'nowrap' }}
                      onClick={handleHotelStayLookup}
                      disabled={lookingUpStay}
                    >
                      <FaSearch /> {lookingUpStay ? 'Verifying...' : 'Verify'}
                    </button>
                  </div>

                  {linkedStayDetails && (
                    <div style={{ marginTop: '0.75rem', padding: '0.65rem', background: '#FFF', borderRadius: '4px', border: '1px solid #4CAF50', fontSize: '0.82rem', color: '#2E7D32' }}>
                      ✓ Verified Stay: <strong>{linkedStayDetails.guestName}</strong> &bull; Room <strong>{linkedStayDetails.roomNumber}</strong> (Ref: {linkedStayDetails.reservationNumber})
                    </div>
                  )}
                </div>
              )}

              {/* 5. Contact Details */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="rest-form-group" style={{ margin: 0 }}>
                  <label className="rest-form-label">
                    <FaUser style={{ marginRight: '0.35rem' }} /> Full Name *
                  </label>
                  <input 
                    type="text"
                    className="rest-form-input"
                    placeholder="e.g. Eleanor Vance"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    required
                  />
                </div>

                <div className="rest-form-group" style={{ margin: 0 }}>
                  <label className="rest-form-label">
                    <FaEnvelope style={{ marginRight: '0.35rem' }} /> Email Address *
                  </label>
                  <input 
                    type="email"
                    className="rest-form-input"
                    placeholder="e.g. eleanor@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="rest-form-group" style={{ margin: 0 }}>
                  <label className="rest-form-label">
                    <FaPhone style={{ marginRight: '0.35rem' }} /> Contact Phone *
                  </label>
                  <input 
                    type="tel"
                    className="rest-form-input"
                    placeholder="+94 77 123 4567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* 6. Special Requests */}
              <div className="rest-form-group">
                <label className="rest-form-label">Dietary Preferences or Special Requests</label>
                <textarea 
                  className="rest-form-textarea"
                  rows="2"
                  placeholder="Dietary allergies, window preferences, anniversary cake requests..."
                  value={specialRequests}
                  onChange={(e) => setSpecialRequests(e.target.value)}
                />
              </div>

              {/* Submit CTA */}
              <div style={{ marginTop: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '1rem' }}>
                <button 
                  type="button" 
                  className="rest-btn-secondary"
                  style={{ color: 'var(--c-text-primary)', borderColor: 'var(--c-border-medium)' }}
                  onClick={handleResetAndClose}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="rest-btn-primary"
                  disabled={submitting}
                >
                  {submitting ? 'Confirming Table...' : 'Confirm Reservation'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default RestaurantReservationModal;
