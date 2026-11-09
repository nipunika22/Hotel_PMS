// frontend/src/pages/FinancialDashboard.js
import React, { useState, useEffect } from 'react';
import { 
  FaChartPie, 
  FaCalendarAlt, 
  FaDownload, 
  FaSync, 
  FaMoneyBillWave, 
  FaUndo, 
  FaBed, 
  FaUtensils, 
  FaGlassCheers, 
  FaFileInvoiceDollar,
  FaArrowUp,
  FaCheckCircle,
  FaClock,
  FaExclamationCircle,
  FaHotel,
  FaPrint
} from 'react-icons/fa';
import { paymentAPI, propertyAPI } from '../services/api';
import { toast } from 'react-toastify';
import '../components/PaymentModal.css';

const FinancialDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState(null);
  const [properties, setProperties] = useState([]);
  const [selectedProperty, setSelectedProperty] = useState('ALL');
  
  // Quick date ranges
  const [dateRangeMode, setDateRangeMode] = useState('30days'); // 'today', '7days', '30days', 'custom'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    fetchProperties();
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [selectedProperty, dateRangeMode, startDate, endDate]);

  const fetchProperties = async () => {
    try {
      const res = await propertyAPI.getProperties();
      setProperties(res.data || []);
    } catch (e) {
      console.warn('Failed to load properties list:', e);
    }
  };

  const getEffectiveDates = () => {
    const now = new Date();
    let s = null;
    let e = now.toISOString();

    if (dateRangeMode === 'today') {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      s = start.toISOString();
    } else if (dateRangeMode === '7days') {
      const start = new Date(now);
      start.setDate(now.getDate() - 7);
      s = start.toISOString();
    } else if (dateRangeMode === '30days') {
      const start = new Date(now);
      start.setDate(now.getDate() - 30);
      s = start.toISOString();
    } else if (dateRangeMode === 'custom') {
      s = startDate ? new Date(startDate).toISOString() : null;
      e = endDate ? new Date(endDate).toISOString() : null;
    }

    return { s, e };
  };

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const { s, e } = getEffectiveDates();
      const params = {
        propertyId: selectedProperty !== 'ALL' ? selectedProperty : undefined,
        startDate: s || undefined,
        endDate: e || undefined
      };

      const res = await paymentAPI.getFinancialAnalytics(params);
      setAnalytics(res.data || null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load financial analytics');
    } finally {
      setLoading(false);
    }
  };

  // CSV Report Export
  const handleExportCSV = async () => {
    try {
      toast.info('Preparing export report...');
      const { s, e } = getEffectiveDates();
      const res = await paymentAPI.getPayments({
        limit: 1000,
        propertyId: selectedProperty !== 'ALL' ? selectedProperty : undefined,
        startDate: s || undefined,
        endDate: e || undefined
      });

      const payments = res.data?.payments || [];
      if (payments.length === 0) {
        toast.warning('No payments found for the selected period to export.');
        return;
      }

      const headers = [
        'Payment Reference',
        'Date',
        'Customer Name',
        'Customer Email',
        'Service Purpose',
        'Gateway Method',
        'Gateway Txn ID',
        'Currency',
        'Gross Amount',
        'Refunded Amount',
        'Net Amount',
        'Status'
      ];

      const rows = payments.map(p => [
        p.paymentReference,
        new Date(p.paymentDate || p.createdAt).toISOString(),
        `"${p.user?.name || 'Guest'}"`,
        `"${p.user?.email || ''}"`,
        p.purpose,
        p.gatewayMethod || p.paymentMethod || 'Online',
        p.gatewayTransactionId || p.transactionId || '',
        p.currency || 'LKR',
        p.amount || 0,
        p.refundAmount || 0,
        (p.amount || 0) - (p.refundAmount || 0),
        p.paymentStatus
      ]);

      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `Serendib-Financial-Report-${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Financial report exported successfully.');
    } catch (err) {
      toast.error('Failed to export CSV report');
    }
  };

  const getPurposeLabel = (p) => {
    switch (p) {
      case 'room_booking': return 'Room Reservations';
      case 'restaurant_dining': return 'Restaurant Dining';
      case 'event_booking': return 'Events & Banquets';
      case 'invoice_settlement': return 'Invoice Settlements';
      default: return p;
    }
  };

  const summary = analytics?.summary || {};
  const totalRevenue = summary.totalConfirmedRevenue || 0;
  const netRevenue = summary.netRevenue || 0;
  const totalRefunds = summary.totalRefundedAmount || 0;

  return (
    <div className="pms-page-container" style={{ padding: '1.5rem 2rem', fontFamily: "'Poppins', sans-serif" }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: 'var(--c-forest-deep, #162E24)', margin: 0 }}>
            Financial Management & Revenue Analytics
          </h1>
          <p style={{ color: '#64748B', fontSize: '0.875rem', margin: '0.25rem 0 0 0' }}>
            Serendib Sanctuary chain-wide reconciled financial dashboard.
          </p>
        </div>

        <div className="no-print" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={fetchAnalytics}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
          >
            <FaSync className={loading ? 'fa-spin' : ''} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() => window.print()}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
          >
            <FaPrint />
            <span>Print Report</span>
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleExportCSV}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
          >
            <FaDownload />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Date & Property Controls Filter */}
      <div className="no-print" style={{ 
        background: '#FFFFFF', 
        borderRadius: '0.75rem', 
        border: '1px solid #E2E8F0', 
        padding: '1rem 1.25rem', 
        marginBottom: '1.75rem',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '1rem',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        {/* Date presets */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {[
            { id: 'today', label: 'Today' },
            { id: '7days', label: 'Last 7 Days' },
            { id: '30days', label: 'Last 30 Days' },
            { id: 'custom', label: 'Custom Range' }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              className={`btn btn-sm ${dateRangeMode === tab.id ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => setDateRangeMode(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Custom date range inputs */}
        {dateRangeMode === 'custom' && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ padding: '0.4rem 0.6rem', borderRadius: '0.375rem', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
            />
            <span style={{ color: '#64748B' }}>to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ padding: '0.4rem 0.6rem', borderRadius: '0.375rem', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
            />
          </div>
        )}

        {/* Property Selector */}
        {properties.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FaHotel style={{ color: '#64748B' }} />
            <select
              value={selectedProperty}
              onChange={(e) => setSelectedProperty(e.target.value)}
              style={{ padding: '0.45rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
            >
              <option value="ALL">All Chain Properties</option>
              {properties.map(p => (
                <option key={p._id} value={p._id}>{p.name} ({p.city})</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Main KPI Cards */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', 
        gap: '1.25rem', 
        marginBottom: '2rem' 
      }}>
        <div style={{ background: '#FFFFFF', padding: '1.5rem', borderRadius: '0.85rem', border: '1px solid #E2E8F0', borderLeft: '4px solid #059669', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#059669', textTransform: 'uppercase' }}>
              Gross Confirmed Revenue
            </span>
            <FaCheckCircle style={{ color: '#059669' }} />
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#162E24', marginTop: '0.5rem' }}>
            Rs. {Number(totalRevenue).toLocaleString()}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '0.25rem' }}>
            {summary.totalConfirmedCount || 0} successfully verified settlements
          </div>
        </div>

        <div style={{ background: '#FFFFFF', padding: '1.5rem', borderRadius: '0.85rem', border: '1px solid #E2E8F0', borderLeft: '4px solid #B68C48', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#B68C48', textTransform: 'uppercase' }}>
              Net Hospitality Revenue
            </span>
            <FaMoneyBillWave style={{ color: '#B68C48' }} />
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#162E24', marginTop: '0.5rem' }}>
            Rs. {Number(netRevenue).toLocaleString()}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '0.25rem' }}>
            Gross less authorized refunds
          </div>
        </div>

        <div style={{ background: '#FFFFFF', padding: '1.5rem', borderRadius: '0.85rem', border: '1px solid #E2E8F0', borderLeft: '4px solid #DC2626', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#DC2626', textTransform: 'uppercase' }}>
              Total Reconciled Refunds
            </span>
            <FaUndo style={{ color: '#DC2626' }} />
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#991B1B', marginTop: '0.5rem' }}>
            Rs. {Number(totalRefunds).toLocaleString()}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '0.25rem' }}>
            {summary.totalRefundedCount || 0} refund transactions
          </div>
        </div>

        <div style={{ background: '#FFFFFF', padding: '1.5rem', borderRadius: '0.85rem', border: '1px solid #E2E8F0', borderLeft: '4px solid #D97706', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#D97706', textTransform: 'uppercase' }}>
              Pending Clearance
            </span>
            <FaClock style={{ color: '#D97706' }} />
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#162E24', marginTop: '0.5rem' }}>
            Rs. {Number(summary.pendingAmount || 0).toLocaleString()}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '0.25rem' }}>
            {summary.pendingCount || 0} pending sessions
          </div>
        </div>
      </div>

      {/* Grid: Revenue Breakdown by Purpose & Revenue by Property */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        {/* Purpose Breakdown */}
        <div style={{ background: '#FFFFFF', borderRadius: '0.75rem', border: '1px solid #E2E8F0', padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#162E24', margin: '0 0 1.25rem 0' }}>
            Revenue by Service Stream
          </h3>

          {!analytics?.revenueByPurpose || analytics.revenueByPurpose.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>
              No confirmed revenue recorded in this period.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {analytics.revenueByPurpose.map((item) => {
                const pct = totalRevenue > 0 ? Math.round((item.revenue / totalRevenue) * 100) : 0;
                return (
                  <div key={item._id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '0.35rem' }}>
                      <strong style={{ color: '#162E24' }}>{getPurposeLabel(item._id)}</strong>
                      <span>
                        Rs. {Number(item.revenue).toLocaleString()} <span style={{ color: '#64748B' }}>({pct}%)</span>
                      </span>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: '#B68C48', borderRadius: '4px' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Property Breakdown */}
        <div style={{ background: '#FFFFFF', borderRadius: '0.75rem', border: '1px solid #E2E8F0', padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#162E24', margin: '0 0 1.25rem 0' }}>
            Revenue by Property Location
          </h3>

          {!analytics?.revenueByProperty || analytics.revenueByProperty.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>
              No property revenue breakdown available.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {analytics.revenueByProperty.map((item) => {
                const pct = totalRevenue > 0 ? Math.round((item.revenue / totalRevenue) * 100) : 0;
                return (
                  <div key={item._id || item.propertyName}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '0.35rem' }}>
                      <strong style={{ color: '#162E24' }}>{item.propertyName}</strong>
                      <span>
                        Rs. {Number(item.revenue).toLocaleString()} <span style={{ color: '#64748B' }}>({pct}%)</span>
                      </span>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: '#345B4A', borderRadius: '4px' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Payment Methods & Timeline */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>
        {/* Gateway Payment Methods */}
        <div style={{ background: '#FFFFFF', borderRadius: '0.75rem', border: '1px solid #E2E8F0', padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#162E24', margin: '0 0 1.25rem 0' }}>
            Reconciled Payment Methods
          </h3>

          {!analytics?.methods || analytics.methods.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>
              No payment methods recorded.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {analytics.methods.map((m) => (
                <div key={m._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.85rem', background: '#F8FAFC', borderRadius: '0.5rem', border: '1px solid #E2E8F0' }}>
                  <span style={{ fontWeight: 600, color: '#1E293B', fontSize: '0.875rem' }}>
                    {m._id || 'PayHere Online'}
                  </span>
                  <div style={{ textAlign: 'right' }}>
                    <strong style={{ color: '#059669', fontSize: '0.9rem' }}>
                      Rs. {Number(m.revenue).toLocaleString()}
                    </strong>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                      {m.count} settlement{m.count > 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Daily Timeline */}
        <div style={{ background: '#FFFFFF', borderRadius: '0.75rem', border: '1px solid #E2E8F0', padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#162E24', margin: '0 0 1.25rem 0' }}>
            Daily Revenue Settlement Log
          </h3>

          {!analytics?.timeline || analytics.timeline.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>
              No timeline settlements recorded in this period.
            </div>
          ) : (
            <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #E2E8F0', color: '#64748B', textAlign: 'left' }}>
                    <th style={{ padding: '0.5rem' }}>Date</th>
                    <th style={{ padding: '0.5rem', textAlign: 'center' }}>Transactions</th>
                    <th style={{ padding: '0.5rem', textAlign: 'right' }}>Gross Settlement</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.timeline.map((t) => (
                    <tr key={t._id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '0.5rem', fontWeight: 500 }}>{t._id}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'center' }}>{t.count}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 700, color: '#162E24' }}>
                        Rs. {Number(t.revenue).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FinancialDashboard;
