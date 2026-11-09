// frontend/src/pages/ReservationDetails.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaEdit, FaMoneyBillWave, FaReceipt } from 'react-icons/fa';
import { reservationAPI, guestExpenseAPI, invoiceAPI } from '../services/api';
import { toast } from 'react-toastify';
import { format } from 'date-fns';

const ReservationDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [reservation, setReservation] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedExpenseId, setSelectedExpenseId] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState(0);

  useEffect(() => {
    fetchReservation();
    fetchExpenses();
  }, [id]);

  const fetchReservation = async () => {
    try {
      const response = await reservationAPI.getReservation(id);
      setReservation(response.data);
    } catch (error) {
      toast.error('Failed to load reservation');
      navigate('/reservations');
    } finally {
      setLoading(false);
    }
  };

  const fetchExpenses = async () => {
    try {
      const response = await guestExpenseAPI.getExpensesByReservation(id);
      // API returns { expenses, total }
      setExpenses(response.data.expenses || []);
    } catch (error) {
      console.error('Failed to load expenses');
      setExpenses([]);
    }
  };

  const handleMarkAsPaid = async (expenseId) => {
    try {
      await guestExpenseAPI.updateExpense(expenseId, { paymentStatus: 'Paid' });
      toast.success('Expense marked as paid');
      fetchExpenses();
    } catch (error) {
      toast.error('Failed to update expense');
    }
  };

  const handleAddToBill = async (expenseId) => {
    try {
      await guestExpenseAPI.updateExpense(expenseId, { paymentStatus: 'Added to Bill' });
      toast.success('Expense added to bill');
      fetchExpenses();
    } catch (error) {
      toast.error('Failed to update expense');
    }
  };

  const handleCheckIn = async () => {
    try {
      await reservationAPI.checkIn(id);
      toast.success('Guest checked in successfully');
      fetchReservation();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to check in');
    }
  };

  const handleCheckOut = async () => {
    try {
      await reservationAPI.checkOut(id);
      toast.success('Guest checked out successfully');
      fetchReservation();
      // Redirect to invoice if one was created
      const invoiceRes = await invoiceAPI.getInvoicesByReservation(id);
      if (invoiceRes.data && invoiceRes.data.length > 0) {
        navigate(`/invoices/${invoiceRes.data[0]._id}`);
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to check out');
    }
  };

  const handleCancel = async () => {
    if (!window.confirm('Are you sure you want to cancel this reservation?')) return;
    
    try {
      await reservationAPI.cancelReservation(id);
      toast.success('Reservation cancelled');
      navigate('/reservations');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to cancel');
    }
  };

  const getStatusBadge = (status) => {
    const classes = {
      'Confirmed': 'badge-info',
      'Checked-In': 'badge-success',
      'Checked-Out': 'badge-secondary',
      'Cancelled': 'badge-danger'
    };
    return <span className={`badge ${classes[status]}`}>{status}</span>;
  };

  const getPaymentStatusBadge = (status) => {
    const classes = {
      'Pending': 'badge-warning',
      'Partial': 'badge-info',
      'Paid': 'badge-success'
    };
    return <span className={`badge ${classes[status]}`}>{status}</span>;
  };

  const getTotalExpenses = () => {
    if (!Array.isArray(expenses)) return 0;
    return expenses.reduce((sum, exp) => sum + exp.totalAmount, 0);
  };

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  if (!reservation) {
    return <div className="empty-state"><h3>Reservation not found</h3></div>;
  }

  return (
    <div>
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => navigate('/reservations')} className="btn btn-outline">
            <FaArrowLeft /> Back
          </button>
          <h1 className="topbar-title">Reservation Details</h1>
        </div>
        <div className="topbar-actions">
          {reservation.status === 'Confirmed' && (
            <button onClick={handleCheckIn} className="btn btn-success">
              Check In
            </button>
          )}
          {reservation.status === 'Checked-In' && (
            <>
              <button onClick={() => navigate('/expenses/new')} className="btn btn-primary">
                <FaReceipt /> Add Expense
              </button>
              <button onClick={handleCheckOut} className="btn btn-warning">
                Check Out
              </button>
            </>
          )}
          {reservation.status !== 'Checked-Out' && reservation.status !== 'Cancelled' && (
            <>
              <button onClick={() => navigate(`/reservations/${id}/edit`)} className="btn btn-primary">
                <FaEdit /> Edit
              </button>
              <button onClick={handleCancel} className="btn btn-danger">
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      <div className="content-wrapper">
        {/* Reservation Info */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1.5rem' }}>
            <div>
              <h2 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>
                {reservation.reservationNumber}
              </h2>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {getStatusBadge(reservation.status)}
                {getPaymentStatusBadge(reservation.paymentStatus)}
              </div>
            </div>
          </div>

          <div className="form-grid">
            <div>
              <label className="form-label">Guest</label>
              <div style={{ padding: '0.625rem 0', color: '#1e293b', fontWeight: '600' }}>
                {reservation.guest?.firstName} {reservation.guest?.lastName}
              </div>
            </div>
            <div>
              <label className="form-label">Phone</label>
              <div style={{ padding: '0.625rem 0', color: '#1e293b' }}>
                {reservation.guest?.phone}
              </div>
            </div>
            <div>
              <label className="form-label">Email</label>
              <div style={{ padding: '0.625rem 0', color: '#1e293b' }}>
                {reservation.guest?.email || 'Not provided'}
              </div>
            </div>
            <div>
              <label className="form-label">Room</label>
              <div style={{ padding: '0.625rem 0', color: '#1e293b', fontWeight: '600' }}>
                {reservation.room?.roomNumber || 'Not assigned'} - {reservation.roomType}
              </div>
            </div>
            <div>
              <label className="form-label">Check-In Date</label>
              <div style={{ padding: '0.625rem 0', color: '#1e293b' }}>
                {format(new Date(reservation.checkInDate), 'MMM dd, yyyy')}
              </div>
            </div>
            <div>
              <label className="form-label">Check-Out Date</label>
              <div style={{ padding: '0.625rem 0', color: '#1e293b' }}>
                {format(new Date(reservation.checkOutDate), 'MMM dd, yyyy')}
              </div>
            </div>
            <div>
              <label className="form-label">Number of Nights</label>
              <div style={{ padding: '0.625rem 0', color: '#1e293b' }}>
                {reservation.numberOfNights}
              </div>
            </div>
            <div>
              <label className="form-label">Guests</label>
              <div style={{ padding: '0.625rem 0', color: '#1e293b' }}>
                {reservation.numberOfAdults} Adults, {reservation.numberOfChildren} Children
              </div>
            </div>
            <div>
              <label className="form-label">Booking Source</label>
              <div style={{ padding: '0.625rem 0', color: '#1e293b' }}>
                {reservation.bookingSource}
              </div>
            </div>
            {reservation.travelAgent && (
              <div>
                <label className="form-label">Travel Agent</label>
                <div style={{ padding: '0.625rem 0', color: '#1e293b' }}>
                  {reservation.travelAgent.companyName} ({reservation.travelAgent.agentCode})
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Pricing */}
        <div className="card">
          <h3 style={{ marginBottom: '1.5rem' }}>Pricing Details</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Rate per Night:</span>
              <strong>₹{reservation.ratePerNight.toLocaleString()}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Number of Nights:</span>
              <strong>{reservation.numberOfNights}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Room Charges:</span>
              <strong>₹{reservation.roomCharges.toLocaleString()}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Tax:</span>
              <strong>₹{reservation.taxAmount.toLocaleString()}</strong>
            </div>
            {reservation.discountAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#10b981' }}>
                <span>Discount {reservation.discountReason && `(${reservation.discountReason})`}:</span>
                <strong>- ₹{reservation.discountAmount.toLocaleString()}</strong>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.75rem', borderTop: '2px solid #e2e8f0', fontSize: '1.125rem' }}>
              <span><strong>Total Amount:</strong></span>
              <strong style={{ color: '#2563eb' }}>₹{reservation.totalAmount.toLocaleString()}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Advance Paid:</span>
              <strong style={{ color: '#10b981' }}>₹{reservation.advancePayment.toLocaleString()}</strong>
            </div>
          </div>
        </div>

        {/* Expenses */}
        {reservation.status === 'Checked-In' && (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3>Additional Expenses</h3>
              <button onClick={() => navigate('/expenses/new')} className="btn btn-sm btn-primary">
                <FaReceipt /> Add Expense
              </button>
            </div>
            
            {!Array.isArray(expenses) || expenses.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                No expenses added yet
              </div>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Category</th>
                      <th>Description</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((expense) => (
                      <tr key={expense._id}>
                        <td>{format(new Date(expense.expenseDate), 'MMM dd, yyyy')}</td>
                        <td>{expense.category}</td>
                        <td>{expense.description}</td>
                        <td><strong>₹{expense.totalAmount.toLocaleString()}</strong></td>
                        <td>
                          {expense.paymentStatus === 'Paid' && <span className="badge badge-success">Paid</span>}
                          {expense.paymentStatus === 'Pending' && <span className="badge badge-warning">Pending</span>}
                          {expense.paymentStatus === 'Added to Bill' && <span className="badge badge-info">Added to Bill</span>}
                        </td>
                        <td>
                          {expense.paymentStatus === 'Pending' && (
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button
                                onClick={() => handleMarkAsPaid(expense._id)}
                                className="btn btn-sm btn-success"
                                title="Mark as Paid"
                              >
                                <FaMoneyBillWave /> Paid
                              </button>
                              <button
                                onClick={() => handleAddToBill(expense._id)}
                                className="btn btn-sm btn-info"
                                title="Add to Bill"
                              >
                                Add to Bill
                              </button>
                            </div>
                          )}
                          {expense.paymentStatus !== 'Pending' && (
                            <span style={{ color: '#64748b', fontSize: '0.875rem' }}>
                              {expense.paymentStatus}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ fontWeight: 'bold', background: '#f8fafc' }}>
                      <td colSpan="3" style={{ textAlign: 'right' }}>Total Expenses:</td>
                      <td>₹{getTotalExpenses().toLocaleString()}</td>
                      <td colSpan="2"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Special Requests */}
        {reservation.specialRequests && (
          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>Special Requests</h3>
            <div style={{ padding: '0.625rem 0', color: '#1e293b', whiteSpace: 'pre-wrap' }}>
              {reservation.specialRequests}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReservationDetails;
