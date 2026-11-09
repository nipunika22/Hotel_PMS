// frontend/src/pages/AdminPayments.js
import React, { useState, useEffect } from 'react';
import { 
  FaCreditCard, 
  FaSearch, 
  FaFilter, 
  FaSync, 
  FaCheckCircle, 
  FaClock, 
  FaTimesCircle, 
  FaUndo, 
  FaEye, 
  FaPrint, 
  FaShieldAlt,
  FaFileInvoiceDollar,
  FaBed,
  FaUtensils,
  FaGlassCheers,
  FaMoneyBillWave,
  FaExclamationTriangle
} from 'react-icons/fa';
import { paymentAPI, propertyAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import '../components/PaymentModal.css';

const AdminPayments = () => {
  const { user } = useAuth();
  const [payments, setPayments] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, pages: 1 });

  // Filters
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [purposeFilter, setPurposeFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [properties, setProperties] = useState([]);
  const [selectedProperty, setSelectedProperty] = useState('ALL');

  // Modal details
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [refundModalPayment, setRefundModalPayment] = useState(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [processingRefund, setProcessingRefund] = useState(false);

  useEffect(() => {
    fetchProperties();
  }, []);

  useEffect(() => {
    fetchData();
  }, [pagination.page, statusFilter, purposeFilter, selectedProperty]);

  const fetchProperties = async () => {
    try {
      const res = await propertyAPI.getProperties();
      setProperties(res.data || []);
    } catch (e) {
      console.warn('Failed to fetch properties:', e);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        status: statusFilter,
        purpose: purposeFilter,
        search: searchQuery || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        propertyId: selectedProperty !== 'ALL' ? selectedProperty : undefined
      };

      const [paymentsRes, analyticsRes] = await Promise.all([
        paymentAPI.getPayments(params),
        paymentAPI.getFinancialAnalytics({
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          propertyId: selectedProperty !== 'ALL' ? selectedProperty : undefined
        })
      ]);

      setPayments(paymentsRes.data?.payments || []);
      setPagination(paymentsRes.data?.pagination || { page: 1, limit: 15, total: 0, pages: 1 });
      setAnalytics(analyticsRes.data || null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load payments data');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchData();
  };

  const handleResetFilters = () => {
    setStatusFilter('ALL');
    setPurposeFilter('ALL');
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
    setSelectedProperty('ALL');
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleOpenRefund = (payment) => {
    setRefundModalPayment(payment);
    const maxRefundable = payment.amount - (payment.refundAmount || 0);
    setRefundAmount(maxRefundable);
    setRefundReason('');
  };

  const handleSubmitRefund = async (e) => {
    e.preventDefault();
    if (!refundModalPayment) return;

    const num = Number(refundAmount);
    const max = refundModalPayment.amount - (refundModalPayment.refundAmount || 0);
    if (isNaN(num) || num <= 0 || num > max) {
      toast.error(`Please enter a valid refund amount up to Rs. ${max.toLocaleString()}`);
      return;
    }

    try {
      setProcessingRefund(true);
      const res = await paymentAPI.processRefund(refundModalPayment._id, {
        amount: num,
        reason: refundReason || 'Guest cancellation refund'
      });

      toast.success(res.data?.message || 'Refund successfully processed');
      setRefundModalPayment(null);
      if (selectedPayment?._id === refundModalPayment._id) {
        setSelectedPayment(res.data?.payment || null);
      }
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to process refund');
    } finally {
      setProcessingRefund(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed':
        return (
          <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0' }}>
            <FaCheckCircle size={11} /> Completed
          </span>
        );
      case 'pending':
      case 'processing':
        return (
          <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: '#FFFBEB', color: '#B45309', border: '1px solid #FDE68A' }}>
            <FaClock size={11} /> Pending
          </span>
        );
      case 'partially_refunded':
        return (
          <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1' }}>
            <FaUndo size={11} /> Partial Refund
          </span>
        );
      case 'refunded':
        return (
          <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA' }}>
            <FaUndo size={11} /> Refunded
          </span>
        );
      case 'cancelled':
      case 'failed':
      default:
        return (
          <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FCA5A5' }}>
            <FaTimesCircle size={11} /> {status}
          </span>
        );
    }
  };

  const getPurposeIcon = (purpose) => {
    switch (purpose) {
      case 'room_booking': return <FaBed style={{ color: '#1E3A8A' }} />;
      case 'restaurant_dining': return <FaUtensils style={{ color: '#D97706' }} />;
      case 'event_booking': return <FaGlassCheers style={{ color: '#B68C48' }} />;
      case 'invoice_settlement': return <FaFileInvoiceDollar style={{ color: '#059669' }} />;
      default: return <FaCreditCard style={{ color: '#64748B' }} />;
    }
  };

  const formatPurposeName = (purpose) => {
    switch (purpose) {
      case 'room_booking': return 'Room Reservation';
      case 'restaurant_dining': return 'Restaurant Dining';
      case 'event_booking': return 'Event & Banquet';
      case 'invoice_settlement': return 'Invoice Settlement';
      default: return purpose?.replace('_', ' ');
    }
  };

  const canRefund = ['admin', 'finance', 'super_admin'].includes(user?.role);

  return (
    <div className="pms-page-container" style={{ padding: '1.5rem 2rem', fontFamily: "'Poppins', sans-serif" }}>
      {/* Page Title & Topbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: 'var(--c-forest-deep, #162E24)', margin: 0 }}>
            Payment Transactions & Settlement
          </h1>
          <p style={{ color: '#64748B', fontSize: '0.875rem', margin: '0.25rem 0 0 0' }}>
            Authoritative financial records verified with PayHere Payment Gateway.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={fetchData}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}
          >
            <FaSync className={loading ? 'fa-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      {analytics?.summary && (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '1rem', 
          marginBottom: '2rem' 
        }}>
          {/* Confirmed Revenue */}
          <div style={{ background: '#FFFFFF', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid #E2E8F0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#059669', textTransform: 'uppercase' }}>
              Confirmed Revenue (Gross)
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#162E24', marginTop: '0.35rem' }}>
              Rs. {Number(analytics.summary.totalConfirmedRevenue || 0).toLocaleString()}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.2rem' }}>
              {analytics.summary.totalConfirmedCount} confirmed transactions
            </div>
          </div>

          {/* Net Revenue */}
          <div style={{ background: '#FFFFFF', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid #E2E8F0', borderLeft: '4px solid #B68C48' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#B68C48', textTransform: 'uppercase' }}>
              Net Hospitality Revenue
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#162E24', marginTop: '0.35rem' }}>
              Rs. {Number(analytics.summary.netRevenue || 0).toLocaleString()}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.2rem' }}>
              After deducting refunds
            </div>
          </div>

          {/* Pending Volume */}
          <div style={{ background: '#FFFFFF', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#D97706', textTransform: 'uppercase' }}>
              Pending Settlements
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#162E24', marginTop: '0.35rem' }}>
              Rs. {Number(analytics.summary.pendingAmount || 0).toLocaleString()}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.2rem' }}>
              {analytics.summary.pendingCount} checkout sessions
            </div>
          </div>

          {/* Total Refunds */}
          <div style={{ background: '#FFFFFF', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#DC2626', textTransform: 'uppercase' }}>
              Total Refunds
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#991B1B', marginTop: '0.35rem' }}>
              Rs. {Number(analytics.summary.totalRefundedAmount || 0).toLocaleString()}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.2rem' }}>
              {analytics.summary.totalRefundedCount} processed refunds
            </div>
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div style={{ 
        background: '#FFFFFF', 
        borderRadius: '0.75rem', 
        border: '1px solid #E2E8F0', 
        padding: '1.25rem', 
        marginBottom: '1.5rem',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '1rem',
        alignItems: 'flex-end'
      }}>
        <form onSubmit={handleSearchSubmit} style={{ flex: '1 1 240px', display: 'flex', gap: '0.5rem' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <FaSearch style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
            <input
              type="text"
              placeholder="Search reference, customer, or gateway ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem 0.65rem 2.4rem',
                borderRadius: '0.5rem',
                border: '1px solid #CBD5E1',
                fontSize: '0.875rem'
              }}
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ padding: '0.65rem 1rem', fontSize: '0.85rem' }}>
            Search
          </button>
        </form>

        {/* Status Dropdown */}
        <div style={{ minWidth: '150px' }}>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748B', marginBottom: '0.25rem' }}>
            Payment Status
          </label>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPagination(prev => ({ ...prev, page: 1 }));
            }}
            style={{ width: '100%', padding: '0.65rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #CBD5E1', fontSize: '0.875rem' }}
          >
            <option value="ALL">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="partially_refunded">Partially Refunded</option>
            <option value="refunded">Refunded</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {/* Service Purpose Dropdown */}
        <div style={{ minWidth: '170px' }}>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748B', marginBottom: '0.25rem' }}>
            Service Purpose
          </label>
          <select
            value={purposeFilter}
            onChange={(e) => {
              setPurposeFilter(e.target.value);
              setPagination(prev => ({ ...prev, page: 1 }));
            }}
            style={{ width: '100%', padding: '0.65rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #CBD5E1', fontSize: '0.875rem' }}
          >
            <option value="ALL">All Services</option>
            <option value="room_booking">Room Reservations</option>
            <option value="restaurant_dining">Restaurant Dining</option>
            <option value="event_booking">Event & Banquets</option>
            <option value="invoice_settlement">Invoices</option>
          </select>
        </div>

        {/* Property Filter */}
        {properties.length > 1 && (
          <div style={{ minWidth: '170px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748B', marginBottom: '0.25rem' }}>
              Property
            </label>
            <select
              value={selectedProperty}
              onChange={(e) => {
                setSelectedProperty(e.target.value);
                setPagination(prev => ({ ...prev, page: 1 }));
              }}
              style={{ width: '100%', padding: '0.65rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #CBD5E1', fontSize: '0.875rem' }}
            >
              <option value="ALL">All Properties</option>
              {properties.map(p => (
                <option key={p._id} value={p._id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        <button
          type="button"
          className="btn btn-outline-secondary"
          onClick={handleResetFilters}
          style={{ padding: '0.65rem 1rem', fontSize: '0.85rem' }}
        >
          Reset Filters
        </button>
      </div>

      {/* Transactions Table */}
      <div style={{ background: '#FFFFFF', borderRadius: '0.75rem', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem 0' }}>
            <div className="spinner" style={{ margin: '0 auto 1rem auto' }} />
            <p style={{ color: '#64748B' }}>Loading verified transaction records...</p>
          </div>
        ) : payments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
            <FaCreditCard size={48} style={{ color: '#94A3B8', marginBottom: '1rem' }} />
            <h3 style={{ color: '#162E24', fontWeight: 600, marginBottom: '0.5rem' }}>No Transactions Found</h3>
            <p style={{ color: '#64748B', maxWidth: '420px', margin: '0 auto' }}>
              No payments match your selected search or filter parameters.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="pms-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '0.85rem 1rem' }}>Reference / ID</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Customer</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Service / Purpose</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Gateway / Method</th>
                  <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Amount (LKR)</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Status</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Date & Time</th>
                  <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const dateStr = new Date(p.paymentDate || p.createdAt).toLocaleString([], {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  });

                  return (
                    <tr key={p._id} style={{ borderBottom: '1px solid #F1F5F9', transition: 'background 0.15s ease' }}>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 700, color: 'var(--c-forest-deep, #162E24)' }}>
                          {p.paymentReference}
                        </div>
                        {p.gatewayTransactionId && (
                          <div style={{ fontSize: '0.72rem', color: '#64748B', fontFamily: 'monospace' }}>
                            {p.gatewayTransactionId}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 600, color: '#0F172A' }}>
                          {p.user?.name || 'Customer'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                          {p.user?.email || p.user?.phone}
                        </div>
                      </td>

                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
                          {getPurposeIcon(p.purpose)}
                          <span>{formatPurposeName(p.purpose)}</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                          {p.booking?.room ? `Room ${p.booking.room.roomNumber} (${p.booking.room.roomType})` : ''}
                          {p.restaurantReservation ? `Table Ref: ${p.restaurantReservation.confirmationNumber}` : ''}
                          {p.eventBooking ? `${p.eventBooking.venueName || 'Event Hall'}` : ''}
                          {p.invoice ? `Invoice #${p.invoice.invoiceNumber}` : ''}
                        </div>
                      </td>

                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 600 }}>{p.gatewayMethod || p.paymentMethod || 'Online'}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{p.gateway || 'PayHere'}</div>
                      </td>

                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, color: 'var(--c-forest-deep, #162E24)' }}>
                          Rs. {Number(p.amount || 0).toLocaleString()}
                        </div>
                        {p.refundAmount > 0 && (
                          <div style={{ fontSize: '0.72rem', color: '#DC2626' }}>
                            Refunded: Rs. {Number(p.refundAmount).toLocaleString()}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '0.85rem 1rem' }}>
                        {getStatusBadge(p.paymentStatus)}
                      </td>

                      <td style={{ padding: '0.85rem 1rem', color: '#64748B', fontSize: '0.8rem' }}>
                        {dateStr}
                      </td>

                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="btn btn-outline-secondary btn-sm"
                            style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem' }}
                            onClick={() => setSelectedPayment(p)}
                            title="View Full Payment Record & Audit Trail"
                          >
                            <FaEye /> View
                          </button>

                          {canRefund && p.paymentStatus === 'completed' && (
                            <button
                              type="button"
                              className="btn btn-outline-danger btn-sm"
                              style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem' }}
                              onClick={() => handleOpenRefund(p)}
                              title="Process Verified Refund"
                            >
                              <FaUndo /> Refund
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {pagination.pages > 1 && (
          <div style={{ padding: '1rem', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: '#64748B' }}>
              Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} records
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                disabled={pagination.page <= 1}
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                disabled={pagination.page >= pagination.pages}
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedPayment && (
        <div className="serendib-pay-backdrop" onClick={() => setSelectedPayment(null)}>
          <div className="serendib-pay-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '680px' }}>
            <div className="serendib-pay-header">
              <div className="serendib-pay-header-left">
                <div className="serendib-pay-badge-icon">
                  <FaShieldAlt />
                </div>
                <div>
                  <h3 className="serendib-pay-title">Transaction Details</h3>
                  <p className="serendib-pay-subtitle">Ref: {selectedPayment.paymentReference}</p>
                </div>
              </div>
              <button
                type="button"
                className="serendib-pay-close-btn"
                onClick={() => setSelectedPayment(null)}
              >
                <FaTimes />
              </button>
            </div>

            <div className="serendib-pay-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', background: '#FFFFFF', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid #E2E8F0', fontSize: '0.875rem' }}>
                <div>
                  <span style={{ color: '#64748B' }}>Payment Reference:</span><br />
                  <strong>{selectedPayment.paymentReference}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Status:</span><br />
                  <div style={{ marginTop: '0.2rem' }}>{getStatusBadge(selectedPayment.paymentStatus)}</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Customer:</span><br />
                  <strong>{selectedPayment.user?.name}</strong><br />
                  <span style={{ fontSize: '0.8rem', color: '#64748B' }}>{selectedPayment.user?.email}</span>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Authoritative Amount:</span><br />
                  <strong style={{ fontSize: '1.1rem', color: '#162E24' }}>
                    Rs. {Number(selectedPayment.amount || 0).toLocaleString()} {selectedPayment.currency}
                  </strong>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Gateway Transaction ID:</span><br />
                  <code style={{ fontSize: '0.8rem', background: '#F1F5F9', padding: '0.2rem 0.4rem', borderRadius: '0.25rem' }}>
                    {selectedPayment.gatewayTransactionId || selectedPayment.transactionId || 'Pending'}
                  </code>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Gateway Method:</span><br />
                  <strong>{selectedPayment.gatewayMethod || selectedPayment.paymentMethod || 'Online'}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Payment Purpose:</span><br />
                  <strong style={{ textTransform: 'capitalize' }}>{selectedPayment.purpose?.replace('_', ' ')}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Confirmation Date:</span><br />
                  <strong>{selectedPayment.confirmedAt ? new Date(selectedPayment.confirmedAt).toLocaleString() : 'Pending confirmation'}</strong>
                </div>
              </div>

              {/* Refund Info if exists */}
              {selectedPayment.refundAmount > 0 && (
                <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '0.75rem', padding: '1rem', fontSize: '0.85rem', color: '#991B1B' }}>
                  <strong>Refund Processed:</strong> Rs. {Number(selectedPayment.refundAmount).toLocaleString()}<br />
                  <strong>Reason:</strong> {selectedPayment.refundReason || 'N/A'}<br />
                  <strong>Processed By:</strong> {selectedPayment.refundedBy?.name || 'Staff'}<br />
                  <strong>Date:</strong> {selectedPayment.refundDate ? new Date(selectedPayment.refundDate).toLocaleString() : 'N/A'}
                </div>
              )}

              {/* Audit History Log */}
              {selectedPayment.auditLog && selectedPayment.auditLog.length > 0 && (
                <div>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#162E24', margin: '0 0 0.5rem 0' }}>
                    Audit History & Lifecycle
                  </h4>
                  <div style={{ background: '#F8FAFC', borderRadius: '0.75rem', border: '1px solid #E2E8F0', padding: '0.75rem', maxHeight: '180px', overflowY: 'auto' }}>
                    {selectedPayment.auditLog.map((log, index) => (
                      <div key={index} style={{ padding: '0.4rem 0', borderBottom: index < selectedPayment.auditLog.length - 1 ? '1px solid #E2E8F0' : 'none', fontSize: '0.8rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}>
                          <strong style={{ color: '#0F172A' }}>{log.action}</strong>
                          <span>{new Date(log.timestamp).toLocaleString()}</span>
                        </div>
                        {log.notes && <div style={{ color: '#475569', marginTop: '0.15rem' }}>{log.notes}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => setSelectedPayment(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Refund Processing Modal */}
      {refundModalPayment && (
        <div className="serendib-pay-backdrop" onClick={() => setRefundModalPayment(null)}>
          <div className="serendib-pay-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className="serendib-pay-header">
              <div className="serendib-pay-header-left">
                <div className="serendib-pay-badge-icon" style={{ color: '#DC2626', background: 'rgba(220, 38, 38, 0.1)' }}>
                  <FaUndo />
                </div>
                <div>
                  <h3 className="serendib-pay-title">Process Payment Refund</h3>
                  <p className="serendib-pay-subtitle">Ref: {refundModalPayment.paymentReference}</p>
                </div>
              </div>
              <button
                type="button"
                className="serendib-pay-close-btn"
                onClick={() => setRefundModalPayment(null)}
              >
                <FaTimes />
              </button>
            </div>

            <form onSubmit={handleSubmitRefund} className="serendib-pay-body">
              <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', padding: '1rem', borderRadius: '0.75rem', fontSize: '0.85rem', color: '#92400E' }}>
                <FaExclamationTriangle style={{ marginRight: '0.4rem' }} />
                Refunds deduct directly from verified hospitality revenue and update linked booking and folio records.
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                  Refund Amount (LKR)
                </label>
                <input
                  type="number"
                  step="0.01"
                  max={refundModalPayment.amount - (refundModalPayment.refundAmount || 0)}
                  min="1"
                  required
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #CBD5E1', fontSize: '1rem', fontWeight: 600 }}
                />
                <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block', marginTop: '0.25rem' }}>
                  Maximum refundable: Rs. {(refundModalPayment.amount - (refundModalPayment.refundAmount || 0)).toLocaleString()}
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                  Reason for Refund
                </label>
                <textarea
                  rows="3"
                  required
                  placeholder="State the customer or managerial justification for this refund..."
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #CBD5E1', fontSize: '0.875rem' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => setRefundModalPayment(null)}
                  disabled={processingRefund}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-danger"
                  disabled={processingRefund}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <FaUndo />
                  <span>{processingRefund ? 'Processing Refund...' : 'Authorize Refund'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPayments;
