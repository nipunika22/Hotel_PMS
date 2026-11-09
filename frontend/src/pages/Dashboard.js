// frontend/src/pages/Dashboard.js
import React, { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { 
  FaUserCheck, 
  FaUserTimes, 
  FaBed, 
  FaCalendarCheck,
  FaMoneyBillWave,
  FaPlus,
  FaReceipt,
  FaBroom,
  FaTools,
  FaUser,
  FaFileInvoiceDollar,
  FaArrowRight,
  FaCheckCircle,
  FaSyncAlt,
  FaHotel
} from 'react-icons/fa';
import { reservationAPI, roomAPI } from '../services/api';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';
import { StatsSkeleton } from '../components/ui/LoadingSkeleton';
const { STAFF_ROLES, getDepartmentNavigation } = require('../config/roleAccess');

const Dashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [roomStats, setRoomStats] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [recentReservations, setRecentReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roomFilter, setRoomFilter] = useState('all');

  const role = (user?.role || '').toLowerCase().trim();

  useEffect(() => {
    if (user?.departmentAdmin === true) {
      setLoading(false);
    } else if (STAFF_ROLES.includes(role)) {
      fetchDashboardData();
    } else {
      setLoading(false);
    }
  }, [role]);

  if (role === 'customer') {
    return <Navigate to="/" replace />;
  }

  if (!STAFF_ROLES.includes(role)) {
    return (
      <div className="content-wrapper" style={{ padding: '3rem', textAlign: 'center' }}>
        <h2>Unauthorized Access</h2>
        <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>
          Your account does not have internal hotel management permissions.
        </p>
      </div>
    );
  }

  if (user?.departmentAdmin === true) {
    const links = getDepartmentNavigation(user).flatMap((section) => section.items.map((item) => ({
      ...item,
      section: section.title
    })));
    return <div className="content-wrapper" style={{ padding: '2rem' }}>
      <h1>Department Dashboard</h1>
      <p>Access is limited to the hotel departments assigned to your account.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '1rem', marginTop: '1.5rem' }}>
        {links.map((item) => <Link key={item.path} to={item.path} style={{ display: 'block', padding: '1.25rem', border: '1px solid #dce4df', borderRadius: 10, color: '#203a35', background: '#fff', textDecoration: 'none' }}><strong>{item.label}</strong><p style={{ margin: '8px 0 0', color: '#68766f' }}>{item.section}</p></Link>)}
        <Link to="/staff-attendance" style={{ display: 'block', padding: '1.25rem', border: '1px solid #dce4df', borderRadius: 10, color: '#203a35', background: '#fff', textDecoration: 'none' }}><strong>My Attendance</strong><p style={{ margin: '8px 0 0', color: '#68766f' }}>Check in, check out, and view your history</p></Link>
        <Link to="/profile" style={{ display: 'block', padding: '1.25rem', border: '1px solid #dce4df', borderRadius: 10, color: '#203a35', background: '#fff', textDecoration: 'none' }}><strong>My Profile</strong><p style={{ margin: '8px 0 0', color: '#68766f' }}>View your account and update your password</p></Link>
      </div>
      {!links.length && <p>Your administrator account has no active department assignments. Contact the Super Admin.</p>}
    </div>;
  }

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [dashboardRes, roomsRes, allRoomsRes, resRes] = await Promise.all([
        reservationAPI.getDashboardStats().catch(() => ({ data: {} })),
        roomAPI.getRoomStats().catch(() => ({ data: {} })),
        roomAPI.getRooms().catch(() => ({ data: [] })),
        reservationAPI.getReservations().catch(() => ({ data: [] }))
      ]);

      setStats(dashboardRes.data || {});
      setRoomStats(roomsRes.data || {});
      setRooms(allRoomsRes.data || []);
      setRecentReservations(Array.isArray(resRes.data) ? resRes.data.slice(0, 5) : []);
    } catch (error) {
      toast.error('Failed to load operations dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const todayFormatted = new Date().toLocaleDateString('en-US', { 
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
  });

  const getFilteredRooms = () => {
    if (roomFilter === 'all') return rooms;
    return rooms.filter(r => (r.status || '').toLowerCase() === roomFilter.toLowerCase());
  };

  if (loading) {
    return (
      <div>
        <div style={{ marginBottom: '2rem' }}>
          <div className="skeleton skeleton-title" style={{ width: '280px', height: '32px' }} />
          <div className="skeleton skeleton-text" style={{ width: '400px', marginTop: '0.5rem' }} />
        </div>
        <StatsSkeleton count={5} />
        <div className="skeleton skeleton-card" style={{ height: '240px', marginTop: '1.5rem' }} />
      </div>
    );
  }

  const occupancyRate = roomStats?.occupancyRate || 0;
  const filteredRoomsList = getFilteredRooms();

  return (
    <div>
      {/* ----------------------------------------------------
          1. Header & Live Operational Status Banner
          ---------------------------------------------------- */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        marginBottom: '1.75rem' 
      }}>
        <div>
          <h1 style={{ 
            fontFamily: 'Poppins, sans-serif', 
            fontSize: '1.75rem', 
            fontWeight: 700, 
            color: '#162E24',
            margin: '0 0 0.35rem 0',
            letterSpacing: '-0.02em'
          }}>
            {getGreeting()}, {user?.name?.split(' ')[0] || 'Staff'}
          </h1>
          <p style={{ color: '#64748B', fontSize: '0.9rem', margin: 0 }}>
            {todayFormatted} &bull; Serendib Sanctuary Hotel Operations Control Center
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: '0.45rem',
            padding: '0.4rem 0.85rem',
            background: '#F0FDF4',
            border: '1px solid #BBF7D0',
            borderRadius: '9999px',
            color: '#15803D',
            fontSize: '0.78rem',
            fontWeight: 600
          }}>
            <FaCheckCircle size={11} /> Real-Time Live Sync
          </span>

          <button 
            type="button" 
            onClick={fetchDashboardData}
            className="btn btn-outline btn-sm"
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '0.4rem', 
              background: '#FFFFFF',
              borderColor: 'rgba(22, 46, 36, 0.2)',
              color: '#162E24',
              borderRadius: '6px',
              padding: '0.4rem 0.85rem',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
            title="Refresh dashboard metrics"
          >
            <FaSyncAlt size={11} /> Refresh
          </button>
        </div>
      </div>

      {/* ----------------------------------------------------
          2. Row 1: Executive Operational KPIs (5 Cards)
          ---------------------------------------------------- */}
      <div className="pms-kpi-grid">
        {/* KPI 1: Occupancy Rate */}
        <div className="pms-kpi-card">
          <div className="pms-kpi-header">
            <span className="pms-kpi-label">Occupancy Rate</span>
            <div className="pms-kpi-icon-wrap forest">
              <FaBed />
            </div>
          </div>
          <div className="pms-kpi-value">{occupancyRate}%</div>
          <div className="pms-kpi-subtext">
            <span>{roomStats?.occupiedRooms || 0} of {roomStats?.totalRooms || 0} Rooms Occupied</span>
          </div>
          <div style={{ width: '100%', height: '4px', background: '#E2E8F0', borderRadius: '9999px', marginTop: '0.75rem', overflow: 'hidden' }}>
            <div style={{ width: `${occupancyRate}%`, height: '100%', background: '#162E24', borderRadius: '9999px' }} />
          </div>
        </div>

        {/* KPI 2: Checking In Today */}
        <div className="pms-kpi-card">
          <div className="pms-kpi-header">
            <span className="pms-kpi-label">Today&apos;s Arrivals</span>
            <div className="pms-kpi-icon-wrap green">
              <FaUserCheck />
            </div>
          </div>
          <div className="pms-kpi-value">{stats?.checkingInToday || 0}</div>
          <div className="pms-kpi-subtext">
            <span>Confirmed Guest Check-ins Scheduled</span>
          </div>
        </div>

        {/* KPI 3: Checking Out Today */}
        <div className="pms-kpi-card">
          <div className="pms-kpi-header">
            <span className="pms-kpi-label">Today&apos;s Departures</span>
            <div className="pms-kpi-icon-wrap red">
              <FaUserTimes />
            </div>
          </div>
          <div className="pms-kpi-value">{stats?.checkingOutToday || 0}</div>
          <div className="pms-kpi-subtext">
            <span>Folio Settled & Pending Check-outs</span>
          </div>
        </div>

        {/* KPI 4: In-House Guests / Occupancy */}
        <div className="pms-kpi-card">
          <div className="pms-kpi-header">
            <span className="pms-kpi-label">In-House Stays</span>
            <div className="pms-kpi-icon-wrap blue">
              <FaCalendarCheck />
            </div>
          </div>
          <div className="pms-kpi-value">{stats?.currentOccupancy || 0}</div>
          <div className="pms-kpi-subtext">
            <span>{roomStats?.availableRooms || 0} Rooms Available for Sale</span>
          </div>
        </div>

        {/* KPI 5: Revenue Today */}
        <div className="pms-kpi-card">
          <div className="pms-kpi-header">
            <span className="pms-kpi-label">Revenue Today</span>
            <div className="pms-kpi-icon-wrap brass">
              <FaMoneyBillWave />
            </div>
          </div>
          <div className="pms-kpi-value" style={{ color: 'var(--c-forest-deep, #162E24)' }}>
            Rs. {(stats?.revenueToday || 0).toLocaleString()}
          </div>
          <div className="pms-kpi-subtext">
            <span>Direct & Front-Desk Folios</span>
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------
          3. Row 2: Room Status Overview Board
          ---------------------------------------------------- */}
      <div className="pms-panel-card">
        <div className="pms-panel-header">
          <div className="pms-panel-title-group">
            <h2 className="pms-panel-title">Room Status Board</h2>
            <span className="pms-panel-badge">{rooms.length} Total Units</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '0.25rem', background: '#F1F5F9', padding: '3px', borderRadius: '6px' }}>
              {['all', 'available', 'occupied', 'cleaning', 'maintenance'].map((filterKey) => (
                <button
                  key={filterKey}
                  type="button"
                  onClick={() => setRoomFilter(filterKey)}
                  style={{
                    padding: '0.3rem 0.75rem',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    textTransform: 'capitalize',
                    cursor: 'pointer',
                    background: roomFilter === filterKey ? '#FFFFFF' : 'transparent',
                    color: roomFilter === filterKey ? '#162E24' : '#64748B',
                    boxShadow: roomFilter === filterKey ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {filterKey}
                </button>
              ))}
            </div>

            <Link 
              to="/rooms" 
              style={{ 
                fontSize: '0.78rem', 
                fontWeight: 600, 
                color: 'var(--c-brass, #B68C48)', 
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                marginLeft: '0.5rem'
              }}
            >
              <span>Manage Inventory</span>
              <FaArrowRight size={10} />
            </Link>
          </div>
        </div>

        <div className="pms-panel-body">
          {filteredRoomsList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 0', color: '#64748B' }}>
              No rooms currently match the selected status filter.
            </div>
          ) : (
            <div className="pms-room-chips-grid">
              {filteredRoomsList.map((room) => {
                const s = (room.status || 'Available').toLowerCase();
                let dotClass = 'available';
                if (s === 'occupied') dotClass = 'occupied';
                else if (s === 'cleaning') dotClass = 'cleaning';
                else if (s === 'maintenance' || s === 'out of order') dotClass = 'maintenance';

                return (
                  <div key={room._id} className="pms-room-chip">
                    <div className="pms-room-chip-top">
                      <span className="pms-room-number">#{room.roomNumber}</span>
                      <span className="pms-room-floor">Floor {room.floor || 1}</span>
                    </div>

                    <div className="pms-room-type">{room.roomType || 'Deluxe'}</div>

                    <div className="pms-room-status-indicator">
                      <span className={`pms-room-status-dot ${dotClass}`} />
                      <span>{room.status || 'Available'}</span>
                    </div>

                    <div style={{ marginTop: '0.65rem', paddingTop: '0.5rem', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#64748B' }}>
                      <span>Cleaning: {room.cleaningStatus || 'Clean'}</span>
                      <span style={{ fontWeight: 600, color: '#162E24' }}>Rs. {room.basePrice?.toLocaleString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ----------------------------------------------------
          4. Row 3: Quick Operations Actions Grid
          ---------------------------------------------------- */}
      <div style={{ marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', margin: '0 0 0.85rem 0' }}>
          Front Office Quick Actions
        </h3>
        <div className="pms-quick-grid">
          <Link to="/reservations/new" className="pms-action-tile">
            <div className="pms-action-tile-icon">
              <FaPlus />
            </div>
            <span>New Reservation</span>
          </Link>

          <Link to="/guests/new" className="pms-action-tile">
            <div className="pms-action-tile-icon">
              <FaUser />
            </div>
            <span>Register Guest</span>
          </Link>

          <Link to="/housekeeping" className="pms-action-tile">
            <div className="pms-action-tile-icon">
              <FaBroom />
            </div>
            <span>Housekeeping Tasks</span>
          </Link>

          <Link to="/maintenance" className="pms-action-tile">
            <div className="pms-action-tile-icon">
              <FaTools />
            </div>
            <span>Maintenance Tickets</span>
          </Link>

          <Link to="/expenses/new" className="pms-action-tile">
            <div className="pms-action-tile-icon">
              <FaReceipt />
            </div>
            <span>Record Expense</span>
          </Link>

          <Link to="/invoices" className="pms-action-tile">
            <div className="pms-action-tile-icon">
              <FaFileInvoiceDollar />
            </div>
            <span>Billing & Invoices</span>
          </Link>
        </div>
      </div>

      {/* ----------------------------------------------------
          5. Row 4: Recent Reservations & Activity Table
          ---------------------------------------------------- */}
      <div className="pms-panel-card">
        <div className="pms-panel-header">
          <div className="pms-panel-title-group">
            <h2 className="pms-panel-title">Recent Front Office Reservations</h2>
            <span className="pms-panel-badge">Latest Records</span>
          </div>

          <Link 
            to="/reservations" 
            style={{ 
              fontSize: '0.78rem', 
              fontWeight: 600, 
              color: 'var(--c-brass, #B68C48)', 
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem'
            }}
          >
            <span>View All Reservations</span>
            <FaArrowRight size={10} />
          </Link>
        </div>

        <div className="pms-table-container">
          {recentReservations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem 0', color: '#64748B' }}>
              No recent reservation records found.
            </div>
          ) : (
            <table className="pms-data-table">
              <thead>
                <tr>
                  <th>Res #</th>
                  <th>Guest Name</th>
                  <th>Room Assigned</th>
                  <th>Check In</th>
                  <th>Check Out</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {recentReservations.map((res) => {
                  const s = (res.status || 'Confirmed').toLowerCase();
                  let badgeClass = 'confirmed';
                  if (s === 'checked-in') badgeClass = 'checked-in';
                  else if (s === 'checked-out') badgeClass = 'checked-out';
                  else if (s === 'cancelled' || s === 'no-show') badgeClass = 'cancelled';

                  const resNumber = res.reservationNumber || `RES-${res._id?.slice(-6).toUpperCase()}`;
                  const guestName = res.guest?.name || res.customer?.name || 'Walk-in Guest';
                  const roomNumber = res.room?.roomNumber ? `Room ${res.room.roomNumber}` : 'Unassigned';

                  return (
                    <tr key={res._id}>
                      <td style={{ fontWeight: 600, color: '#162E24' }}>{resNumber}</td>
                      <td>{guestName}</td>
                      <td>{roomNumber}</td>
                      <td>{new Date(res.checkInDate).toLocaleDateString()}</td>
                      <td>{new Date(res.checkOutDate).toLocaleDateString()}</td>
                      <td>
                        <span className={`badge-clean ${badgeClass}`}>
                          {res.status}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>Rs. {(res.totalAmount || 0).toLocaleString()}</td>
                      <td>
                        <Link 
                          to={`/reservations/${res._id}`}
                          style={{ color: 'var(--c-brass, #B68C48)', fontWeight: 600, fontSize: '0.8rem', textDecoration: 'none' }}
                        >
                          View Folio &rarr;
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
