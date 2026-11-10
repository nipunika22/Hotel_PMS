// frontend/src/pages/Reports.js
import React, { useState, useEffect } from 'react';
import DatePicker from 'react-datepicker';
import { FaChartBar, FaFileAlt, FaUsers, FaPlane, FaDollarSign } from 'react-icons/fa';
import { reservationAPI, roomAPI, guestAPI, travelAgentAPI, invoiceAPI, guestExpenseAPI } from '../services/api';
import { toast } from 'react-toastify';
import { format, startOfMonth, endOfMonth } from 'date-fns';

const Reports = () => {
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState({
    startDate: startOfMonth(new Date()),
    endDate: endOfMonth(new Date())
  });

  const [stats, setStats] = useState({
    occupancy: null,
    revenue: null,
    bookingSources: null,
    guestStats: null,
    agentStats: null,
    expenseSummary: null
  });

  useEffect(() => {
    generateReports();
  }, []);

  const generateReports = async () => {
    setLoading(true);
    try {
      const [
        roomStatsRes,
        invoiceStatsRes,
        guestStatsRes,
        agentStatsRes,
        expenseSummaryRes,
        reservationsRes
      ] = await Promise.all([
        roomAPI.getRoomStats(),
        invoiceAPI.getInvoiceStats(
          dateRange.startDate.toISOString(),
          dateRange.endDate.toISOString()
        ),
        guestAPI.getGuestStats(),
        travelAgentAPI.getAgentStats(),
        guestExpenseAPI.getExpenseSummary(
          dateRange.startDate.toISOString(),
          dateRange.endDate.toISOString()
        ),
        reservationAPI.getReservationsByDateRange(
          dateRange.startDate.toISOString(),
          dateRange.endDate.toISOString()
        )
      ]);

      // Calculate booking source breakdown
      const reservations = reservationsRes.data;
      const sourceBreakdown = reservations.reduce((acc, res) => {
        acc[res.bookingSource] = (acc[res.bookingSource] || 0) + 1;
        return acc;
      }, {});

      setStats({
        occupancy: roomStatsRes.data,
        revenue: invoiceStatsRes.data,
        bookingSources: sourceBreakdown,
        guestStats: guestStatsRes.data,
        agentStats: agentStatsRes.data,
        expenseSummary: expenseSummaryRes.data
      });

      toast.success('Reports generated successfully');
    } catch (error) {
      toast.error('Failed to generate reports');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !stats.occupancy) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  return (
    <div>
      <div className="topbar">
        <h1 className="topbar-title">Reports & Analytics</h1>
        <div className="topbar-actions">
          <button onClick={generateReports} className="btn btn-primary" disabled={loading}>
            {loading ? 'Generating...' : 'Refresh Reports'}
          </button>
        </div>
      </div>

      <div className="content-wrapper">
        {/* Date Range Selector */}
        <div className="card" style={{ marginBottom: '2rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Report Period</h3>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <label className="form-label">Start Date</label>
              <DatePicker
                selected={dateRange.startDate}
                onChange={(date) => setDateRange({ ...dateRange, startDate: date })}
                className="form-control"
                dateFormat="MMM dd, yyyy"
              />
            </div>
            <div>
              <label className="form-label">End Date</label>
              <DatePicker
                selected={dateRange.endDate}
                onChange={(date) => setDateRange({ ...dateRange, endDate: date })}
                minDate={dateRange.startDate}
                className="form-control"
                dateFormat="MMM dd, yyyy"
              />
            </div>
            <div style={{ paddingTop: '1.75rem' }}>
              <button onClick={generateReports} className="btn btn-primary" disabled={loading}>
                Apply
              </button>
            </div>
          </div>
        </div>

        {/* Occupancy Report */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <FaChartBar style={{ marginRight: '0.5rem' }} />
              Occupancy Report
            </h3>
          </div>
          
          {stats.occupancy && (
            <div className="stats-grid">
              <div style={{ textAlign: 'center', padding: '1.5rem' }}>
                <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#2563eb' }}>
                  {stats.occupancy.totalRooms}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.5rem' }}>
                  Total Rooms
                </div>
              </div>

              <div style={{ textAlign: 'center', padding: '1.5rem' }}>
                <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#10b981' }}>
                  {stats.occupancy.availableRooms}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.5rem' }}>
                  Available
                </div>
              </div>

              <div style={{ textAlign: 'center', padding: '1.5rem' }}>
                <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#ef4444' }}>
                  {stats.occupancy.occupiedRooms}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.5rem' }}>
                  Occupied
                </div>
              </div>

              <div style={{ textAlign: 'center', padding: '1.5rem' }}>
                <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#f59e0b' }}>
                  {stats.occupancy.occupancyRate}%
                </div>
                <div style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.5rem' }}>
                  Occupancy Rate
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Revenue Report */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <FaDollarSign style={{ marginRight: '0.5rem' }} />
              Revenue Report
            </h3>
            <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
              {format(dateRange.startDate, 'MMM dd, yyyy')} - {format(dateRange.endDate, 'MMM dd, yyyy')}
            </div>
          </div>

          {stats.revenue && (
            <>
              <div className="stats-grid">
                <div style={{ textAlign: 'center', padding: '1.5rem' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#10b981' }}>
                    ₹{(stats.revenue.totalRevenue || 0).toLocaleString()}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.5rem' }}>
                    Total Revenue
                  </div>
                </div>

                <div style={{ textAlign: 'center', padding: '1.5rem' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#3b82f6' }}>
                    ₹{(stats.revenue.totalPaid || 0).toLocaleString()}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.5rem' }}>
                    Collected
                  </div>
                </div>

                <div style={{ textAlign: 'center', padding: '1.5rem' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f59e0b' }}>
                    ₹{(stats.revenue.totalPending || 0).toLocaleString()}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.5rem' }}>
                    Pending
                  </div>
                </div>
              </div>

              {stats.revenue.paymentStatusBreakdown && (
                <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px' }}>
                  <h4 style={{ marginBottom: '1rem' }}>Payment Status Breakdown</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                    {Object.entries(stats.revenue.paymentStatusBreakdown).map(([status, data]) => (
                      <div key={status} style={{ padding: '0.75rem', background: 'white', borderRadius: '6px' }}>
                        <div style={{ fontSize: '0.875rem', color: '#64748b' }}>{status}</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 'bold', marginTop: '0.25rem' }}>
                          {data.count} ({data.percentage.toFixed(1)}%)
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Booking Source Report */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <FaFileAlt style={{ marginRight: '0.5rem' }} />
              Booking Source Analysis
            </h3>
            <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
              {format(dateRange.startDate, 'MMM dd, yyyy')} - {format(dateRange.endDate, 'MMM dd, yyyy')}
            </div>
          </div>

          {stats.bookingSources && Object.keys(stats.bookingSources).length > 0 ? (
            <div style={{ padding: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                {Object.entries(stats.bookingSources)
                  .sort(([, a], [, b]) => b - a)
                  .map(([source, count]) => {
                    const total = Object.values(stats.bookingSources).reduce((a, b) => a + b, 0);
                    const percentage = ((count / total) * 100).toFixed(1);
                    return (
                      <div key={source} style={{ padding: '1rem', background: '#f8fafc', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <span style={{ fontWeight: '600' }}>{source}</span>
                          <span className="badge badge-info">{count}</span>
                        </div>
                        <div style={{ height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                          <div 
                            style={{ 
                              height: '100%', 
                              background: '#2563eb', 
                              width: `${percentage}%`,
                              transition: 'width 0.3s'
                            }}
                          />
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.5rem' }}>
                          {percentage}% of bookings
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          ) : (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
              No bookings in selected period
            </div>
          )}
        </div>

        {/* Guest Analytics */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <FaUsers style={{ marginRight: '0.5rem' }} />
              Guest Analytics
            </h3>
          </div>

          {stats.guestStats && (
            <div className="stats-grid">
              <div style={{ textAlign: 'center', padding: '1.5rem' }}>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#2563eb' }}>
                  {stats.guestStats.totalGuests}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.5rem' }}>
                  Total Guests
                </div>
              </div>

              <div style={{ textAlign: 'center', padding: '1.5rem' }}>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f59e0b' }}>
                  {stats.guestStats.vipGuests}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.5rem' }}>
                  VIP Guests
                </div>
              </div>

              <div style={{ textAlign: 'center', padding: '1.5rem' }}>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#ef4444' }}>
                  {stats.guestStats.blacklistedGuests}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.5rem' }}>
                  Blacklisted
                </div>
              </div>
            </div>
          )}

          {stats.guestStats?.topSpenders && stats.guestStats.topSpenders.length > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
              <h4 style={{ marginBottom: '1rem', paddingLeft: '1.5rem' }}>Top Spending Guests</h4>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Guest Name</th>
                      <th>Total Stays</th>
                      <th>Total Spent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.guestStats.topSpenders.map((guest, index) => (
                      <tr key={guest._id}>
                        <td><strong>#{index + 1}</strong></td>
                        <td>{guest.firstName} {guest.lastName}</td>
                        <td>{guest.totalStays}</td>
                        <td><strong>₹{guest.totalSpent?.toLocaleString()}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Travel Agent Performance */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <FaPlane style={{ marginRight: '0.5rem' }} />
              Travel Agent Performance
            </h3>
          </div>

          {stats.agentStats && (
            <>
              <div className="stats-grid">
                <div style={{ textAlign: 'center', padding: '1.5rem' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#2563eb' }}>
                    {stats.agentStats.totalAgents}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.5rem' }}>
                    Total Agents
                  </div>
                </div>

                <div style={{ textAlign: 'center', padding: '1.5rem' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#10b981' }}>
                    {stats.agentStats.activeAgents}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.5rem' }}>
                    Active Agents
                  </div>
                </div>

                <div style={{ textAlign: 'center', padding: '1.5rem' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f59e0b' }}>
                    ₹{(stats.agentStats.totalRevenue || 0).toLocaleString()}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.5rem' }}>
                    Total Revenue
                  </div>
                </div>
              </div>

              {stats.agentStats.topPerformers && stats.agentStats.topPerformers.length > 0 && (
                <div style={{ marginTop: '1.5rem' }}>
                  <h4 style={{ marginBottom: '1rem', paddingLeft: '1.5rem' }}>Top Performing Agents</h4>
                  <div className="table-container">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Rank</th>
                          <th>Company</th>
                          <th>Agent Code</th>
                          <th>Bookings</th>
                          <th>Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.agentStats.topPerformers.map((agent, index) => (
                          <tr key={agent._id}>
                            <td><strong>#{index + 1}</strong></td>
                            <td>{agent.companyName}</td>
                            <td><span className="badge badge-info">{agent.agentCode}</span></td>
                            <td>{agent.totalBookings}</td>
                            <td><strong>₹{agent.totalRevenue?.toLocaleString()}</strong></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Expense Summary */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <FaFileAlt style={{ marginRight: '0.5rem' }} />
              Expense Summary by Category
            </h3>
            <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
              {format(dateRange.startDate, 'MMM dd, yyyy')} - {format(dateRange.endDate, 'MMM dd, yyyy')}
            </div>
          </div>

          {stats.expenseSummary && stats.expenseSummary.length > 0 ? (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Count</th>
                    <th>Total Amount</th>
                    <th>Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.expenseSummary.map((item) => (
                    <tr key={item._id}>
                      <td><strong>{item._id}</strong></td>
                      <td>{item.count}</td>
                      <td>₹{item.totalAmount.toLocaleString()}</td>
                      <td>{item.percentage.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 'bold', background: '#f8fafc' }}>
                    <td>Total</td>
                    <td>{stats.expenseSummary.reduce((sum, item) => sum + item.count, 0)}</td>
                    <td>₹{stats.expenseSummary.reduce((sum, item) => sum + item.totalAmount, 0).toLocaleString()}</td>
                    <td>100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
              No expenses in selected period
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Reports;