// frontend/src/pages/GuestDetails.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  FaEdit, 
  FaTrash, 
  FaArrowLeft, 
  FaUser, 
  FaIdCard, 
  FaMapMarkerAlt, 
  FaBed, 
  FaCalendarAlt, 
  FaUtensils, 
  FaGlassCheers, 
  FaFileInvoiceDollar, 
  FaUserCheck, 
  FaUserTimes, 
  FaInfoCircle, 
  FaClock, 
  FaShieldAlt, 
  FaToggleOn, 
  FaToggleOff 
} from 'react-icons/fa';
import { guestAPI } from '../services/api';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import StatusBadge from '../components/ui/StatusBadge';

const GuestDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [guest, setGuest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); // overview, reservations, dining, invoices, profile
  const [togglingStatus, setTogglingStatus] = useState(false);

  useEffect(() => {
    fetchGuest();
  }, [id]);

  const fetchGuest = async () => {
    try {
      setLoading(true);
      const response = await guestAPI.getGuest(id);
      setGuest(response.data);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to load guest details');
      navigate('/guests');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    const reservationCount = guest?.reservations?.length || 0;
    if (reservationCount > 0) {
      toast.error(`Cannot delete guest with ${reservationCount} existing hotel booking(s). You can deactivate the account instead.`);
      return;
    }

    if (!window.confirm(`Are you sure you want to permanently delete the profile for ${guest.firstName} ${guest.lastName}?`)) return;

    try {
      await guestAPI.deleteGuest(id);
      toast.success('Guest deleted successfully');
      navigate('/guests');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete guest');
    }
  };

  const handleToggleStatus = async () => {
    const newStatus = (guest.status === 'Active' || !guest.status) ? 'Inactive' : 'Active';
    const actionLabel = newStatus === 'Active' ? 'activate' : 'deactivate';

    if (!window.confirm(`Are you sure you want to ${actionLabel} ${guest.firstName}'s account?`)) return;

    try {
      setTogglingStatus(true);
      await guestAPI.updateGuestStatus(id, newStatus);
      toast.success(`Guest account is now ${newStatus}`);
      setGuest(prev => ({ ...prev, status: newStatus }));
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to update account status');
    } finally {
      setTogglingStatus(false);
    }
  };

  if (loading) {
    return (
      <div className="content-wrapper" style={{ padding: '4rem', textAlign: 'center' }}>
        <div className="spinner"></div>
        <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>Retrieving guest dossier...</p>
      </div>
    );
  }

  if (!guest) {
    return (
      <div className="content-wrapper" style={{ padding: '3rem', textAlign: 'center' }}>
        <h3>Guest profile not found</h3>
        <button onClick={() => navigate('/guests')} className="btn btn-primary" style={{ marginTop: '1rem' }}>
          Back to Guest Directory
        </button>
      </div>
    );
  }

  const isRegistered = !!guest.user;
  const isActive = (guest.status || 'Active') === 'Active';
  const guestCode = guest.nationalIdNumber?.startsWith('GST-')
    ? guest.nationalIdNumber
    : `GST-${(guest._id || '').slice(-6).toUpperCase()}`;

  const reservations = guest.reservations || [];
  const diningReservations = guest.restaurantReservations || [];
  const eventBookings = guest.eventBookings || [];
  const invoices = guest.invoices || [];

  return (
    <div>
      {/* Top Header Bar */}
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => navigate('/guests')} className="btn btn-outline btn-sm">
            <FaArrowLeft /> Back to Directory
          </button>
          <div>
            <h1 className="topbar-title" style={{ margin: 0, fontSize: '1.25rem' }}>
              Guest Dossier: {guest.firstName} {guest.lastName}
            </h1>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              {guestCode}
            </span>
          </div>
        </div>

        <div className="topbar-actions" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button 
            onClick={handleToggleStatus} 
            disabled={togglingStatus}
            className="btn btn-outline"
            style={{ 
              color: isActive ? 'var(--color-warning, #d97706)' : 'var(--color-success, #16a34a)',
              borderColor: isActive ? 'var(--color-warning, #d97706)' : 'var(--color-success, #16a34a)' 
            }}
          >
            {isActive ? <FaToggleOn /> : <FaToggleOff />}
            {isActive ? 'Deactivate Account' : 'Activate Account'}
          </button>

          <button onClick={() => navigate(`/guests/${id}/edit`)} className="btn btn-primary">
            <FaEdit /> Edit Profile
          </button>

          <button onClick={handleDelete} className="btn btn-danger">
            <FaTrash /> Delete
          </button>
        </div>
      </div>

      <div className="content-wrapper">
        {/* Guest Summary Hero Card */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
              <div 
                className="user-avatar" 
                style={{ 
                  width: '72px', 
                  height: '72px', 
                  fontSize: '1.75rem', 
                  fontWeight: 700,
                  background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)',
                  color: '#ffffff',
                  boxShadow: '0 4px 12px rgba(30, 58, 138, 0.25)'
                }}
              >
                {(guest.firstName?.[0] || 'G')}{(guest.lastName?.[0] || 'U')}
              </div>

              <div>
                <h2 style={{ fontSize: '1.625rem', margin: 0, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {guest.firstName} {guest.lastName}
                </h2>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginTop: '0.375rem' }}>
                  <StatusBadge status={guest.guestType || 'Regular'} />
                  {isRegistered ? (
                    <span className={`badge ${isActive ? 'badge-success' : 'badge-danger'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      {isActive ? <FaUserCheck /> : <FaUserTimes />}
                      {isActive ? 'Portal Account Active' : 'Portal Account Deactivated'}
                    </span>
                  ) : (
                    <span className="badge badge-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <FaUser /> Walk-in Profile
                    </span>
                  )}
                  {guest.blacklisted && (
                    <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <FaShieldAlt /> Blacklisted
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Metrics */}
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center', minWidth: '90px' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#2563eb' }}>
                  {reservations.length || guest.totalStays || 0}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Room Stays
                </div>
              </div>

              <div style={{ textAlign: 'center', minWidth: '110px' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10b981' }}>
                  LKR {(guest.totalSpent || 0).toLocaleString()}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Total Spent
                </div>
              </div>

              <div style={{ textAlign: 'center', minWidth: '90px' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f59e0b' }}>
                  {guest.loyaltyPoints || 0}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Loyalty Pts
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{ 
          display: 'flex', 
          gap: '0.5rem', 
          borderBottom: '2px solid var(--border-color, #e2e8f0)', 
          marginBottom: '1.5rem',
          overflowX: 'auto',
          paddingBottom: '2px'
        }}>
          <button
            onClick={() => setActiveTab('overview')}
            className={`btn btn-ghost btn-sm ${activeTab === 'overview' ? 'active' : ''}`}
            style={{ 
              borderBottom: activeTab === 'overview' ? '2px solid var(--primary-color, #1e3a8a)' : 'none',
              borderRadius: 0,
              fontWeight: activeTab === 'overview' ? 600 : 500,
              padding: '0.625rem 1rem'
            }}
          >
            <FaInfoCircle style={{ marginRight: '6px' }} /> Overview
          </button>

          <button
            onClick={() => setActiveTab('reservations')}
            className={`btn btn-ghost btn-sm ${activeTab === 'reservations' ? 'active' : ''}`}
            style={{ 
              borderBottom: activeTab === 'reservations' ? '2px solid var(--primary-color, #1e3a8a)' : 'none',
              borderRadius: 0,
              fontWeight: activeTab === 'reservations' ? 600 : 500,
              padding: '0.625rem 1rem'
            }}
          >
            <FaBed style={{ marginRight: '6px' }} /> Room Stays ({reservations.length})
          </button>

          <button
            onClick={() => setActiveTab('dining')}
            className={`btn btn-ghost btn-sm ${activeTab === 'dining' ? 'active' : ''}`}
            style={{ 
              borderBottom: activeTab === 'dining' ? '2px solid var(--primary-color, #1e3a8a)' : 'none',
              borderRadius: 0,
              fontWeight: activeTab === 'dining' ? 600 : 500,
              padding: '0.625rem 1rem'
            }}
          >
            <FaUtensils style={{ marginRight: '6px' }} /> Dining & Events ({diningReservations.length + eventBookings.length})
          </button>

          <button
            onClick={() => setActiveTab('invoices')}
            className={`btn btn-ghost btn-sm ${activeTab === 'invoices' ? 'active' : ''}`}
            style={{ 
              borderBottom: activeTab === 'invoices' ? '2px solid var(--primary-color, #1e3a8a)' : 'none',
              borderRadius: 0,
              fontWeight: activeTab === 'invoices' ? 600 : 500,
              padding: '0.625rem 1rem'
            }}
          >
            <FaFileInvoiceDollar style={{ marginRight: '6px' }} /> Invoices & Folios ({invoices.length})
          </button>

          <button
            onClick={() => setActiveTab('profile')}
            className={`btn btn-ghost btn-sm ${activeTab === 'profile' ? 'active' : ''}`}
            style={{ 
              borderBottom: activeTab === 'profile' ? '2px solid var(--primary-color, #1e3a8a)' : 'none',
              borderRadius: 0,
              fontWeight: activeTab === 'profile' ? 600 : 500,
              padding: '0.625rem 1rem'
            }}
          >
            <FaIdCard style={{ marginRight: '6px' }} /> Full Profile & ID
          </button>
        </div>

        {/* Tab 1: Overview */}
        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
            {/* Account & Profile Summary */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  <FaUser style={{ marginRight: '0.5rem', color: '#3b82f6' }} />
                  Account & Identity
                </h3>
              </div>
              <div className="form-grid">
                <div>
                  <label className="form-label">Full Name</label>
                  <div style={{ fontWeight: 600 }}>{guest.firstName} {guest.lastName}</div>
                </div>
                <div>
                  <label className="form-label">Account Type</label>
                  <div>{isRegistered ? 'Verified Online Customer' : 'Walk-in Guest'}</div>
                </div>
                <div>
                  <label className="form-label">Email Address</label>
                  <div>{guest.email || 'Not provided'}</div>
                </div>
                <div>
                  <label className="form-label">Primary Phone</label>
                  <div>{guest.phone || 'Not provided'}</div>
                </div>
                <div>
                  <label className="form-label">Member Since</label>
                  <div>{guest.createdAt ? format(new Date(guest.createdAt), 'MMMM dd, yyyy') : 'Unknown'}</div>
                </div>
                <div>
                  <label className="form-label">Last Activity / Login</label>
                  <div>
                    {guest.user?.lastLogin ? format(new Date(guest.user.lastLogin), 'MMM dd, yyyy • hh:mm a') : 'No recorded login'}
                  </div>
                </div>
              </div>
            </div>

            {/* Stay Summary */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  <FaCalendarAlt style={{ marginRight: '0.5rem', color: '#10b981' }} />
                  Stay & Activity Summary
                </h3>
              </div>
              <div className="form-grid">
                <div>
                  <label className="form-label">Total Reservations</label>
                  <div style={{ fontWeight: 600, fontSize: '1.125rem' }}>{reservations.length}</div>
                </div>
                <div>
                  <label className="form-label">Latest Stay Check-in</label>
                  <div>
                    {reservations[0]?.checkInDate 
                      ? format(new Date(reservations[0].checkInDate), 'MMMM dd, yyyy') 
                      : 'No stays recorded'}
                  </div>
                </div>
                <div>
                  <label className="form-label">Restaurant Reservations</label>
                  <div>{diningReservations.length} reservation(s)</div>
                </div>
                <div>
                  <label className="form-label">Event Bookings</label>
                  <div>{eventBookings.length} booking(s)</div>
                </div>
                <div>
                  <label className="form-label">Total Invoiced Amount</label>
                  <div style={{ fontWeight: 600 }}>
                    LKR {invoices.reduce((acc, inv) => acc + (inv.subtotal || 0), 0).toLocaleString()}
                  </div>
                </div>
                <div>
                  <label className="form-label">Nationality</label>
                  <div>{guest.nationality || 'Resident'}</div>
                </div>
              </div>
            </div>

            {/* Notes & Special Requests */}
            <div className="card" style={{ gridColumn: '1 / -1' }}>
              <div className="card-header">
                <h3 className="card-title">
                  <FaInfoCircle style={{ marginRight: '0.5rem', color: '#8b5cf6' }} />
                  Guest Notes & Preferences
                </h3>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                <div>
                  <label className="form-label">Room Preference</label>
                  <div>{guest.preferences?.roomType || 'Standard'} • Floor: {guest.preferences?.floor || 'Any'} • Bed: {guest.preferences?.bedType || 'Standard'}</div>
                </div>
                <div>
                  <label className="form-label">Smoking Preference</label>
                  <div>{guest.preferences?.smoking ? 'Smoking Allowed' : 'Non-Smoking Room'}</div>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">Internal Concierge Notes</label>
                  <div style={{ 
                    padding: '0.75rem', 
                    background: 'var(--bg-secondary, #f8fafc)', 
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    color: guest.notes ? 'var(--text-primary)' : 'var(--text-muted)'
                  }}>
                    {guest.notes || 'No notes on file for this guest.'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Room Reservations */}
        {activeTab === 'reservations' && (
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="card-title">
                <FaBed style={{ marginRight: '0.5rem', color: '#2563eb' }} />
                Hotel Stays & Reservations
              </h3>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                {reservations.length} record(s) on file
              </span>
            </div>

            {reservations.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <FaBed style={{ fontSize: '2.5rem', opacity: 0.3, marginBottom: '0.75rem' }} />
                <p>No room reservations recorded for this guest profile yet.</p>
              </div>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Ref Number</th>
                      <th>Room</th>
                      <th>Check-In</th>
                      <th>Check-Out</th>
                      <th>Guests</th>
                      <th>Source</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservations.map((res) => (
                      <tr key={res._id}>
                        <td>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                            {res.reservationNumber || res._id.slice(-6).toUpperCase()}
                          </span>
                        </td>
                        <td>
                          {res.room ? (
                            <div>
                              <strong>Room {res.room.roomNumber}</strong>
                              <div className="table-cell-sub">{res.room.roomType}</div>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>Unassigned</span>
                          )}
                        </td>
                        <td>{res.checkInDate ? format(new Date(res.checkInDate), 'MMM dd, yyyy') : '-'}</td>
                        <td>{res.checkOutDate ? format(new Date(res.checkOutDate), 'MMM dd, yyyy') : '-'}</td>
                        <td>{res.numberOfAdults || 1} Adult(s)</td>
                        <td>{res.bookingSource || 'Hotel Website'}</td>
                        <td>
                          <StatusBadge status={res.status || 'Confirmed'} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Dining & Events */}
        {activeTab === 'dining' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Restaurant Reservations */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  <FaUtensils style={{ marginRight: '0.5rem', color: '#f97316' }} />
                  Restaurant Table Reservations
                </h3>
              </div>

              {diningReservations.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <FaUtensils style={{ fontSize: '2rem', opacity: 0.3, marginBottom: '0.5rem' }} />
                  <p>No dining reservations found.</p>
                </div>
              ) : (
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Confirmation #</th>
                        <th>Restaurant</th>
                        <th>Table</th>
                        <th>Date & Time</th>
                        <th>Party</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diningReservations.map((dining) => (
                        <tr key={dining._id}>
                          <td>
                            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                              {dining.confirmationNumber}
                            </span>
                          </td>
                          <td>
                            <strong>{dining.restaurant?.name || 'Sanctuary Dining'}</strong>
                            <div className="table-cell-sub">{dining.guestType || 'Guest'}</div>
                          </td>
                          <td>{dining.table?.tableNumber ? `Table ${dining.table.tableNumber}` : 'Standard Seating'}</td>
                          <td>
                            {dining.date ? format(new Date(dining.date), 'MMM dd, yyyy') : '-'} • {dining.timeSlot || 'Evening'}
                          </td>
                          <td>{dining.partySize || 2} Person(s)</td>
                          <td>
                            <StatusBadge status={dining.status || 'Confirmed'} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Event Bookings */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  <FaGlassCheers style={{ marginRight: '0.5rem', color: '#8b5cf6' }} />
                  Event & Banquet Bookings
                </h3>
              </div>

              {eventBookings.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <FaGlassCheers style={{ fontSize: '2rem', opacity: 0.3, marginBottom: '0.5rem' }} />
                  <p>No private events or curated banquet tickets booked.</p>
                </div>
              ) : (
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Booking #</th>
                        <th>Event / Venue</th>
                        <th>Date</th>
                        <th>Attendees</th>
                        <th>Total Amount</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eventBookings.map((eventB) => (
                        <tr key={eventB._id}>
                          <td>
                            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                              {eventB.confirmationNumber}
                            </span>
                          </td>
                          <td>
                            <strong>{eventB.event?.title || eventB.venue?.name || 'Private Event'}</strong>
                            <div className="table-cell-sub">{eventB.venueName || 'Serendib Ballroom'}</div>
                          </td>
                          <td>
                            {eventB.bookingDate ? format(new Date(eventB.bookingDate), 'MMM dd, yyyy') : '-'}
                          </td>
                          <td>{eventB.attendees || 1} Guests</td>
                          <td>LKR {(eventB.totalAmount || 0).toLocaleString()}</td>
                          <td>
                            <StatusBadge status={eventB.status || 'Confirmed'} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Invoices & Folios */}
        {activeTab === 'invoices' && (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <FaFileInvoiceDollar style={{ marginRight: '0.5rem', color: '#10b981' }} />
                Guest Folios & Invoices
              </h3>
            </div>

            {invoices.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <FaFileInvoiceDollar style={{ fontSize: '2.5rem', opacity: 0.3, marginBottom: '0.75rem' }} />
                <p>No billing folios or invoices recorded for this guest profile.</p>
              </div>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Issue Date</th>
                      <th>Stay Period</th>
                      <th>Room Charges</th>
                      <th>Extra Charges</th>
                      <th>Total Amount</th>
                      <th>Payment Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv._id}>
                        <td>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                            {inv.invoiceNumber}
                          </span>
                        </td>
                        <td>{inv.invoiceDate ? format(new Date(inv.invoiceDate), 'MMM dd, yyyy') : '-'}</td>
                        <td>
                          {inv.checkInDate && inv.checkOutDate
                            ? `${format(new Date(inv.checkInDate), 'MMM dd')} - ${format(new Date(inv.checkOutDate), 'MMM dd, yyyy')}`
                            : '-'}
                        </td>
                        <td>LKR {(inv.roomCharges || 0).toLocaleString()}</td>
                        <td>LKR {(inv.totalExtraExpenses || 0).toLocaleString()}</td>
                        <td>
                          <strong>LKR {(inv.subtotal || 0).toLocaleString()}</strong>
                        </td>
                        <td>
                          <span className={`badge ${inv.status === 'Paid' ? 'badge-success' : 'badge-warning'}`}>
                            {inv.status || 'Paid'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 5: Full Profile & Identification */}
        {activeTab === 'profile' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
            {/* Personal Info */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  <FaUser style={{ marginRight: '0.5rem', color: '#2563eb' }} />
                  Personal Details
                </h3>
              </div>
              <div className="form-grid">
                <div>
                  <label className="form-label">First Name</label>
                  <div style={{ fontWeight: 600 }}>{guest.firstName}</div>
                </div>
                <div>
                  <label className="form-label">Last Name</label>
                  <div style={{ fontWeight: 600 }}>{guest.lastName}</div>
                </div>
                <div>
                  <label className="form-label">Email</label>
                  <div>{guest.email || 'Not provided'}</div>
                </div>
                <div>
                  <label className="form-label">Primary Contact</label>
                  <div>{guest.phone}</div>
                </div>
                <div>
                  <label className="form-label">Alternate Phone</label>
                  <div>{guest.alternatePhone || 'Not provided'}</div>
                </div>
                <div>
                  <label className="form-label">Date of Birth</label>
                  <div>{guest.dateOfBirth ? format(new Date(guest.dateOfBirth), 'MMM dd, yyyy') : 'Not provided'}</div>
                </div>
                <div>
                  <label className="form-label">Gender</label>
                  <div>{guest.gender || 'Not specified'}</div>
                </div>
                <div>
                  <label className="form-label">Nationality</label>
                  <div>{guest.nationality || 'Resident'}</div>
                </div>
                <div>
                  <label className="form-label">Company / Affiliation</label>
                  <div>{guest.company || 'Not provided'}</div>
                </div>
              </div>
            </div>

            {/* National ID & Compliance */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  <FaIdCard style={{ marginRight: '0.5rem', color: '#8b5cf6' }} />
                  Identification Document
                </h3>
              </div>
              <div className="form-grid">
                <div>
                  <label className="form-label">Identification Document Type</label>
                  <div style={{ fontWeight: 600 }}>{guest.nationalIdType || 'National ID'}</div>
                </div>
                <div>
                  <label className="form-label">Document Identification Number</label>
                  <div style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '1rem', color: '#1e3a8a' }}>
                    {guest.nationalIdNumber || 'Not provided'}
                  </div>
                </div>
                <div>
                  <label className="form-label">Security & Compliance</label>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    Identity verified for hotel guest registration regulations.
                  </div>
                </div>
              </div>
            </div>

            {/* Address */}
            <div className="card" style={{ gridColumn: '1 / -1' }}>
              <div className="card-header">
                <h3 className="card-title">
                  <FaMapMarkerAlt style={{ marginRight: '0.5rem', color: '#ef4444' }} />
                  Residential Address
                </h3>
              </div>
              <div className="form-grid">
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">Street Address</label>
                  <div>{guest.address?.street || 'Not provided'}</div>
                </div>
                <div>
                  <label className="form-label">City</label>
                  <div>{guest.address?.city || 'Not provided'}</div>
                </div>
                <div>
                  <label className="form-label">State / Province</label>
                  <div>{guest.address?.state || 'Not provided'}</div>
                </div>
                <div>
                  <label className="form-label">Postal / Zip Code</label>
                  <div>{guest.address?.zipCode || 'Not provided'}</div>
                </div>
                <div>
                  <label className="form-label">Country</label>
                  <div>{guest.address?.country || 'Sri Lanka'}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GuestDetails;