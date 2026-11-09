// frontend/src/pages/Guests.js
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FaPlus, 
  FaEye, 
  FaEdit, 
  FaTrash, 
  FaSearch, 
  FaUser, 
  FaUserCheck, 
  FaUserTimes, 
  FaCalendarAlt, 
  FaChevronLeft, 
  FaChevronRight, 
  FaToggleOn, 
  FaToggleOff,
  FaShieldAlt
} from 'react-icons/fa';
import { guestAPI } from '../services/api';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import EmptyState from '../components/ui/EmptyState';
import { TableSkeleton } from '../components/ui/LoadingSkeleton';

const Guests = () => {
  const navigate = useNavigate();
  const [guests, setGuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  
  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All'); // All, Active, Inactive, Suspended
  const [typeFilter, setTypeFilter] = useState('All');     // All, Regular, VIP, Corporate, Group
  const [accountFilter, setAccountFilter] = useState('All'); // All, Registered, WalkIn
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [togglingId, setTogglingId] = useState(null);

  useEffect(() => {
    fetchGuests();
  }, []);

  const fetchGuests = async () => {
    try {
      setLoading(true);
      setFetchError(null);
      const response = await guestAPI.getGuests();
      const data = Array.isArray(response.data) ? response.data : (response.data?.guests || []);
      setGuests(data);
    } catch (error) {
      const msg = error.response?.data?.error || error.message || 'Failed to load guest directory';
      setFetchError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, name, bookingCount) => {
    if (bookingCount > 0) {
      toast.error(`Cannot delete ${name}: this guest has ${bookingCount} existing hotel booking(s). Please deactivate their account instead.`);
      return;
    }

    if (!window.confirm(`Are you sure you want to permanently delete the profile for ${name}?`)) return;

    try {
      await guestAPI.deleteGuest(id);
      toast.success('Guest profile removed successfully');
      fetchGuests();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete guest');
    }
  };

  const handleToggleStatus = async (guest) => {
    const newStatus = (guest.status === 'Active' || !guest.status) ? 'Inactive' : 'Active';
    const actionLabel = newStatus === 'Active' ? 'activate' : 'deactivate';

    if (!window.confirm(`Are you sure you want to ${actionLabel} ${guest.firstName} ${guest.lastName}'s account?`)) {
      return;
    }

    try {
      setTogglingId(guest._id);
      await guestAPI.updateGuestStatus(guest._id, newStatus);
      toast.success(`Guest account has been marked as ${newStatus}`);
      setGuests(prev => prev.map(g => g._id === guest._id ? { ...g, status: newStatus } : g));
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to update account status');
    } finally {
      setTogglingId(null);
    }
  };

  // Filter logic
  const filteredGuests = useMemo(() => {
    return guests.filter(guest => {
      // 1. Text Search
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const fullName = `${guest.firstName || ''} ${guest.lastName || ''}`.toLowerCase();
        const email = (guest.email || '').toLowerCase();
        const phone = (guest.phone || '').toLowerCase();
        const nationalId = (guest.nationalIdNumber || '').toLowerCase();
        const idStr = (guest._id || '').toLowerCase();

        const matches = 
          fullName.includes(term) ||
          email.includes(term) ||
          phone.includes(term) ||
          nationalId.includes(term) ||
          idStr.includes(term);

        if (!matches) return false;
      }

      // 2. Status Filter
      if (statusFilter !== 'All') {
        const currentStatus = guest.status || 'Active';
        if (currentStatus !== statusFilter) return false;
      }

      // 3. Guest Type Filter
      if (typeFilter !== 'All') {
        if ((guest.guestType || 'Regular') !== typeFilter) return false;
      }

      // 4. Account Type Filter
      if (accountFilter === 'Registered') {
        if (!guest.hasAccount && !guest.user) return false;
      } else if (accountFilter === 'WalkIn') {
        if (guest.hasAccount || guest.user) return false;
      }

      return true;
    });
  }, [guests, searchTerm, statusFilter, typeFilter, accountFilter]);

  // Pagination calculations
  const totalItems = filteredGuests.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const paginatedGuests = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredGuests.slice(start, start + pageSize);
  }, [filteredGuests, currentPage, pageSize]);

  // Reset to page 1 on search or filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, typeFilter, accountFilter, pageSize]);

  return (
    <div>
      <div className="content-wrapper">
        <PageHeader 
          title="Guest Directory & CRM" 
          subtitle="Manage verified customer accounts, hotel guest profiles, stay history and membership status."
        >
          <button onClick={() => navigate('/guests/new')} className="btn btn-primary">
            <FaPlus /> Add New Guest
          </button>
        </PageHeader>

        {/* Search & Filter Bar */}
        <div className="card" style={{ marginBottom: '1.25rem', padding: '1rem 1.25rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', flex: 1, minWidth: '320px' }}>
              <div className="search-box" style={{ flex: 1, minWidth: '240px', maxWidth: '420px', margin: 0 }}>
                <FaSearch />
                <input
                  type="text"
                  placeholder="Search by name, email, phone, ID number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  aria-label="Search guests"
                />
              </div>

              {/* Status Filter */}
              <select 
                className="form-control" 
                style={{ width: 'auto', minWidth: '130px' }}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter by lifecycle status"
              >
                <option value="All">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Suspended">Suspended</option>
              </select>

              {/* Guest Type Filter */}
              <select 
                className="form-control" 
                style={{ width: 'auto', minWidth: '130px' }}
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                aria-label="Filter by guest tier"
              >
                <option value="All">All Tiers</option>
                <option value="Regular">Regular</option>
                <option value="VIP">VIP</option>
                <option value="Corporate">Corporate</option>
                <option value="Group">Group</option>
              </select>

              {/* Account Type Filter */}
              <select 
                className="form-control" 
                style={{ width: 'auto', minWidth: '160px' }}
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value)}
                aria-label="Filter by account type"
              >
                <option value="All">All Accounts</option>
                <option value="Registered">Registered Portal Users</option>
                <option value="WalkIn">Walk-in Guests</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                Rows per page:
              </span>
              <select
                className="form-control"
                style={{ width: 'auto', padding: '0.25rem 0.5rem' }}
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>
        </div>

        {/* Content Area */}
        {loading ? (
          <TableSkeleton rows={8} cols={8} />
        ) : fetchError ? (
          <div className="card" style={{ padding: '2.5rem', textAlign: 'center', borderColor: 'var(--color-danger, #ef4444)' }}>
            <div style={{ color: 'var(--color-danger, #ef4444)', fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Failed to Load Guest Directory
            </div>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              {fetchError}
            </p>
            <button onClick={fetchGuests} className="btn btn-primary">
              Retry Loading Guests
            </button>
          </div>
        ) : filteredGuests.length === 0 ? (
          <EmptyState 
            icon={FaUser}
            title="No guests found"
            message={searchTerm || statusFilter !== 'All' || typeFilter !== 'All' || accountFilter !== 'All' 
              ? "No guests match your active search or filter criteria." 
              : "No guest accounts have been registered or created yet."}
            action={
              (searchTerm || statusFilter !== 'All' || typeFilter !== 'All' || accountFilter !== 'All') ? (
                <button 
                  onClick={() => {
                    setSearchTerm('');
                    setStatusFilter('All');
                    setTypeFilter('All');
                    setAccountFilter('All');
                  }} 
                  className="btn btn-outline"
                >
                  Clear Filters
                </button>
              ) : (
                <button onClick={() => navigate('/guests/new')} className="btn btn-primary">
                  <FaPlus /> Add First Guest
                </button>
              )
            }
          />
        ) : (
          <div className="card" style={{ marginBottom: 0 }}>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Guest ID</th>
                    <th>Full Name & Identity</th>
                    <th>Contact Info</th>
                    <th>Account Status</th>
                    <th>Tier / Type</th>
                    <th>Reservations</th>
                    <th>Latest Booking</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedGuests.map((guest) => {
                    const guestIdDisplay = guest.nationalIdNumber?.startsWith('GST-')
                      ? guest.nationalIdNumber
                      : `GST-${(guest._id || '').slice(-6).toUpperCase()}`;
                    
                    const isRegistered = guest.hasAccount || !!guest.user;
                    const isActive = (guest.status || 'Active') === 'Active';

                    return (
                      <tr key={guest._id} style={{ opacity: isActive ? 1 : 0.65 }}>
                        {/* Guest ID */}
                        <td>
                          <span style={{ 
                            fontFamily: 'monospace', 
                            fontSize: '0.8125rem', 
                            padding: '3px 6px', 
                            background: 'var(--bg-secondary, #f1f5f9)', 
                            borderRadius: '4px',
                            fontWeight: 600,
                            color: 'var(--text-primary)'
                          }}>
                            {guestIdDisplay}
                          </span>
                        </td>

                        {/* Name & Identity */}
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {guest.firstName} {guest.lastName}
                          </div>
                          <div className="table-cell-sub" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '2px' }}>
                            <span>{guest.nationality || 'Resident'}</span>
                            {guest.company && (
                              <>
                                <span>•</span>
                                <span>{guest.company}</span>
                              </>
                            )}
                          </div>
                        </td>

                        {/* Contact */}
                        <td>
                          <div style={{ color: 'var(--text-primary)' }}>{guest.phone || 'No phone'}</div>
                          {guest.email && (
                            <div className="table-cell-sub" style={{ fontSize: '0.8125rem' }}>
                              {guest.email}
                            </div>
                          )}
                        </td>

                        {/* Account Status */}
                        <td>
                          {isRegistered ? (
                            <span 
                              className={`badge ${isActive ? 'badge-success' : 'badge-danger'}`}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                              {isActive ? <FaUserCheck /> : <FaUserTimes />}
                              {isActive ? 'Portal User' : 'Deactivated'}
                            </span>
                          ) : (
                            <span className="badge badge-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <FaUser style={{ fontSize: '0.75rem' }} /> Walk-in
                            </span>
                          )}
                        </td>

                        {/* Tier */}
                        <td>
                          <StatusBadge status={guest.guestType || 'Regular'} />
                          {guest.blacklisted && (
                            <span className="badge badge-danger" style={{ marginLeft: '4px' }}>
                              <FaShieldAlt style={{ marginRight: '2px' }} /> Blacklisted
                            </span>
                          )}
                        </td>

                        {/* Bookings / Stays */}
                        <td>
                          <div style={{ fontWeight: 600 }}>
                            {guest.bookingCount || guest.totalStays || 0} booking(s)
                          </div>
                          <div className="table-cell-sub" style={{ fontSize: '0.8125rem' }}>
                            LKR {(guest.totalSpent || 0).toLocaleString()} total
                          </div>
                        </td>

                        {/* Latest Booking */}
                        <td>
                          {guest.latestBookingDate ? (
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.875rem' }}>
                                <FaCalendarAlt style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }} />
                                {format(new Date(guest.latestBookingDate), 'MMM dd, yyyy')}
                              </div>
                              {guest.latestBookingStatus && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                  ({guest.latestBookingStatus})
                                </span>
                              )}
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                              No stays recorded
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td>
                          <div className="table-actions" style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <button
                              onClick={() => navigate(`/guests/${guest._id}`)}
                              className="btn btn-icon btn-ghost btn-sm"
                              title="View Complete Guest Dossier"
                              aria-label={`View dossier for ${guest.firstName}`}
                            >
                              <FaEye />
                            </button>
                            <button
                              onClick={() => navigate(`/guests/${guest._id}/edit`)}
                              className="btn btn-icon btn-ghost btn-sm"
                              title="Edit Guest Profile"
                              aria-label={`Edit ${guest.firstName}`}
                            >
                              <FaEdit />
                            </button>
                            <button
                              onClick={() => handleToggleStatus(guest)}
                              disabled={togglingId === guest._id}
                              className="btn btn-icon btn-ghost btn-sm"
                              title={isActive ? "Deactivate Account" : "Activate Account"}
                              aria-label={isActive ? "Deactivate guest account" : "Activate guest account"}
                              style={{ color: isActive ? 'var(--color-warning, #d97706)' : 'var(--color-success, #16a34a)' }}
                            >
                              {isActive ? <FaToggleOn size={16} /> : <FaToggleOff size={16} />}
                            </button>
                            <button
                              onClick={() => handleDelete(guest._id, `${guest.firstName} ${guest.lastName}`, guest.bookingCount || 0)}
                              className="btn btn-icon btn-ghost btn-sm"
                              title="Delete Guest"
                              aria-label={`Delete ${guest.firstName}`}
                              style={{ color: 'var(--color-danger)' }}
                            >
                              <FaTrash />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.875rem 1.25rem',
              borderTop: '1px solid var(--border-color, #e2e8f0)',
              fontSize: '0.875rem',
              color: 'var(--text-muted)'
            }}>
              <div>
                Showing <strong>{Math.min(totalItems, (currentPage - 1) * pageSize + 1)}</strong> to{' '}
                <strong>{Math.min(totalItems, currentPage * pageSize)}</strong> of{' '}
                <strong>{totalItems}</strong> guests
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  className="btn btn-outline btn-sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  aria-label="Previous page"
                >
                  <FaChevronLeft /> Previous
                </button>
                <span style={{ margin: '0 0.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  className="btn btn-outline btn-sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  aria-label="Next page"
                >
                  Next <FaChevronRight />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Guests;