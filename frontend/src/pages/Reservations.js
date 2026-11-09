// frontend/src/pages/Reservations.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaPlus, FaEye, FaCheck, FaTimes, FaSearch, FaCalendarAlt } from 'react-icons/fa';
import { reservationAPI } from '../services/api';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import EmptyState from '../components/ui/EmptyState';
import { TableSkeleton } from '../components/ui/LoadingSkeleton';

const Reservations = () => {
  const navigate = useNavigate();
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [checkInFrom, setCheckInFrom] = useState('');
  const [checkInTo, setCheckInTo] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    fetchReservations();
  }, [statusFilter]);

  const fetchReservations = async () => {
    try {
      let response;
      if (statusFilter === 'all') {
        response = await reservationAPI.getReservations();
      } else {
        response = await reservationAPI.getReservationsByStatus(statusFilter);
      }
      setReservations(response.data);
    } catch (error) {
      toast.error('Failed to load reservations');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckIn = async (id) => {
    if (!window.confirm('Check in this guest?')) return;
    try {
      await reservationAPI.checkIn(id, { actualCheckInDate: new Date() });
      toast.success('Guest checked in successfully');
      fetchReservations();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Check-in failed');
    }
  };

  const handleCheckOut = async (id) => {
    if (!window.confirm('Check out this guest?')) return;
    try {
      const response = await reservationAPI.checkOut(id, { actualCheckOutDate: new Date() });
      
      if (response.data.invoice) {
        toast.success('Invoice generated. Please process payment.');
        navigate(`/invoices/${response.data.invoice._id}`);
      } else {
        toast.success('Guest checked out successfully');
        fetchReservations();
      }
    } catch (error) {
      if (error.response?.data?.invoiceId) {
        toast.warning(error.response.data.error);
        navigate(`/invoices/${error.response.data.invoiceId}`);
      } else {
        toast.error(error.response?.data?.error || 'Check-out failed');
      }
    }
  };

  const filteredReservations = reservations.filter(r => {
    const checkIn = r.checkInDate ? new Date(r.checkInDate).toISOString().slice(0, 10) : '';
    if (checkInFrom && checkIn < checkInFrom) return false;
    if (checkInTo && checkIn > checkInTo) return false;
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      r.reservationNumber?.toLowerCase().includes(term) ||
      r.guest?.firstName?.toLowerCase().includes(term) ||
      r.guest?.lastName?.toLowerCase().includes(term) ||
      r.guest?.phone?.includes(term) ||
      r.room?.roomNumber?.includes(term)
    );
  });
  const pageCount = Math.max(1, Math.ceil(filteredReservations.length / pageSize));
  const paginatedReservations = filteredReservations.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { setPage(1); }, [searchTerm, statusFilter, checkInFrom, checkInTo]);

  return (
    <div>
      <div className="content-wrapper">
        <PageHeader 
          title="Reservations" 
          subtitle="Manage bookings, arrivals, departures and guest stays."
        >
          <button onClick={() => navigate('/reservations/new')} className="btn btn-primary">
            <FaPlus /> New Reservation
          </button>
        </PageHeader>

        {/* Filters */}
        <div className="filters">
          <div className="filter-row">
            <div className="search-box">
              <FaSearch />
              <input
                type="text"
                placeholder="Search reservation, guest or room..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <select
              className="form-control"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ maxWidth: '180px' }}
            >
              <option value="all">All Status</option>
              <option value="Confirmed">Confirmed</option>
              <option value="Checked-In">Checked-In</option>
              <option value="Checked-Out">Checked-Out</option>
              <option value="Cancelled">Cancelled</option>
              <option value="No-Show">No-Show</option>
            </select>
            <label className="form-label">Check-in from <input type="date" value={checkInFrom} onChange={(event) => setCheckInFrom(event.target.value)} /></label>
            <label className="form-label">Check-in to <input type="date" value={checkInTo} onChange={(event) => setCheckInTo(event.target.value)} /></label>
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={6} cols={8} />
        ) : filteredReservations.length === 0 ? (
          <EmptyState 
            icon={FaCalendarAlt}
            title="No reservations found"
            message={searchTerm ? "Try adjusting your search or filters." : "Create a new reservation to get started."}
            action={
              !searchTerm && (
                <button onClick={() => navigate('/reservations/new')} className="btn btn-primary">
                  <FaPlus /> New Reservation
                </button>
              )
            }
          />
        ) : (
          <div className="card" style={{ marginBottom: 0 }}>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Reservation #</th>
                    <th>Guest</th>
                    <th>Room</th>
                    <th>Check-In</th>
                    <th>Check-Out</th>
                    <th>Guests</th>
                    <th>Source</th>
                    <th>Status</th>
                    <th>Payment</th>
                    <th>Total</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedReservations.map((reservation) => (
                    <tr key={reservation._id}>
                      <td><strong>{reservation.reservationNumber}</strong></td>
                      <td>
                        <div style={{ fontWeight: 500 }}>
                          {reservation.guest?.firstName} {reservation.guest?.lastName}
                        </div>
                        <div className="table-cell-sub">
                          {reservation.guest?.phone}
                        </div>
                      </td>
                      <td>
                        {reservation.room ? (
                          <>
                            <div style={{ fontWeight: 500 }}>{reservation.room.roomType}</div>
                            <div className="table-cell-sub">
                              Room {reservation.room.roomNumber}
                            </div>
                          </>
                        ) : (
                          <span className="badge badge-warning">Not Assigned</span>
                        )}
                      </td>
                      <td>{format(new Date(reservation.checkInDate), 'MMM dd, yyyy')}</td>
                      <td>{format(new Date(reservation.checkOutDate), 'MMM dd, yyyy')}</td>
                      <td>{reservation.numberOfGuests ?? ((reservation.numberOfAdults || 0) + (reservation.numberOfChildren || 0))}</td>
                      <td><StatusBadge status={reservation.bookingSource} /></td>
                      <td><StatusBadge status={reservation.status} /></td>
                      <td><StatusBadge status={reservation.paymentStatus || 'Unavailable'} /></td>
                      <td><strong>₹{reservation.totalAmount?.toLocaleString()}</strong></td>
                      <td>
                        <div className="table-actions">
                          <button
                            onClick={() => navigate(`/reservations/${reservation._id}`)}
                            className="btn btn-icon btn-ghost btn-sm"
                            title="View Details"
                            aria-label="View reservation details"
                          >
                            <FaEye />
                          </button>
                          {reservation.status === 'Confirmed' && (
                            <button
                              onClick={() => handleCheckIn(reservation._id)}
                              className="btn btn-icon btn-sm btn-success"
                              title="Check In"
                              aria-label="Check in guest"
                            >
                              <FaCheck />
                            </button>
                          )}
                          {reservation.status === 'Checked-In' && (
                            <button
                              onClick={() => handleCheckOut(reservation._id)}
                              className="btn btn-icon btn-sm btn-warning"
                              title="Check Out"
                              aria-label="Check out guest"
                            >
                              <FaTimes />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {!loading && filteredReservations.length > pageSize && <div className="pagination-controls"><button type="button" className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button><span>Page {page} of {pageCount} · {filteredReservations.length} reservations</span><button type="button" className="btn btn-secondary" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}>Next</button></div>}
      </div>
    </div>
  );
};

export default Reservations;
