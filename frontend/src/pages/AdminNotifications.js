// frontend/src/pages/AdminNotifications.js
import React, { useState, useEffect, useCallback } from 'react';
import { 
  FaBell, 
  FaPlus, 
  FaSearch, 
  FaUsers, 
  FaUser, 
  FaCheckCircle, 
  FaClock, 
  FaTimes, 
  FaEye, 
  FaPaperPlane, 
  FaExclamationTriangle,
  FaCheckDouble,
  FaCalendarAlt,
  FaBullhorn,
  FaFilter,
  FaLayerGroup,
  FaInbox
} from 'react-icons/fa';
import { notificationAPI } from '../services/api';
import { toast } from 'react-toastify';
import './AdminNotifications.css';

const DEPARTMENTS = [
  'Front Desk',
  'Housekeeping',
  'Maintenance',
  'Finance',
  'Kitchen',
  'Restaurant',
  'Management',
  'General'
];

const ROLES = [
  { value: 'admin', label: 'Administrator' },
  { value: 'manager', label: 'Manager' },
  { value: 'staff', label: 'Front Desk / Staff' },
  { value: 'housekeeping', label: 'Housekeeping' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'finance', label: 'Finance' }
];

const CATEGORIES = [
  { value: 'announcement', label: 'General Announcement' },
  { value: 'reservation', label: 'Reservation Update' },
  { value: 'dining', label: 'Dining & Kitchen' },
  { value: 'housekeeping', label: 'Housekeeping' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'billing', label: 'Billing & Invoice' },
  { value: 'system', label: 'System Notice' }
];

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' }
];

const AdminNotifications = () => {
  // State: Dashboard Stats
  const [stats, setStats] = useState({
    totalSent: 0,
    totalRead: 0,
    totalUnread: 0,
    readRate: 0,
    categories: {},
    priorities: {},
    audiences: {}
  });

  // State: Campaigns List
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [audienceFilter, setAudienceFilter] = useState('all');

  // Modal State: Compose
  const [showComposeModal, setShowComposeModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmBulk, setShowConfirmBulk] = useState(false);

  // Form Fields
  const [composeForm, setComposeForm] = useState({
    title: '',
    message: '',
    category: 'announcement',
    priority: 'normal',
    audience: 'individual',
    targetId: '',
    selectedGuestIds: [],
    department: 'Front Desk',
    role: 'staff',
    actionUrl: '',
    expiresAt: ''
  });

  // Recipient options (for dropdowns)
  const [recipientOptions, setRecipientOptions] = useState({
    staffUsers: [],
    guests: []
  });

  // Estimated recipient count preview
  const [previewCount, setPreviewCount] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Modal State: View Campaign Details
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [campaignRecipients, setCampaignRecipients] = useState([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // 1. Load Stats and Recipient Options
  const loadInitialData = async () => {
    try {
      const [statsRes, optionsRes] = await Promise.all([
        notificationAPI.getAdminStats(),
        notificationAPI.getRecipientOptions()
      ]);
      setStats(statsRes.data?.stats || {});
      setRecipientOptions({
        staffUsers: optionsRes.data?.staffUsers || [],
        guests: optionsRes.data?.guests || []
      });
    } catch (err) {
      console.error('Failed to load initial notification data:', err);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // 2. Load Campaigns Table
  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await notificationAPI.getAdminCampaigns({
        page,
        limit: 10,
        search: searchQuery.trim() || undefined,
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        priority: priorityFilter !== 'all' ? priorityFilter : undefined,
        audience: audienceFilter !== 'all' ? audienceFilter : undefined
      });
      setCampaigns(res.data?.campaigns || []);
      setTotalPages(res.data?.totalPages || 1);
      setTotalCount(res.data?.total || 0);
    } catch (err) {
      console.error('Failed to load campaigns:', err);
      toast.error('Unable to load notification campaigns.');
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery, categoryFilter, priorityFilter, audienceFilter]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  // 3. Dynamic Live Recipient Preview Effect
  useEffect(() => {
    if (!showComposeModal) return;

    let isSubscribed = true;
    const updatePreview = async () => {
      setPreviewLoading(true);
      try {
        const params = {
          audience: composeForm.audience,
          targetId: composeForm.targetId || undefined,
          department: composeForm.department,
          role: composeForm.role,
          selectedGuestIds: composeForm.selectedGuestIds.join(',') || undefined
        };
        const res = await notificationAPI.previewRecipients(params);
        if (isSubscribed) {
          setPreviewCount(res.data?.count || 0);
        }
      } catch (err) {
        if (isSubscribed) setPreviewCount(0);
      } finally {
        if (isSubscribed) setPreviewLoading(false);
      }
    };

    const timer = setTimeout(updatePreview, 300);
    return () => {
      isSubscribed = false;
      clearTimeout(timer);
    };
  }, [
    showComposeModal,
    composeForm.audience,
    composeForm.targetId,
    composeForm.selectedGuestIds,
    composeForm.department,
    composeForm.role
  ]);

  // Handle Form Change
  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setComposeForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Open Compose Modal
  const handleOpenCompose = () => {
    setComposeForm({
      title: '',
      message: '',
      category: 'announcement',
      priority: 'normal',
      audience: 'individual',
      targetId: recipientOptions.staffUsers[0]?._id || '',
      selectedGuestIds: [],
      department: 'Front Desk',
      role: 'staff',
      actionUrl: '',
      expiresAt: ''
    });
    setShowConfirmBulk(false);
    setShowComposeModal(true);
  };

  // Send Notification
  const handleSendNotification = async () => {
    if (!composeForm.title.trim()) {
      toast.error('Please provide a notification title.');
      return;
    }

    if (!composeForm.message.trim()) {
      toast.error('Please enter the message body.');
      return;
    }

    // Require confirmation for bulk sends to all guests or all users
    if (['all_guests', 'all_users'].includes(composeForm.audience) && !showConfirmBulk) {
      setShowConfirmBulk(true);
      return;
    }

    setSubmitting(true);
    try {
      const res = await notificationAPI.sendAdminNotification(composeForm);
      toast.success(`Successfully sent to ${res.data?.count || 0} recipient(s)!`);
      setShowComposeModal(false);
      setShowConfirmBulk(false);
      loadInitialData();
      fetchCampaigns();
    } catch (err) {
      console.error('Send error:', err);
      toast.error(err.response?.data?.error || 'Failed to dispatch notification.');
    } finally {
      setSubmitting(false);
    }
  };

  // View Campaign Delivery Details
  const handleViewDetails = async (campaign) => {
    setSelectedCampaign(campaign);
    setLoadingDetails(true);
    try {
      const res = await notificationAPI.getCampaignDetails(campaign._id);
      setCampaignRecipients(res.data?.recipients || []);
    } catch (err) {
      toast.error('Failed to load campaign recipient details.');
    } finally {
      setLoadingDetails(false);
    }
  };

  return (
    <div className="admin-notif-container">
      {/* Page Header */}
      <div className="admin-notif-header">
        <div className="admin-notif-title-area">
          <h1>
            <FaBell />
            <span>Centralized Notification Management</span>
          </h1>
          <p>
            Create, target, and monitor operational announcements, task alerts, and guest notifications across the hotel chain.
          </p>
        </div>

        <div className="admin-notif-header-actions">
          <button 
            type="button" 
            className="btn-compose-gold"
            onClick={handleOpenCompose}
          >
            <FaPlus />
            <span>Compose Notification</span>
          </button>
        </div>
      </div>

      {/* Metrics Cards Grid */}
      <div className="admin-notif-stats-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-info">
            <span className="admin-stat-label">Total Dispatched</span>
            <h3 className="admin-stat-value">{stats.totalSent || 0}</h3>
            <span className="admin-stat-sub">Across all hotel modules</span>
          </div>
          <div className="admin-stat-icon-wrap stat-icon-blue">
            <FaPaperPlane />
          </div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-info">
            <span className="admin-stat-label">Read Rate</span>
            <h3 className="admin-stat-value">{stats.readRate || 0}%</h3>
            <span className="admin-stat-sub">{stats.totalRead || 0} of {stats.totalSent || 0} read</span>
          </div>
          <div className="admin-stat-icon-wrap stat-icon-green">
            <FaCheckCircle />
          </div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-info">
            <span className="admin-stat-label">Pending / Unread</span>
            <h3 className="admin-stat-value">{stats.totalUnread || 0}</h3>
            <span className="admin-stat-sub">Awaiting recipient action</span>
          </div>
          <div className="admin-stat-icon-wrap stat-icon-gold">
            <FaClock />
          </div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-info">
            <span className="admin-stat-label">Broadcast Campaigns</span>
            <h3 className="admin-stat-value">{totalCount || 0}</h3>
            <span className="admin-stat-sub">Sent announcements</span>
          </div>
          <div className="admin-stat-icon-wrap stat-icon-red">
            <FaBullhorn />
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="admin-notif-toolbar">
        <div className="admin-notif-filters">
          <div className="notif-search-box" style={{ minWidth: '240px' }}>
            <FaSearch className="notif-search-icon" />
            <input 
              type="text" 
              className="notif-search-input"
              placeholder="Search by title or text..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            />
          </div>

          <select 
            className="admin-filter-select"
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
          >
            <option value="all">All Categories</option>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>

          <select 
            className="admin-filter-select"
            value={priorityFilter}
            onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }}
          >
            <option value="all">All Priorities</option>
            {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>

          <select 
            className="admin-filter-select"
            value={audienceFilter}
            onChange={(e) => { setAudienceFilter(e.target.value); setPage(1); }}
          >
            <option value="all">All Audiences</option>
            <option value="individual">Individual</option>
            <option value="guest">Guest</option>
            <option value="department">Department</option>
            <option value="role">Role</option>
            <option value="staff">All Staff</option>
            <option value="all_guests">All Guests</option>
            <option value="all_users">All Users</option>
          </select>
        </div>
      </div>

      {/* Campaigns Table */}
      <div className="admin-notif-table-card">
        <div className="admin-table-container">
          <table className="admin-notif-table">
            <thead>
              <tr>
                <th>Title & Message</th>
                <th>Audience</th>
                <th>Category</th>
                <th>Priority</th>
                <th>Sent Date</th>
                <th>Recipients</th>
                <th>Read Rate</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '3rem' }}>
                    <div className="spinner" style={{ margin: '0 auto 1rem auto' }} />
                    <p style={{ color: '#64748B' }}>Loading notification history...</p>
                  </td>
                </tr>
              ) : campaigns.length > 0 ? (
                campaigns.map(camp => (
                  <tr key={camp._id}>
                    <td style={{ maxWidth: '300px' }}>
                      <strong style={{ color: '#0F172A', display: 'block', fontSize: '0.9rem' }}>
                        {camp.title}
                      </strong>
                      <span style={{ color: '#64748B', fontSize: '0.8rem', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {camp.message}
                      </span>
                    </td>
                    <td>
                      <span className="table-audience-badge">
                        {camp.targetAudience === 'department' ? `Dept: ${camp.targetDepartment || 'General'}` :
                         camp.targetAudience === 'role' ? `Role: ${camp.targetRole}` :
                         camp.targetAudience.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600, color: '#475569' }}>
                        {camp.category}
                      </span>
                    </td>
                    <td>
                      <span className={`notif-priority-tag notif-priority-${camp.priority || 'normal'}`}>
                        {(camp.priority || 'normal').toUpperCase()}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: '#64748B' }}>
                      {new Date(camp.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ fontWeight: 600, color: '#0F172A' }}>
                      {camp.totalRecipients}
                    </td>
                    <td>
                      <div className="table-progress-wrap">
                        <div className="table-progress-bar">
                          <div 
                            className="table-progress-fill" 
                            style={{ width: `${camp.readRate || 0}%` }}
                          />
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#0F172A' }}>
                          {camp.readCount}/{camp.totalRecipients} ({camp.readRate || 0}%)
                        </span>
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-table-action"
                        onClick={() => handleViewDetails(camp)}
                      >
                        <FaEye />
                        <span>Details</span>
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '3.5rem', color: '#64748B' }}>
                    <FaInbox size={36} style={{ color: '#CBD5E1', marginBottom: '0.75rem' }} />
                    <p style={{ margin: 0, fontWeight: 500 }}>No notification campaigns found.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="notif-pagination" style={{ padding: '1rem 1.5rem', borderTop: '1px solid #E2E8F0' }}>
            <span>Page {page} of {totalPages} ({totalCount} total campaigns)</span>
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

      {/* ============================================================
          COMPOSE NOTIFICATION MODAL
          ============================================================ */}
      {showComposeModal && (
        <div className="admin-modal-backdrop" onClick={() => setShowComposeModal(false)}>
          <div className="admin-modal-card" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h2>
                <FaPaperPlane style={{ color: '#B68C48' }} />
                <span>Compose Hotel Notification</span>
              </h2>
              <button 
                type="button" 
                className="admin-modal-close-btn"
                onClick={() => setShowComposeModal(false)}
              >
                <FaTimes />
              </button>
            </div>

            <div className="admin-modal-body">
              {/* Recipient Targeting Mode */}
              <div className="form-group-notif">
                <label>Recipient Targeting Audience *</label>
                <select 
                  className="form-select-notif"
                  name="audience"
                  value={composeForm.audience}
                  onChange={handleFormChange}
                >
                  <option value="individual">Individual Staff or User</option>
                  <option value="guest">Specific Guest</option>
                  <option value="department">Specific Department (All or Select Members)</option>
                  <option value="role">Specific Role (e.g. Housekeeping, Finance, Manager)</option>
                  <option value="staff">All Staff Members</option>
                  <option value="all_guests">All Registered Guests</option>
                  <option value="all_users">All Eligible Users (System-wide)</option>
                </select>
              </div>

              {/* Dynamic Target Selection based on chosen Mode */}
              {composeForm.audience === 'individual' && (
                <div className="form-group-notif">
                  <label>Select Staff or User *</label>
                  <select 
                    className="form-select-notif"
                    name="targetId"
                    value={composeForm.targetId}
                    onChange={handleFormChange}
                  >
                    <option value="">-- Choose User --</option>
                    {recipientOptions.staffUsers.map(u => (
                      <option key={u._id} value={u._id}>
                        {u.name} ({u.role} - {u.email})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {composeForm.audience === 'guest' && (
                <div className="form-group-notif">
                  <label>Select Guest Profile *</label>
                  <select 
                    className="form-select-notif"
                    name="targetId"
                    value={composeForm.targetId}
                    onChange={handleFormChange}
                  >
                    <option value="">-- Choose Guest --</option>
                    {recipientOptions.guests.map(g => (
                      <option key={g._id} value={g._id}>
                        {g.name} ({g.email})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {composeForm.audience === 'department' && (
                <div className="form-group-notif">
                  <label>Select Department *</label>
                  <select 
                    className="form-select-notif"
                    name="department"
                    value={composeForm.department}
                    onChange={handleFormChange}
                  >
                    {DEPARTMENTS.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              )}

              {composeForm.audience === 'role' && (
                <div className="form-group-notif">
                  <label>Select Role *</label>
                  <select 
                    className="form-select-notif"
                    name="role"
                    value={composeForm.role}
                    onChange={handleFormChange}
                  >
                    {ROLES.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Live Recipient Preview Banner */}
              <div className="recipient-preview-banner">
                <span style={{ fontSize: '0.85rem', color: '#475569' }}>
                  Targeted Recipients Estimation:
                </span>
                <span className="preview-pill">
                  {previewLoading ? 'Calculating...' : `${previewCount || 0} recipient(s) eligible`}
                </span>
              </div>

              {/* Title & Message */}
              <div className="form-group-notif">
                <label>Notification Title *</label>
                <input 
                  type="text" 
                  className="form-input-notif"
                  name="title"
                  placeholder="e.g. Maintenance Scheduled for South Wing"
                  value={composeForm.title}
                  onChange={handleFormChange}
                />
              </div>

              <div className="form-group-notif">
                <label>Message Content *</label>
                <textarea 
                  className="form-textarea-notif"
                  name="message"
                  rows={4}
                  placeholder="Provide clear, concise details of the notification..."
                  value={composeForm.message}
                  onChange={handleFormChange}
                />
              </div>

              {/* Category & Priority */}
              <div className="form-row-2">
                <div className="form-group-notif">
                  <label>Category</label>
                  <select 
                    className="form-select-notif"
                    name="category"
                    value={composeForm.category}
                    onChange={handleFormChange}
                  >
                    {CATEGORIES.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group-notif">
                  <label>Priority Level</label>
                  <select 
                    className="form-select-notif"
                    name="priority"
                    value={composeForm.priority}
                    onChange={handleFormChange}
                  >
                    {PRIORITIES.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Action Route & Expiry */}
              <div className="form-row-2">
                <div className="form-group-notif">
                  <label>Action Route / URL (Optional)</label>
                  <input 
                    type="text" 
                    className="form-input-notif"
                    name="actionUrl"
                    placeholder="e.g. /reservations or /housekeeping"
                    value={composeForm.actionUrl}
                    onChange={handleFormChange}
                  />
                </div>

                <div className="form-group-notif">
                  <label>Expiry Date (Optional)</label>
                  <input 
                    type="date" 
                    className="form-input-notif"
                    name="expiresAt"
                    value={composeForm.expiresAt}
                    onChange={handleFormChange}
                  />
                </div>
              </div>

              {/* Explicit Confirmation Dialog Warning for Bulk Sends */}
              {showConfirmBulk && (
                <div style={{
                  background: '#FEF2F2',
                  border: '1px solid #F87171',
                  borderRadius: '8px',
                  padding: '1rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem'
                }}>
                  <FaExclamationTriangle style={{ color: '#DC2626', fontSize: '1.25rem', marginTop: '0.15rem' }} />
                  <div>
                    <h4 style={{ margin: '0 0 0.25rem 0', color: '#991B1B', fontSize: '0.9rem' }}>
                      Confirm System-Wide Bulk Dispatch
                    </h4>
                    <p style={{ margin: 0, color: '#B91C1C', fontSize: '0.825rem' }}>
                      You are about to send this notification to <strong>{previewCount} eligible recipient(s)</strong> across the hotel system. Please confirm that the message details and target group are accurate.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="admin-modal-footer">
              <button 
                type="button" 
                className="notif-btn-action"
                disabled={submitting}
                onClick={() => setShowComposeModal(false)}
              >
                Cancel
              </button>

              <button 
                type="button" 
                className="btn-compose-gold"
                disabled={submitting || (previewCount === 0 && composeForm.audience !== 'individual')}
                onClick={handleSendNotification}
              >
                <FaPaperPlane />
                <span>
                  {submitting 
                    ? 'Dispatching...' 
                    : showConfirmBulk 
                      ? `Confirm & Send to ${previewCount} Users` 
                      : 'Send Notification'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          CAMPAIGN DELIVERY DETAILS MODAL
          ============================================================ */}
      {selectedCampaign && (
        <div className="admin-modal-backdrop" onClick={() => setSelectedCampaign(null)}>
          <div className="admin-modal-card" style={{ maxWidth: '820px' }} onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h2>
                <FaCheckDouble style={{ color: '#059669' }} />
                <span>Delivery & Read Statistics</span>
              </h2>
              <button 
                type="button" 
                className="admin-modal-close-btn"
                onClick={() => setSelectedCampaign(null)}
              >
                <FaTimes />
              </button>
            </div>

            <div className="admin-modal-body">
              <div style={{ background: '#F8FAFC', padding: '1rem', borderRadius: '8px', border: '1px solid #E2E8F0', marginBottom: '1rem' }}>
                <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '1.05rem', color: '#0F172A' }}>
                  {selectedCampaign.title}
                </h3>
                <p style={{ margin: '0 0 0.65rem 0', fontSize: '0.875rem', color: '#475569' }}>
                  {selectedCampaign.message}
                </p>
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: '#64748B' }}>
                  <span>Audience: <strong>{selectedCampaign.targetAudience}</strong></span>
                  <span>Category: <strong>{selectedCampaign.category}</strong></span>
                  <span>Priority: <strong>{selectedCampaign.priority}</strong></span>
                  <span>Read Rate: <strong>{selectedCampaign.readRate}%</strong></span>
                </div>
              </div>

              <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', color: '#334155' }}>
                Recipient Delivery List ({campaignRecipients.length} recipients)
              </h4>

              {loadingDetails ? (
                <div style={{ padding: '2rem', textAlign: 'center' }}>
                  <div className="spinner" style={{ margin: '0 auto 0.5rem auto' }} />
                  <p style={{ color: '#64748B', fontSize: '0.85rem' }}>Loading recipient status...</p>
                </div>
              ) : (
                <div style={{ maxHeight: '340px', overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                  <table className="admin-notif-table">
                    <thead>
                      <tr>
                        <th>Recipient</th>
                        <th>Role / Dept</th>
                        <th>Delivery Status</th>
                        <th>Read Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaignRecipients.map(r => (
                        <tr key={r.recipientId || Math.random()}>
                          <td>
                            <strong style={{ display: 'block', color: '#0F172A' }}>{r.name}</strong>
                            <span style={{ fontSize: '0.75rem', color: '#64748B' }}>{r.email}</span>
                          </td>
                          <td>
                            <span className="table-audience-badge">
                              {r.role} ({r.department})
                            </span>
                          </td>
                          <td>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#059669', fontSize: '0.8rem', fontWeight: 500 }}>
                              <FaCheckCircle size={11} /> Delivered in-app
                            </span>
                          </td>
                          <td>
                            {r.isRead ? (
                              <span style={{ color: '#2563EB', fontSize: '0.8rem', fontWeight: 500 }}>
                                Read on {new Date(r.readAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            ) : (
                              <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>
                                Unread
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="admin-modal-footer">
              <button 
                type="button" 
                className="notif-btn-action"
                onClick={() => setSelectedCampaign(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminNotifications;
