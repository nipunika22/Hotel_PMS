// frontend/src/pages/ReservationDetails.js
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  FaArrowLeft, 
  FaEdit, 
  FaMoneyBillWave, 
  FaReceipt, 
  FaCreditCard, 
  FaTimes, 
  FaCheckCircle, 
  FaClock, 
  FaUserShield,
  FaFileInvoiceDollar
} from 'react-icons/fa';
import { reservationAPI, guestExpenseAPI, invoiceAPI, paymentAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import '../components/PaymentModal.css';

const ReservationDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [reservation, setReservation] = useState(null);
  const [invoice, setInvoice] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  // Payment Recording Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    paymentMethod: 'Cash',
    paymentDate: new Date().toISOString().slice(0, 16),
    transactionReference: '',
    notes: ''
  });
  const paymentKeyRef = useRef(null);

  const staffRoles = ['admin', 'staff', 'finance', 'manager', 'super_admin'];
  const isAuthorizedStaff = user && staffRoles.includes((user.role || '').toLowerCase());

  useEffect(() => {
    fetchReservation();
    fetchInvoice();
    fetchExpenses();
    fetchPayments();
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

  const fetchInvoice = async () => {
    try {
      const response = await invoiceAPI.getInvoicesByReservation(id);
      setInvoice(Array.isArray(response.data) ? response.data[0] || null : null);
    } catch (error) {
      console.warn('Failed to load reservation invoice:', error);
      setInvoice(null);
    }
  };

  const fetchExpenses = async () => {
    try {
      const response = await guestExpenseAPI.getExpensesByReservation(id);
      setExpenses(response.data.expenses || []);
    } catch (error) {
      console.error('Failed to load expenses');
      setExpenses([]);
    }
  };

  const fetchPayments = async () => {
    try {
      setPaymentsLoading(true);
      const response = await reservationAPI.getPayments(id);
      setPayments(response.data || []);
    } catch (error) {
      console.warn('Failed to load reservation payment ledger:', error);
      setPayments([]);
    } finally {
      setPaymentsLoading(false);
    }
  };

  // Financial calculations
  const totalAmount = Number(invoice?.totalAmount ?? reservation?.totalAmount ?? 0);
  const validPayments = Array.isArray(payments)
    ? payments.filter((p) => p.paymentStatus === 'completed' || p.paymentStatus === 'partially_refunded')
    : [];
  const ledgerPaid = validPayments.reduce((sum, p) => sum + ((p.amount || 0) - (p.refundAmount || 0)), 0);
  const totalPaid = invoice
    ? Number(invoice.totalPaid ?? invoice.advancePaid ?? 0)
    : ledgerPaid > 0 ? ledgerPaid : Number(reservation?.advancePayment || 0);
  const outstandingBalance = Math.max(0, totalAmount - totalPaid);
  const isFullyPaid = outstandingBalance <= 0;
  const invoiceHistoryOnly = (invoice?.payments || [])
    .filter((invoicePayment) => !validPayments.some((payment) => {
      const paymentReferences = [payment.paymentReference, payment.transactionId].filter(Boolean).map(String);
      if (invoicePayment.transactionId && paymentReferences.includes(String(invoicePayment.transactionId))) return true;
      return Number(payment.amount) === Number(invoicePayment.amount) &&
        payment.paymentDate &&
        invoicePayment.paymentDate &&
        Math.abs(new Date(payment.paymentDate).getTime() - new Date(invoicePayment.paymentDate).getTime()) < 60000;
    }))
    .map((payment, index) => ({
      ...payment,
      _id: payment._id || `invoice-history-${index}`,
      paymentReference: payment.transactionId || 'INVOICE-HISTORY',
      paymentStatus: 'completed',
      auditLog: []
    }));
  const paymentHistory = [...validPayments, ...invoiceHistoryOnly]
    .sort((left, right) => new Date(right.paymentDate || right.createdAt || 0) - new Date(left.paymentDate || left.createdAt || 0));

  const handleOpenPaymentModal = () => {
    setPaymentForm({
      amount: outstandingBalance > 0 ? outstandingBalance : '',
      paymentMethod: reservation?.paymentMethod && reservation.paymentMethod !== 'Unspecified' ? reservation.paymentMethod : 'Cash',
      paymentDate: new Date().toISOString().slice(0, 16),
      transactionReference: '',
      notes: ''
    });
    paymentKeyRef.current = `RES-PAY-${id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setShowPaymentModal(true);
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    const enteredAmount = Number(paymentForm.amount);

    if (!enteredAmount || enteredAmount <= 0) {
      toast.error('Payment amount must be greater than zero');
      return;
    }

    if (enteredAmount > outstandingBalance) {
      toast.error(`Payment amount cannot exceed outstanding balance of LKR ${outstandingBalance.toLocaleString()}`);
      return;
    }

    try {
      setSubmittingPayment(true);
      await paymentAPI.recordPayment({
        reservationId: id,
        ...(invoice ? { invoiceId: invoice._id } : {}),
        amount: enteredAmount,
        paymentMethod: paymentForm.paymentMethod,
        paymentDate: paymentForm.paymentDate ? new Date(paymentForm.paymentDate) : new Date(),
        transactionReference: paymentForm.transactionReference.trim() || undefined,
        notes: paymentForm.notes.trim() || undefined,
        idempotencyKey: paymentKeyRef.current
      });

      toast.success(`Payment of LKR ${enteredAmount.toLocaleString()} recorded successfully!`);
      setShowPaymentModal(false);
      paymentKeyRef.current = null;
      setPaymentForm({
        amount: '',
        paymentMethod: 'Cash',
        paymentDate: new Date().toISOString().slice(0, 16),
        transactionReference: '',
        notes: ''
      });

      // Refresh reservation and payment history concurrently
      await Promise.all([fetchReservation(), fetchInvoice(), fetchPayments()]);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to record payment');
    } finally {
      setSubmittingPayment(false);
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
      const invoiceRes = await invoiceAPI.getInvoicesByReservation(id);
      if (invoiceRes.data && invoiceRes.data.length > 0) {
        navigate(`/invoices/${invoiceRes.data[0]._id}`);
      }
    } catch (error) {
      const { error: message, invoiceId } = error.response?.data || {};
      if (invoiceId) {
        toast.warning(message);
        navigate(`/invoices/${invoiceId}`);
      } else {
        toast.error(message || 'Failed to check out');
      }
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
      'Cancelled': 'badge-danger',
      'No-Show': 'badge-dark'
    };
    return <span className={`badge ${classes[status] || 'badge-secondary'}`}>{status}</span>;
  };

  const getPaymentStatusBadge = (status) => {
    const classes = {
      'Pending': 'badge-warning',
      'Partial': 'badge-info',
      'Paid': 'badge-success',
      'Refunded': 'badge-danger'
    };
    return <span className={`badge ${classes[status] || 'badge-warning'}`}>{status}</span>;
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
      {/* Topbar */}
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => navigate('/reservations')} className="btn btn-outline">
            <FaArrowLeft /> Back
          </button>
          <h1 className="topbar-title">Reservation Details</h1>
        </div>
        <div className="topbar-actions">
          {/* Quick Record Payment in Topbar for staff */}
          {isAuthorizedStaff && reservation.status !== 'Cancelled' && !isFullyPaid && invoice?.paymentStatus !== 'Refunded' && (
            <button onClick={handleOpenPaymentModal} className="btn btn-success" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FaMoneyBillWave /> Record Balance Payment
            </button>
          )}

          {reservation.status === 'Confirmed' && (
            <button onClick={handleCheckIn} className="btn btn-primary">
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
              <button onClick={() => navigate(`/reservations/${id}/edit`)} className="btn btn-outline">
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
        {/* 1. Primary Reservation Summary */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.75rem', marginBottom: '0.5rem', color: 'var(--c-forest-deep, #162E24)' }}>
                {reservation.reservationNumber}
              </h2>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                {getStatusBadge(reservation.status)}
                {getPaymentStatusBadge(invoice?.paymentStatus || reservation.paymentStatus)}
                <span className="badge badge-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  <FaCreditCard /> {reservation.paymentMethod || 'Unspecified'}
                </span>
                <span className="badge badge-outline">
                  {reservation.bookingSource || 'Direct'}
                </span>
              </div>
            </div>
            {isAuthorizedStaff && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.875rem', color: '#64748b' }}>Outstanding Balance</div>
                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: outstandingBalance > 0 ? '#b45309' : '#10b981' }}>
                  LKR {outstandingBalance.toLocaleString()}
                </div>
              </div>
            )}
          </div>

          <div className="form-grid">
            <div>
              <label className="form-label">Guest Name</label>
              <div style={{ padding: '0.625rem 0', color: '#1e293b', fontWeight: '600' }}>
                {reservation.guest?.firstName} {reservation.guest?.lastName}
              </div>
            </div>
            <div>
              <label className="form-label">Phone</label>
              <div style={{ padding: '0.625rem 0', color: '#1e293b' }}>
                {reservation.guest?.phone || 'Not provided'}
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
                {reservation.room?.roomNumber ? `Room ${reservation.room.roomNumber} (${reservation.roomType})` : reservation.roomType}
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
              <label className="form-label">Nights & Guests</label>
              <div style={{ padding: '0.625rem 0', color: '#1e293b' }}>
                {reservation.numberOfNights} Nights · {reservation.numberOfAdults} Adults, {reservation.numberOfChildren} Children
              </div>
            </div>
            <div>
              <label className="form-label">Selected Payment Method</label>
              <div style={{ padding: '0.625rem 0', color: '#1e293b', fontWeight: '600' }}>
                {reservation.paymentMethod || 'Unspecified'}
              </div>
            </div>
          </div>
        </div>

        {/* 2. Unified Payment Management Section */}
        <div className="card" style={{ borderLeft: '4px solid #162E24' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--c-forest-deep, #162E24)' }}>
                <FaMoneyBillWave /> Payment Management & Folio Settlement
              </h3>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#64748b' }}>
                Authoritative record of all collections, advances, and remaining balances for this stay.
              </p>
            </div>
            {isAuthorizedStaff && reservation.status !== 'Cancelled' && invoice?.paymentStatus !== 'Refunded' && (
              <button
                type="button"
                onClick={handleOpenPaymentModal}
                disabled={isFullyPaid}
                className={`btn ${isFullyPaid ? 'btn-secondary' : 'btn-success'}`}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <FaMoneyBillWave /> {isFullyPaid ? 'Fully Paid' : 'Record Balance Payment'}
              </button>
            )}
          </div>

          {/* Balance Breakdown Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            padding: '1.25rem',
            background: '#f8fafc',
            borderRadius: '0.75rem',
            border: '1px solid #e2e8f0',
            marginBottom: '1.5rem'
          }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Amount</div>
              <div style={{ fontSize: '1.35rem', fontWeight: '700', color: '#1e293b', marginTop: '0.25rem' }}>
                LKR {totalAmount.toLocaleString()}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Room charges, taxes & fees</div>
            </div>

            <div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Paid</div>
              <div style={{ fontSize: '1.35rem', fontWeight: '700', color: '#10b981', marginTop: '0.25rem' }}>
                LKR {totalPaid.toLocaleString()}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Verified completed transactions</div>
            </div>

            <div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Outstanding Balance</div>
              <div style={{
                fontSize: '1.35rem',
                fontWeight: '700',
                color: outstandingBalance > 0 ? '#b45309' : '#10b981',
                marginTop: '0.25rem'
              }}>
                LKR {outstandingBalance.toLocaleString()}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                {outstandingBalance === 0 ? 'Fully settled' : 'Payment required before checkout'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Payment Status</div>
              <div style={{ marginTop: '0.35rem' }}>
                {getPaymentStatusBadge(invoice?.paymentStatus || reservation.paymentStatus)}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.35rem' }}>
                Method: <strong>{reservation.paymentMethod || 'Unspecified'}</strong>
              </div>
            </div>
          </div>

          {/* Payment History Sub-ledger */}
          <h4 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.75rem', color: '#334155' }}>
            Payment Transaction History
          </h4>

          {paymentsLoading ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b' }}>
              <div className="spinner" style={{ width: '24px', height: '24px', margin: '0 auto 0.5rem' }}></div>
              Loading payment history...
            </div>
          ) : paymentHistory.length === 0 ? (
            <div style={{
              padding: '1.5rem',
              textAlign: 'center',
              background: '#ffffff',
              borderRadius: '0.5rem',
              border: '1px dashed #cbd5e1',
              color: '#64748b'
            }}>
              <p style={{ margin: 0, fontWeight: '500' }}>No formal payment transactions recorded yet.</p>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
                {reservation.advancePayment > 0 
                  ? `An initial advance of LKR ${reservation.advancePayment.toLocaleString()} is recorded on the booking.`
                  : 'Click "Record Payment" to log front-desk cash, card, or transfer settlements.'}
              </p>
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Date & Time</th>
                    <th>Method</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Received By</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentHistory.map((p) => {
                    const staffUser = p.auditLog?.find((a) => a.performedBy)?.performedBy;
                    return (
                      <tr key={p._id}>
                        <td>
                          <strong>{p.paymentReference || p.transactionId || 'MANUAL'}</strong>
                        </td>
                        <td>
                          {p.paymentDate ? format(new Date(p.paymentDate), 'MMM dd, yyyy HH:mm') : format(new Date(p.createdAt), 'MMM dd, yyyy')}
                        </td>
                        <td>
                          <span className="badge badge-secondary">{p.paymentMethod || 'Cash'}</span>
                        </td>
                        <td>
                          <strong style={{ color: '#10b981' }}>
                            LKR {Number(p.amount || 0).toLocaleString()}
                          </strong>
                          {p.refundAmount > 0 && (
                            <div style={{ fontSize: '0.75rem', color: '#ef4444' }}>
                              Refunded: -LKR {p.refundAmount.toLocaleString()}
                            </div>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${p.paymentStatus === 'completed' ? 'badge-success' : p.paymentStatus === 'refunded' ? 'badge-danger' : 'badge-warning'}`}>
                            {p.paymentStatus}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontSize: '0.85rem' }}>
                            {staffUser?.name || user?.name || 'Staff Member'}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            {staffUser?.role || 'Staff'}
                          </div>
                        </td>
                        <td style={{ fontSize: '0.85rem', color: '#64748b' }}>
                          {p.notes || p.transactionId || 'Front desk collection'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 3. Pricing Details Card */}
        <div className="card">
          <h3 style={{ marginBottom: '1.5rem' }}>Pricing Details</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Rate per Night:</span>
              <strong>LKR {Number(reservation.ratePerNight || 0).toLocaleString()}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Number of Nights:</span>
              <strong>{reservation.numberOfNights}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Room Charges:</span>
              <strong>LKR {Number(reservation.roomCharges || 0).toLocaleString()}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Tax Amount:</span>
              <strong>LKR {Number(reservation.taxAmount || 0).toLocaleString()}</strong>
            </div>
            {reservation.discountAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#10b981' }}>
                <span>Discount {reservation.discountReason && `(${reservation.discountReason})`}:</span>
                <strong>- LKR {Number(reservation.discountAmount).toLocaleString()}</strong>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.75rem', borderTop: '2px solid #e2e8f0', fontSize: '1.125rem' }}>
              <span><strong>Total Reservation Amount:</strong></span>
              <strong style={{ color: '#2563eb' }}>LKR {totalAmount.toLocaleString()}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Total Paid:</span>
              <strong style={{ color: '#10b981' }}>LKR {totalPaid.toLocaleString()}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: outstandingBalance > 0 ? '#b45309' : '#10b981' }}>
              <span><strong>Outstanding Balance:</strong></span>
              <strong>LKR {outstandingBalance.toLocaleString()}</strong>
            </div>
          </div>
        </div>

        {/* 4. Additional Expenses Card */}
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
                        <td><strong>LKR {Number(expense.totalAmount || 0).toLocaleString()}</strong></td>
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
                      <td>LKR {getTotalExpenses().toLocaleString()}</td>
                      <td colSpan="2"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 5. Special Requests */}
        {reservation.specialRequests && (
          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>Special Requests</h3>
            <div style={{ padding: '0.625rem 0', color: '#1e293b', whiteSpace: 'pre-wrap' }}>
              {reservation.specialRequests}
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* RECORD PAYMENT MODAL                                              */}
      {/* ------------------------------------------------------------------ */}
      {showPaymentModal && (
        <div className="serendib-pay-backdrop" onClick={(e) => {
          if (e.target === e.currentTarget && !submittingPayment) setShowPaymentModal(false);
        }}>
          <div className="serendib-pay-modal" style={{ maxWidth: '540px' }}>
            <div className="serendib-pay-header">
              <div className="serendib-pay-header-left">
                <div className="serendib-pay-badge-icon">
                  <FaMoneyBillWave />
                </div>
                <div>
                  <h3 className="serendib-pay-title">Record Balance Payment</h3>
                  <p className="serendib-pay-subtitle">
                    Reservation #{reservation.reservationNumber} · {reservation.guest?.firstName} {reservation.guest?.lastName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="serendib-pay-close-btn"
                onClick={() => setShowPaymentModal(false)}
                disabled={submittingPayment}
                aria-label="Close modal"
              >
                <FaTimes />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Outstanding balance banner */}
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '0.5rem',
                padding: '0.85rem 1rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Current Outstanding</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#b45309' }}>
                    LKR {outstandingBalance.toLocaleString()}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => setPaymentForm({ ...paymentForm, amount: outstandingBalance })}
                    disabled={submittingPayment || outstandingBalance <= 0}
                  >
                    Pay Full
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => setPaymentForm({ ...paymentForm, amount: Math.round(outstandingBalance / 2) })}
                    disabled={submittingPayment || outstandingBalance <= 0}
                  >
                    50%
                  </button>
                </div>
              </div>

              {/* Amount Input */}
              <div className="form-group">
                <label className="form-label required" style={{ fontWeight: '600', marginBottom: '0.35rem' }}>
                  Payment Amount (LKR)
                </label>
                <input
                  type="number"
                  className="form-control"
                  placeholder="0.00"
                  min="1"
                  max={outstandingBalance}
                  step="0.01"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  required
                  disabled={submittingPayment}
                  style={{ fontSize: '1.15rem', fontWeight: '600' }}
                />
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.35rem' }}>
                  Maximum payable amount is LKR {outstandingBalance.toLocaleString()}
                </div>
              </div>

              {/* Payment Method */}
              <div className="form-group">
                <label className="form-label required" style={{ fontWeight: '600', marginBottom: '0.35rem' }}>
                  Payment Method
                </label>
                <select
                  className="form-control"
                  value={paymentForm.paymentMethod}
                  onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}
                  required
                  disabled={submittingPayment}
                >
                  <option value="Cash">Cash (Front Desk)</option>
                  <option value="Card">Credit / Debit Card (POS)</option>
                  <option value="Bank Transfer">Bank Transfer / Cheque</option>
                </select>
              </div>

              {/* Payment Date & Reference */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: '600', marginBottom: '0.35rem' }}>
                    Payment Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    className="form-control"
                    value={paymentForm.paymentDate}
                    onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
                    disabled={submittingPayment}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: '600', marginBottom: '0.35rem' }}>
                    Reference / Receipt #
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. POS-9841 / Slip #"
                    value={paymentForm.transactionReference}
                    onChange={(e) => setPaymentForm({ ...paymentForm, transactionReference: e.target.value })}
                    disabled={submittingPayment}
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: '600', marginBottom: '0.35rem' }}>
                  Internal Folio Notes (Optional)
                </label>
                <textarea
                  className="form-control"
                  rows="2"
                  placeholder="Additional notes for accounting ledger"
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  disabled={submittingPayment}
                />
              </div>

              {/* Live Balance Preview */}
              {Number(paymentForm.amount) > 0 && (
                <div style={{
                  background: Number(paymentForm.amount) > outstandingBalance ? '#fef2f2' : '#f0fdf4',
                  border: `1px solid ${Number(paymentForm.amount) > outstandingBalance ? '#fca5a5' : '#86efac'}`,
                  borderRadius: '0.5rem',
                  padding: '0.75rem 1rem',
                  fontSize: '0.875rem'
                }}>
                  {Number(paymentForm.amount) > outstandingBalance ? (
                    <span style={{ color: '#b91c1c', fontWeight: '600' }}>
                      Amount exceeds outstanding balance by LKR {(Number(paymentForm.amount) - outstandingBalance).toLocaleString()}!
                    </span>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#166534' }}>Remaining Balance After Payment:</span>
                      <strong style={{ color: '#166534', fontSize: '1rem' }}>
                        LKR {Math.max(0, outstandingBalance - Number(paymentForm.amount)).toLocaleString()}
                      </strong>
                    </div>
                  )}
                </div>
              )}

              {/* Footer Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowPaymentModal(false)}
                  disabled={submittingPayment}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-success"
                  disabled={
                    submittingPayment ||
                    !paymentForm.amount ||
                    Number(paymentForm.amount) <= 0 ||
                    Number(paymentForm.amount) > outstandingBalance
                  }
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  {submittingPayment ? (
                    <>
                      <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
                      Recording Payment...
                    </>
                  ) : (
                    <>
                      <FaCheckCircle /> Confirm & Record Payment
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReservationDetails;
