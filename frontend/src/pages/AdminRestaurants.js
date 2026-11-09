// frontend/src/pages/AdminRestaurants.js
import React, { useState, useEffect } from 'react';
import { 
  FaCalendarAlt, 
  FaUsers, 
  FaChair, 
  FaClock, 
  FaPlus, 
  FaEdit, 
  FaTrash, 
  FaCheck, 
  FaTimes, 
  FaUtensils, 
  FaPercent, 
  FaFileInvoiceDollar, 
  FaSearch, 
  FaHotel, 
  FaEye,
  FaFilter,
  FaTag
} from 'react-icons/fa';
import { restaurantAPI } from '../services/api';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import './RestaurantExperience.css';

const AdminRestaurants = () => {
  const [activeTab, setActiveTab] = useState('reservations');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Common datasets
  const [restaurants, setRestaurants] = useState([]);
  const [selectedRestFilter, setSelectedRestFilter] = useState('');
  const [restaurantForm, setRestaurantForm] = useState(null);
  const [savingRestaurant, setSavingRestaurant] = useState(false);

  // 1. Reservations tab state
  const [reservations, setReservations] = useState([]);
  const [resStatusFilter, setResStatusFilter] = useState('ALL');
  const [resDateFilter, setResDateFilter] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [resSearch, setResSearch] = useState('');
  
  // Folio Charging Modal State
  const [folioModalRes, setFolioModalRes] = useState(null);
  const [chargeAmount, setChargeAmount] = useState('');
  const [chargeDescription, setChargeDescription] = useState('');
  const [chargingFolio, setChargingFolio] = useState(false);

  // 2. Tables tab state
  const [tables, setTables] = useState([]);
  const [showTableModal, setShowTableModal] = useState(false);
  const [tableForm, setTableForm] = useState({
    restaurant: '',
    tableNumber: '',
    capacity: 4,
    location: 'Indoor',
    status: 'AVAILABLE'
  });

  // 3. Menus tab state
  const [menuItems, setMenuItems] = useState([]);
  const [menuCategories, setMenuCategories] = useState([]);
  const [showItemModal, setShowItemModal] = useState(false);
  const [itemForm, setItemForm] = useState({
    restaurant: '',
    category: '',
    name: '',
    description: '',
    price: '',
    dietaryTags: [],
    available: true
  });

  // 4. Buffets tab state
  const [buffets, setBuffets] = useState([]);
  const [showBuffetModal, setShowBuffetModal] = useState(false);
  const [buffetForm, setBuffetForm] = useState({
    restaurant: '',
    name: '',
    mealPeriod: 'Dinner',
    startTime: '19:00',
    endTime: '22:30',
    adultPrice: '',
    childPrice: '',
    hotelGuestPrice: '',
    theme: 'International Night',
    capacity: 120
  });

  // 5. Offers tab state
  const [offers, setOffers] = useState([]);

  useEffect(() => {
    loadInitialAdminData();
  }, []);

  useEffect(() => {
    if (activeTab === 'reservations') loadReservations();
    if (activeTab === 'tables') loadTables();
    if (activeTab === 'menus') loadMenuItems();
    if (activeTab === 'buffets') loadBuffets();
    if (activeTab === 'offers') loadOffers();
  }, [activeTab, selectedRestFilter, resStatusFilter, resDateFilter]);

  const loadInitialAdminData = async () => {
    try {
      setLoading(true);
      const [statsRes, restsRes] = await Promise.all([
        restaurantAPI.getDashboardStats(),
        restaurantAPI.getAdminRestaurants()
      ]);

      if (statsRes.data?.data) setStats(statsRes.data.data);
      if (restsRes.data?.data) {
        setRestaurants(restsRes.data.data);
        if (restsRes.data.data.length > 0 && !selectedRestFilter) {
          // Keep all or first
        }
      }
      await loadReservations();
    } catch (err) {
      console.error('Error loading initial admin data', err);
      toast.error('Failed to load restaurant dashboard');
    } finally {
      setLoading(false);
    }
  };

  const loadReservations = async () => {
    try {
      const res = await restaurantAPI.getAdminReservations({
        restaurantId: selectedRestFilter || undefined,
        status: resStatusFilter !== 'ALL' ? resStatusFilter : undefined,
        date: resDateFilter || undefined,
        search: resSearch || undefined
      });
      if (res.data?.data) setReservations(res.data.data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadTables = async () => {
    try {
      const res = await restaurantAPI.getAdminTables({ restaurantId: selectedRestFilter || undefined });
      if (res.data?.data) setTables(res.data.data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadMenuItems = async () => {
    try {
      const res = await restaurantAPI.getAdminMenuItems({ restaurantId: selectedRestFilter || undefined });
      if (res.data?.data) setMenuItems(res.data.data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadBuffets = async () => {
    try {
      const res = await restaurantAPI.getAdminBuffets({ restaurantId: selectedRestFilter || undefined });
      if (res.data?.data) setBuffets(res.data.data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadOffers = async () => {
    try {
      const res = await restaurantAPI.getAdminOffers({ restaurantId: selectedRestFilter || undefined });
      if (res.data?.data) setOffers(res.data.data);
    } catch (err) {
      console.error(err);
    }
  };

  // Status update
  const handleUpdateStatus = async (id, newStatus) => {
    try {
      await restaurantAPI.updateReservationStatus(id, { status: newStatus });
      toast.success(`Reservation marked as ${newStatus}`);
      loadReservations();
      // Refresh dashboard counts
      const s = await restaurantAPI.getDashboardStats();
      if (s.data?.data) setStats(s.data.data);
    } catch (err) {
      toast.error('Failed to update reservation status');
    }
  };

  // Charge to Folio
  const handlePostFolioCharge = async (e) => {
    e.preventDefault();
    if (!folioModalRes || !chargeAmount) return;

    try {
      setChargingFolio(true);
      const res = await restaurantAPI.chargeFolio(folioModalRes._id, {
        amount: parseFloat(chargeAmount),
        description: chargeDescription || `Dining at ${folioModalRes.restaurant?.name || 'Hotel Restaurant'}`
      });
      if (res.data?.success) {
        toast.success(res.data.message || 'Successfully charged to guest room folio!');
        setFolioModalRes(null);
        setChargeAmount('');
        setChargeDescription('');
        loadReservations();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to post charge to guest folio');
    } finally {
      setChargingFolio(false);
    }
  };

  // Table creation
  const handleCreateTable = async (e) => {
    e.preventDefault();
    try {
      const targetRest = tableForm.restaurant || (restaurants[0]?._id);
      await restaurantAPI.createTable({ ...tableForm, restaurant: targetRest });
      toast.success('Table created successfully');
      setShowTableModal(false);
      loadTables();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create table');
    }
  };

  const handleSaveRestaurant = async (event) => {
    event.preventDefault();
    if (!restaurantForm) return;
    setSavingRestaurant(true);
    try {
      const body = { ...restaurantForm, capacity: Number(restaurantForm.capacity) };
      if (restaurantForm._id) await restaurantAPI.updateRestaurant(restaurantForm._id, body);
      else await restaurantAPI.createRestaurant(body);
      const response = await restaurantAPI.getAdminRestaurants();
      const updated = response.data?.data || [];
      setRestaurants(updated);
      toast.success(restaurantForm._id ? 'Restaurant updated.' : 'Restaurant created.');
      setRestaurantForm(null);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Unable to save restaurant.');
    } finally {
      setSavingRestaurant(false);
    }
  };

  const handleDeactivateRestaurant = async (restaurant) => {
    if (!window.confirm(`Deactivate ${restaurant.name}? Existing restaurant records will be retained.`)) return;
    try {
      await restaurantAPI.deleteRestaurant(restaurant._id);
      setRestaurants((current) => current.map((item) => item._id === restaurant._id ? { ...item, active: false } : item));
      toast.success('Restaurant deactivated.');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Unable to deactivate restaurant.');
    }
  };

  return (
    <div className="rest-admin-wrap">
      
      {/* 1. Header & Title */}
      <div className="rest-admin-header">
        <div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 600, color: 'var(--c-forest-deep)', margin: 0 }}>
            Restaurant & Dining Management
          </h1>
          <p style={{ color: 'var(--c-text-muted)', fontSize: '0.88rem', margin: '0.25rem 0 0 0' }}>
            Table reservations, room folio billing, seating inventory, menus, buffets, and offers.
          </p>
        </div>

        {/* Global Restaurant Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button type="button" className="btn btn-primary" onClick={() => setRestaurantForm({ name: '', slug: '', cuisine: '', location: '', openingHours: '', contactPhone: '', contactEmail: '', description: '', heroImage: '', capacity: 80, active: true })}><FaPlus /> Add Restaurant</button>
          <select 
            className="rest-form-select"
            style={{ minWidth: '220px', padding: '0.65rem 1rem' }}
            value={selectedRestFilter}
            onChange={(e) => setSelectedRestFilter(e.target.value)}
          >
            <option value="">All Restaurants</option>
            {restaurants.map((r) => (
              <option key={r._id} value={r._id}>{r.name}</option>
            ))}
          </select>
        </div>
      </div>

      <section id="restaurant-records" className="rest-admin-table-container" style={{ marginBottom: '1.25rem', padding: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>Restaurants</h2>
        {restaurants.length ? <div style={{ overflowX: 'auto' }}><table className="rest-pms-table"><thead><tr><th>Name</th><th>Cuisine</th><th>Location</th><th>Status</th><th>Actions</th></tr></thead><tbody>{restaurants.map((restaurant) => <tr key={restaurant._id}><td>{restaurant.name}</td><td>{restaurant.cuisine}</td><td>{restaurant.location}</td><td>{restaurant.active ? 'Active' : 'Inactive'}</td><td><button type="button" onClick={() => setRestaurantForm({ ...restaurant })}><FaEdit /> Edit</button> {restaurant.active && <button type="button" onClick={() => handleDeactivateRestaurant(restaurant)}><FaTimes /> Deactivate</button>}</td></tr>)}</tbody></table></div> : <p>No restaurants are configured for this property.</p>}
      </section>

      {/* 2. Dashboard KPI Statistics (Requirement 21) */}
      {stats && (
        <div className="rest-admin-stats-grid">
          <div className="rest-stat-card">
            <div className="rest-stat-icon-wrap">
              <FaCalendarAlt />
            </div>
            <div>
              <div className="rest-stat-val">{stats.todayReservationsCount || 0}</div>
              <div className="rest-stat-lbl">Today's Bookings</div>
            </div>
          </div>

          <div className="rest-stat-card">
            <div className="rest-stat-icon-wrap">
              <FaUsers />
            </div>
            <div>
              <div className="rest-stat-val">{stats.todayCovers || 0}</div>
              <div className="rest-stat-lbl">Today's Covers</div>
            </div>
          </div>

          <div className="rest-stat-card">
            <div className="rest-stat-icon-wrap" style={{ background: '#E8F5E9', color: '#2E7D32' }}>
              <FaChair />
            </div>
            <div>
              <div className="rest-stat-val">{stats.availableTables || 0}</div>
              <div className="rest-stat-lbl">Available Tables</div>
            </div>
          </div>

          <div className="rest-stat-card">
            <div className="rest-stat-icon-wrap" style={{ background: '#FFF3E0', color: '#E65100' }}>
              <FaChair />
            </div>
            <div>
              <div className="rest-stat-val">{stats.occupiedTables || 0}</div>
              <div className="rest-stat-lbl">Occupied Tables</div>
            </div>
          </div>

          <div className="rest-stat-card">
            <div className="rest-stat-icon-wrap">
              <FaClock />
            </div>
            <div>
              <div className="rest-stat-val">{stats.pendingReservations || 0}</div>
              <div className="rest-stat-lbl">Pending Requests</div>
            </div>
          </div>

          <div className="rest-stat-card">
            <div className="rest-stat-icon-wrap">
              <FaUtensils />
            </div>
            <div>
              <div className="rest-stat-val">{stats.upcomingBuffets || 0}</div>
              <div className="rest-stat-lbl">Active Buffets</div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Navigation Tabs */}
      <div className="rest-admin-tabs">
        <button 
          type="button" 
          className={`rest-admin-tab-btn ${activeTab === 'reservations' ? 'active' : ''}`}
          onClick={() => setActiveTab('reservations')}
        >
          <FaCalendarAlt /> Reservations & Folio Billing
        </button>
        <button 
          type="button" 
          className={`rest-admin-tab-btn ${activeTab === 'tables' ? 'active' : ''}`}
          onClick={() => setActiveTab('tables')}
        >
          <FaChair /> Seating & Tables
        </button>
        <button 
          type="button" 
          className={`rest-admin-tab-btn ${activeTab === 'menus' ? 'active' : ''}`}
          onClick={() => setActiveTab('menus')}
        >
          <FaUtensils /> Menu Items
        </button>
        <button 
          type="button" 
          className={`rest-admin-tab-btn ${activeTab === 'buffets' ? 'active' : ''}`}
          onClick={() => setActiveTab('buffets')}
        >
          <FaClock /> International Buffets
        </button>
      </div>

      {/* ============================================================
         TAB 1: RESERVATIONS & FOLIO BILLING (Requirement 20 & 22)
         ============================================================ */}
      {activeTab === 'reservations' && (
        <div>
          {/* Reservation Filter Controls */}
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <input 
              type="date"
              className="rest-form-input"
              style={{ width: 'auto' }}
              value={resDateFilter}
              onChange={(e) => setResDateFilter(e.target.value)}
            />

            <select 
              className="rest-form-select"
              style={{ width: 'auto' }}
              value={resStatusFilter}
              onChange={(e) => setResStatusFilter(e.target.value)}
            >
              <option value="ALL">All Statuses</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="SEATED">Seated</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="PENDING">Pending</option>
            </select>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: '220px' }}>
              <input 
                type="text"
                className="rest-form-input"
                placeholder="Search guest, email, phone, room or ref..."
                value={resSearch}
                onChange={(e) => setResSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') loadReservations(); }}
              />
              <button 
                type="button" 
                className="rest-btn-primary"
                style={{ padding: '0.8rem 1.25rem' }}
                onClick={loadReservations}
              >
                <FaSearch />
              </button>
            </div>
          </div>

          <div className="rest-admin-table-container">
            <table className="rest-pms-table">
              <thead>
                <tr>
                  <th>Ref #</th>
                  <th>Guest / Contact</th>
                  <th>Restaurant</th>
                  <th>Date & Time</th>
                  <th>Party</th>
                  <th>Type & Seating</th>
                  <th>Status</th>
                  <th>Folio / Room Charge</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {reservations.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '3rem', color: 'var(--c-text-muted)' }}>
                      No reservations matching the current filters.
                    </td>
                  </tr>
                ) : (
                  reservations.map((r) => (
                    <tr key={r._id}>
                      <td>
                        <strong>{r.confirmationNumber}</strong>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--c-forest-deep)' }}>{r.customerName}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--c-text-muted)' }}>{r.phone}</div>
                        {r.email && <div style={{ fontSize: '0.74rem', color: 'var(--c-text-muted)' }}>{r.email}</div>}
                      </td>
                      <td>{r.restaurant?.name || 'Restaurant'}</td>
                      <td>
                        <div>{r.date}</div>
                        <strong style={{ color: 'var(--c-brass)' }}>{r.time}</strong>
                      </td>
                      <td>
                        <strong>{r.guestCount}</strong> guests
                      </td>
                      <td>
                        <div>{r.diningType}</div>
                        <span style={{ fontSize: '0.76rem', color: 'var(--c-text-muted)' }}>
                          {r.seatingPreference} &bull; {r.guestType}
                        </span>
                        {r.roomNumber && (
                          <div style={{ fontSize: '0.74rem', color: '#1565C0', fontWeight: 600 }}>
                            Room: {r.roomNumber}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={`rest-status-badge ${r.status?.toLowerCase()}`}>
                          {r.status}
                        </span>
                      </td>
                      <td>
                        {r.guestType === 'Hotel Guest' && r.hotelReservation ? (
                          r.billedToFolio ? (
                            <span style={{ color: '#2E7D32', fontSize: '0.78rem', fontWeight: 600 }}>
                              ✓ Billed: LKR {r.totalAmount?.toLocaleString()}
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="rest-btn-secondary"
                              style={{ padding: '0.35rem 0.65rem', fontSize: '0.74rem', color: 'var(--c-forest-deep)' }}
                              onClick={() => setFolioModalRes(r)}
                            >
                              <FaFileInvoiceDollar /> Charge Room
                            </button>
                          )
                        ) : (
                          <span style={{ fontSize: '0.74rem', color: 'var(--c-text-muted)' }}>
                            Outside Guest
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          {r.status !== 'SEATED' && r.status !== 'COMPLETED' && r.status !== 'CANCELLED' && (
                            <button
                              type="button"
                              title="Mark Seated"
                              style={{ padding: '0.4rem 0.6rem', background: '#E3F2FD', color: '#1565C0', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.76rem' }}
                              onClick={() => handleUpdateStatus(r._id, 'SEATED')}
                            >
                              Seat
                            </button>
                          )}
                          {r.status === 'SEATED' && (
                            <button
                              type="button"
                              title="Mark Completed"
                              style={{ padding: '0.4rem 0.6rem', background: '#E8F5E9', color: '#2E7D32', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.76rem' }}
                              onClick={() => handleUpdateStatus(r._id, 'COMPLETED')}
                            >
                              Complete
                            </button>
                          )}
                          {r.status !== 'CANCELLED' && r.status !== 'COMPLETED' && (
                            <button
                              type="button"
                              title="Cancel Reservation"
                              style={{ padding: '0.4rem 0.6rem', background: '#FFEBEE', color: '#C62828', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.76rem' }}
                              onClick={() => handleUpdateStatus(r._id, 'CANCELLED')}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================
         TAB 2: SEATING & TABLES (Requirement 11)
         ============================================================ */}
      {activeTab === 'tables' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--c-forest-deep)' }}>Table Inventory & Floor Management</h3>
            <button
              type="button"
              className="rest-btn-primary"
              onClick={() => setShowTableModal(true)}
            >
              <FaPlus /> Add Table
            </button>
          </div>

          <div className="rest-admin-table-container">
            <table className="rest-pms-table">
              <thead>
                <tr>
                  <th>Table #</th>
                  <th>Restaurant</th>
                  <th>Capacity</th>
                  <th>Location / Area</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tables.map((t) => (
                  <tr key={t._id}>
                    <td><strong>{t.tableNumber}</strong></td>
                    <td>{t.restaurant?.name || 'Restaurant'}</td>
                    <td>{t.capacity} Guests</td>
                    <td>{t.location}</td>
                    <td>{t.type}</td>
                    <td>
                      <span className={`rest-status-badge ${t.status?.toLowerCase()}`}>
                        {t.status}
                      </span>
                    </td>
                    <td>
                      <select
                        style={{ padding: '0.3rem', fontSize: '0.8rem', borderRadius: '4px' }}
                        value={t.status}
                        onChange={async (e) => {
                          await restaurantAPI.updateTable(t._id, { status: e.target.value });
                          toast.success('Table status updated');
                          loadTables();
                        }}
                      >
                        <option value="AVAILABLE">AVAILABLE</option>
                        <option value="OCCUPIED">OCCUPIED</option>
                        <option value="RESERVED">RESERVED</option>
                        <option value="CLEANING">CLEANING</option>
                        <option value="OUT_OF_SERVICE">OUT_OF_SERVICE</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================
         TAB 3: MENUS (Requirement 6 & 20)
         ============================================================ */}
      {activeTab === 'menus' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--c-forest-deep)' }}>À la Carte Menu Management</h3>
          </div>

          <div className="rest-admin-table-container">
            <table className="rest-pms-table">
              <thead>
                <tr>
                  <th>Dish Name</th>
                  <th>Category</th>
                  <th>Restaurant</th>
                  <th>Price</th>
                  <th>Dietary Tags</th>
                  <th>Availability</th>
                </tr>
              </thead>
              <tbody>
                {menuItems.map((item) => (
                  <tr key={item._id}>
                    <td>
                      <strong>{item.name}</strong>
                      <div style={{ fontSize: '0.78rem', color: 'var(--c-text-muted)' }}>{item.description}</div>
                    </td>
                    <td>{item.category?.name || 'General'}</td>
                    <td>{item.restaurant?.name}</td>
                    <td><strong>{item.currency} {item.price?.toLocaleString()}</strong></td>
                    <td>
                      {item.dietaryTags?.map(t => (
                        <span key={t} className="rest-tag-pill" style={{ marginRight: '0.2rem' }}>{t}</span>
                      ))}
                    </td>
                    <td>
                      <button
                        type="button"
                        style={{
                          padding: '0.3rem 0.6rem',
                          borderRadius: '4px',
                          border: 'none',
                          cursor: 'pointer',
                          background: item.available ? '#E8F5E9' : '#FFEBEE',
                          color: item.available ? '#2E7D32' : '#C62828',
                          fontSize: '0.78rem',
                          fontWeight: 600
                        }}
                        onClick={async () => {
                          await restaurantAPI.updateMenuItem(item._id, { available: !item.available });
                          toast.success('Updated menu availability');
                          loadMenuItems();
                        }}
                      >
                        {item.available ? 'Available' : 'Unavailable'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================
         TAB 4: BUFFET SESSIONS (Requirement 8 & 20)
         ============================================================ */}
      {activeTab === 'buffets' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--c-forest-deep)' }}>International Buffet Sessions</h3>
          </div>

          <div className="rest-admin-table-container">
            <table className="rest-pms-table">
              <thead>
                <tr>
                  <th>Session Name</th>
                  <th>Period</th>
                  <th>Hours</th>
                  <th>Adult Price</th>
                  <th>Child Price</th>
                  <th>Hotel Guest Rate</th>
                  <th>Theme</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                {buffets.map((b) => (
                  <tr key={b._id}>
                    <td><strong>{b.name}</strong></td>
                    <td>{b.mealPeriod}</td>
                    <td>{b.startTime} — {b.endTime}</td>
                    <td>{b.currency} {b.adultPrice?.toLocaleString()}</td>
                    <td>{b.currency} {b.childPrice?.toLocaleString()}</td>
                    <td>{b.hotelGuestPrice === 0 ? 'Complimentary' : `${b.currency} ${b.hotelGuestPrice?.toLocaleString()}`}</td>
                    <td>{b.theme}</td>
                    <td>
                      <span className={`rest-status-badge ${b.active ? 'confirmed' : 'cancelled'}`}>
                        {b.active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================
         FOLIO CHARGING MODAL (Requirement 22)
         ============================================================ */}
      {folioModalRes && (
        <div className="rest-modal-backdrop" onClick={() => setFolioModalRes(null)}>
          <div className="rest-res-modal-panel" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div className="rest-res-modal-header">
              <h3 style={{ margin: 0, color: '#FFF' }}>Charge Dining Bill to Guest Folio</h3>
              <p style={{ margin: '0.25rem 0 0 0', color: 'rgba(253, 252, 247, 0.8)', fontSize: '0.85rem' }}>
                Ref: {folioModalRes.confirmationNumber} &bull; Room {folioModalRes.roomNumber}
              </p>
            </div>

            <form onSubmit={handlePostFolioCharge} className="rest-res-modal-body">
              <div style={{ background: 'var(--c-sand-subtle)', padding: '1rem', borderRadius: '6px', marginBottom: '1.25rem', fontSize: '0.88rem' }}>
                <div>Guest: <strong>{folioModalRes.customerName}</strong></div>
                <div>Venue: <strong>{folioModalRes.restaurant?.name}</strong></div>
                <div>Table Guests: <strong>{folioModalRes.guestCount}</strong></div>
              </div>

              <div className="rest-form-group">
                <label className="rest-form-label">Total Bill Amount (LKR) *</label>
                <input 
                  type="number"
                  min="1"
                  step="0.01"
                  className="rest-form-input"
                  placeholder="e.g. 18500"
                  value={chargeAmount}
                  onChange={(e) => setChargeAmount(e.target.value)}
                  required
                />
              </div>

              <div className="rest-form-group">
                <label className="rest-form-label">Charge Line Description</label>
                <input 
                  type="text"
                  className="rest-form-input"
                  placeholder="e.g. Seafood Dinner at Azure Tide"
                  value={chargeDescription}
                  onChange={(e) => setChargeDescription(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  className="rest-btn-secondary"
                  style={{ color: 'var(--c-forest-deep)', borderColor: 'var(--c-border-medium)' }}
                  onClick={() => setFolioModalRes(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rest-btn-primary"
                  disabled={chargingFolio}
                >
                  {chargingFolio ? 'Posting to Folio...' : 'Post to Room Folio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {restaurantForm && <div className="rest-modal-backdrop" role="presentation"><form className="rest-res-modal-panel" onSubmit={handleSaveRestaurant}><div className="rest-res-modal-header"><h2>{restaurantForm._id ? 'Edit Restaurant' : 'Add Restaurant'}</h2></div><div className="rest-res-modal-body"><label className="rest-form-group">Name<input className="rest-form-input" required value={restaurantForm.name} onChange={(e) => setRestaurantForm({ ...restaurantForm, name: e.target.value })} /></label><label className="rest-form-group">Cuisine<input className="rest-form-input" required value={restaurantForm.cuisine} onChange={(e) => setRestaurantForm({ ...restaurantForm, cuisine: e.target.value })} /></label><label className="rest-form-group">Location<input className="rest-form-input" required value={restaurantForm.location} onChange={(e) => setRestaurantForm({ ...restaurantForm, location: e.target.value })} /></label><label className="rest-form-group">Opening hours<input className="rest-form-input" required value={restaurantForm.openingHours} onChange={(e) => setRestaurantForm({ ...restaurantForm, openingHours: e.target.value })} /></label><label className="rest-form-group">Capacity<input className="rest-form-input" type="number" min="1" required value={restaurantForm.capacity} onChange={(e) => setRestaurantForm({ ...restaurantForm, capacity: e.target.value })} /></label><label className="rest-form-group">Contact phone<input className="rest-form-input" value={restaurantForm.contactPhone || ''} onChange={(e) => setRestaurantForm({ ...restaurantForm, contactPhone: e.target.value })} /></label><label className="rest-form-group">Contact email<input className="rest-form-input" type="email" value={restaurantForm.contactEmail || ''} onChange={(e) => setRestaurantForm({ ...restaurantForm, contactEmail: e.target.value })} /></label><label className="rest-form-group">Description<textarea className="rest-form-input" value={restaurantForm.description || ''} onChange={(e) => setRestaurantForm({ ...restaurantForm, description: e.target.value })} /></label><label className="rest-form-group">Image URL<input className="rest-form-input" type="url" value={restaurantForm.heroImage || ''} onChange={(e) => setRestaurantForm({ ...restaurantForm, heroImage: e.target.value })} /></label><div><button className="btn btn-primary" disabled={savingRestaurant}>{savingRestaurant ? 'Saving…' : 'Save Restaurant'}</button> <button type="button" className="btn btn-secondary" onClick={() => setRestaurantForm(null)}>Cancel</button></div></div></form></div>}

      {/* ============================================================
         ADD TABLE MODAL
         ============================================================ */}
      {showTableModal && (
        <div className="rest-modal-backdrop" onClick={() => setShowTableModal(false)}>
          <div className="rest-res-modal-panel" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div className="rest-res-modal-header">
              <h3 style={{ margin: 0, color: '#FFF' }}>Add Restaurant Table</h3>
            </div>
            <form onSubmit={handleCreateTable} className="rest-res-modal-body">
              <div className="rest-form-group">
                <label className="rest-form-label">Restaurant</label>
                <select 
                  className="rest-form-select"
                  value={tableForm.restaurant || (restaurants[0]?._id || '')}
                  onChange={(e) => setTableForm({ ...tableForm, restaurant: e.target.value })}
                >
                  {restaurants.map(r => (
                    <option key={r._id} value={r._id}>{r.name}</option>
                  ))}
                </select>
              </div>

              <div className="rest-form-group">
                <label className="rest-form-label">Table Number / Label *</label>
                <input 
                  type="text"
                  className="rest-form-input"
                  placeholder="e.g. T-12 (Window)"
                  value={tableForm.tableNumber}
                  onChange={(e) => setTableForm({ ...tableForm, tableNumber: e.target.value })}
                  required
                />
              </div>

              <div className="rest-form-group">
                <label className="rest-form-label">Seating Capacity *</label>
                <input 
                  type="number"
                  min="1"
                  max="30"
                  className="rest-form-input"
                  value={tableForm.capacity}
                  onChange={(e) => setTableForm({ ...tableForm, capacity: parseInt(e.target.value) || 2 })}
                  required
                />
              </div>

              <div className="rest-form-group">
                <label className="rest-form-label">Location / Area</label>
                <select 
                  className="rest-form-select"
                  value={tableForm.location}
                  onChange={(e) => setTableForm({ ...tableForm, location: e.target.value })}
                >
                  <option value="Indoor">Indoor</option>
                  <option value="Window">Window</option>
                  <option value="Ocean Terrace">Ocean Terrace</option>
                  <option value="Private Dining">Private Dining</option>
                  <option value="Garden">Garden</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  className="rest-btn-secondary"
                  style={{ color: 'var(--c-forest-deep)', borderColor: 'var(--c-border-medium)' }}
                  onClick={() => setShowTableModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="rest-btn-primary">
                  Save Table
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminRestaurants;
