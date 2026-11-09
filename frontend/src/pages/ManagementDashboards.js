import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaBed, FaCalendarCheck, FaUtensils, FaTag, FaGlassCheers, FaPlus, FaArrowRight, FaSyncAlt } from 'react-icons/fa';
import { roomAPI, reservationAPI, restaurantAPI, eventAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
const { getDepartmentNavigation } = require('../config/roleAccess');
import './ManagementDashboards.css';

const displayValue = (value) => value == null ? 'Unavailable' : Number(value).toLocaleString();
const requestError = (error) => error?.response?.data?.error || error?.message || 'Unable to load this information.';

function useLoad(loader, deps = []) {
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let current = true;
    setState({ loading: true, error: '', data: null });
    Promise.resolve().then(loader).then((data) => { if (current) setState({ loading: false, error: '', data }); })
      .catch((error) => { if (current) setState({ loading: false, error: requestError(error), data: null }); });
    return () => { current = false; };
  }, [...deps, refresh]);
  return { ...state, reload: () => setRefresh((value) => value + 1) };
}

function DashboardFrame({ title, subtitle, icon: Icon, links, cards, error, loading, onRefresh, children }) {
  return <main className="management-dashboard content-wrapper">
    <header className="management-dashboard-header"><div className="management-dashboard-title"><span><Icon /></span><div><h1>{title}</h1><p>{subtitle}</p></div></div><button className="btn btn-secondary" type="button" onClick={onRefresh}><FaSyncAlt /> Refresh</button></header>
    {error && <div className="management-dashboard-error" role="status">Some data could not be loaded: {error}</div>}
    <section className="management-dashboard-cards" aria-label={`${title} summary`}>
      {cards.map((card) => <article className="management-dashboard-card" key={card.label}><span>{card.label}</span><strong>{loading ? '…' : displayValue(card.value)}</strong>{card.note && <small>{card.note}</small>}</article>)}
    </section>
    <section className="management-dashboard-actions" aria-label="Quick actions">{links.map((link) => <Link key={link.to} to={link.to}><span>{link.icon}</span><strong>{link.label}</strong><FaArrowRight /></Link>)}</section>
    {children}
  </main>;
}

function RecentTable({ title, columns, rows, empty }) {
  return <section className="management-dashboard-panel"><div className="management-dashboard-panel-head"><h2>{title}</h2></div>{rows?.length ? <div className="management-dashboard-table-wrap"><table><thead><tr>{columns.map((column) => <th key={column.label}>{column.label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id}>{columns.map((column) => <td key={column.label}>{column.value(row)}</td>)}</tr>)}</tbody></table></div> : <p className="management-dashboard-empty">{empty}</p>}</section>;
}

export function RoomManagementDashboard() {
  const { user } = useAuth();
  const permittedPaths = new Set(getDepartmentNavigation(user).flatMap((section) => section.items.map((item) => item.path)));
  const load = () => Promise.allSettled([roomAPI.getRoomStats(), roomAPI.getRooms(), reservationAPI.getReservations()]).then(([stats, rooms, reservations]) => ({
    stats: stats.status === 'fulfilled' ? stats.value.data : null,
    rooms: rooms.status === 'fulfilled' ? rooms.value.data : null,
    reservations: reservations.status === 'fulfilled' ? reservations.value.data : null,
    errors: [stats, rooms, reservations].filter((result) => result.status === 'rejected').map((result) => requestError(result.reason))
  }));
  const state = useLoad(load);
  const data = state.data || {};
  const reservations = Array.isArray(data.reservations) ? data.reservations : null;
  const upcoming = reservations?.filter((reservation) => new Date(reservation.checkInDate) >= new Date() && reservation.status === 'Confirmed').length;
  const distribution = ['Available', 'Occupied', 'Reserved', 'Maintenance', 'Cleaning'].map((status) => ({ status, count: Array.isArray(data.rooms) ? data.rooms.filter((room) => room.status === status).length : null }));
  return <DashboardFrame title="Room Management Dashboard" subtitle="Room inventory and reservation activity for your authorized property." icon={FaBed} loading={state.loading} error={[state.error, ...(data.errors || [])].filter(Boolean).join(' ')} onRefresh={state.reload} cards={[
    { label: 'Total Rooms', value: data.stats?.totalRooms }, { label: 'Available Rooms', value: data.stats?.availableRooms }, { label: 'Occupied Rooms', value: data.stats?.occupiedRooms }, { label: 'Under Maintenance', value: data.stats?.maintenanceRooms }, { label: 'Reservations', value: reservations?.length }, { label: 'Upcoming Check-ins', value: upcoming }
  ]} links={[...(permittedPaths.has('/rooms') ? [{ to: '/rooms/new', label: 'Add Room', icon: <FaPlus /> }, { to: '/rooms', label: 'View Rooms', icon: <FaBed /> }] : []), ...(permittedPaths.has('/reservations') ? [{ to: '/reservations', label: 'Reservations', icon: <FaCalendarCheck /> }, { to: '/guests', label: 'Guest Profiles', icon: <FaArrowRight /> }] : [])]}>
    <div className="management-dashboard-columns"><RecentTable title="Recent reservations" columns={[{ label: 'Reference', value: (r) => r.reservationNumber || '—' }, { label: 'Guest', value: (r) => r.guest ? `${r.guest.firstName || ''} ${r.guest.lastName || ''}`.trim() : '—' }, { label: 'Room', value: (r) => r.room?.roomNumber || 'Unassigned' }, { label: 'Check-in', value: (r) => r.checkInDate ? new Date(r.checkInDate).toLocaleDateString() : '—' }, { label: 'Status', value: (r) => r.status || '—' }]} rows={reservations?.slice(0, 6).map((r) => ({ ...r, id: r._id }))} empty={reservations ? 'No reservations found.' : 'Reservation data is unavailable for this account.'} />
      <section className="management-dashboard-panel"><div className="management-dashboard-panel-head"><h2>Room status overview</h2></div>{state.loading ? <p className="management-dashboard-empty">Loading room statuses…</p> : <ul className="management-status-list">{distribution.map((item) => <li key={item.status}><span>{item.status}</span><strong>{displayValue(item.count)}</strong></li>)}</ul>}</section></div>
  </DashboardFrame>;
}

export function RestaurantManagementDashboard() {
  const load = () => Promise.all([restaurantAPI.getDashboardStats(), restaurantAPI.getAdminRestaurants(), restaurantAPI.getAdminOffers()]).then(([stats, restaurants, offers]) => ({ stats: stats.data?.data, restaurants: restaurants.data?.data || [], offers: offers.data?.data || [] }));
  const state = useLoad(load); const data = state.data || {};
  const activeRestaurants = data.restaurants?.filter((item) => item.active).length;
  const activeOffers = data.offers?.filter((item) => item.active);
  const expiring = activeOffers?.filter((offer) => offer.validUntil && new Date(offer.validUntil) >= new Date() && new Date(offer.validUntil) <= new Date(Date.now() + 30 * 86400000)).length;
  const recent = [...(data.offers || [])].sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)).slice(0, 5).map((offer) => ({ ...offer, id: offer._id }));
  return <DashboardFrame title="Restaurant Management Dashboard" subtitle="Restaurant operations and persisted dining offers." icon={FaUtensils} loading={state.loading} error={state.error} onRefresh={state.reload} cards={[
    { label: 'Total Restaurants', value: data.stats?.totalRestaurants ?? data.restaurants?.length }, { label: 'Active Restaurants', value: activeRestaurants }, { label: 'Total Dining Offers', value: data.offers?.length }, { label: 'Active Dining Offers', value: activeOffers?.length }, { label: 'Offers Expiring in 30 Days', value: expiring }, { label: 'Today’s Dining Bookings', value: data.stats?.todayReservationsCount }
  ]} links={[{ to: '/admin/restaurants', label: 'Manage Restaurants', icon: <FaUtensils /> }, { to: '/admin/restaurants#restaurant-records', label: 'Add Restaurant', icon: <FaPlus /> }, { to: '/admin/dining-offers', label: 'Manage Dining Offers', icon: <FaTag /> }]}>
    <RecentTable title="Recently updated dining offers" columns={[{ label: 'Offer', value: (offer) => offer.title }, { label: 'Restaurant', value: (offer) => offer.restaurant?.name || '—' }, { label: 'Status', value: (offer) => offer.active ? 'Active' : 'Inactive' }, { label: 'Valid until', value: (offer) => offer.validUntil ? new Date(offer.validUntil).toLocaleDateString() : 'Ongoing' }]} rows={recent} empty="No persisted dining offers are available." />
  </DashboardFrame>;
}

export function EventManagementDashboard() {
  const load = () => Promise.all([eventAPI.getDashboardStats(), eventAPI.getAdminEvents(), eventAPI.getAdminVenues()]).then(([stats, events, venues]) => ({ stats: stats.data, events: events.data?.data || events.data || [], venues: venues.data?.data || venues.data || [] }));
  const state = useLoad(load); const data = state.data || {};
  const eventCategories = new Set((data.events || []).map((event) => event.eventType).filter(Boolean));
  const recent = [...(data.events || [])].sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)).slice(0, 5).map((item) => ({ ...item, id: item._id }));
  const recentBookings = (data.stats?.recentBookings || []).slice(0, 5).map((item) => ({ ...item, id: item._id }));
  return <DashboardFrame title="Event Management Dashboard" subtitle="Event listings, venues, and enquiry activity from the existing event system." icon={FaGlassCheers} loading={state.loading} error={state.error} onRefresh={state.reload} cards={[
    { label: 'Event Categories in Use', value: eventCategories.size }, { label: 'Wedding & Event Halls', value: data.venues?.filter((venue) => /wedding|occasion/i.test((venue.categories || []).join(' '))).length }, { label: 'Conference / Corporate Venues', value: data.venues?.filter((venue) => /conference|corporate|meeting/i.test((venue.categories || []).join(' '))).length }, { label: 'Upcoming Events', value: data.stats?.upcomingEvents }, { label: 'Pending Enquiries', value: data.stats?.pendingBookings }, { label: 'Confirmed Enquiries', value: data.stats?.confirmedBookings }
  ]} links={[{ to: '/admin/events?tab=events', label: 'Manage Events', icon: <FaGlassCheers /> }, { to: '/admin/events?tab=venues', label: 'Manage Venues', icon: <FaBed /> }, { to: '/admin/events?tab=bookings', label: 'Event Enquiries', icon: <FaCalendarCheck /> }]}>
    <div className="management-dashboard-columns"><RecentTable title="Recent event enquiries" columns={[{ label: 'Reference', value: (item) => item.confirmationNumber || '—' }, { label: 'Customer', value: (item) => item.customerName || '—' }, { label: 'Event', value: (item) => item.eventType || '—' }, { label: 'Date', value: (item) => item.date || '—' }, { label: 'Status', value: (item) => item.status || '—' }]} rows={recentBookings} empty="No recent event enquiries are available." />
    <RecentTable title="Recently updated events" columns={[{ label: 'Event', value: (item) => item.title || item.name || '—' }, { label: 'Category', value: (item) => item.eventType || '—' }, { label: 'Status', value: (item) => item.status || '—' }, { label: 'Start date', value: (item) => item.startDate ? new Date(item.startDate).toLocaleDateString() : '—' }]} rows={recent} empty="No event listings are available." /></div>
  </DashboardFrame>;
}

