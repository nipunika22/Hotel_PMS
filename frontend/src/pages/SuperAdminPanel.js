import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  FaBars, FaBuilding, FaUsers, FaShieldAlt, FaCalendarCheck, FaBed,
  FaUserFriends, FaChartLine, FaClipboardList, FaCog, FaHome,
  FaSignOutAlt, FaSearch, FaChevronLeft, FaChevronRight, FaPlus,
  FaTimes, FaSyncAlt, FaEdit, FaEye, FaUtensils, FaGlassCheers,
  FaUserCheck
} from 'react-icons/fa';
import { toast } from 'react-toastify';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement } from 'chart.js';
import { Doughnut, Line } from 'react-chartjs-2';
import { useAuth } from '../context/AuthContext';
import { superAdminAPI } from '../services/api';
import Attendance from './Attendance';
import './SuperAdminPanel.css';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement);

const NAV = [
  { path: '/super-admin/dashboard', label: 'Dashboard', icon: FaHome, group: 'Portfolio' },
  { path: '/super-admin/properties', label: 'Properties', icon: FaBuilding, group: 'Portfolio' },
  { path: '/super-admin/admins', label: 'Department Admins', icon: FaShieldAlt, group: 'Access' },
  { path: '/super-admin/staff', label: 'Staff', icon: FaUsers, group: 'Access' },
  { path: '/super-admin/users', label: 'All Users', icon: FaUserFriends, group: 'Access' },
  { path: '/super-admin/attendance', label: 'Attendance', icon: FaClipboardList, group: 'Operations' },
  { path: '/super-admin/roles', label: 'Roles & Permissions', icon: FaShieldAlt, group: 'Access' },
  { path: '/super-admin/reservations', label: 'Reservations', icon: FaCalendarCheck, group: 'Operations' },
  { path: '/super-admin/rooms', label: 'Rooms', icon: FaBed, group: 'Operations' },
  { path: '/super-admin/customers', label: 'Customers', icon: FaUserFriends, group: 'Operations' },
  { path: '/super-admin/reports', label: 'Reports', icon: FaChartLine, group: 'Insights' },
  { path: '/super-admin/audit-logs', label: 'Audit Logs', icon: FaClipboardList, group: 'Insights' },
  { path: '/super-admin/settings', label: 'System Settings', icon: FaCog, group: 'System' },
  { path: '/rooms/dashboard', label: 'Room Dashboard', icon: FaBed, group: 'Departments' },
  { path: '/rooms', label: 'Room Operations', icon: FaBed, group: 'Departments' },
  { path: '/reservations', label: 'Reservation Operations', icon: FaCalendarCheck, group: 'Departments' },
  { path: '/guests', label: 'Guest Profiles', icon: FaUserFriends, group: 'Departments' },
  { path: '/admin/restaurants/dashboard', label: 'Restaurant Dashboard', icon: FaUtensils, group: 'Departments' },
  { path: '/admin/restaurants', label: 'Restaurants & Dining', icon: FaUtensils, group: 'Departments' },
  { path: '/admin/dining-offers', label: 'Dining Offers', icon: FaUtensils, group: 'Departments' },
  { path: '/admin/events/dashboard', label: 'Event Dashboard', icon: FaGlassCheers, group: 'Departments' },
  { path: '/admin/events', label: 'Events & Venues', icon: FaGlassCheers, group: 'Departments' }
];

const TITLE = Object.fromEntries(NAV.map((item) => [item.path, item.label]));
const STAFF_ROLES = ['admin', 'manager', 'staff', 'finance', 'housekeeping', 'maintenance'];

function errorMessage(error) {
  return error?.response?.data?.error || error?.message || 'The request could not be completed.';
}

function metricTemp(value) {
  return value == null ? '—' : Number(value).toLocaleString();
}

function usePagedResource(resource, filters = {}) {
  const { search = '', status = '', propertyId = '', from = '', to = '', role = '', roomType = '', departmentAccess = '', refresh = 0, page = 1, ...extraParams } = filters;
  const [data, setData] = useState({ items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const params = { page, pageSize: 20, ...extraParams };
    if (search.trim()) params.search = search.trim();
    if (status) params.status = status;
    if (propertyId) params.propertyId = propertyId;
    if (from) params.from = from;
    if (to) params.to = to;
    if (role) params.role = role;
    if (roomType) params.roomType = roomType;
    if (departmentAccess) params.departmentAccess = departmentAccess;
    setLoading(true);
    setError('');
    superAdminAPI[resource](params).then((response) => {
      if (active) setData(response.data);
    }).catch((requestError) => {
      if (active) setError(errorMessage(requestError));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [resource, search, status, propertyId, from, to, role, roomType, departmentAccess, refresh, page, JSON.stringify(extraParams)]);

  return { ...data, loading, error };
}

function PanelHeading({ title, subtitle, action }) {
  return <div className="sa-heading"><div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;
}

function Pagination({ pagination, page, setPage }) {
  if (!pagination || pagination.totalPages < 2) return null;
  return <div className="sa-pagination"><span>{pagination.total} records · Page {pagination.page} of {pagination.totalPages}</span><div>
    <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><FaChevronLeft /></button>
    <button type="button" disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)} aria-label="Next page"><FaChevronRight /></button>
  </div></div>;
}

function DataTablePage({ title, subtitle, resource, resourceParams = {}, columns, filters = [], roleOptions = STAFF_ROLES, actions, empty = 'No records found.', viewDetails = false }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [role, setRole] = useState('');
  const [roomType, setRoomType] = useState('');
  const [departmentAccess, setDepartmentAccess] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [properties, setProperties] = useState([]);
  const [departmentOptions, setDepartmentOptions] = useState([]);
  const [selected, setSelected] = useState(null);
  const result = usePagedResource(resource, { search, status, propertyId, role, roomType, departmentAccess, from, to, page, refresh, ...resourceParams });
  const needsProperties = filters.includes('property');
  const needsDepartmentOptions = filters.includes('departmentAccess');
  const statusOptions = filters.find((item) => typeof item === 'object')?.statuses || [];
  const visibleColumns = viewDetails ? [...columns, { key: 'viewDetails', label: 'Details', render: (item) => <button className="sa-icon-button sa-edit-button" onClick={() => setSelected(item)}><FaEye /> View</button> }] : columns;

  useEffect(() => {
    if (!needsProperties) return;
    superAdminAPI.getProperties({ page: 1, pageSize: 100 }).then((response) => setProperties(response.data.items || [])).catch(() => setProperties([]));
  }, [needsProperties]);
  useEffect(() => {
    if (!needsDepartmentOptions) return;
    superAdminAPI.getRoles().then((response) => setDepartmentOptions((response.data.departments || []).map((value) => [value, response.data.departmentLabels?.[value] || value]))).catch(() => setDepartmentOptions([]));
  }, [needsDepartmentOptions]);

  const setAndResetPage = (setter) => (event) => { setter(event.target.value); setPage(1); };
  return <>
    <PanelHeading title={title} subtitle={subtitle} action={<button className="sa-button sa-button-secondary" onClick={() => setRefresh((v) => v + 1)}><FaSyncAlt /> Refresh</button>} />
    <div className="sa-toolbar">
      <label className="sa-search"><FaSearch /><input value={search} onChange={setAndResetPage(setSearch)} placeholder="Search records" aria-label="Search records" /></label>
      {filters.includes('status') && <select value={status} onChange={setAndResetPage(setStatus)} aria-label="Filter by status"><option value="">All statuses</option>{statusOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select>}
      {filters.includes('role') && <select value={role} onChange={setAndResetPage(setRole)} aria-label="Filter by role"><option value="">All roles</option>{roleOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select>}
      {filters.includes('departmentAccess') && <select value={departmentAccess} onChange={setAndResetPage(setDepartmentAccess)} aria-label="Filter by department access"><option value="">All departments</option>{departmentOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}
      {filters.includes('roomType') && <select value={roomType} onChange={setAndResetPage(setRoomType)} aria-label="Filter by room type"><option value="">All room types</option>{['Single', 'Double', 'Twin', 'Suite', 'Deluxe', 'Presidential', 'Family', 'Connecting'].map((item) => <option key={item}>{item}</option>)}</select>}
      {filters.includes('property') && <select value={propertyId} onChange={setAndResetPage(setPropertyId)} aria-label="Filter by property"><option value="">All properties</option>{properties.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select>}
      {filters.includes('dates') && <><label className="sa-date">From<input type="date" value={from} onChange={setAndResetPage(setFrom)} /></label><label className="sa-date">To<input type="date" value={to} onChange={setAndResetPage(setTo)} /></label></>}
      {actions}
      {(search || status || propertyId || role || roomType || departmentAccess || from || to) && <button type="button" className="sa-button sa-button-secondary" onClick={() => { setSearch(''); setStatus(''); setPropertyId(''); setRole(''); setRoomType(''); setDepartmentAccess(''); setFrom(''); setTo(''); setPage(1); }}>Clear filters</button>}
    </div>
    <div className="sa-table-wrap">
      {result.loading ? <div className="sa-state"><span className="sa-spinner" /> Loading {title.toLowerCase()}…</div>
        : result.error ? <div className="sa-state sa-error"><p>{result.error}</p><button className="sa-button sa-button-secondary" onClick={() => setRefresh((v) => v + 1)}>Try again</button></div>
          : result.items?.length ? <table className="sa-table"><thead><tr>{visibleColumns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{result.items.map((item) => <tr key={item._id}>{visibleColumns.map((column) => <td key={column.key}>{column.render ? column.render(item) : (item[column.key] ?? '—')}</td>)}</tr>)}</tbody></table>
            : <div className="sa-state"><strong>{empty}</strong><span>Change the search or filters, or refresh to check again.</span></div>}
    </div>
    {!result.loading && !result.error && <Pagination pagination={result.pagination} page={page} setPage={setPage} />}
    {selected && <div className="sa-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelected(null); }}><section className="sa-modal"><div className="sa-modal-head"><h2>Reservation {selected.reservationNumber}</h2><button className="sa-icon-button" onClick={() => setSelected(null)} aria-label="Close"><FaTimes /></button></div><div className="sa-detail-grid">
      <span>Customer</span><strong>{selected.guest ? `${selected.guest.firstName} ${selected.guest.lastName}` : 'Not linked'}</strong>
      <span>Email</span><strong>{selected.guest?.email || '—'}</strong>
      <span>Property</span><strong>{selected.property?.name || '—'}</strong>
      <span>Room</span><strong>{selected.room?.roomNumber || 'Unassigned'} {selected.room?.roomType ? `· ${selected.room.roomType}` : ''}</strong>
      <span>Stay</span><strong>{new Date(selected.checkInDate).toLocaleDateString()} – {new Date(selected.checkOutDate).toLocaleDateString()}</strong>
      <span>Guests</span><strong>{selected.numberOfGuests ?? ((selected.numberOfAdults || 0) + (selected.numberOfChildren || 0))}</strong>
      <span>Reservation status</span><strong><StatusPill value={selected.status} /></strong>
      <span>Payment status</span><strong><StatusPill value={selected.paymentStatus} /></strong>
      <span>Created</span><strong>{new Date(selected.createdAt).toLocaleString()}</strong>
    </div></section></div>}
  </>;
}

function StatusPill({ value }) {
  const status = String(value || 'Unknown');
  return <span className={`sa-status sa-status-${status.toLowerCase().replace(/[^a-z]+/g, '-')}`}>{status}</span>;
}

function DashboardPage() {
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [propertyId, setPropertyId] = useState('');
  const [properties, setProperties] = useState([]);
  const [propertyError, setPropertyError] = useState('');
  const [trend, setTrend] = useState([]);
  const [trendPeriod, setTrendPeriod] = useState('30d');
  const [trendLoading, setTrendLoading] = useState(true);
  const [trendError, setTrendError] = useState('');
  const trendRange = useMemo(() => {
    const to = new Date();
    const from = trendPeriod === 'month' ? new Date(to.getFullYear(), to.getMonth(), 1) : new Date(to);
    if (trendPeriod !== 'month') from.setDate(from.getDate() - (trendPeriod === '7d' ? 6 : 29));
    const asDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return { from: asDate(from), to: asDate(to) };
  }, [trendPeriod]);
  const trendPoints = useMemo(() => {
    const counts = new Map(trend.map((item) => [item._id, Number(item.count) || 0]));
    const cursor = new Date(`${trendRange.from}T00:00:00Z`);
    const last = new Date(`${trendRange.to}T00:00:00Z`);
    const points = [];
    while (cursor <= last) {
      const key = cursor.toISOString().slice(0, 10);
      points.push({ date: key, count: counts.get(key) || 0 });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return points;
  }, [trend, trendRange]);
  useEffect(() => {
    let active = true;
    superAdminAPI.getProperties({ page: 1, pageSize: 100 })
      .then((res) => { if (active) { setProperties(res.data.items || []); setPropertyError(''); } })
      .catch((err) => { if (active) setPropertyError(errorMessage(err)); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    superAdminAPI.getDashboard(propertyId ? { propertyId } : {}).then((res) => { if (active) setData(res.data); }).catch((err) => { if (active) setError(errorMessage(err)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [propertyId, refresh]);
  useEffect(() => {
    let active = true;
    setTrendLoading(true); setTrendError('');
    superAdminAPI.getReports({ ...trendRange, ...(propertyId ? { propertyId } : {}) })
      .then((res) => { if (active) setTrend(res.data.reservationTrends || []); })
      .catch((err) => { if (active) setTrendError(errorMessage(err)); })
      .finally(() => { if (active) setTrendLoading(false); });
    return () => { active = false; };
  }, [propertyId, refresh, trendRange]);
  const summary = data?.summary;
  const admins = summary?.departmentAdmins;
  const cards = [
    ['Department Admins', admins?.total, `Active ${metricTemp(admins?.active)} · Inactive ${metricTemp(admins?.inactive)}`, '/super-admin/admins', FaShieldAlt],
    ['Staff', summary?.staff, `${metricTemp(summary?.activeStaff)} active operational accounts`, '/super-admin/staff', FaUsers],
    ['Rooms', summary?.rooms, `${metricTemp(summary?.availableRooms)} available · ${metricTemp(summary?.occupiedRooms)} occupied`, '/super-admin/rooms', FaBed],
    ['Reservations', summary?.reservations, `All statuses · ${metricTemp(summary?.upcomingCheckIns)} upcoming check-ins · ${metricTemp(summary?.pendingPaymentReservations)} awaiting payment`, '/super-admin/reservations', FaCalendarCheck],
    ['Restaurants', summary?.restaurants, 'Restaurant records', null, FaUtensils],
    ['Dining Offers', summary?.activeDiningOffers, 'Active persisted offers', null, FaUtensils],
    ['Events', summary?.upcomingEvents, `${metricTemp(summary?.pendingEventEnquiries)} pending enquiries`, null, FaGlassCheers],
    ["Today's Attendance", summary?.checkedInToday, 'Staff with a recorded check-in today', '/super-admin/attendance', FaClipboardList]
  ];
  const reservationStatuses = summary?.reservationsByStatus ? Object.entries(summary.reservationsByStatus) : [];
  const metricValue = (value) => value == null ? '—' : Number(value).toLocaleString();
  const chartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, tooltip: { enabled: true } } };
  const roomStatusDistribution = summary?.roomStatusDistribution || [];
  const roomChart = { labels: roomStatusDistribution.map((item) => item._id), datasets: [{ data: roomStatusDistribution.map((item) => item.count), backgroundColor: ['#4f8068', '#d9ad5c', '#6a91aa', '#b77d76', '#9eaa9f', '#856bb3', '#b8c8bf'], borderWidth: 0 }] };
  const reservationChart = { labels: reservationStatuses.map(([status]) => status), datasets: [{ data: reservationStatuses.map(([, count]) => count), backgroundColor: ['#4f8068', '#d9ad5c', '#6a91aa', '#b77d76', '#9eaa9f'], borderWidth: 0 }] };
  const adminDistribution = admins?.distribution || [];
  const adminChart = { labels: adminDistribution.map((item) => item.department[0].toUpperCase() + item.department.slice(1)), datasets: [{ label: 'Department assignments', data: adminDistribution.map((item) => item.count), backgroundColor: '#54816d', borderRadius: 5 }] };
  const attendanceEntries = Object.entries(summary?.todayAttendance || {});
  const attendanceChart = { labels: attendanceEntries.map(([status]) => status), datasets: [{ data: attendanceEntries.map(([, count]) => count), backgroundColor: ['#4f8068', '#d9ad5c', '#b77d76', '#8b9b93'], borderWidth: 0 }] };
  const trendChart = { labels: trendPoints.map((item) => item.date), datasets: [{ label: 'Reservation records created (all statuses)', data: trendPoints.map((item) => item.count), borderColor: '#4f8068', backgroundColor: 'rgba(79, 128, 104, .14)', fill: true, tension: .28, pointRadius: 2 }] };
  const hasReservationStatuses = reservationStatuses.some(([, count]) => Number(count) > 0);
  const hasAttendance = attendanceEntries.some(([, count]) => Number(count) > 0);
  return <>
    <PanelHeading title="Super Admin Dashboard" subtitle="Overview of hotel operations, administration, and system activity." action={<div className="sa-heading-actions"><label className="sa-dashboard-filter"><span>Property</span><select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} aria-label="Choose property" disabled={Boolean(propertyError)}><option value="">All properties</option>{properties.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label><button className="sa-button sa-button-secondary" onClick={() => setRefresh((v) => v + 1)} disabled={loading || trendLoading}><FaSyncAlt /> Refresh</button></div>} />
    {propertyError && <div className="sa-form-hint sa-filter-error" role="status">Property filter unavailable: {propertyError}. Showing the all-properties summary.</div>}
    {loading ? <div className="sa-card-grid">{Array.from({ length: 8 }).map((_, i) => <div className="sa-card sa-card-loading" key={i} />)}</div> : error ? <div className="sa-state sa-error"><p>{error}</p><button className="sa-button sa-button-secondary" onClick={() => setRefresh((v) => v + 1)}>Retry overview</button></div> : <>
      <div className="sa-card-grid">{cards.map(([label, value, note, to, Icon]) => { const content = <><Icon /><span>{label}</span><strong>{metricValue(value)}</strong><small>{note}</small></>; return to ? <Link className="sa-card sa-card-link" to={to} key={label}>{content}</Link> : <article className="sa-card" key={label}>{content}</article>; })}</div>
      <div className="sa-info-banner"><strong>Revenue summary unavailable</strong><span>{summary?.revenue?.reason || 'The current payment data is not reconciled into an auditable revenue total.'}</span></div>
      <div className="sa-info-banner"><strong>Attendance policy</strong><span>{summary?.attendancePolicy || 'No work schedule is configured. Absence and lateness are not inferred automatically.'} Staff not yet checked in cannot be calculated without configured schedules.</span></div>
      <div className="sa-two-column">
        <section className="sa-section-card sa-dashboard-trend"><div className="sa-section-heading"><div><h2>Reservation trend</h2><p>Reservation records created, all statuses · {trendRange.from} to {trendRange.to}</p></div><div className="sa-chart-actions"><select value={trendPeriod} onChange={(event) => setTrendPeriod(event.target.value)} aria-label="Reservation trend period"><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="month">This month</option></select><Link to="/super-admin/reports" className="sa-text-link">Open reports <FaChartLine /></Link></div></div>{trendLoading ? <div className="sa-state sa-small-state"><span className="sa-spinner" /> Loading trend…</div> : trendError ? <div className="sa-inline-error" role="alert">Trend unavailable. <button className="sa-link-button" onClick={() => setRefresh((v) => v + 1)}>Retry</button></div> : trendPoints.some((item) => item.count > 0) ? <><div className="sa-chart-area sa-trend-chart"><Line data={trendChart} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }} /></div><small className="sa-chart-note">{trendPoints.reduce((sum, item) => sum + item.count, 0).toLocaleString()} records in this date range. Grouped by reservation creation date; cancelled records remain included as records.</small></> : <div className="sa-inline-empty">No reservation records were created in this period.</div>}</section>
        <section className="sa-section-card sa-quick-card"><h2>Quick actions</h2><div className="sa-quick-actions"><Link to="/super-admin/properties"><FaPlus /> Add property</Link><Link to="/super-admin/admins?create=1"><FaPlus /> Add Department Admin</Link><Link to="/super-admin/admins"><FaShieldAlt /> Manage Department Admins</Link><Link to="/super-admin/staff"><FaUsers /> Manage staff</Link><Link to="/super-admin/users"><FaUserFriends /> Manage all users</Link><Link to="/super-admin/attendance"><FaClipboardList /> Review attendance</Link><Link to="/super-admin/reservations"><FaCalendarCheck /> View reservations</Link><Link to="/super-admin/reports"><FaChartLine /> Open reports</Link><Link to="/super-admin/audit-logs"><FaClipboardList /> Review audit logs</Link></div></section>
        <section className="sa-section-card"><h2>Recent reservations</h2>{data?.recentReservations?.length ? <div className="sa-compact-list">{data.recentReservations.map((reservation) => <div className="sa-list-row" key={reservation._id}><div><strong>{reservation.reservationNumber}</strong><span>{reservation.property?.name || 'Property unavailable'} · {reservation.room?.roomNumber || 'Room unassigned'}</span></div><StatusPill value={reservation.status} /></div>)}</div> : <div className="sa-inline-empty">No reservation records yet.</div>}</section>
        <section className="sa-section-card"><h2>Recent customer registrations</h2>{data?.recentCustomers?.length ? <div className="sa-compact-list">{data.recentCustomers.map((customer) => <div className="sa-list-row" key={customer._id}><div><strong>{customer.name}</strong><span>Registered {new Date(customer.createdAt).toLocaleDateString()}</span></div><StatusPill value="Customer" /></div>)}</div> : <div className="sa-inline-empty">No customer accounts found.</div>}</section>
        <section className="sa-section-card"><div className="sa-section-heading"><h2>Reservation status</h2><Link to="/super-admin/reservations" className="sa-text-link">View all <FaCalendarCheck /></Link></div>{reservationStatuses.length ? <div className="sa-status-summary">{reservationStatuses.map(([status, count]) => <div key={status}><StatusPill value={status} /><strong>{Number(count).toLocaleString()}</strong></div>)}</div> : <div className="sa-inline-empty">Reservation status summary unavailable.</div>}</section>
        <section className="sa-section-card"><div className="sa-section-heading"><h2>Room status</h2><Link to="/super-admin/rooms" className="sa-text-link">View rooms <FaBed /></Link></div>{roomStatusDistribution.length ? <><small className="sa-chart-note">{metricValue(summary?.rooms)} active rooms; chart total {roomStatusDistribution.reduce((sum, item) => sum + Number(item.count || 0), 0).toLocaleString()}.</small><div className="sa-chart-area"><Doughnut data={roomChart} options={chartOptions} /></div></> : <div className="sa-inline-empty">No active room records.</div>}</section>
        <section className="sa-section-card"><h2>Reservation status distribution</h2>{hasReservationStatuses ? <div className="sa-chart-area"><Doughnut data={reservationChart} options={chartOptions} /></div> : <div className="sa-inline-empty">No reservation status records.</div>}</section>
        <section className="sa-section-card"><div className="sa-section-heading"><h2>Department Admin distribution</h2><Link to="/super-admin/admins" className="sa-text-link">Manage admins <FaShieldAlt /></Link></div>{adminDistribution.length ? <><div className="sa-chart-area"><Doughnut data={adminChart} options={chartOptions} /></div><small className="sa-chart-note">Includes admins of every status. Counts are permission assignments; an administrator assigned to multiple departments appears in each category.</small></> : <div className="sa-inline-empty">No department assignments recorded.</div>}</section>
        <section className="sa-section-card"><div className="sa-section-heading"><h2>Today's attendance</h2><Link to="/super-admin/attendance" className="sa-text-link">View attendance <FaClipboardList /></Link></div>{hasAttendance ? <><div className="sa-chart-area"><Doughnut data={attendanceChart} options={chartOptions} /></div><small className="sa-chart-note">Actual attendance records by recorded status, using each property's local date. No schedule is configured, so staff not yet checked in are not classified as absent.</small></> : <div className="sa-inline-empty">No attendance records for today.</div>}</section>
        <section className="sa-section-card"><h2>Properties</h2>{data?.propertySummaries?.length ? <div className="sa-compact-list">{data.propertySummaries.map((property) => <div className="sa-list-row" key={property._id}><div><strong>{property.name}</strong><span>{property.code} · {property.rooms} rooms · {property.reservations} reservations</span></div><StatusPill value={property.status} /></div>)}</div> : <div className="sa-inline-empty">No properties found.</div>}</section>
        <section className="sa-section-card"><h2>Recent administrative activity</h2>{data?.recentAdministrativeActivity?.length ? <div className="sa-compact-list">{data.recentAdministrativeActivity.map((entry) => <div className="sa-list-row" key={entry._id}><div><strong>{entry.summary}</strong><span>{entry.actorName} · {entry.property?.name || entry.resourceType} · {new Date(entry.createdAt).toLocaleString()}</span></div><StatusPill value={entry.action} /></div>)}</div> : <div className="sa-inline-empty">No administrative changes recorded yet.</div>}</section>
      </div>
      <p className="sa-footnote">Counts use the existing Reservation and User records. Legacy Booking records are kept separate. Revenue is intentionally omitted until financial records can be reconciled.</p>
    </>}
  </>;
}

function PropertyForm({ initial, onClose, onSaved }) {
  const [chains, setChains] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: initial?.name || '', code: initial?.code || '', chain: initial?.chain?._id || '', city: initial?.city || '', country: initial?.country || '', currency: initial?.currency || 'LKR', timezone: initial?.timezone || 'Asia/Colombo', contactEmail: initial?.contactEmail || '', contactPhone: initial?.contactPhone || '', status: initial?.status || 'Active' });
  useEffect(() => { superAdminAPI.getChains().then((res) => { const items = res.data.items || []; setChains(items); if (!initial && items.length) setForm((old) => ({ ...old, chain: items[0]._id })); }).catch((err) => setError(errorMessage(err))); }, [initial]);
  const set = (key) => (event) => setForm((old) => ({ ...old, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    if (initial?.status === 'Active' && form.status !== 'Active' && !window.confirm(`Change ${initial.name} to ${form.status}? It will no longer be selected as the default active property.`)) return;
    setSaving(true); setError('');
    try {
      const response = initial ? await superAdminAPI.updateProperty(initial._id, form) : await superAdminAPI.createProperty(form);
      if (response.data.auditLogged === false) toast.warn('Property saved, but its audit entry could not be recorded.');
      else toast.success(initial ? 'Property updated.' : 'Property created.');
      onSaved(response.data.property);
    } catch (err) { setError(errorMessage(err)); } finally { setSaving(false); }
  };
  return <div className="sa-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><form className="sa-modal" onSubmit={submit} aria-label={initial ? 'Edit property' : 'Create property'}>
    <div className="sa-modal-head"><h2>{initial ? 'Edit property' : 'Add property'}</h2><button type="button" className="sa-icon-button" onClick={onClose} aria-label="Close"><FaTimes /></button></div>
    {error && <div className="sa-form-error">{error}</div>}
    <div className="sa-form-grid">
      <label>Property name<input required value={form.name} onChange={set('name')} /></label>
      <label>Property code<input required maxLength="20" value={form.code} onChange={set('code')} /></label>
      <label>Hotel chain<select required value={form.chain} onChange={set('chain')}><option value="">Choose a chain</option>{chains.map((chain) => <option key={chain._id} value={chain._id}>{chain.name} ({chain.code})</option>)}</select></label>
      <label>City<input value={form.city} onChange={set('city')} /></label>
      <label>Country<input value={form.country} onChange={set('country')} /></label>
      <label>Currency<input maxLength="3" value={form.currency} onChange={set('currency')} /></label>
      <label>Timezone<input value={form.timezone} onChange={set('timezone')} /></label>
      <label>Contact email<input type="email" value={form.contactEmail} onChange={set('contactEmail')} /></label>
      <label>Contact phone<input value={form.contactPhone} onChange={set('contactPhone')} /></label>
      <label>Status<select value={form.status} onChange={set('status')}><option>Active</option><option>Inactive</option><option>Under Maintenance</option></select></label>
    </div>
    <div className="sa-modal-actions"><button type="button" className="sa-button sa-button-secondary" onClick={onClose}>Cancel</button><button className="sa-button sa-button-primary" disabled={saving || !chains.length}>{saving ? 'Saving…' : initial ? 'Save changes' : 'Create property'}</button></div>
    {!chains.length && !error && <p className="sa-form-hint">An active hotel chain is required before adding a property.</p>}
  </form></div>;
}

function PropertyPage() {
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const columns = [
    { key: 'name', label: 'Property', render: (item) => <><strong>{item.name}</strong><small className="sa-cell-sub">{item.code}</small></> },
    { key: 'city', label: 'Location', render: (item) => [item.city, item.country].filter(Boolean).join(', ') || '—' },
    { key: 'chain', label: 'Chain', render: (item) => item.chain?.name || '—' },
    { key: 'roomCount', label: 'Rooms' },
    { key: 'reservationCount', label: 'Reservations' },
    { key: 'status', label: 'Status', render: (item) => <StatusPill value={item.status} /> },
    { key: 'actions', label: 'Actions', render: (item) => <button className="sa-icon-button sa-edit-button" onClick={() => setEditing(item)} aria-label={`Edit ${item.name}`}><FaEdit /> Edit</button> }
  ];
  return <>
    <DataTablePage key={refresh} title="Hotels & properties" subtitle="Manage property details and status. Historical reservations are preserved; property deletion is not offered." resource="getProperties" columns={columns} filters={['status', { statuses: ['Active', 'Inactive', 'Under Maintenance'] }]} actions={<button className="sa-button sa-button-primary" onClick={() => setCreating(true)}><FaPlus /> Add property</button>} />
    {(creating || editing) && <PropertyForm initial={editing} onClose={() => { setCreating(false); setEditing(null); }} onSaved={() => { setCreating(false); setEditing(null); setRefresh((v) => v + 1); }} />}
  </>;
}

function StaffForm({ onClose, onSaved, adminOnly = false }) {
  const [properties, setProperties] = useState([]);
  const [permissionConfig, setPermissionConfig] = useState({ departments: [], permissions: [], labels: {} });
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', role: adminOnly ? 'admin' : 'staff', property: '', allowedProperties: [], status: 'Active', staffId: '', department: 'General', jobTitle: '', adminDepartments: [], adminPermissions: [] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { superAdminAPI.getProperties({ page: 1, pageSize: 100 }).then((res) => setProperties(res.data.items || [])).catch((err) => setError(errorMessage(err))); if (adminOnly) superAdminAPI.getRoles().then((res) => setPermissionConfig({ departments: res.data.departments || [], permissions: res.data.permissions || [], labels: res.data.departmentLabels || {} })).catch((err) => setError(errorMessage(err))); }, [adminOnly]);
  const set = (key) => (event) => setForm((old) => ({ ...old, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setError('');
    try { const response = await (adminOnly ? superAdminAPI.createAdmin(form) : superAdminAPI.createStaff(form)); if (response.data.auditLogged === false) toast.warn('Account created, but its audit entry could not be recorded.'); else toast.success('Account created.'); onSaved(); }
    catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  };
  return <div className="sa-modal-backdrop"><form className="sa-modal" onSubmit={submit} aria-label={`Create ${adminOnly ? 'Department Admin' : 'staff'} account`}>
    <div className="sa-modal-head"><h2>Create {adminOnly ? 'Department Admin' : 'staff'} account</h2><button type="button" className="sa-icon-button" onClick={onClose} aria-label="Close"><FaTimes /></button></div>
    {error && <div className="sa-form-error">{error}</div>}
    <div className="sa-form-grid">
      <label>Full name<input required value={form.name} onChange={set('name')} /></label><label>Email<input required type="email" value={form.email} onChange={set('email')} /></label>
      <label>Phone<input required value={form.phone} onChange={set('phone')} /></label><label>Temporary password<input required minLength="10" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} /><small>At least 10 characters. The password is never returned by the API.</small></label>
      <label>Staff ID (optional)<input value={form.staffId} onChange={set('staffId')} placeholder="Generated if left blank" /></label>
      <label>{adminOnly ? 'Department profile' : 'Department'}<select value={form.department} onChange={set('department')}>{['Front Desk', 'Housekeeping', 'Maintenance', 'Finance', 'Kitchen', 'Restaurant', 'Management', 'General'].map((item) => <option key={item}>{item}</option>)}</select>{adminOnly && <small>Profile label only; access is controlled by the grants below.</small>}</label>
      <label>Job title<input value={form.jobTitle} onChange={set('jobTitle')} maxLength="100" /></label>
      {adminOnly && <fieldset className="sa-form-wide"><legend>Authorized departments</legend>{permissionConfig.departments.map((item) => <label key={item}><input type="checkbox" checked={form.adminDepartments.includes(item)} onChange={(e) => setForm((old) => ({ ...old, adminDepartments: e.target.checked ? [...old.adminDepartments, item] : old.adminDepartments.filter((value) => value !== item) }))} /> {permissionConfig.labels[item] || item}</label>)}{permissionConfig.permissions.filter((item) => !permissionConfig.departments.includes(item)).map((permission) => <label key={permission}><input type="checkbox" checked={form.adminPermissions.includes(permission)} onChange={(e) => setForm((old) => ({ ...old, adminPermissions: e.target.checked ? [...old.adminPermissions, permission] : old.adminPermissions.filter((value) => value !== permission) }))} /> {permission === 'offers.dining' ? 'Dining offers only' : permission}</label>)}</fieldset>}
      {!adminOnly && <label>Role<select value={form.role} onChange={set('role')}>{STAFF_ROLES.filter((role) => role !== 'admin').map((role) => <option key={role} value={role}>{role}</option>)}</select></label>}
      <label>Primary property<select required={adminOnly} value={form.property} onChange={set('property')}><option value="">{adminOnly ? 'Select property' : 'No property assignment'}</option>{properties.map((property) => <option key={property._id} value={property._id}>{property.name}</option>)}</select></label>
      {adminOnly && <>
        <label>Initial account status<select value={form.status} onChange={set('status')}>{['Active', 'Inactive', 'Suspended'].map((status) => <option key={status}>{status}</option>)}</select></label>
        <fieldset className="sa-form-wide"><legend>Additional property access</legend>{properties.filter((item) => item._id !== form.property).map((item) => <label key={item._id}><input type="checkbox" checked={form.allowedProperties.includes(item._id)} onChange={(event) => setForm((old) => ({ ...old, allowedProperties: event.target.checked ? [...old.allowedProperties, item._id] : old.allowedProperties.filter((id) => id !== item._id) }))} /> {item.name} ({item.code})</label>)}</fieldset>
      </>}
    </div>
    <p className="sa-form-hint">This form cannot create or manage Super Admin accounts. Use the one-time backend bootstrap procedure for the initial Super Admin.</p>
    <div className="sa-modal-actions"><button type="button" className="sa-button sa-button-secondary" onClick={onClose}>Cancel</button><button className="sa-button sa-button-primary" disabled={saving}>{saving ? 'Creating…' : `Create ${adminOnly ? 'Department Admin' : 'staff account'}`}</button></div>
  </form></div>;
}

function StaffPage({ adminOnly = false }) {
  const location = useLocation();
  const [creating, setCreating] = useState(() => adminOnly && new URLSearchParams(location.search).get('create') === '1');
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [properties, setProperties] = useState([]);
  const [profile, setProfile] = useState(null);
  const [permissionConfig, setPermissionConfig] = useState({ departments: [], permissions: [], labels: {} });
  useEffect(() => { superAdminAPI.getProperties({ page: 1, pageSize: 100 }).then((res) => setProperties(res.data.items || [])).catch(() => setProperties([])); }, []);
  useEffect(() => { if (adminOnly) superAdminAPI.getRoles().then((res) => setPermissionConfig({ departments: res.data.departments || [], permissions: res.data.permissions || [], labels: res.data.departmentLabels || {} })).catch((err) => toast.error(errorMessage(err))); }, [adminOnly]);
  const update = async (id, changes) => {
    if (changes.status && changes.status !== 'Active' && !window.confirm(`Deactivate this ${adminOnly ? 'Department Admin' : 'staff'} account? They will be unable to sign in.`)) return;
    if (changes.role === 'admin' && !window.confirm('Grant this account the existing admin role?')) return;
    setSavingId(id);
    try { const response = await (adminOnly ? superAdminAPI.updateAdmin(id, changes) : superAdminAPI.updateStaff(id, changes)); if (response.data.auditLogged === false) toast.warn('Account updated, but its audit entry could not be recorded.'); else toast.success('Account updated.'); setEditing(null); setRefresh((v) => v + 1); }
    catch (err) { toast.error(errorMessage(err)); }
    finally { setSavingId(null); }
  };
  const columns = [
    { key: 'name', label: 'Team member', render: (item) => editing?._id === item._id ? <input aria-label="Staff name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /> : <strong>{item.name}</strong> },
    { key: 'email', label: 'Email', render: (item) => editing?._id === item._id ? <input aria-label="Staff email" type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /> : item.email },
    { key: 'phone', label: 'Phone', render: (item) => editing?._id === item._id ? <input aria-label="Staff phone" value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /> : item.phone || '—' },
    { key: 'staffId', label: 'Staff ID', render: (item) => editing?._id === item._id ? <input aria-label="Staff ID" value={editing.staffId} onChange={(e) => setEditing({ ...editing, staffId: e.target.value })} /> : item.staffId || '—' },
    { key: 'department', label: 'Department / title', render: (item) => editing?._id === item._id ? <><select aria-label="Department" value={editing.department} onChange={(e) => setEditing({ ...editing, department: e.target.value })}>{['Front Desk', 'Housekeeping', 'Maintenance', 'Finance', 'Kitchen', 'Restaurant', 'Management', 'General'].map((value) => <option key={value}>{value}</option>)}</select><input aria-label="Job title" value={editing.jobTitle} onChange={(e) => setEditing({ ...editing, jobTitle: e.target.value })} /></> : <>{item.department || '—'}<small className="sa-cell-sub">{item.jobTitle || ''}</small></> },
    { key: 'role', label: 'Role', render: (item) => editing?._id === item._id && !adminOnly ? <select aria-label="Change staff role" value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })}>{STAFF_ROLES.filter((role) => role !== 'admin').map((role) => <option key={role}>{role}</option>)}</select> : <StatusPill value={item.role} /> },
    { key: 'property', label: adminOnly ? 'Assigned properties' : 'Property', render: (item) => editing?._id === item._id ? <><select aria-label="Primary property" value={editing.property || ''} onChange={(e) => setEditing({ ...editing, property: e.target.value })}><option value="">Unassigned</option>{properties.map((property) => <option key={property._id} value={property._id}>{property.name}</option>)}</select>{adminOnly && <fieldset className="sa-inline-property-list"><legend>Additional properties</legend>{properties.filter((property) => property._id !== editing.property).map((property) => <label key={property._id}><input type="checkbox" checked={(editing.allowedProperties || []).includes(property._id)} onChange={(event) => setEditing((old) => ({ ...old, allowedProperties: event.target.checked ? [...(old.allowedProperties || []), property._id] : (old.allowedProperties || []).filter((id) => id !== property._id) }))} />{property.name}</label>)}</fieldset>}</> : <>{item.property?.name || 'Unassigned'}{adminOnly && item.allowedProperties?.length > 0 && <small className="sa-cell-sub">Also: {item.allowedProperties.map((property) => property.name).join(', ')}</small>}</> },
    ...(adminOnly ? [{ key: 'access', label: 'Department access', render: (item) => editing?._id === item._id ? <fieldset><legend>Grants</legend>{permissionConfig.departments.map((grant) => <label key={grant}><input type="checkbox" checked={(editing.adminDepartments || []).includes(grant)} onChange={(e) => setEditing((old) => ({ ...old, adminDepartments: e.target.checked ? [...old.adminDepartments, grant] : old.adminDepartments.filter((value) => value !== grant) }))} />{permissionConfig.labels[grant] || grant}</label>)}{permissionConfig.permissions.filter((permission) => !permissionConfig.departments.includes(permission)).map((permission) => <label key={permission}><input type="checkbox" checked={(editing.adminPermissions || []).includes(permission)} onChange={(e) => setEditing((old) => ({ ...old, adminPermissions: e.target.checked ? [...old.adminPermissions, permission] : old.adminPermissions.filter((value) => value !== permission) }))} />{permission === 'offers.dining' ? 'Dining offers' : permission}</label>)}</fieldset> : [...(item.adminDepartments || []), ...(item.adminPermissions || [])].map((value) => permissionConfig.labels[value] || (value === 'offers.dining' ? 'Dining offers' : value)).join(', ') || '—' }] : []),
    { key: 'status', label: 'Account status', render: (item) => editing?._id === item._id ? <select aria-label="Change account status" value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>{['Active', 'Inactive', 'Suspended'].map((status) => <option key={status}>{status}</option>)}</select> : <StatusPill value={item.status} /> },
    { key: 'lastLogin', label: 'Last login', render: (item) => item.lastLogin ? new Date(item.lastLogin).toLocaleString() : 'Never' },
    ...(adminOnly ? [{ key: 'createdAt', label: 'Created', render: (item) => item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'Unavailable' }] : []),
    { key: 'actions', label: 'Actions', render: (item) => editing?._id === item._id ? <span className="sa-row-actions"><button className="sa-link-button" disabled={savingId === item._id} onClick={() => update(item._id, { name: editing.name, email: editing.email, phone: editing.phone, role: editing.role, property: editing.property, status: editing.status, ...(editing.staffId ? { staffId: editing.staffId } : {}), department: editing.department, jobTitle: editing.jobTitle, ...(adminOnly ? { adminDepartments: editing.adminDepartments, adminPermissions: editing.adminPermissions, allowedProperties: editing.allowedProperties } : {}) })}>{savingId === item._id ? 'Saving…' : 'Save'}</button><button className="sa-link-button" disabled={savingId === item._id} onClick={() => setEditing(null)}>Cancel</button></span> : <><button className="sa-icon-button sa-edit-button" onClick={() => setEditing({ _id: item._id, name: item.name, email: item.email, phone: item.phone || '', role: item.role, property: item.property?._id || '', allowedProperties: (item.allowedProperties || []).map((property) => property._id), status: item.status, staffId: item.staffId || '', department: item.department || 'General', jobTitle: item.jobTitle || '', adminDepartments: item.adminDepartments || [], adminPermissions: item.adminPermissions || [] })}><FaEdit /> Edit</button> {adminOnly && <button className="sa-link-button" disabled={savingId === item._id} onClick={() => update(item._id, { status: item.status === 'Active' ? 'Inactive' : 'Active' })}>{item.status === 'Active' ? 'Deactivate' : 'Reactivate'}</button>} <button className="sa-link-button" onClick={() => superAdminAPI.getStaffProfile(item._id).then((res) => setProfile(res.data)).catch((err) => toast.error(errorMessage(err)))}>{adminOnly ? 'View details' : 'Profile'}</button></> }
  ];
  return <>
    <DataTablePage key={refresh} title={adminOnly ? 'Department Admins' : 'Operational staff'} subtitle={adminOnly ? 'Create, view, update, deactivate, and reactivate scoped department administrator accounts.' : 'Manage account details, role, property assignment and active status. Super Admin accounts are excluded.'} resource={adminOnly ? 'getAdmins' : 'getStaff'} resourceParams={adminOnly ? {} : { excludeRole: 'admin' }} columns={columns} filters={['status', 'role', 'property', ...(adminOnly ? ['departmentAccess'] : []), { statuses: ['Active', 'Inactive', 'Suspended'] }]} actions={<button className="sa-button sa-button-primary" onClick={() => setCreating(true)}><FaPlus /> Add {adminOnly ? 'Department Admin' : 'staff'}</button>} />
    {creating && <StaffForm adminOnly={adminOnly} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); setRefresh((v) => v + 1); }} />}
    {profile && <div className="sa-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfile(null); }}><section className="sa-modal"><div className="sa-modal-head"><h2>{profile.staff?.name} · {profile.staff?.staffId}</h2><button className="sa-icon-button" onClick={() => setProfile(null)} aria-label="Close"><FaTimes /></button></div><div className="sa-detail-grid"><span>Email</span><strong>{profile.staff?.email || '—'}</strong><span>Phone</span><strong>{profile.staff?.phone || '—'}</strong><span>Account status</span><strong><StatusPill value={profile.staff?.status} /></strong><span>Department access</span><strong>{[...(profile.staff?.adminDepartments || []), ...(profile.staff?.adminPermissions || [])].join(', ') || 'No department grants'}</strong><span>Primary property</span><strong>{profile.staff?.property?.name || 'Unassigned'}</strong><span>Additional properties</span><strong>{profile.staff?.allowedProperties?.map((property) => property.name).join(', ') || 'None'}</strong><span>Created</span><strong>{profile.staff?.createdAt ? new Date(profile.staff.createdAt).toLocaleString() : 'Unavailable'}</strong><span>Last login</span><strong>{profile.staff?.lastLogin ? new Date(profile.staff.lastLogin).toLocaleString() : 'Never recorded'}</strong></div><h3>Recent attendance</h3>{profile.attendance?.length ? <div className="sa-compact-list">{profile.attendance.map((entry) => <div key={entry._id} className="sa-list-row"><span>{entry.attendanceDate}</span><StatusPill value={entry.status} /></div>)}</div> : <p>No attendance records found.</p>}</section></div>}
  </>;
}

function ManagedUsersPage() {
  const [refresh, setRefresh] = useState(0);
  const [resetUser, setResetUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const save = async (id, changes) => {
    if (changes.status && changes.status !== 'Active' && !window.confirm(`Set this account to ${changes.status}? The user will be unable to sign in.`)) return;
    setBusy(true);
    try { const res = await superAdminAPI.updateManagedUser(id, changes); toast.success(res.data.auditLogged === false ? 'Updated; audit entry could not be recorded.' : 'User updated.'); setEditing(null); setRefresh((n) => n + 1); }
    catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  };
  const reset = async (event) => {
    event.preventDefault(); setBusy(true);
    try { await superAdminAPI.resetManagedUserPassword(resetUser._id, newPassword); toast.success('Password reset. Share it through a private channel.'); setResetUser(null); setNewPassword(''); }
    catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  };
  const cols = [
    { key: 'name', label: 'Name', render: (u) => editing?._id === u._id ? <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /> : u.name },
    { key: 'email', label: 'Email', render: (u) => editing?._id === u._id ? <input type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /> : u.email },
    { key: 'role', label: 'Role', render: (u) => <StatusPill value={u.role} /> },
    { key: 'property', label: 'Property', render: (u) => u.property?.name || u.allowedProperties?.map((p) => p.name).join(', ') || '—' },
    { key: 'status', label: 'Status', render: (u) => editing?._id === u._id ? <select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>{['Active', 'Inactive', 'Suspended'].map((s) => <option key={s}>{s}</option>)}</select> : <StatusPill value={u.status} /> },
    { key: 'createdAt', label: 'Created', render: (u) => u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—' },
    { key: 'actions', label: 'Actions', render: (u) => editing?._id === u._id ? <><button className="sa-link-button" disabled={busy} onClick={() => save(u._id, { name: editing.name, email: editing.email, status: editing.status })}>Save</button> <button className="sa-link-button" onClick={() => setEditing(null)}>Cancel</button></> : <><button className="sa-link-button" onClick={() => setEditing({ _id: u._id, name: u.name, email: u.email, status: u.status })}>Edit</button> <button className="sa-link-button" onClick={() => setResetUser(u)}>Reset password</button></> }
  ];
  return <><DataTablePage key={refresh} title="User Management" subtitle="Manage customer and staff account profile/status. Roles, guest links, Super Admin accounts and passwords are protected from profile editing." resource="getManagedUsers" columns={cols} filters={['status', 'role', { statuses: ['Active', 'Inactive', 'Suspended'] }, 'property']} roleOptions={['customer', ...STAFF_ROLES]} />
    {resetUser && <div className="sa-modal-backdrop"><form className="sa-modal" onSubmit={reset}><div className="sa-modal-head"><h2>Reset password for {resetUser.name}</h2><button type="button" className="sa-icon-button" onClick={() => setResetUser(null)}><FaTimes /></button></div><p>The password is saved through the existing hash mechanism and is never returned by the API. Share it using a private channel.</p><label>New password<input required minLength="12" maxLength="128" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></label><div className="sa-modal-actions"><button type="button" className="sa-button sa-button-secondary" onClick={() => setResetUser(null)}>Cancel</button><button disabled={busy} className="sa-button sa-button-primary">Reset password</button></div></form></div>}
  </>;
}

function RolesPage() {
  const [result, setResult] = useState(null); const [error, setError] = useState('');
  useEffect(() => { superAdminAPI.getRoles().then((res) => setResult(res.data)).catch((err) => setError(errorMessage(err))); }, []);
  return <><PanelHeading title="Roles & permissions" subtitle="Read-only view of roles currently represented by the application." />
    {error ? <div className="sa-state sa-error">{error}</div> : !result ? <div className="sa-state"><span className="sa-spinner" /> Loading roles…</div> : <>
      <div className="sa-info-banner"><strong>Permission detail is route-based</strong><span>{result.permissionModel}</span></div>
      <div className="sa-role-grid">{result.roles.map((role) => <article key={role} className="sa-section-card"><div className="sa-role-title"><FaShieldAlt /><h2>{role.replace('_', ' ')}</h2></div><p>{role === 'super_admin' ? 'Access to the dedicated portfolio administration APIs.' : role === 'customer' ? 'Customer self-service and public booking workflows.' : 'Operational staff role. Exact access varies by protected API route.'}</p><StatusPill value={role === 'super_admin' ? 'Dedicated' : 'Existing role'} /></article>)}</div>
    </>}
  </>;
}

function CustomerPage() {
  const [selected, setSelected] = useState(null); const [history, setHistory] = useState(null); const [historyError, setHistoryError] = useState('');
  const openHistory = async (customer) => {
    setSelected(customer); setHistory(null); setHistoryError('');
    try { const res = await superAdminAPI.getCustomerReservations(customer._id, { page: 1, pageSize: 10 }); setHistory(res.data); }
    catch (err) { setHistoryError(errorMessage(err)); }
  };
  const columns = [
    { key: 'name', label: 'Customer', render: (item) => <><strong>{item.name}</strong><small className="sa-cell-sub">{item.email}</small></> },
    { key: 'phone', label: 'Phone' },
    { key: 'status', label: 'Account status', render: (item) => <StatusPill value={item.status} /> },
    { key: 'guest', label: 'Guest profile', render: (item) => item.guest ? `${item.guest.totalStays || 0} recorded stays` : 'Not linked' },
    { key: 'createdAt', label: 'Registered', render: (item) => new Date(item.createdAt).toLocaleDateString() },
    { key: 'actions', label: 'History', render: (item) => <button className="sa-icon-button sa-edit-button" onClick={() => openHistory(item)}><FaEye /> View history</button> }
  ];
  return <><DataTablePage title="Customers" subtitle="Read-only customer account list. Contact details are limited to name, email, and phone." resource="getCustomers" columns={columns} empty="No customer accounts found." />
    {selected && <div className="sa-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelected(null); }}><section className="sa-modal sa-history-modal"><div className="sa-modal-head"><h2>Reservation history · {selected.name}</h2><button type="button" className="sa-icon-button" onClick={() => setSelected(null)} aria-label="Close"><FaTimes /></button></div>
      {historyError ? <div className="sa-form-error">{historyError}</div> : !history ? <div className="sa-state"><span className="sa-spinner" /> Loading linked records…</div> : <><p>{history.pagination.total} reservation records · {history.customerBookingCount} separate legacy booking records</p>{history.reservations.length ? <div className="sa-compact-list">{history.reservations.map((item) => <div className="sa-list-row" key={item._id}><div><strong>{item.reservationNumber}</strong><span>{item.property?.name || 'Property'} · {item.room?.roomNumber || 'Room unassigned'} · {new Date(item.checkInDate).toLocaleDateString()}</span></div><StatusPill value={item.status} /></div>)}</div> : <div className="sa-inline-empty">No canonical reservation records are linked to this customer profile.</div>}{history.customerBookingRecords?.length > 0 && <p className="sa-form-hint">Legacy Booking records are shown as a separate count to avoid double-counting the two data models.</p>}</>}
    </section></div>}
  </>;
}

function ReportPage() {
  const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [propertyId, setPropertyId] = useState('');
  const [properties, setProperties] = useState([]); const [result, setResult] = useState(null); const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [refresh, setRefresh] = useState(0);
  useEffect(() => { superAdminAPI.getProperties({ page: 1, pageSize: 100 }).then((res) => setProperties(res.data.items || [])).catch(() => setProperties([])); }, []);
  useEffect(() => { let active = true; setLoading(true); setError(''); superAdminAPI.getReports({ ...(from ? { from } : {}), ...(to ? { to } : {}), ...(propertyId ? { propertyId } : {}) }).then((res) => { if (active) setResult(res.data); }).catch((err) => { if (active) setError(errorMessage(err)); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [from, to, propertyId, refresh]);
  const max = Math.max(1, ...(result?.reservationTrends || []).map((item) => item.count));
  return <><PanelHeading title="Reports & analytics" subtitle="Counts and trends from saved records; no revenue or estimated occupancy is fabricated." action={<button className="sa-button sa-button-secondary" onClick={() => setRefresh((v) => v + 1)}><FaSyncAlt /> Refresh</button>} />
    <div className="sa-toolbar"><label className="sa-date">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label className="sa-date">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label><select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} aria-label="Filter reports by property"><option value="">All properties</option>{properties.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}</select><span className="sa-period">Selected period: {from || 'Any start'} – {to || 'Today'}</span></div>
    {loading ? <div className="sa-state"><span className="sa-spinner" /> Loading reports…</div> : error ? <div className="sa-state sa-error"><p>{error}</p><button className="sa-button sa-button-secondary" onClick={() => setRefresh((v) => v + 1)}>Retry</button></div> : result && <div className="sa-two-column">
      <section className="sa-section-card"><h2>Reservations created by day</h2>{result.reservationTrends.length ? <div className="sa-bars">{result.reservationTrends.map((item) => <div className="sa-bar-row" key={item._id}><span>{item._id}</span><div><i style={{ width: `${Math.max(3, item.count / max * 100)}%` }} /></div><strong>{item.count}</strong></div>)}</div> : <div className="sa-inline-empty">No reservations in this period.</div>}</section>
      <section className="sa-section-card"><h2>Customer registrations</h2>{result.customerRegistrationTrends.length ? <div className="sa-bars">{result.customerRegistrationTrends.map((item) => <div className="sa-bar-row" key={item._id}><span>{item._id}</span><div><i style={{ width: `${Math.max(3, item.count / Math.max(1, ...result.customerRegistrationTrends.map((x) => x.count)) * 100)}%` }} /></div><strong>{item.count}</strong></div>)}</div> : <div className="sa-inline-empty">No customer registrations in this period.</div>}</section>
      <section className="sa-section-card"><h2>Properties by status</h2>{result.propertiesByStatus.length ? result.propertiesByStatus.map((item) => <div className="sa-list-row" key={item._id}><StatusPill value={item._id} /><strong>{item.count}</strong></div>) : <div className="sa-inline-empty">No property records.</div>}</section>
      <section className="sa-section-card"><h2>Rooms by operational status</h2>{result.roomsByOperationalStatus.length ? result.roomsByOperationalStatus.map((item) => <div className="sa-list-row" key={item._id}><StatusPill value={item._id} /><strong>{item.count}</strong></div>) : <div className="sa-inline-empty">No room records.</div>}</section>
      <div className="sa-info-banner sa-span-all"><strong>Financial summary unavailable</strong><span>{result.revenue.reason}</span></div>
    </div>}
  </>;
}

function AuditPage() {
  const [action, setAction] = useState(''); const [page, setPage] = useState(1); const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { let active = true; setLoading(true); setError(''); superAdminAPI.getAuditLogs({ page, pageSize: 20, ...(action ? { action } : {}) }).then((res) => { if (active) setData(res.data); }).catch((err) => { if (active) setError(errorMessage(err)); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [page, action, refresh]);
  return <><PanelHeading title="Administrative audit log" subtitle="Persistent records for Super Admin staff and property changes made through this panel." action={<button className="sa-button sa-button-secondary" onClick={() => setRefresh((v) => v + 1)}><FaSyncAlt /> Refresh</button>} />
    <div className="sa-toolbar"><input className="sa-filter-input" value={action} onChange={(e) => { setPage(1); setAction(e.target.value); }} placeholder="Filter by action code" aria-label="Filter audit logs by action" /></div>
    <div className="sa-table-wrap">{loading ? <div className="sa-state"><span className="sa-spinner" /> Loading audit records…</div> : error ? <div className="sa-state sa-error"><p>{error}</p><button className="sa-button sa-button-secondary" onClick={() => setRefresh((v) => v + 1)}>Retry</button></div> : data?.items?.length ? <table className="sa-table"><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Resource</th><th>Property</th><th>Details</th></tr></thead><tbody>{data.items.map((item) => <tr key={item._id}><td>{new Date(item.createdAt).toLocaleString()}</td><td>{item.actorName}</td><td><StatusPill value={item.action} /></td><td>{item.resourceType} · {item.resourceId}</td><td>{item.property?.name || '—'}</td><td>{item.summary}</td></tr>)}</tbody></table> : <div className="sa-state"><strong>No administrative activity recorded yet.</strong><span>Records appear after property or staff changes through this panel.</span></div>}</div>
    {!loading && !error && data && <Pagination pagination={data.pagination} page={page} setPage={setPage} />}
  </>;
}

function SettingsPage() {
  const [result, setResult] = useState(null); const [error, setError] = useState('');
  useEffect(() => { superAdminAPI.getSettings().then((res) => setResult(res.data)).catch((err) => setError(errorMessage(err))); }, []);
  return <><PanelHeading title="System settings" subtitle="Only settings with a safe persisted configuration API can be displayed or edited here." />
    {error ? <div className="sa-state sa-error">{error}</div> : !result ? <div className="sa-state"><span className="sa-spinner" /> Loading settings…</div> : <div className="sa-info-banner"><FaShieldAlt /><div><strong>Settings are read-only</strong><span>{result.message}</span></div></div>}
  </>;
}

function CurrentPage() {
  const { pathname } = useLocation();
  if (pathname === '/super-admin' || pathname === '/super-admin/dashboard') return <DashboardPage />;
  if (pathname === '/super-admin/properties') return <PropertyPage />;
  if (pathname === '/super-admin/staff') return <StaffPage />;
  if (pathname === '/super-admin/admins') return <StaffPage adminOnly />;
  if (pathname === '/super-admin/users') return <ManagedUsersPage />;
  if (pathname === '/super-admin/attendance') return <Attendance superAdminView />;
  if (pathname === '/super-admin/roles') return <RolesPage />;
  if (pathname === '/super-admin/reservations') return <DataTablePage title="Reservations" subtitle="Read-only portfolio overview using the canonical Reservation records." resource="getReservations" filters={['status', { statuses: ['Confirmed', 'Checked-In', 'Checked-Out', 'Cancelled', 'No-Show'] }, 'property', 'dates']} viewDetails columns={[
    { key: 'reservationNumber', label: 'Reference' }, { key: 'guest', label: 'Customer', render: (r) => r.guest ? `${r.guest.firstName} ${r.guest.lastName}` : '—' }, { key: 'property', label: 'Property', render: (r) => r.property?.name || '—' }, { key: 'room', label: 'Room', render: (r) => r.room?.roomNumber || '—' }, { key: 'checkInDate', label: 'Check-in', render: (r) => new Date(r.checkInDate).toLocaleDateString() }, { key: 'checkOutDate', label: 'Check-out', render: (r) => new Date(r.checkOutDate).toLocaleDateString() }, { key: 'numberOfGuests', label: 'Guests' }, { key: 'status', label: 'Status', render: (r) => <StatusPill value={r.status} /> }, { key: 'paymentStatus', label: 'Payment', render: (r) => <StatusPill value={r.paymentStatus} /> }
  ]} />;
  if (pathname === '/super-admin/rooms') return <DataTablePage title="Room inventory" subtitle="Read-only room details and operational status from the room inventory model." resource="getRooms" filters={['status', { statuses: ['Available', 'Occupied', 'Reserved', 'Maintenance', 'Out of Order', 'Cleaning'] }, 'property', 'roomType']} columns={[
    { key: 'roomNumber', label: 'Room' }, { key: 'property', label: 'Property', render: (r) => r.property?.name || 'Unassigned' }, { key: 'roomType', label: 'Type' }, { key: 'floor', label: 'Floor' }, { key: 'basePrice', label: 'Base price', render: (r) => r.basePrice == null ? '—' : `${r.property?.currency || ''} ${Number(r.basePrice).toLocaleString()}` }, { key: 'status', label: 'Status', render: (r) => <StatusPill value={r.status} /> }, { key: 'cleaningStatus', label: 'Cleaning', render: (r) => <StatusPill value={r.cleaningStatus} /> }
  ]} />;
  if (pathname === '/super-admin/customers') return <CustomerPage />;
  if (pathname === '/super-admin/reports') return <ReportPage />;
  if (pathname === '/super-admin/audit-logs') return <AuditPage />;
  if (pathname === '/super-admin/settings') return <SettingsPage />;
  return <Navigate to="/super-admin/dashboard" replace />;
}

export default function SuperAdminPanel() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('superAdminSidebarCollapsed') === 'true');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [managedProperties, setManagedProperties] = useState([]);
  const [managedPropertyId, setManagedPropertyId] = useState(() => localStorage.getItem('superAdminPropertyContext') || '');
  useEffect(() => { superAdminAPI.getProperties({ page: 1, pageSize: 100, status: 'Active' }).then((response) => setManagedProperties(response.data.items || [])).catch(() => setManagedProperties([])); }, []);
  const activePath = useMemo(() => NAV.find((item) => location.pathname === item.path)?.path || '/super-admin/dashboard', [location.pathname]);
  const toggleCollapsed = () => setCollapsed((value) => { localStorage.setItem('superAdminSidebarCollapsed', String(!value)); return !value; });
  const grouped = useMemo(() => NAV.reduce((groups, item) => ({ ...groups, [item.group]: [...(groups[item.group] || []), item] }), {}), []);

  return <div className={`sa-layout ${collapsed ? 'sa-collapsed' : ''}`}>
    {mobileOpen && <button className="sa-mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <aside className={`sa-sidebar ${mobileOpen ? 'sa-mobile-open' : ''}`}>
      <div className="sa-brand"><div className="sa-brand-mark">S</div>{!collapsed && <div><strong>Serendib</strong><span>SUPER ADMIN</span></div>}<button className="sa-collapse" onClick={toggleCollapsed} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? <FaChevronRight /> : <FaChevronLeft />}</button></div>
      <nav className="sa-nav" aria-label="Super Admin navigation">{Object.entries(grouped).map(([group, items]) => <div className="sa-nav-group" key={group}><span className="sa-nav-label">{collapsed ? group.slice(0, 1) : group}</span>{items.map((item) => { const Icon = item.icon; return <Link key={item.path} to={item.path} title={collapsed ? item.label : undefined} className={`sa-nav-link ${activePath === item.path ? 'active' : ''}`} onClick={() => setMobileOpen(false)}><Icon /><span>{item.label}</span></Link>; })}</div>)}</nav>
      <div className="sa-sidebar-bottom"><div className="sa-current-user"><div className="sa-avatar">{(user?.name || 'SA').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</div>{!collapsed && <div><strong>{user?.name || 'Super Admin'}</strong><span>Super Admin</span></div>}</div><button className="sa-logout" onClick={logout} title="Sign out"><FaSignOutAlt /><span>{collapsed ? '' : 'Sign out'}</span></button></div>
    </aside>
    <main className="sa-main"><header className="sa-topbar"><button className="sa-mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><FaBars /></button><div><span className="sa-breadcrumb">Portfolio management</span><h1>{TITLE[activePath] || 'Dashboard'}</h1></div><label className="sa-property-switch"><span>Department page property</span><select aria-label="Choose property for department pages" value={managedPropertyId} onChange={(event) => { const next = event.target.value; setManagedPropertyId(next); if (next) localStorage.setItem('superAdminPropertyContext', next); else localStorage.removeItem('superAdminPropertyContext'); window.location.reload(); }}><option value="">Default active property</option>{managedProperties.map((property) => <option key={property._id} value={property._id}>{property.name}</option>)}</select></label><div className="sa-user-chip"><span>{user?.name || 'Super Admin'}</span><StatusPill value="super_admin" /></div><button className="sa-top-logout" onClick={logout} aria-label="Sign out"><FaSignOutAlt /></button></header><section className="sa-content"><CurrentPage /></section><footer className="sa-footer">Super Admin workspace · Department pages use backend authorization and the selected active property.</footer></main>
  </div>;
}
