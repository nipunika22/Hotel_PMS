// frontend/src/components/NotificationBell.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  FaBell, 
  FaCheckDouble, 
  FaCheck, 
  FaCalendarAlt, 
  FaBroom, 
  FaTools, 
  FaFileInvoiceDollar, 
  FaUtensils, 
  FaBullhorn, 
  FaInfoCircle, 
  FaArrowRight, 
  FaInbox 
} from 'react-icons/fa';
import { notificationAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import './NotificationBell.css';

// Map notification categories to respective icons and CSS classes
const CATEGORY_META = {
  reservation: { icon: <FaCalendarAlt />, className: 'notif-icon-reservation' },
  dining: { icon: <FaUtensils />, className: 'notif-icon-dining' },
  housekeeping: { icon: <FaBroom />, className: 'notif-icon-housekeeping' },
  maintenance: { icon: <FaTools />, className: 'notif-icon-maintenance' },
  billing: { icon: <FaFileInvoiceDollar />, className: 'notif-icon-billing' },
  announcement: { icon: <FaBullhorn />, className: 'notif-icon-announcement' },
  system: { icon: <FaInfoCircle />, className: 'notif-icon-system' }
};

// Friendly relative time formatter
const formatRelativeTime = (dateString) => {
  if (!dateString) return '';
  const now = new Date();
  const date = new Date(dateString);
  const diffSec = Math.floor((now - date) / 1000);

  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDays = Math.floor(diffHour / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const NotificationBell = ({ theme = 'default' }) => {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [recentNotifications, setRecentNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  const dropdownRef = useRef(null);

  // Fetch unread count & recent notifications
  const fetchNotificationData = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const [countRes, listRes] = await Promise.all([
        notificationAPI.getUnreadCount(),
        notificationAPI.getMyNotifications({ limit: 5 })
      ]);
      setUnreadCount(countRes.data?.unreadCount || 0);
      setRecentNotifications(listRes.data?.notifications || []);
    } catch (err) {
      // Quietly handle network failure to avoid disrupting navigation
    }
  }, [isAuthenticated]);

  // Initial load and periodic 30s background polling
  useEffect(() => {
    if (!isAuthenticated) return;

    fetchNotificationData();

    const interval = setInterval(() => {
      fetchNotificationData();
    }, 30000); // 30 seconds poll

    return () => clearInterval(interval);
  }, [isAuthenticated, fetchNotificationData]);

  // Close dropdown on click outside or Escape key
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const toggleDropdown = () => {
    if (!isOpen) {
      fetchNotificationData();
    }
    setIsOpen(prev => !prev);
  };

  const handleMarkAsRead = async (e, notificationId) => {
    e.stopPropagation();
    try {
      await notificationAPI.markAsRead(notificationId);
      setRecentNotifications(prev =>
        prev.map(n => n._id === notificationId ? { ...n, isRead: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark read:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await notificationAPI.markAllAsRead();
      setRecentNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  const handleItemClick = (notification) => {
    if (!notification.isRead) {
      notificationAPI.markAsRead(notification._id).catch(() => {});
      setRecentNotifications(prev =>
        prev.map(n => n._id === notification._id ? { ...n, isRead: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    }

    setIsOpen(false);

    if (notification.actionUrl) {
      navigate(notification.actionUrl);
    } else {
      navigate('/notifications');
    }
  };

  if (!isAuthenticated) return null;

  return (
    <div className={`notif-bell-container ${theme}`} ref={dropdownRef}>
      {/* Bell Button */}
      <button 
        type="button" 
        className="notif-bell-btn" 
        onClick={toggleDropdown}
        aria-label="View notifications"
        aria-expanded={isOpen}
        title={unreadCount > 0 ? `${unreadCount} unread notification(s)` : 'Notifications'}
      >
        <FaBell />
        {unreadCount > 0 && (
          <span className="notif-badge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="notif-dropdown" role="region" aria-label="Recent notifications">
          {/* Header */}
          <div className="notif-dropdown-header">
            <div className="notif-header-title">
              <span>Notifications</span>
              {unreadCount > 0 && (
                <span className="notif-header-pill">{unreadCount} New</span>
              )}
            </div>

            {unreadCount > 0 && (
              <button 
                type="button" 
                className="notif-btn-mark-all"
                onClick={handleMarkAllAsRead}
                title="Mark all as read"
              >
                <FaCheckDouble size={11} />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          {/* List */}
          <ul className="notif-dropdown-list">
            {recentNotifications.length > 0 ? (
              recentNotifications.map(notification => {
                const meta = CATEGORY_META[notification.category] || CATEGORY_META.system;
                return (
                  <li 
                    key={notification._id}
                    className={`notif-item ${!notification.isRead ? 'is-unread' : ''}`}
                    onClick={() => handleItemClick(notification)}
                  >
                    <div className={`notif-icon-avatar ${meta.className}`}>
                      {meta.icon}
                    </div>

                    <div className="notif-item-body">
                      <div className="notif-item-header">
                        <span className="notif-item-title">{notification.title}</span>
                        <span className="notif-item-time">{formatRelativeTime(notification.createdAt)}</span>
                      </div>

                      <p className="notif-item-msg">{notification.message}</p>

                      <div className="notif-item-actions">
                        {notification.actionUrl && (
                          <span className="notif-link-btn">
                            <span>View Details</span>
                            <FaArrowRight size={9} />
                          </span>
                        )}

                        {!notification.isRead && (
                          <button
                            type="button"
                            className="notif-mark-read-btn"
                            title="Mark as read"
                            aria-label="Mark notification as read"
                            onClick={(e) => handleMarkAsRead(e, notification._id)}
                          >
                            <FaCheck />
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })
            ) : (
              <li className="notif-empty-state">
                <FaInbox className="notif-empty-icon" />
                <p>No notifications yet</p>
              </li>
            )}
          </ul>

          {/* Footer */}
          <div className="notif-dropdown-footer">
            <Link 
              to="/notifications" 
              className="notif-footer-link"
              onClick={() => setIsOpen(false)}
            >
              <span>View All Notifications</span>
              <FaArrowRight size={11} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
