// frontend/src/components/Sidebar.js
import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  FaHome, 
  FaUser, 
  FaBed, 
  FaCalendarAlt, 
  FaFileInvoiceDollar,
  FaChartBar,
  FaPlane,
  FaReceipt,
  FaBroom,
  FaTools,
  FaBoxOpen,
  FaSignOutAlt,
  FaCompass,
  FaShieldAlt,
  FaHotel,
  FaUtensils,
  FaTag,
  FaGlassCheers,
  FaBell,
  FaClipboardCheck,
  FaCreditCard,
  FaChartPie
} from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
const { ROUTE_ROLES, STAFF_ROLES, normalizeRole, hasDepartmentPermission, getDepartmentNavigation } = require('../config/roleAccess');

const Sidebar = ({ isOpen, onClose }) => {
  const location = useLocation();
  const { logout, user } = useAuth();
  const [collapsedSections, setCollapsedSections] = useState({});

  const userRole = normalizeRole(user?.role);
  const isCustomerRole = userRole === 'customer';
  const isSuperAdmin = userRole === 'super_admin';
  const departmentIcons = {
    rooms: <FaBed />,
    reservations: <FaCalendarAlt />,
    guests: <FaUser />,
    dining: <FaUtensils />,
    diningOffers: <FaTag />,
    events: <FaGlassCheers />
  };
  const departmentSections = getDepartmentNavigation(user).map((section) => ({
    title: section.title,
    collapsible: true,
    items: section.items.map((item) => ({ ...item, allowed: [userRole], icon: departmentIcons[item.icon] }))
  }));

  useEffect(() => {
    setCollapsedSections((current) => {
      const next = { ...current };
      departmentSections.forEach((section) => {
        if (section.items.some((item) => isActivePath(location.pathname, item.path))) next[section.title] = false;
      });
      return next;
    });
  }, [location.pathname, userRole]);

  // Role-aware permission check helper
  const canAccess = (allowedRoles, permission) => {
    const roleAllowed = !allowedRoles || allowedRoles.length === 0 || allowedRoles.includes(userRole);
    if (!roleAllowed) return false;
    if (user?.departmentAdmin !== true) return !permission || hasDepartmentPermission(user, permission);
    return Boolean(permission && hasDepartmentPermission(user, permission));
  };

  const menuSections = isCustomerRole
    ? [
        {
          title: 'Guest Portal',
          items: [
            { path: '/', icon: <FaHome />, label: 'Sanctuary Home' },
            { path: '/my-bookings', icon: <FaCalendarAlt />, label: 'My Reservations' },
            { path: '/notifications', icon: <FaBell />, label: 'My Notifications' },
            { path: '/profile', icon: <FaUser />, label: 'My Profile' }
          ]
        }
      ]
    : isSuperAdmin
    ? [
        { title: 'Overview', items: [{ path: '/super-admin/dashboard', icon: <FaHome />, label: 'Super Admin Dashboard', allowed: [userRole] }] },
        ...departmentSections
      ]
    : [
        {
          title: 'Overview',
          items: [
            { path: '/admin-dashboard', icon: <FaHome />, label: 'Operations Dashboard', allowed: ROUTE_ROLES.dashboard, selfService: true }
          ]
        },
        ...departmentSections,
        {
          title: 'Operations',
          items: [
            { path: '/housekeeping', icon: <FaBroom />, label: 'Housekeeping', allowed: ROUTE_ROLES.housekeeping },
            { path: '/maintenance', icon: <FaTools />, label: 'Maintenance', allowed: ROUTE_ROLES.maintenance },
            { path: '/lost-and-found', icon: <FaBoxOpen />, label: 'Lost & Found', allowed: ROUTE_ROLES.lostAndFound }
          ]
        },
        {
          title: 'Finance & Payments',
          items: [
            { path: '/admin/finance', icon: <FaChartPie />, label: 'Financial Dashboard', allowed: ROUTE_ROLES.financialDashboard },
            { path: '/admin/payments', icon: <FaCreditCard />, label: 'Payment Transactions', allowed: ROUTE_ROLES.payments },
            { path: '/invoices', icon: <FaFileInvoiceDollar />, label: 'Invoices & Billing', allowed: ROUTE_ROLES.invoices },
            { path: '/expenses', icon: <FaReceipt />, label: 'Guest Expenses', allowed: ROUTE_ROLES.expenses }
          ]
        },
        {
          title: 'Notifications',
          items: [
            { path: '/notifications', icon: <FaBell />, label: 'Notification Centre', allowed: STAFF_ROLES },
            { path: '/admin/notifications', icon: <FaBell />, label: 'Notification Management', allowed: ROUTE_ROLES.adminNotifications }
          ]
        },
        {
          title: 'Attendance',
          items: [
            { path: '/staff-attendance', icon: <FaClipboardCheck />, label: 'My Attendance', allowed: STAFF_ROLES, selfService: true },
            { path: '/admin/attendance', icon: <FaClipboardCheck />, label: 'Attendance Review', allowed: ['admin'] }
          ]
        },
        {
          title: 'Reports',
          items: [
            { path: '/reports', icon: <FaChartBar />, label: 'Analytics & Reports', allowed: ROUTE_ROLES.reports }
          ]
        },
        {
          title: 'Administration',
          items: [
            { path: '/travel-agents', icon: <FaPlane />, label: 'Travel Partners', allowed: ROUTE_ROLES.travelAgents }
          ]
        },
        {
          title: 'Account',
          items: [
            { path: '/profile', icon: <FaShieldAlt />, label: 'Staff Profile', allowed: STAFF_ROLES, selfService: true }
          ]
        }
      ];

  const isActive = (path) => {
    if (path === '/admin-dashboard' && location.pathname === '/dashboard') return true;
    if (['/rooms', '/admin/restaurants', '/admin/events'].includes(path) && location.pathname.endsWith('/dashboard')) return false;
    return location.pathname === path || (path !== '/' && location.pathname.startsWith(path + '/'));
  };

  const getUserInitials = () => {
    if (!user?.name) return 'ST';
    return user.name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleNavClick = () => {
    if (onClose) onClose();
  };

  return (
    <>
      <div 
        className={`sidebar-overlay ${isOpen ? 'active' : ''}`} 
        onClick={onClose} 
        aria-hidden="true"
      />
      <aside className={`sidebar ${isOpen ? 'open' : ''}`} aria-label="Staff Navigation">
        {/* Brand Header */}
        <div className="sidebar-header">
          <Link to={isSuperAdmin ? '/super-admin/dashboard' : '/admin-dashboard'} className="sidebar-brand" onClick={handleNavClick}>
            <div className="sidebar-logo">
              <span>🇱🇰</span>
            </div>
            <div className="sidebar-brand-text">
              <span className="sidebar-brand-title">Serendib Sanctuary</span>
              <span className="sidebar-brand-sub">Hotel Operations PMS</span>
            </div>
          </Link>
        </div>

        {/* Menu Navigation Sections */}
        <nav className="sidebar-menu">
          {menuSections.map((section) => {
            const visibleItems = section.items.filter(item => item.selfService ? item.allowed.includes(userRole) : canAccess(item.allowed, item.permission));
            if (visibleItems.length === 0) return null;

            return (
              <div key={section.title} className="sidebar-group">
                {section.collapsible ? (
                  <button
                    type="button"
                    className="sidebar-section sidebar-section-toggle"
                    aria-expanded={!collapsedSections[section.title]}
                    onClick={() => setCollapsedSections((current) => ({ ...current, [section.title]: !current[section.title] }))}
                  >
                    <span>{section.title}</span><span aria-hidden="true">{collapsedSections[section.title] ? '+' : '−'}</span>
                  </button>
                ) : <div className="sidebar-section">{section.title}</div>}
                {!collapsedSections[section.title] && visibleItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`sidebar-link ${isActive(item.path) ? 'active' : ''}`}
                    onClick={handleNavClick}
                    title={item.label}
                  >
                    <span className="sidebar-link-icon">{item.icon}</span>
                    <span className="sidebar-link-label">{item.label}</span>
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>

        {/* Footer: User Profile & Logout */}
        <div className="sidebar-footer">
          <Link 
            to="/profile" 
            className="sidebar-user" 
            onClick={handleNavClick}
            title="View Staff Profile"
          >
            <div className="sidebar-user-avatar">
              {getUserInitials()}
            </div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{user?.name || 'Staff Member'}</div>
              <div className="sidebar-user-role">{user?.role || 'Staff'}</div>
            </div>
          </Link>

          <button 
            type="button"
            onClick={logout} 
            className="sidebar-logout-btn"
            title="Sign Out of PMS"
          >
            <FaSignOutAlt />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
};

function isActivePath(pathname, path) {
  return pathname === path || pathname.startsWith(`${path}/`);
}

export default Sidebar;
