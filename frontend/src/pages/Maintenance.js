// frontend/src/pages/Maintenance.js
import React, { useState, useEffect, useCallback } from 'react';
import { 
  FaTools, 
  FaPlus, 
  FaPlay, 
  FaCheck, 
  FaTimes, 
  FaUserCheck, 
  FaSearch, 
  FaFilter, 
  FaBed, 
  FaExclamationTriangle,
  FaShieldAlt,
  FaBroom,
  FaDollarSign,
  FaSyncAlt
} from 'react-icons/fa';
import { maintenanceAPI, roomAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import EmptyState from '../components/ui/EmptyState';
import { StatsSkeleton } from '../components/ui/LoadingSkeleton';

const Maintenance = () => {
  const { user } = useAuth();
  const userRole = (user?.role || '').toLowerCase().trim();
  const isTechnician = userRole === 'maintenance';
  const isSupervisor = ['admin', 'manager'].includes(userRole);
  const canCreate = ['admin', 'manager', 'staff', 'housekeeping'].includes(userRole);

  // States
  const [tickets, setTickets] = useState([]);
  const [myTickets, setMyTickets] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(isTechnician ? 'my' : 'all');

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);

  // Form states
  const [formData, setFormData] = useState({
    roomId: '',
    issueCategory: 'Plumbing',
    description: '',
    priority: 'Medium',
    estimatedCost: 0,
    scheduledDate: '',
    isBlocking: false
  });

  const [assignTechId, setAssignTechId] = useState('');
  const [resolveData, setResolveData] = useState({ resolutionNotes: '', actualCost: 0 });
  const [closeNotes, setCloseNotes] = useState('');
  const [blockData, setBlockData] = useState({ roomId: '', reason: '' });

  const fetchData = useCallback(async () => {
    try {
      const [ticketsRes, roomsRes] = await Promise.all([
        maintenanceAPI.getTickets(),
        roomAPI.getRooms()
      ]);
      setTickets(ticketsRes.data);
      setRooms(roomsRes.data);

      if (isTechnician) {
        const myRes = await maintenanceAPI.getMyTickets();
        setMyTickets(myRes.data);
      }

      if (isSupervisor) {
        const techRes = await maintenanceAPI.getTechnicians();
        setTechnicians(techRes.data);
      }
    } catch (err) {
      console.error('Fetch maintenance error:', err);
      toast.error('Failed to load maintenance data');
    } finally {
      setLoading(false);
    }
  }, [isTechnician, isSupervisor]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Actions
  const handleCreateTicket = async (e) => {
    e.preventDefault();
    if (!formData.roomId || !formData.description.trim()) {
      toast.error('Please select a room and enter issue description');
      return;
    }

    try {
      await maintenanceAPI.createTicket(formData);
      toast.success('Maintenance ticket created successfully');
      setShowCreateModal(false);
      setFormData({
        roomId: '',
        issueCategory: 'Plumbing',
        description: '',
        priority: 'Medium',
        estimatedCost: 0,
        scheduledDate: '',
        isBlocking: false
      });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create ticket');
    }
  };

  const handleAssignTechnician = async () => {
    if (!selectedTicket || !assignTechId) return;
    try {
      await maintenanceAPI.assignTechnician(selectedTicket._id, assignTechId);
      toast.success('Technician assigned successfully');
      setShowAssignModal(false);
      setSelectedTicket(null);
      setAssignTechId('');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to assign technician');
    }
  };

  const handleStartTicket = async (ticketId) => {
    try {
      await maintenanceAPI.startTicket(ticketId);
      toast.success('Work started on maintenance ticket');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to start ticket');
    }
  };

  const handleResolveTicket = async () => {
    if (!selectedTicket) return;
    try {
      await maintenanceAPI.resolveTicket(selectedTicket._id, resolveData);
      toast.success('Ticket marked as Resolved');
      setShowResolveModal(false);
      setSelectedTicket(null);
      setResolveData({ resolutionNotes: '', actualCost: 0 });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to resolve ticket');
    }
  };

  const handleCloseTicket = async () => {
    if (!selectedTicket) return;
    try {
      await maintenanceAPI.closeTicket(selectedTicket._id, { notes: closeNotes });
      toast.success('Ticket closed and room released for sanitization & cleaning');
      setShowCloseModal(false);
      setSelectedTicket(null);
      setCloseNotes('');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to close ticket');
    }
  };

  const handleBlockRoom = async (e) => {
    e.preventDefault();
    if (!blockData.roomId) {
      toast.error('Please select a room to block');
      return;
    }

    try {
      await maintenanceAPI.blockRoom(blockData);
      toast.success('Room blocked for maintenance successfully');
      setShowBlockModal(false);
      setBlockData({ roomId: '', reason: '' });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to block room');
    }
  };

  // Filter tickets
  const displayList = activeTab === 'my' ? myTickets : tickets;
  const filteredTickets = displayList.filter(t => {
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || t.priority === priorityFilter;
    const matchesCategory = categoryFilter === 'all' || t.issueCategory === categoryFilter;
    const matchesSearch = !searchTerm || 
      t.ticketNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.room?.roomNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.description?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesPriority && matchesCategory && matchesSearch;
  });

  // Calculate statistics
  const totalCount = tickets.length;
  const reportedCount = tickets.filter(t => t.status === 'Reported').length;
  const inProgressCount = tickets.filter(t => ['Assigned', 'In Progress'].includes(t.status)).length;
  const resolvedCount = tickets.filter(t => t.status === 'Resolved').length;
  const blockedRoomsCount = rooms.filter(r => ['Maintenance', 'Out of Order'].includes(r.status)).length;

  if (loading) {
    return (
      <div className="content-wrapper">
        <StatsSkeleton count={4} />
      </div>
    );
  }

  return (
    <div className="content-wrapper">
      <PageHeader 
        title="Maintenance & Repairs" 
        subtitle="Track repair tickets, manage technician assignments, and safeguard room maintenance."
      >
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {isSupervisor && (
            <button className="btn btn-secondary" onClick={() => setShowBlockModal(true)}>
              <FaShieldAlt /> Block Room
            </button>
          )}
          {canCreate && (
            <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
              <FaPlus /> Report Issue
            </button>
          )}
        </div>
      </PageHeader>

      {/* KPI Stats */}
      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-label">Total Work Orders</div>
          <div className="stat-value">{totalCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Open / Reported</div>
          <div className="stat-value" style={{ color: 'var(--color-warning)' }}>{reportedCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">In Progress</div>
          <div className="stat-value" style={{ color: 'var(--color-info)' }}>{inProgressCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Rooms Blocked</div>
          <div className="stat-value" style={{ color: 'var(--color-danger)' }}>{blockedRoomsCount}</div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="tabs" style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
        {isTechnician && (
          <button 
            className={`btn btn-ghost ${activeTab === 'my' ? 'active' : ''}`}
            onClick={() => setActiveTab('my')}
            style={{ borderBottom: activeTab === 'my' ? '2px solid var(--color-primary)' : 'none', borderRadius: 0, fontWeight: 600 }}
          >
            My Assigned Tasks ({myTickets.length})
          </button>
        )}
        <button 
          className={`btn btn-ghost ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => setActiveTab('all')}
          style={{ borderBottom: activeTab === 'all' ? '2px solid var(--color-primary)' : 'none', borderRadius: 0, fontWeight: 600 }}
        >
          All Maintenance Tickets ({tickets.length})
        </button>
        <button 
          className={`btn btn-ghost ${activeTab === 'blocked' ? 'active' : ''}`}
          onClick={() => setActiveTab('blocked')}
          style={{ borderBottom: activeTab === 'blocked' ? '2px solid var(--color-primary)' : 'none', borderRadius: 0, fontWeight: 600 }}
        >
          Blocked Rooms ({blockedRoomsCount})
        </button>
      </div>

      {activeTab === 'blocked' ? (
        /* Blocked Rooms List */
        <div className="card">
          <div className="card-header">
            <h3>Rooms Currently in Maintenance / Out of Order</h3>
          </div>
          <div className="card-body">
            {rooms.filter(r => ['Maintenance', 'Out of Order'].includes(r.status)).length === 0 ? (
              <EmptyState 
                icon={FaBed}
                title="No rooms currently blocked"
                message="All hotel rooms are available or in routine operation."
              />
            ) : (
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Room #</th>
                      <th>Room Type</th>
                      <th>Floor</th>
                      <th>Current Status</th>
                      <th>Maintenance Notes</th>
                      <th>Last Maintenance</th>
                      {isSupervisor && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rooms.filter(r => ['Maintenance', 'Out of Order'].includes(r.status)).map(room => (
                      <tr key={room._id}>
                        <td><strong>#{room.roomNumber}</strong></td>
                        <td>{room.roomType}</td>
                        <td>Floor {room.floor}</td>
                        <td><StatusBadge status={room.status} /></td>
                        <td style={{ fontSize: '0.85rem' }}>{room.maintenanceNotes || 'No notes'}</td>
                        <td>{room.lastMaintenanceAt ? new Date(room.lastMaintenanceAt).toLocaleDateString() : 'N/A'}</td>
                        {isSupervisor && (
                          <td>
                            <button 
                              className="btn btn-sm btn-info"
                              onClick={async () => {
                                if (window.confirm(`Release Room #${room.roomNumber} from maintenance? This will transition it to Cleaning for housekeeping sanitization.`)) {
                                  try {
                                    await maintenanceAPI.releaseRoom({ roomId: room._id });
                                    toast.success(`Room #${room.roomNumber} released to Cleaning!`);
                                    fetchData();
                                  } catch (e) {
                                    toast.error(e.response?.data?.error || 'Failed to release room');
                                  }
                                }
                              }}
                            >
                              <FaBroom /> Release to Cleaning
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Tickets View */
        <>
          {/* Filters Bar */}
          <div className="filters" style={{ marginBottom: '1.5rem' }}>
            <div className="filter-row" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <div className="search-box" style={{ flex: 1, minWidth: '220px' }}>
                <FaSearch />
                <input 
                  type="text"
                  placeholder="Search ticket #, room, or issue description..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="form-control"
                />
              </div>

              <select 
                className="form-control"
                style={{ maxWidth: '170px' }}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Statuses</option>
                <option value="Reported">Reported</option>
                <option value="Assigned">Assigned</option>
                <option value="In Progress">In Progress</option>
                <option value="Resolved">Resolved</option>
                <option value="Closed">Closed</option>
              </select>

              <select 
                className="form-control"
                style={{ maxWidth: '160px' }}
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
              >
                <option value="all">All Priorities</option>
                <option value="Urgent">Urgent</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>

              <select 
                className="form-control"
                style={{ maxWidth: '160px' }}
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="all">All Categories</option>
                <option value="Plumbing">Plumbing</option>
                <option value="Electrical">Electrical</option>
                <option value="HVAC">HVAC</option>
                <option value="Furniture">Furniture</option>
                <option value="Appliance">Appliance</option>
                <option value="Painting">Painting</option>
                <option value="Other">Other</option>
              </select>

              <button className="btn btn-ghost" onClick={fetchData} title="Refresh">
                <FaSyncAlt />
              </button>
            </div>
          </div>

          {filteredTickets.length === 0 ? (
            <EmptyState 
              icon={FaTools}
              title="No maintenance tickets found"
              message={searchTerm || statusFilter !== 'all' ? "Try adjusting your search or filters." : "Create your first maintenance ticket to report an issue."}
              action={
                canCreate && (
                  <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
                    <FaPlus /> Report Issue
                  </button>
                )
              }
            />
          ) : (
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Ticket #</th>
                    <th>Room</th>
                    <th>Category</th>
                    <th>Description</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Technician</th>
                    <th>Cost</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.map(ticket => (
                    <tr key={ticket._id}>
                      <td>
                        <strong>{ticket.ticketNumber}</strong>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {new Date(ticket.createdAt).toLocaleDateString()}
                        </div>
                      </td>
                      <td>
                        <strong>#{ticket.room?.roomNumber || 'N/A'}</strong>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {ticket.room?.roomType}
                        </div>
                      </td>
                      <td><span className="badge badge-info">{ticket.issueCategory}</span></td>
                      <td style={{ maxWidth: '240px' }}>
                        <div>{ticket.description}</div>
                        {ticket.resolutionNotes && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--color-success)', marginTop: '4px' }}>
                            ✓ {ticket.resolutionNotes}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${
                          ticket.priority === 'Urgent' ? 'badge-danger' :
                          ticket.priority === 'High' ? 'badge-warning' :
                          ticket.priority === 'Medium' ? 'badge-info' : 'badge-secondary'
                        }`}>
                          {ticket.priority}
                        </span>
                      </td>
                      <td><StatusBadge status={ticket.status} /></td>
                      <td>
                        {ticket.assignedTechnician ? (
                          <div>
                            <strong>{ticket.assignedTechnician.name}</strong>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{ticket.assignedTechnician.role}</div>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Unassigned</span>
                        )}
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>
                        {ticket.actualCost > 0 ? (
                          <strong style={{ color: 'var(--color-success)' }}>₹{ticket.actualCost}</strong>
                        ) : ticket.estimatedCost > 0 ? (
                          <span style={{ color: 'var(--text-muted)' }}>Est: ₹{ticket.estimatedCost}</span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>
                        <div className="table-actions" style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          {/* Assign action (Supervisor) */}
                          {isSupervisor && ['Reported', 'Assigned'].includes(ticket.status) && (
                            <button 
                              className="btn btn-sm btn-ghost"
                              onClick={() => {
                                setSelectedTicket(ticket);
                                setAssignTechId(ticket.assignedTechnician?._id || '');
                                setShowAssignModal(true);
                              }}
                              title="Assign Technician"
                            >
                              <FaUserCheck /> Assign
                            </button>
                          )}

                          {/* Start action */}
                          {['Reported', 'Assigned'].includes(ticket.status) && (
                            <button 
                              className="btn btn-sm btn-info"
                              onClick={() => handleStartTicket(ticket._id)}
                              title="Start Work"
                            >
                              <FaPlay /> Start
                            </button>
                          )}

                          {/* Resolve action */}
                          {ticket.status === 'In Progress' && (
                            <button 
                              className="btn btn-sm btn-success"
                              onClick={() => {
                                setSelectedTicket(ticket);
                                setResolveData({ resolutionNotes: '', actualCost: ticket.estimatedCost || 0 });
                                setShowResolveModal(true);
                              }}
                              title="Resolve Ticket"
                            >
                              <FaCheck /> Resolve
                            </button>
                          )}

                          {/* Close action (Supervisor only) */}
                          {isSupervisor && ticket.status === 'Resolved' && (
                            <button 
                              className="btn btn-sm btn-primary"
                              onClick={() => {
                                setSelectedTicket(ticket);
                                setShowCloseModal(true);
                              }}
                              title="Close Ticket & Release Room to Cleaning"
                            >
                              <FaBroom /> Close & Release
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* MODAL 1: Create Ticket */}
      {showCreateModal && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: '540px' }}>
            <div className="modal-header">
              <h3>Report Maintenance Issue</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCreateModal(false)}>
                <FaTimes />
              </button>
            </div>
            <form onSubmit={handleCreateTicket}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label required">Room</label>
                  <select 
                    className="form-control"
                    value={formData.roomId}
                    onChange={(e) => setFormData({ ...formData, roomId: e.target.value })}
                    required
                  >
                    <option value="">Select Room...</option>
                    {rooms.map(r => (
                      <option key={r._id} value={r._id}>
                        #{r.roomNumber} - {r.roomType} ({r.status})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label required">Category</label>
                    <select 
                      className="form-control"
                      value={formData.issueCategory}
                      onChange={(e) => setFormData({ ...formData, issueCategory: e.target.value })}
                    >
                      <option value="Plumbing">Plumbing</option>
                      <option value="Electrical">Electrical</option>
                      <option value="HVAC">HVAC</option>
                      <option value="Furniture">Furniture</option>
                      <option value="Appliance">Appliance</option>
                      <option value="Carpentry">Carpentry</option>
                      <option value="Painting">Painting</option>
                      <option value="Structural">Structural</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label required">Priority</label>
                    <select 
                      className="form-control"
                      value={formData.priority}
                      onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Urgent">Urgent</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label required">Issue Description</label>
                  <textarea 
                    className="form-control"
                    rows="3"
                    placeholder="Describe the issue, symptoms, location inside the room..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    required
                  />
                </div>

                <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Estimated Cost (₹)</label>
                    <input 
                      type="number"
                      min="0"
                      className="form-control"
                      value={formData.estimatedCost}
                      onChange={(e) => setFormData({ ...formData, estimatedCost: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Scheduled Date</label>
                    <input 
                      type="date"
                      className="form-control"
                      value={formData.scheduledDate}
                      onChange={(e) => setFormData({ ...formData, scheduledDate: e.target.value })}
                    />
                  </div>
                </div>

                {isSupervisor && (
                  <div className="form-group" style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--bg-muted, #f8f9fa)', borderRadius: '6px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: 0 }}>
                      <input 
                        type="checkbox"
                        checked={formData.isBlocking}
                        onChange={(e) => setFormData({ ...formData, isBlocking: e.target.checked })}
                      />
                      <span><strong>Immediately block room</strong> (Sets room to Maintenance if unoccupied)</span>
                    </label>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Work Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Assign Technician */}
      {showAssignModal && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h3>Assign Technician</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAssignModal(false)}>
                <FaTimes />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>
                Work Order: <strong>{selectedTicket?.ticketNumber}</strong> (Room #{selectedTicket?.room?.roomNumber})
              </p>
              <div className="form-group">
                <label className="form-label required">Select Staff / Technician</label>
                <select 
                  className="form-control"
                  value={assignTechId}
                  onChange={(e) => setAssignTechId(e.target.value)}
                >
                  <option value="">Select Technician...</option>
                  {technicians.map(t => (
                    <option key={t._id} value={t._id}>
                      {t.name} ({t.role})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAssignModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleAssignTechnician} disabled={!assignTechId}>
                Confirm Assignment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Resolve Ticket */}
      {showResolveModal && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3>Resolve Maintenance Ticket</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowResolveModal(false)}>
                <FaTimes />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>
                Completing work on <strong>{selectedTicket?.ticketNumber}</strong> (Room #{selectedTicket?.room?.roomNumber})
              </p>
              <div className="form-group">
                <label className="form-label required">Resolution / Repair Notes</label>
                <textarea 
                  className="form-control"
                  rows="3"
                  placeholder="Detail parts replaced, tests conducted, or repair steps..."
                  value={resolveData.resolutionNotes}
                  onChange={(e) => setResolveData({ ...resolveData, resolutionNotes: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Actual Cost (₹)</label>
                <input 
                  type="number"
                  min="0"
                  className="form-control"
                  value={resolveData.actualCost}
                  onChange={(e) => setResolveData({ ...resolveData, actualCost: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowResolveModal(false)}>
                Cancel
              </button>
              <button className="btn btn-success" onClick={handleResolveTicket}>
                <FaCheck /> Mark Resolved
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Close Ticket & Release Handoff */}
      {showCloseModal && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3>Close Ticket & Release Room</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCloseModal(false)}>
                <FaTimes />
              </button>
            </div>
            <div className="modal-body">
              <div style={{ padding: '0.75rem', background: 'rgba(59, 130, 246, 0.08)', borderRadius: '6px', marginBottom: '1rem', borderLeft: '4px solid var(--color-info)' }}>
                <strong style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FaBroom /> Step 4 Housekeeping Invariant Protection
                </strong>
                <p style={{ fontSize: '0.85rem', marginTop: '4px', marginBottom: 0 }}>
                  Closing this work order transitions Room #{selectedTicket?.room?.roomNumber} to <strong>Cleaning (Dirty)</strong> and triggers an automated <strong>Maintenance Cleaning</strong> task. The room will only become Available after housekeeper cleaning and supervisor inspection.
                </p>
              </div>

              <div className="form-group">
                <label className="form-label">Closing Supervisor Notes (Optional)</label>
                <input 
                  type="text"
                  className="form-control"
                  placeholder="e.g., Work inspected, approved for post-repair cleaning"
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCloseModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleCloseTicket}>
                Confirm Close & Release
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: Block Room for Maintenance */}
      {showBlockModal && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3>Block Room for Maintenance</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowBlockModal(false)}>
                <FaTimes />
              </button>
            </div>
            <form onSubmit={handleBlockRoom}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label required">Select Room</label>
                  <select 
                    className="form-control"
                    value={blockData.roomId}
                    onChange={(e) => setBlockData({ ...blockData, roomId: e.target.value })}
                    required
                  >
                    <option value="">Select Room...</option>
                    {rooms.filter(r => !['Maintenance', 'Out of Order'].includes(r.status)).map(r => (
                      <option key={r._id} value={r._id}>
                        #{r.roomNumber} - {r.roomType} (Currently {r.status})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label required">Reason for Blocking</label>
                  <textarea 
                    className="form-control"
                    rows="3"
                    placeholder="e.g., Deep AC repair, broken window, painting walls"
                    value={blockData.reason}
                    onChange={(e) => setBlockData({ ...blockData, reason: e.target.value })}
                    required
                  />
                </div>

                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  * The system automatically validates that this room is not Occupied and has no conflicting confirmed guest reservations.
                </p>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowBlockModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-danger">
                  <FaShieldAlt /> Confirm Room Block
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Maintenance;
