// frontend/src/pages/MyBookings.js
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  FaCalendarAlt, 
  FaBed, 
  FaUsers, 
  FaCheckCircle, 
  FaTimesCircle, 
  FaClock, 
  FaBan, 
  FaReceipt,
  FaArrowRight,
  FaHotel,
  FaTimes,
  FaMoneyBillWave,
  FaGlassCheers,
  FaUtensils,
  FaChair,
  FaCalendarPlus,
  FaCreditCard
} from 'react-icons/fa';
import { bookingAPI, eventAPI, restaurantAPI } from '../services/api';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import roomDeluxePhoto from '../assets/room-deluxe.jpg';
import roomSuitePhoto from '../assets/room-suite.jpg';
import PaymentModal from '../components/PaymentModal';
import './CustomerPortal.css';

const MyBookings = () => {
  const [bookings, setBookings] = useState([]);
  const [eventBookings, setEventBookings] = useState([]);
  const [diningReservations, setDiningReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('upcoming'); // 'upcoming', 'dining', 'past', or 'events'
  const [selectedBookingDetails, setSelectedBookingDetails] = useState(null);
  const [selectedDiningDetails, setSelectedDiningDetails] = useState(null);
  const [cancellingBookingId, setCancellingBookingId] = useState(null);
  const [paymentModalData, setPaymentModalData] = useState(null);

  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab && ['upcoming', 'dining', 'past', 'events'].includes(tab)) {
      setActiveTab(tab);
    }
  }, [location.search]);

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    try {
      setLoading(true);
      const [roomRes, eventRes, diningRes] = await Promise.allSettled([
        bookingAPI.getMyBookings(),
        eventAPI.getMyBookings(),
        restaurantAPI.getMyReservations()
      ]);

      if (roomRes.status === 'fulfilled') {
        setBookings(roomRes.value.data || []);
      } else {
        toast.error('Failed to load your room reservations');
      }

      if (eventRes.status === 'fulfilled') {
        setEventBookings(eventRes.value.data || []);
      }

      if (diningRes.status === 'fulfilled') {
        setDiningReservations(diningRes.value.data?.data || []);
      }
    } catch (error) {
      toast.error('Failed to load your reservations');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelBooking = async (bookingId) => {
    if (!window.confirm('Are you sure you want to cancel this reservation? This will free up the room.')) {
      return;
    }

    try {
      setCancellingBookingId(bookingId);
      await bookingAPI.cancelBooking(bookingId);
      toast.success('Reservation has been cancelled successfully');
      fetchBookings();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to cancel reservation');
    } finally {
      setCancellingBookingId(null);
    }
  };

  const handleCancelEventBooking = async (eventId) => {
    if (!window.confirm('Are you sure you want to cancel this event request?')) {
      return;
    }

    try {
      setCancellingBookingId(eventId);
      await eventAPI.cancelMyBooking(eventId, { reason: 'Cancelled by guest' });
      toast.success('Event request has been cancelled');
      fetchBookings();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to cancel event request');
    } finally {
      setCancellingBookingId(null);
    }
  };

  const handleCancelDiningReservation = async (reservation) => {
    const ref = reservation.confirmationNumber || reservation._id;
    if (!window.confirm(`Are you sure you want to cancel your table reservation (${reservation.confirmationNumber})?`)) {
      return;
    }

    try {
      setCancellingBookingId(reservation._id);
      await restaurantAPI.cancelReservation(ref, { reason: 'Cancelled by guest from customer portal' });
      toast.success('Your table reservation has been cancelled');
      fetchBookings();
      if (selectedDiningDetails?._id === reservation._id) {
        setSelectedDiningDetails(null);
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to cancel dining reservation');
    } finally {
      setCancellingBookingId(null);
    }
  };

  const handleDownloadDiningCalendar = (dining) => {
    if (!dining) return;
    const startIso = `${dining.date}T${(dining.time || '19:00').replace(':', '')}00`;
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Serendib Sanctuary//Dining Experience//EN',
      'BEGIN:VEVENT',
      `SUMMARY:Dinner at ${dining.restaurant?.name || 'Serendib Dining'}`,
      `DESCRIPTION:Table Reservation Ref: ${dining.confirmationNumber}. Guests: ${dining.guestCount}. Seating: ${dining.seatingPreference}.`,
      `LOCATION:${dining.restaurant?.location || 'Serendib Sanctuary, Sri Lanka'}`,
      `DTSTART:${startIso.replace(/-/g, '')}`,
      'DURATION:PT2H',
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `Table-Reservation-${dining.confirmationNumber}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcomingBookings = bookings.filter((b) => {
    const checkIn = new Date(b.checkInDate);
    const isCancelled = b.bookingStatus === 'cancelled';
    const isCheckedOut = b.bookingStatus === 'checked-out';
    return checkIn >= today && !isCancelled && !isCheckedOut;
  });

  const pastBookings = bookings.filter((b) => {
    const checkIn = new Date(b.checkInDate);
    const isCancelled = b.bookingStatus === 'cancelled';
    const isCheckedOut = b.bookingStatus === 'checked-out';
    return checkIn < today || isCancelled || isCheckedOut;
  });

  const getStatusBadge = (status) => {
    const s = (status || '').toLowerCase();
    switch (s) {
      case 'confirmed':
        return <span className="badge badge-success"><FaCheckCircle size={10} /> Confirmed</span>;
      case 'checked-in':
        return <span className="badge badge-info"><FaClock size={10} /> Checked-In</span>;
      case 'checked-out':
        return <span className="badge badge-secondary"><FaCheckCircle size={10} /> Completed</span>;
      case 'cancelled':
        return <span className="badge badge-danger"><FaBan size={10} /> Cancelled</span>;
      default:
        return <span className="badge badge-secondary">{status}</span>;
    }
  };

  const getDiningStatusBadge = (status) => {
    const s = (status || '').toUpperCase();
    switch (s) {
      case 'CONFIRMED':
        return <span className="badge badge-success"><FaCheckCircle size={10} /> Confirmed</span>;
      case 'SEATED':
        return <span className="badge badge-info"><FaChair size={10} /> Seated</span>;
      case 'COMPLETED':
        return <span className="badge badge-secondary"><FaCheckCircle size={10} /> Completed</span>;
      case 'CANCELLED':
        return <span className="badge badge-danger"><FaBan size={10} /> Cancelled</span>;
      case 'PENDING':
        return <span className="badge badge-warning"><FaClock size={10} /> Pending</span>;
      case 'NO_SHOW':
        return <span className="badge badge-danger"><FaTimesCircle size={10} /> No Show</span>;
      default:
        return <span className="badge badge-secondary">{status}</span>;
    }
  };

  const getRoomImage = (room) => {
    if (room?.images && room.images.length > 0 && room.images[0]) {
      return room.images[0];
    }
    const type = (room?.roomType || '').toLowerCase();
    if (type.includes('suite')) return roomSuitePhoto;
    return roomDeluxePhoto;
  };

  const displayedList = activeTab === 'upcoming' ? upcomingBookings : pastBookings;

  return (
    <div className="portal-container" style={{ paddingTop: '2.5rem', paddingBottom: '5rem' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '2rem' }}>
        <span className="portal-section-tag">Guest Reservations</span>
        <h1 style={{ fontSize: '2.25rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', margin: '0.25rem 0 0.5rem 0' }}>
          My Reservations
        </h1>
        <p style={{ color: '#64748B', fontSize: '1rem', margin: 0 }}>
          View, manage, and review your hotel room stays, restaurant table bookings, and banquet events.
        </p>
      </div>

      {/* Metrics Strip */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
        gap: '1rem', 
        marginBottom: '2rem' 
      }}>
        <div style={{ background: '#FFFFFF', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid #E2E8F0', boxShadow: 'var(--portal-shadow-sm)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
            Room Stays
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--c-forest-deep, #0B2B26)', marginTop: '0.25rem' }}>
            {bookings.length}
          </div>
        </div>

        <div style={{ background: '#FFFFFF', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid #E2E8F0', boxShadow: 'var(--portal-shadow-sm)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
            Upcoming Stays
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#10B981', marginTop: '0.25rem' }}>
            {upcomingBookings.length}
          </div>
        </div>

        <div style={{ background: '#FFFFFF', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid #E2E8F0', boxShadow: 'var(--portal-shadow-sm)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
            Dining & Tables
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#D97706', marginTop: '0.25rem' }}>
            {diningReservations.length}
          </div>
        </div>

        <div style={{ background: '#FFFFFF', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid #E2E8F0', boxShadow: 'var(--portal-shadow-sm)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
            Event Requests
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--c-brass, #C5A059)', marginTop: '0.25rem' }}>
            {eventBookings.length}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ 
        display: 'flex', 
        gap: '1rem', 
        borderBottom: '1px solid #E2E8F0', 
        marginBottom: '2rem',
        flexWrap: 'wrap'
      }}>
        <button
          type="button"
          onClick={() => setActiveTab('upcoming')}
          style={{
            padding: '0.75rem 1.25rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'upcoming' ? '3px solid var(--c-brass, #C5A059)' : '3px solid transparent',
            color: activeTab === 'upcoming' ? 'var(--c-forest-deep, #0B2B26)' : '#64748B',
            fontWeight: 700,
            fontSize: '1rem',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <FaCalendarAlt />
          <span>Upcoming Stays ({upcomingBookings.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('dining')}
          style={{
            padding: '0.75rem 1.25rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'dining' ? '3px solid var(--c-brass, #C5A059)' : '3px solid transparent',
            color: activeTab === 'dining' ? 'var(--c-forest-deep, #0B2B26)' : '#64748B',
            fontWeight: 700,
            fontSize: '1rem',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <FaUtensils />
          <span>Dining & Tables ({diningReservations.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('past')}
          style={{
            padding: '0.75rem 1.25rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'past' ? '3px solid var(--c-brass, #C5A059)' : '3px solid transparent',
            color: activeTab === 'past' ? 'var(--c-forest-deep, #0B2B26)' : '#64748B',
            fontWeight: 700,
            fontSize: '1rem',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <FaClock />
          <span>Past Stays & History ({pastBookings.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('events')}
          style={{
            padding: '0.75rem 1.25rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'events' ? '3px solid var(--c-brass, #C5A059)' : '3px solid transparent',
            color: activeTab === 'events' ? 'var(--c-forest-deep, #0B2B26)' : '#64748B',
            fontWeight: 700,
            fontSize: '1rem',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <FaGlassCheers />
          <span>Events & Banquets ({eventBookings.length})</span>
        </button>
      </div>

      {/* Bookings List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem 0', color: '#64748B' }}>
          <div className="spinner" style={{ margin: '0 auto 1rem auto' }} />
          <p>Loading your reservations...</p>
        </div>
      ) : activeTab === 'dining' ? (
        diningReservations.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '4rem 2rem', 
            background: '#FFFFFF', 
            borderRadius: '1rem', 
            border: '1px solid #E2E8F0',
            boxShadow: 'var(--portal-shadow-sm)'
          }}>
            <FaUtensils size={48} style={{ color: '#94A3B8', marginBottom: '1rem' }} />
            <h3 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.5rem' }}>
              No Dining Reservations Found
            </h3>
            <p style={{ color: '#64748B', maxWidth: '450px', margin: '0 auto 1.5rem auto', lineHeight: 1.6 }}>
              You haven't reserved any restaurant tables yet. Experience our signature culinary restaurants, ocean-view terraces, and curated buffets!
            </p>
            <Link to="/dining" className="portal-btn-book">
              <span>Explore Restaurants & Reserve Table</span>
              <FaArrowRight size={12} />
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {diningReservations.map((dr) => {
              const isCancellable = (dr.status === 'CONFIRMED' || dr.status === 'PENDING');
              const restImage = dr.restaurant?.heroImage || null;
              
              return (
                <div 
                  key={dr._id} 
                  style={{ 
                    background: '#FFFFFF', 
                    borderRadius: '1rem', 
                    border: '1px solid #E2E8F0', 
                    boxShadow: 'var(--portal-shadow-sm)',
                    display: 'grid',
                    gridTemplateColumns: '260px 1fr auto',
                    gap: '1.5rem',
                    padding: '1.25rem',
                    alignItems: 'center'
                  }}
                >
                  {/* Restaurant Image or Fallback */}
                  <div style={{ height: '170px', borderRadius: '0.75rem', overflow: 'hidden', background: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {restImage ? (
                      <img 
                        src={restImage} 
                        alt={dr.restaurant?.name || 'Restaurant'} 
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div style={{ textAlign: 'center', color: '#C5A059', padding: '1rem' }}>
                        <FaUtensils size={36} style={{ marginBottom: '0.5rem' }} />
                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{dr.restaurant?.name || 'Hotel Dining'}</div>
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                      <span style={{ 
                        fontSize: '0.75rem', 
                        fontWeight: 700, 
                        letterSpacing: '0.05em', 
                        background: '#EFF6FF', 
                        color: '#1E3A8A', 
                        padding: '0.2rem 0.6rem', 
                        borderRadius: '0.375rem' 
                      }}>
                        {dr.confirmationNumber}
                      </span>
                      {getDiningStatusBadge(dr.status)}
                      {dr.guestType === 'Hotel Guest' && (
                        <span style={{ 
                          fontSize: '0.72rem', 
                          fontWeight: 600, 
                          background: '#ECFDF5', 
                          color: '#065F46', 
                          padding: '0.2rem 0.5rem', 
                          borderRadius: '0.375rem' 
                        }}>
                          Hotel Resident {dr.roomNumber ? `• Room ${dr.roomNumber}` : ''}
                        </span>
                      )}
                    </div>

                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', margin: '0 0 0.4rem 0' }}>
                      {dr.restaurant?.name || 'Serendib Dining'}
                    </h3>

                    <div style={{ fontSize: '0.9rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <FaCalendarAlt size={12} style={{ color: '#D97706' }} />
                        <span>{dr.date} at {dr.time}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <FaUsers size={12} style={{ color: '#64748B' }} />
                        <span>{dr.guestCount} Guest{dr.guestCount > 1 ? 's' : ''}</span>
                        &bull;
                        <FaChair size={12} style={{ color: '#64748B' }} />
                        <span>{dr.seatingPreference} Seating</span>
                        &bull;
                        <span style={{ textTransform: 'capitalize' }}>{dr.diningType}</span>
                      </div>
                      {dr.table && (
                        <div style={{ fontSize: '0.85rem', color: '#0284C7', fontWeight: 600 }}>
                          Table: {dr.table.tableNumber} ({dr.table.location || dr.table.capacity + ' seats'})
                        </div>
                      )}
                      {dr.buffetSession && (
                        <div style={{ fontSize: '0.85rem', color: '#B68C48', fontWeight: 600 }}>
                          Buffet: {dr.buffetSession.name}
                        </div>
                      )}
                      {dr.offer && (
                        <div style={{ fontSize: '0.85rem', color: '#16A34A', fontWeight: 600 }}>
                          Offer: {dr.offer.title}
                        </div>
                      )}
                    </div>

                    {dr.specialRequests && (
                      <div style={{ fontSize: '0.825rem', color: '#64748B', marginTop: '0.4rem', fontStyle: 'italic' }}>
                        Note: "{dr.specialRequests}"
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: '160px' }}>
                    <div>
                      <div style={{ fontSize: '0.8rem', color: '#64748B' }}>Guest Name</div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0F172A' }}>
                        {dr.customerName}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                        {dr.phone}
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <button
                        type="button"
                        className="portal-btn-details"
                        onClick={() => setSelectedDiningDetails(dr)}
                      >
                        View Details
                      </button>

                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm"
                        style={{ fontSize: '0.8rem', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                        onClick={() => handleDownloadDiningCalendar(dr)}
                      >
                        <FaCalendarPlus size={11} />
                        <span>Add to Cal</span>
                      </button>

                      {dr.totalAmount > 0 && dr.status !== 'CANCELLED' && (
                        <button
                          type="button"
                          className="btn btn-sm"
                          style={{ background: 'var(--c-brass, #B68C48)', color: '#FFFFFF', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', border: 'none', padding: '0.45rem 0.65rem', borderRadius: '0.375rem', fontWeight: 600 }}
                          onClick={() => setPaymentModalData({
                            purpose: 'restaurant_dining',
                            targetId: dr._id,
                            itemSummary: {
                              title: `Table at ${dr.restaurant?.name || 'Restaurant'}`,
                              subtitle: `Confirmation: ${dr.confirmationNumber} · ${dr.diningType}`,
                              dates: `${dr.date} at ${dr.time}`,
                              guests: `${dr.guestCount} Guest(s)`
                            }
                          })}
                        >
                          <FaCreditCard size={11} />
                          <span>Pay with PayHere</span>
                        </button>
                      )}

                      {isCancellable && (
                        <button
                          type="button"
                          onClick={() => handleCancelDiningReservation(dr)}
                          disabled={cancellingBookingId === dr._id}
                          className="btn btn-danger btn-sm"
                          style={{ fontSize: '0.8rem', justifyContent: 'center' }}
                        >
                          {cancellingBookingId === dr._id ? 'Cancelling...' : 'Cancel Table'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : activeTab === 'events' ? (
        eventBookings.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '4rem 2rem', 
            background: '#FFFFFF', 
            borderRadius: '1rem', 
            border: '1px solid #E2E8F0',
            boxShadow: 'var(--portal-shadow-sm)'
          }}>
            <FaGlassCheers size={48} style={{ color: '#94A3B8', marginBottom: '1rem' }} />
            <h3 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.5rem' }}>
              No Event Requests Found
            </h3>
            <p style={{ color: '#64748B', maxWidth: '450px', margin: '0 auto 1.5rem auto', lineHeight: 1.6 }}>
              You haven't requested any banquet or event bookings yet. Discover our breathtaking venues and start planning your next gathering!
            </p>
            <Link to="/events" className="portal-btn-book">
              <span>Explore Event Spaces</span>
              <FaArrowRight size={12} />
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {eventBookings.map((eb) => (
              <div 
                key={eb._id} 
                style={{ 
                  background: '#FFFFFF', 
                  borderRadius: '1rem', 
                  border: '1px solid #E2E8F0', 
                  padding: '1.5rem', 
                  boxShadow: 'var(--portal-shadow-sm)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1.5rem'
                }}
              >
                <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
                  <div style={{ width: '56px', height: '56px', background: 'rgba(182, 140, 72, 0.12)', color: 'var(--c-brass, #B68C48)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '12px', fontSize: '1.4rem' }}>
                    <FaGlassCheers />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--c-brass, #B68C48)', textTransform: 'uppercase' }}>
                      {eb.confirmationNumber}
                    </div>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0F172A', margin: '0.2rem 0' }}>
                      {eb.venue?.name || eb.venueName || 'Serendib Event Space'} &bull; <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>{eb.eventType}</span>
                    </h3>
                    <div style={{ color: '#64748B', fontSize: '0.875rem' }}>
                      {eb.date} ({eb.startTime} – {eb.endTime}) &bull; {eb.guestCount} Guests
                      {eb.selectedPackage && ` &bull; Package: ${eb.selectedPackage}`}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <div>{getStatusBadge(eb.status)}</div>
                  {eb.estimatedPrice > 0 && eb.status !== 'CANCELLED' && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{ background: 'var(--c-brass, #B68C48)', color: '#FFFFFF', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', border: 'none', padding: '0.45rem 0.85rem', borderRadius: '0.375rem', fontWeight: 600 }}
                      onClick={() => setPaymentModalData({
                        purpose: 'event_booking',
                        targetId: eb._id,
                        itemSummary: {
                          title: `${eb.venueName || eb.venue?.name || 'Event Hall'} · ${eb.eventType}`,
                          subtitle: `Confirmation: ${eb.confirmationNumber}`,
                          dates: `${eb.date} (${eb.startTime} – ${eb.endTime})`,
                          guests: `${eb.guestCount} Guests`
                        }
                      })}
                    >
                      <FaCreditCard size={11} /> Pay Event Fee
                    </button>
                  )}
                  {eb.status === 'PENDING' && (
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => handleCancelEventBooking(eb._id)}
                      disabled={cancellingBookingId === eb._id}
                      style={{ fontSize: '0.8rem' }}
                    >
                      {cancellingBookingId === eb._id ? 'Cancelling...' : 'Cancel Request'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : displayedList.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '4rem 2rem', 
          background: '#FFFFFF', 
          borderRadius: '1rem', 
          border: '1px solid #E2E8F0',
          boxShadow: 'var(--portal-shadow-sm)'
        }}>
          <FaHotel size={48} style={{ color: '#94A3B8', marginBottom: '1rem' }} />
          <h3 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.5rem' }}>
            {activeTab === 'upcoming' ? 'No Upcoming Reservations' : 'No Past Stays Recorded'}
          </h3>
          <p style={{ color: '#64748B', maxWidth: '450px', margin: '0 auto 1.5rem auto', lineHeight: 1.6 }}>
            {activeTab === 'upcoming'
              ? 'You do not have any upcoming stays scheduled. Browse our available rooms and book your next luxury retreat!'
              : 'You have no previous stays or past reservation records.'}
          </p>
          <Link to="/#rooms" className="portal-btn-book">
            <span>Explore Rooms & Book Now</span>
            <FaArrowRight size={12} />
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {displayedList.map((booking) => {
            const room = booking.room;
            const resNumber = booking.reservationNumber || booking.reservation?.reservationNumber || `RES-${booking._id.slice(-6).toUpperCase()}`;
            const checkInFormatted = format(new Date(booking.checkInDate), 'EEE, MMM d, yyyy');
            const checkOutFormatted = format(new Date(booking.checkOutDate), 'EEE, MMM d, yyyy');
            const diffDays = Math.max(1, Math.ceil((new Date(booking.checkOutDate) - new Date(booking.checkInDate)) / (1000 * 60 * 60 * 24)));
            const isCancellable = booking.bookingStatus === 'confirmed' && new Date(booking.checkInDate) >= today;

            return (
              <div 
                key={booking._id} 
                style={{ 
                  background: '#FFFFFF', 
                  borderRadius: '1rem', 
                  border: '1px solid #E2E8F0', 
                  boxShadow: 'var(--portal-shadow-sm)',
                  display: 'grid',
                  gridTemplateColumns: '260px 1fr auto',
                  gap: '1.5rem',
                  padding: '1.25rem',
                  alignItems: 'center'
                }}
              >
                {/* Room Image */}
                <div style={{ height: '170px', borderRadius: '0.75rem', overflow: 'hidden' }}>
                  <img 
                    src={getRoomImage(room)} 
                    alt={room?.roomType || 'Room'} 
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>

                {/* Details */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.4rem' }}>
                    <span style={{ 
                      fontSize: '0.75rem', 
                      fontWeight: 700, 
                      letterSpacing: '0.05em', 
                      background: '#EFF6FF', 
                      color: '#1E3A8A', 
                      padding: '0.2rem 0.6rem', 
                      borderRadius: '0.375rem' 
                    }}>
                      {resNumber}
                    </span>
                    {getStatusBadge(booking.bookingStatus)}
                  </div>

                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', margin: '0 0 0.4rem 0' }}>
                    {room?.roomType || 'Hotel'} Room {room?.roomNumber || ''}
                  </h3>

                  <div style={{ fontSize: '0.9rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <FaCalendarAlt size={12} style={{ color: '#D97706' }} />
                      <span>{checkInFormatted} &rarr; {checkOutFormatted} ({diffDays} Night{diffDays > 1 ? 's' : ''})</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <FaUsers size={12} style={{ color: '#64748B' }} />
                      <span>{booking.numberOfGuests} Guest(s)</span>
                      &bull;
                      <FaBed size={12} style={{ color: '#64748B' }} />
                      <span>{room?.bedConfiguration || 'Double Bed'}</span>
                    </div>
                  </div>

                  {booking.specialRequests && (
                    <div style={{ fontSize: '0.825rem', color: '#64748B', marginTop: '0.4rem', fontStyle: 'italic' }}>
                      Note: "{booking.specialRequests}"
                    </div>
                  )}
                </div>

                {/* Pricing & Actions */}
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: '160px' }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: '#64748B' }}>Total Price</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1E3A8A' }}>
                      Rs. {Number(booking.totalPrice || 0).toLocaleString()}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B', textTransform: 'capitalize' }}>
                      Payment: {booking.paymentMethod || 'Cash'} &bull; {booking.paymentStatus || 'Pending'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {booking.paymentStatus === 'pending' && booking.bookingStatus !== 'cancelled' && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{ background: 'var(--c-brass, #B68C48)', color: '#FFFFFF', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', border: 'none', padding: '0.5rem 0.75rem', borderRadius: '0.375rem', fontWeight: 600 }}
                        onClick={() => setPaymentModalData({
                          purpose: 'room_booking',
                          targetId: booking._id,
                          itemSummary: {
                            title: `${room?.roomType || 'Hotel'} Room ${room?.roomNumber || ''}`,
                            subtitle: `Reservation: ${resNumber}`,
                            dates: `${checkInFormatted} → ${checkOutFormatted} (${diffDays} Night${diffDays > 1 ? 's' : ''})`,
                            guests: `${booking.numberOfGuests} Guest(s)`
                          }
                        })}
                      >
                        <FaCreditCard size={11} /> Pay with PayHere
                      </button>
                    )}

                    <button
                      type="button"
                      className="portal-btn-details"
                      onClick={() => setSelectedBookingDetails(booking)}
                    >
                      View Details
                    </button>

                    {isCancellable && (
                      <button
                        type="button"
                        onClick={() => handleCancelBooking(booking._id)}
                        disabled={cancellingBookingId === booking._id}
                        className="btn btn-danger btn-sm"
                        style={{ fontSize: '0.8rem', justifyContent: 'center' }}
                      >
                        {cancellingBookingId === booking._id ? 'Cancelling...' : 'Cancel Stay'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Room Booking Details Modal */}
      {selectedBookingDetails && (
        <div className="portal-modal-backdrop" onClick={() => setSelectedBookingDetails(null)}>
          <div className="portal-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="portal-modal-header">
              <h3 className="portal-modal-title">
                Reservation Details: {selectedBookingDetails.reservationNumber || `RES-${selectedBookingDetails._id.slice(-6).toUpperCase()}`}
              </h3>
              <button 
                type="button" 
                className="portal-modal-close"
                onClick={() => setSelectedBookingDetails(null)}
              >
                <FaTimes />
              </button>
            </div>

            <div className="portal-modal-body">
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.25rem' }}>
                <img 
                  src={getRoomImage(selectedBookingDetails.room)} 
                  alt={selectedBookingDetails.room?.roomType} 
                  style={{ width: '80px', height: '65px', objectFit: 'cover', borderRadius: '0.5rem' }}
                />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1.15rem', color: '#0F172A' }}>
                    {selectedBookingDetails.room?.roomType} Room {selectedBookingDetails.room?.roomNumber}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#64748B' }}>
                    Floor {selectedBookingDetails.room?.floor || 1} &bull; {selectedBookingDetails.room?.building || 'Main Building'}
                  </div>
                </div>
              </div>

              <div style={{ 
                background: '#F8FAFC', 
                borderRadius: '0.75rem', 
                padding: '1.25rem', 
                border: '1px solid #E2E8F0',
                display: 'grid', 
                gridTemplateColumns: '1fr 1fr', 
                gap: '1rem',
                fontSize: '0.9rem',
                lineHeight: 1.7,
                marginBottom: '1.25rem'
              }}>
                <div><strong>Check-In Date:</strong> {format(new Date(selectedBookingDetails.checkInDate), 'MMMM d, yyyy')} (2:00 PM)</div>
                <div><strong>Check-Out Date:</strong> {format(new Date(selectedBookingDetails.checkOutDate), 'MMMM d, yyyy')} (11:00 AM)</div>
                <div><strong>Guests:</strong> {selectedBookingDetails.numberOfGuests} Guest(s)</div>
                <div><strong>Status:</strong> {selectedBookingDetails.bookingStatus}</div>
                <div><strong>Payment Method:</strong> {selectedBookingDetails.paymentMethod}</div>
                <div><strong>Payment Status:</strong> {selectedBookingDetails.paymentStatus}</div>
              </div>

              {selectedBookingDetails.specialRequests && (
                <div style={{ marginBottom: '1.25rem', padding: '0.75rem 1rem', background: '#FEF3C7', borderRadius: '0.5rem', color: '#92400E', fontSize: '0.875rem' }}>
                  <strong>Special Requests:</strong> {selectedBookingDetails.specialRequests}
                </div>
              )}

              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                padding: '1rem', 
                background: '#EFF6FF', 
                borderRadius: '0.75rem', 
                fontWeight: 800,
                fontSize: '1.15rem',
                color: '#1E3A8A'
              }}>
                <span>Total Amount:</span>
                <span>Rs. {Number(selectedBookingDetails.totalPrice || 0).toLocaleString()}</span>
              </div>
            </div>

            <div className="portal-modal-footer">
              <button 
                type="button" 
                className="btn btn-secondary"
                onClick={() => setSelectedBookingDetails(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dining Details Modal */}
      {selectedDiningDetails && (
        <div className="portal-modal-backdrop" onClick={() => setSelectedDiningDetails(null)}>
          <div className="portal-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="portal-modal-header">
              <h3 className="portal-modal-title">
                Table Reservation: {selectedDiningDetails.confirmationNumber}
              </h3>
              <button 
                type="button" 
                className="portal-modal-close"
                onClick={() => setSelectedDiningDetails(null)}
              >
                <FaTimes />
              </button>
            </div>

            <div className="portal-modal-body">
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.25rem' }}>
                <div style={{ width: '80px', height: '65px', borderRadius: '0.5rem', background: 'var(--c-forest-deep, #0B2B26)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C5A059', overflow: 'hidden' }}>
                  {selectedDiningDetails.restaurant?.heroImage ? (
                    <img src={selectedDiningDetails.restaurant.heroImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <FaUtensils size={24} />
                  )}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1.2rem', color: '#0F172A' }}>
                    {selectedDiningDetails.restaurant?.name || 'Restaurant Dining'}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#64748B' }}>
                    {selectedDiningDetails.restaurant?.location || 'Serendib Sanctuary'} &bull; {selectedDiningDetails.restaurant?.cuisine || 'Fine Dining'}
                  </div>
                  {selectedDiningDetails.restaurant?.contactPhone && (
                    <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                      Phone: {selectedDiningDetails.restaurant.contactPhone}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ 
                background: '#F8FAFC', 
                borderRadius: '0.75rem', 
                padding: '1.25rem', 
                border: '1px solid #E2E8F0',
                display: 'grid', 
                gridTemplateColumns: '1fr 1fr', 
                gap: '1rem',
                fontSize: '0.9rem',
                lineHeight: 1.7,
                marginBottom: '1.25rem'
              }}>
                <div><strong>Reservation Date:</strong> {selectedDiningDetails.date}</div>
                <div><strong>Reservation Time:</strong> {selectedDiningDetails.time}</div>
                <div><strong>Party Size:</strong> {selectedDiningDetails.guestCount} Guest(s)</div>
                <div><strong>Seating Preference:</strong> {selectedDiningDetails.seatingPreference}</div>
                <div><strong>Dining Type:</strong> {selectedDiningDetails.diningType}</div>
                <div><strong>Status:</strong> {selectedDiningDetails.status}</div>
                <div><strong>Lead Guest:</strong> {selectedDiningDetails.customerName}</div>
                <div><strong>Contact Phone:</strong> {selectedDiningDetails.phone}</div>
                <div><strong>Email:</strong> {selectedDiningDetails.email}</div>
                <div><strong>Guest Type:</strong> {selectedDiningDetails.guestType} {selectedDiningDetails.roomNumber ? `(Room ${selectedDiningDetails.roomNumber})` : ''}</div>
                {selectedDiningDetails.table && (
                  <div><strong>Table Assigned:</strong> Table {selectedDiningDetails.table.tableNumber} ({selectedDiningDetails.table.location || 'Indoor'})</div>
                )}
                {selectedDiningDetails.occasion && selectedDiningDetails.occasion !== 'Casual Dining' && (
                  <div><strong>Occasion:</strong> {selectedDiningDetails.occasion}</div>
                )}
              </div>

              {selectedDiningDetails.specialRequests && (
                <div style={{ marginBottom: '1.25rem', padding: '0.75rem 1rem', background: '#FEF3C7', borderRadius: '0.5rem', color: '#92400E', fontSize: '0.875rem' }}>
                  <strong>Special Requests:</strong> {selectedDiningDetails.specialRequests}
                </div>
              )}

              {selectedDiningDetails.cancellationReason && (
                <div style={{ marginBottom: '1.25rem', padding: '0.75rem 1rem', background: '#FEE2E2', borderRadius: '0.5rem', color: '#991B1B', fontSize: '0.875rem' }}>
                  <strong>Cancellation Reason:</strong> {selectedDiningDetails.cancellationReason}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleDownloadDiningCalendar(selectedDiningDetails)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
                >
                  <FaCalendarPlus /> Add to Calendar (.ics)
                </button>
                {selectedDiningDetails.restaurant?.slug && (
                  <Link
                    to={`/restaurants/${selectedDiningDetails.restaurant.slug}`}
                    className="btn btn-outline-secondary"
                    style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
                    onClick={() => setSelectedDiningDetails(null)}
                  >
                    <FaUtensils /> View Restaurant Menu
                  </Link>
                )}
                {(selectedDiningDetails.status === 'CONFIRMED' || selectedDiningDetails.status === 'PENDING') && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => handleCancelDiningReservation(selectedDiningDetails)}
                    style={{ fontSize: '0.85rem' }}
                  >
                    Cancel Reservation
                  </button>
                )}
              </div>
            </div>

            <div className="portal-modal-footer">
              <button 
                type="button" 
                className="btn btn-secondary"
                onClick={() => setSelectedDiningDetails(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unified PayHere Payment Modal */}
      {paymentModalData && (
        <PaymentModal
          isOpen={Boolean(paymentModalData)}
          onClose={() => setPaymentModalData(null)}
          purpose={paymentModalData.purpose}
          targetId={paymentModalData.targetId}
          itemSummary={paymentModalData.itemSummary}
          onPaymentSuccess={() => {
            fetchBookings();
          }}
        />
      )}
    </div>
  );
};

export default MyBookings;