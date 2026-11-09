// frontend/src/pages/NotificationCenter.js
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  FaBell, 
  FaCheckDouble, 
  FaCheck, 
  FaSearch, 
  FaCalendarAlt, 
  FaBroom, 
  FaTools, 
  FaFileInvoiceDollar, 
  FaUtensils, 
  FaBullhorn, 
  FaInfoCircle, 
  FaArrowRight, 
  FaTrashAlt, 
  FaInbox,
  FaArrowLeft
} from 'react-icons/fa';
import { notificationAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import './NotificationCenter.css';

const CATEGORIES = [
  { id: 'all', label: 'All Notifications' },
  { id: 'reservation', label: 'Reservations' },
  { id: 'dining', label: 'Dining & Menus' },
  { id: 'housekeeping', label: 'Housekeeping' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'billing', label: 'Billing & Invoices' },
  { id: 'announcement', label: 'Announcements' },
  { id: 'system', label: 'System' }
];

const CATEGORY_META = {
  reservation: { icon: <FaCalendarAlt />, className: 'notif-icon-reservation', label: 'Reservation' },
  dining: { icon: <FaUtensils />, className: 'notif-icon-dining', label: 'Dining' },
  housekeeping: { icon: <FaBroom />, className: 'notif-icon-housekeeping', label: 'Housekeeping' },
  maintenance: { icon: <FaTools />, className: 'notif-icon-maintenance', label: 'Maintenance' },
  billing: { icon: <FaFileInvoiceDollar />, className: 'notif-icon-billing', label: 'Billing' },
  announcement: { icon: <FaBullhorn />, className: 'notif-icon-announcement', label: 'Announcement' },
  system: { icon: <FaInfoCircle />, className: 'notif-icon-system', label: 'System' }
};

const formatFullDate = (dateString) => {
  if (!dateString) return '';
  const d = new Date(dateString);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const NotificationCenter = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'unread', 'read'
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: 15,
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        search: searchQuery.trim() || undefined
      };

      if (statusFilter === 'unread') params.isRead = 'false';
      if (statusFilter === 'read') params.isRead = 'true';

      const res = await notificationAPI.getMyNotifications(params);
      setNotifications(res.data?.notifications || []);
      setTotalPages(res.data?.totalPages || 1);
      setTotalCount(res.data?.total || 0);
      setUnreadCount(res.data?.unreadCount || 0);
    } catch (err) {
      console.error('Failed to load notifications:', err);
      toast.error('Unable to load notifications.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter, searchQuery, page]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkAsRead = async (id) => {
    try {
      await notificationAPI.markAsRead(id);
      setNotifications(prev =>
        prev.map(n => n._id === id ? { ...n, isRead: true, readAt: new Date() } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
      toast.success('Notification marked as read');
    } catch (err) {
      toast.error('Failed to update notification');
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await notificationAPI.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true, readAt: new Date() })));
      setUnreadCount(0);
      toast.success('All notifications marked as read');
    } catch (err) {
      toast.error('Failed to mark all as read');
    }
  };

  const handleArchive = async (id) => {
    try {
      await notificationAPI.archiveNotification(id);
      setNotifications(prev => prev.filter(n => n._id !== id));
      setTotalCount(prev => Math.max(0, prev - 1));
      toast.info('Notification dismissed');
    } catch (err) {
      toast.error('Failed to dismiss notification');
    }
  };

  const handleActionClick = (notification) => {
    if (!notification.isRead) {
      notificationAPI.markAsRead(notification._id).catch(() => {});
    }
    if (notification.actionUrl) {
      navigate(notification.actionUrl);
    }
  };

  return (
    <div className="notif-center-page">
      {/* Header */}
      <div className="notif-center-header">
        <div className="notif-center-title-group">
          <h1>
            <FaBell />
            <span>Notification Centre</span>
            {unreadCount > 0 && (
              <span className="notif-count-badge">{unreadCount} Unread</span>
            )}
          </h1>
          <p>
            {user?.role === 'customer' 
              ? 'Stay informed with your stay updates, dining confirmations, and hotel communications.'
              : 'Operational messages, room cleaning alerts, maintenance dispatches, and guest updates.'}
          </p>
        </div>

        <div className="notif-center-header-actions">
          {unreadCount > 0 && (
            <button 
              type="button" 
              className="notif-btn-action gold"
              onClick={handleMarkAllAsRead}
            >
              <FaCheckDouble />
              <span>Mark All as Read</span>
            </button>
          )}

          <button 
            type="button" 
            className="notif-btn-action"
            onClick={() => navigate(-1)}
          >
            <FaArrowLeft />
            <span>Back</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="notif-toolbar">
        <div className="notif-toolbar-top">
          {/* Status Tabs */}
          <div className="notif-tabs" role="tablist">
            <button 
              type="button" 
              className={`notif-tab-btn ${statusFilter === 'all' ? 'active' : ''}`}
              onClick={() => { setStatusFilter('all'); setPage(1); }}
            >
              All ({totalCount})
            </button>
            <button 
              type="button" 
              className={`notif-tab-btn ${statusFilter === 'unread' ? 'active' : ''}`}
              onClick={() => { setStatusFilter('unread'); setPage(1); }}
            >
              Unread ({unreadCount})
            </button>
            <button 
              type="button" 
              className={`notif-tab-btn ${statusFilter === 'read' ? 'active' : ''}`}
              onClick={() => { setStatusFilter('read'); setPage(1); }}
            >
              Read
            </button>
          </div>

          {/* Search Box */}
          <div className="notif-search-box">
            <FaSearch className="notif-search-icon" />
            <input 
              type="text" 
              className="notif-search-input"
              placeholder="Search notifications..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            />
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="notif-category-pills">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              type="button"
              className={`notif-pill-btn ${categoryFilter === cat.id ? 'active' : ''}`}
              onClick={() => { setCategoryFilter(cat.id); setPage(1); }}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notification Cards Feed */}
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>
          <div className="spinner" style={{ margin: '0 auto 1rem auto' }} />
          <p>Loading your notifications...</p>
        </div>
      ) : notifications.length > 0 ? (
        <div className="notif-cards-list">
          {notifications.map(item => {
            const meta = CATEGORY_META[item.category] || CATEGORY_META.system;
            const priorityClass = `notif-priority-${item.priority || 'normal'}`;

            return (
              <div 
                key={item._id} 
                className={`notif-card ${!item.isRead ? 'is-unread' : ''}`}
              >
                <div className={`notif-card-avatar ${meta.className}`}>
                  {meta.icon}
                </div>

                <div className="notif-card-main">
                  <div className="notif-card-meta-top">
                    <span className="notif-category-tag" style={{ background: '#F1F5F9', color: '#334155' }}>
                      {meta.label}
                    </span>

                    <span className={`notif-priority-tag ${priorityClass}`}>
                      {(item.priority || 'normal').toUpperCase()}
                    </span>

                    {item.sender?.name && (
                      <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                        From: <strong>{item.sender.name}</strong> ({item.sender.role})
                      </span>
                    )}

                    <span className="notif-timestamp">
                      {formatFullDate(item.createdAt)}
                    </span>
                  </div>

                  <h3 className="notif-card-title">{item.title}</h3>

                  <p className="notif-card-message">{item.message}</p>

                  <div className="notif-card-footer">
                    {item.actionUrl && (
                      <button
                        type="button"
                        className="notif-cta-btn"
                        onClick={() => handleActionClick(item)}
                      >
                        <span>Open Related Page</span>
                        <FaArrowRight size={11} />
                      </button>
                    )}

                    {!item.isRead ? (
                      <button
                        type="button"
                        className="notif-secondary-btn"
                        onClick={() => handleMarkAsRead(item._id)}
                      >
                        <FaCheck size={12} />
                        <span>Mark as Read</span>
                      </button>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                        Read on {formatFullDate(item.readAt)}
                      </span>
                    )}

                    <button
                      type="button"
                      className="notif-secondary-btn notif-dismiss-btn"
                      title="Dismiss notification"
                      onClick={() => handleArchive(item._id)}
                    >
                      <FaTrashAlt size={12} />
                      <span>Dismiss</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="notif-card" style={{ padding: '3.5rem 2rem', textAlign: 'center', display: 'block' }}>
          <FaInbox size={42} style={{ color: '#CBD5E1', marginBottom: '1rem' }} />
          <h3 style={{ fontSize: '1.15rem', color: '#334155', marginBottom: '0.35rem' }}>No notifications found</h3>
          <p style={{ color: '#64748B', fontSize: '0.875rem' }}>
            {statusFilter === 'unread' 
              ? 'You are all caught up! No unread notifications.' 
              : 'You have no notifications matching your current filter selection.'}
          </p>
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="notif-pagination">
          <span>Page {page} of {totalPages} ({totalCount} total)</span>
          <div className="notif-page-btns">
            <button
              type="button"
              className="notif-page-btn"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="notif-page-btn"
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;
