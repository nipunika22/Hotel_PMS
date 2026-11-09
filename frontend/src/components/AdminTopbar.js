// frontend/src/components/AdminTopbar.js
import React, { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { 
  FaBars, 
  FaSignOutAlt
} from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';
import { propertyAPI, superAdminAPI } from '../services/api';

const ROUTE_TITLES = {
  '/dashboard': { title: 'Operations Dashboard', category: 'Overview' },
  '/admin-dashboard': { title: 'Operations Dashboard', category: 'Overview' },
  '/reservations': { title: 'Reservations & Bookings', category: 'Front Office' },
  '/reservations/new': { title: 'Create Reservation', category: 'Front Office' },
  '/guests': { title: 'Guest Profiles & CRM', category: 'Front Office' },
  '/guests/new': { title: 'Register Guest', category: 'Front Office' },
  '/rooms': { title: 'Room Inventory & Status', category: 'Front Office' },
  '/rooms/new': { title: 'Add New Room', category: 'Front Office' },
  '/housekeeping': { title: 'Housekeeping & Inspections', category: 'Operations' },
  '/maintenance': { title: 'Maintenance & Repairs', category: 'Operations' },
  '/lost-and-found': { title: 'Lost & Found Registry', category: 'Operations' },
  '/invoices': { title: 'Billing & Invoices', category: 'Finance' },
  '/expenses': { title: 'Guest Expenses & Ledger', category: 'Finance' },
  '/expenses/new': { title: 'Record Guest Expense', category: 'Finance' },
  '/travel-agents': { title: 'Travel Partner Directory', category: 'Management' },
  '/travel-agents/new': { title: 'Add Travel Agent', category: 'Management' },
  '/reports': { title: 'Operational Analytics & Reports', category: 'Management' },
  '/admin/notifications': { title: 'Notification Management & Campaigns', category: 'Management' },
  '/notifications': { title: 'Staff Notification Centre', category: 'Account' },
  '/profile': { title: 'Staff Profile & Security', category: 'Account' }
};

const AdminTopbar = ({ onToggleSidebar }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const isSuperAdmin = user?.role === 'super_admin';
  const isDepartmentAdmin = user?.role === 'admin' && user?.departmentAdmin === true;
  const canSelectProperty = isSuperAdmin || isDepartmentAdmin;
  const assignedPropertyIds = [...new Set([user?.property, ...(user?.allowedProperties || [])]
    .filter(Boolean).map((property) => String(property._id || property)))];
  const [properties, setProperties] = useState([]);
  const [propertyError, setPropertyError] = useState('');
  const [propertyId, setPropertyId] = useState(() => {
    const selected = localStorage.getItem('superAdminPropertyContext') || '';
    return isDepartmentAdmin && !assignedPropertyIds.includes(selected) ? '' : selected;
  });

  useEffect(() => {
    if (!canSelectProperty) return;
    const request = isSuperAdmin
      ? superAdminAPI.getProperties({ page: 1, pageSize: 100, status: 'Active' }).then((response) => response.data.items || [])
      : propertyAPI.getProperties().then((response) => (response.data || []).filter((property) => assignedPropertyIds.includes(String(property._id))));
    request.then((items) => {
      setProperties(items);
      setPropertyError('');
      if (isDepartmentAdmin) {
        const stored = localStorage.getItem('superAdminPropertyContext') || '';
        const next = items.some((property) => String(property._id) === stored)
          ? stored
          : String(items[0]?._id || '');
        setPropertyId(next);
        if (next) localStorage.setItem('superAdminPropertyContext', next);
        else localStorage.removeItem('superAdminPropertyContext');
      }
    })
      .catch(() => setPropertyError('Property selection unavailable'));
  }, [isSuperAdmin, isDepartmentAdmin, canSelectProperty, user?._id]);

  const selectProperty = (event) => {
    const next = event.target.value;
    setPropertyId(next);
    if (next) localStorage.setItem('superAdminPropertyContext', next);
    else localStorage.removeItem('superAdminPropertyContext');
    window.location.reload();
  };

  // Determine current page info
  const path = location.pathname;
  const currentRoute = ROUTE_TITLES[path] || {
    title: path.split('/').filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' / ') || 'Hotel PMS',
    category: 'Operations'
  };

  const getUserInitials = () => {
    if (!user?.name) return 'ST';
    return user.name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <header className="pms-topbar">
      {/* Left: Mobile trigger & Breadcrumb / Page Title */}
      <div className="pms-topbar-left">
        <button 
          type="button"
          className="pms-mobile-menu-btn" 
          onClick={onToggleSidebar}
          aria-label="Toggle navigation menu"
          title="Toggle Navigation Menu"
        >
          <FaBars />
        </button>

        <div className="pms-breadcrumb">
          <span className="pms-breadcrumb-category">{currentRoute.category}</span>
          <span className="pms-breadcrumb-divider">/</span>
          <h1 className="pms-breadcrumb-title">{currentRoute.title}</h1>
        </div>
      </div>

      {/* Right: Operational Notifications & Staff User Profile */}
      <div className="pms-topbar-right">
        {canSelectProperty && <label className="sa-topbar-property"><span>Property</span><select aria-label="Choose property for department pages" value={propertyId} onChange={selectProperty} disabled={Boolean(propertyError)}>{isSuperAdmin && <option value="">Default active property</option>}{properties.map((property) => <option key={property._id} value={property._id}>{property.name}</option>)}</select></label>}
        {/* Operational Notifications Indicator with Real Unread Count & Dropdown */}
        <NotificationBell />

        <div className="pms-topbar-divider" />

        {/* Staff User Menu Card */}
        <div className="pms-user-menu">
          <Link to={isSuperAdmin ? '/super-admin/settings' : '/profile'} className="pms-user-pill" title={isSuperAdmin ? 'Super Admin settings' : 'View & Edit Profile'}>
            <div className="pms-avatar-circle">
              {getUserInitials()}
            </div>
            <div className="pms-user-details">
              <span className="pms-user-name">{user?.name || 'Staff Member'}</span>
              <span className="pms-user-role">{user?.role || 'Staff'}</span>
            </div>
          </Link>

          <button 
            type="button" 
            onClick={logout} 
            className="pms-logout-icon-btn" 
            title="Sign Out of PMS"
            aria-label="Sign Out of PMS"
          >
            <FaSignOutAlt />
          </button>
        </div>
      </div>
    </header>
  );
};

export default AdminTopbar;
