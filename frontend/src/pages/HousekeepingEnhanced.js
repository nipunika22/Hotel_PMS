// frontend/src/pages/HousekeepingEnhanced.js
import React, { useState, useEffect, useCallback } from 'react';
import { 
  FaBroom, 
  FaCheck, 
  FaClipboardCheck, 
  FaBox, 
  FaSyncAlt, 
  FaPlay, 
  FaUserCheck, 
  FaTimes, 
  FaExclamationTriangle, 
  FaPlus, 
  FaFilter,
  FaBed
} from 'react-icons/fa';
import { housekeepingAPI, roomAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import { StatsSkeleton } from '../components/ui/LoadingSkeleton';

const canProcessRoom = (room) => room && !['Occupied', 'Maintenance', 'Out of Order'].includes(room.status);
const canStartTask = (task) => ['Pending', 'Assigned', 'Needs Recleaning'].includes(task.status);

const HousekeepingEnhanced = () => {
  const { user } = useAuth();
  const isHousekeeper = user?.role === 'housekeeping';
  const isSupervisor = ['admin', 'manager'].includes(user?.role);
  const canManage = ['admin', 'manager', 'staff'].includes(user?.role);

  // States
  const [tasks, setTasks] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [activeTab, setActiveTab] = useState('tasks');

  // Filters
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterRoom, setFilterRoom] = useState('');

  // Modals
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [showInspectModal, setShowInspectModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);

  // Modal form states
  const [completeData, setCompleteData] = useState({
    notes: '',
    itemDescription: '',
    location: '',
    foundBy: user?.name || ''
  });

  const [inspectData, setInspectData] = useState({
    approved: true,
    notes: ''
  });

  const [createTaskData, setCreateTaskData] = useState({
    roomId: '',
    taskType: 'Check-out Cleaning',
    priority: 'Medium',
    assignedTo: '',
    notes: ''
  });

  // Load data
  const fetchData = useCallback(async () => {
    setLoading(true);
    const [taskResult, roomResult, staffResult] = await Promise.allSettled([
      housekeepingAPI.getTasks(),
      roomAPI.getRooms(),
      canManage ? housekeepingAPI.getStaff() : Promise.resolve({ data: [] })
    ]);
    if (taskResult.status === 'fulfilled') setTasks(taskResult.value.data);
    else toast.error('Failed to load housekeeping tasks');
    if (roomResult.status === 'fulfilled') setRooms(roomResult.value.data);
    else toast.error('Failed to load room readiness');
    if (staffResult.status === 'fulfilled') setStaffList(staffResult.value.data);
    else toast.error('Failed to load housekeeping staff');
    setLoading(false);
  }, [canManage]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handlers
  const handleStartTask = async (room, task = null) => {
    if (!window.confirm(`Start cleaning Room #${room.roomNumber}?`)) return;
    setSubmitting(true);
    try {
      const cleaningTask = task || (await housekeepingAPI.createTask({
        roomId: room._id,
        taskType: 'Daily Cleaning'
      })).data;
      await housekeepingAPI.startTask(cleaningTask._id);
      toast.success(`Cleaning started for Room #${room.roomNumber}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to start cleaning');
    } finally {
      setSubmitting(false);
      fetchData();
    }
  };

  const handleOpenCompleteModal = (task) => {
    setSelectedTask(task);
    setCompleteData({
      notes: '',
      itemDescription: '',
      location: '',
      foundBy: user?.name || ''
    });
    setShowCompleteModal(true);
  };

  const handleSubmitComplete = async () => {
    if (!selectedTask || submitting) return;
    setSubmitting(true);
    try {
      const payload = {
        notes: completeData.notes
      };
      if (completeData.itemDescription.trim()) {
        payload.lostItems = [{
          itemDescription: completeData.itemDescription.trim(),
          location: completeData.location.trim(),
          foundBy: completeData.foundBy.trim() || user?.name || 'Housekeeping',
          notes: completeData.notes
        }];
      }
      await housekeepingAPI.completeTask(selectedTask._id, payload);
      toast.success('Cleaning completed. Room is awaiting inspection.');
      setShowCompleteModal(false);
      setSelectedTask(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to complete task');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenInspectModal = (task) => {
    setSelectedTask(task);
    setInspectData({
      approved: true,
      notes: ''
    });
    setShowInspectModal(true);
  };

  const handleSubmitInspect = async () => {
    if (!selectedTask || submitting) return;
    setSubmitting(true);
    try {
      await housekeepingAPI.inspectTask(selectedTask._id, inspectData);
      toast.success(
        inspectData.approved
          ? 'Room inspected and marked Available!'
          : 'Room rejected — returned for recleaning'
      );
      setShowInspectModal(false);
      setSelectedTask(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit inspection');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssignStaff = async (taskId, staffId) => {
    if (!staffId) return;
    try {
      await housekeepingAPI.assignTask(taskId, staffId);
      toast.success('Staff assigned');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to assign staff');
    }
  };

  const showTasks = (roomNumber = '') => {
    setFilterStatus('All');
    setFilterRoom(String(roomNumber));
    setActiveTab('tasks');
  };

  const handleSyncTasks = async () => {
    if (!window.confirm('Synchronize housekeeping tasks for this property?')) return;
    setSubmitting(true);
    setSyncResult(null);
    try {
      const response = await housekeepingAPI.syncTasks();
      setSyncResult(response.data);
      showTasks();
      await fetchData();
      toast.success('Housekeeping synchronization completed');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to synchronize housekeeping tasks');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!createTaskData.roomId) {
      toast.error('Please select a room');
      return;
    }
    if (!canProcessRoom(rooms.find(room => room._id === createTaskData.roomId))) {
      toast.error('Select a room that is eligible for housekeeping');
      return;
    }
    setSubmitting(true);
    try {
      const result = await housekeepingAPI.createTask({
        roomId: createTaskData.roomId,
        taskType: createTaskData.taskType,
        priority: createTaskData.priority,
        assignedTo: createTaskData.assignedTo || undefined,
        notes: createTaskData.notes
      });
      const task = result.data;
      toast.success(result.status === 201
        ? `Cleaning task created for Room #${task.room.roomNumber}`
        : `Existing cleaning task reused for Room #${task.room.roomNumber}`);
      showTasks(task.room.roomNumber);
      setShowCreateModal(false);
      setCreateTaskData({
        roomId: '',
        taskType: 'Check-out Cleaning',
        priority: 'Medium',
        assignedTo: '',
        notes: ''
      });
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create task');
    } finally {
      setSubmitting(false);
    }
  };

  const renderCleaningActions = (room, task) => {
    if (!canProcessRoom(room)) return null;
    if (!task) {
      if (!canManage || (room.status !== 'Cleaning' && !['Dirty', 'Pickup'].includes(room.cleaningStatus))) return null;
      return (
        <button className="btn btn-sm btn-info" onClick={() => handleStartTask(room)} disabled={loading || submitting}>
          <FaPlay /> Start Cleaning
        </button>
      );
    }

    if (task.status === 'Completed' && isSupervisor && room.status === 'Cleaning' && room.cleaningStatus === 'Clean') {
      return (
        <button className="btn btn-sm btn-primary" onClick={() => handleOpenInspectModal({ ...task, room })} disabled={loading || submitting}>
          <FaClipboardCheck /> Inspect Room
        </button>
      );
    }

    const assignee = task.assignedTo?._id || task.assignedTo;
    if (!isSupervisor && assignee && String(assignee) !== String(user?._id || user?.id)) return null;
    if (canStartTask(task)) {
      return (
        <button className="btn btn-sm btn-info" onClick={() => handleStartTask(room, task)} disabled={loading || submitting}>
          <FaPlay /> Start Cleaning
        </button>
      );
    }
    if (task.status === 'In Progress') {
      return (
        <button className="btn btn-sm btn-success" onClick={() => handleOpenCompleteModal({ ...task, room })} disabled={loading || submitting}>
          <FaCheck /> Complete Cleaning
        </button>
      );
    }
    return null;
  };

  const visibleTasks = tasks.filter(task =>
    (filterStatus === 'All' || task.displayStatus === filterStatus) &&
    String(task.room?.roomNumber || '').toLowerCase().includes(filterRoom.trim().toLowerCase())
  );

  // Stats calculation
  const stats = {
    total: tasks.length,
    inProgress: tasks.filter(t => t.status === 'In Progress').length,
    completed: tasks.filter(t => t.displayStatus === 'Pending Inspection').length,
    pending: tasks.filter(t => ['Pending', 'Assigned', 'Needs Recleaning'].includes(t.status)).length,
    inspected: tasks.filter(t => t.status === 'Inspected').length
  };

  if (loading && tasks.length === 0) {
    return (
      <div className="content-wrapper">
        <PageHeader title="Housekeeping & Room Status" subtitle="Loading task data..." />
        <StatsSkeleton count={4} />
      </div>
    );
  }

  return (
    <div className="content-wrapper">
      <PageHeader 
        title="Housekeeping & Room Status"
        subtitle={
          isHousekeeper 
            ? "Manage assigned and unassigned cleaning tasks, update progress, and record lost items."
            : "Monitor room hygiene lifecycles, staff assignments, and supervisor room inspections."
        }
      >
        <button onClick={fetchData} className="btn btn-outline">
          <FaSyncAlt /> Refresh
        </button>
        {isSupervisor && (
          <button onClick={handleSyncTasks} disabled={loading || submitting} className="btn btn-outline">
            <FaSyncAlt /> Sync Housekeeping Tasks
          </button>
        )}
        {canManage && (
          <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">
            <FaPlus /> Create Task
          </button>
        )}
      </PageHeader>

      {syncResult && (
        <div role="status" className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
          <strong>Housekeeping sync results</strong>
          <div>{syncResult.created} created · {syncResult.reused} reused · {syncResult.skipped} rooms skipped</div>
          <div>{syncResult.duplicateTasks} duplicate active tasks · {syncResult.invalidRoomReferences} invalid room references · {syncResult.invalidStatuses} invalid task statuses</div>
          {Boolean(syncResult.duplicateTasks || syncResult.invalidRoomReferences || syncResult.invalidStatuses) && (
            <details>
              <summary>Record IDs to review</summary>
              {syncResult.duplicateTasks > 0 && <div>Rooms with duplicate tasks: {syncResult.issues.duplicateRoomIds.join(', ')}</div>}
              {syncResult.invalidRoomReferences > 0 && <div>Tasks with invalid room references: {syncResult.issues.invalidRoomTaskIds.join(', ')}</div>}
              {syncResult.invalidStatuses > 0 && <div>Tasks with invalid statuses: {syncResult.issues.invalidStatusTaskIds.join(', ')}</div>}
            </details>
          )}
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="stats-grid" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="stat-card">
          <div className="stat-icon red"><FaBroom /></div>
          <div className="stat-content">
            <div className="stat-label">Pending / Needs Clean</div>
            <div className="stat-value">{stats.pending}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon yellow"><FaPlay /></div>
          <div className="stat-content">
            <div className="stat-label">In Progress</div>
            <div className="stat-value">{stats.inProgress}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue"><FaClipboardCheck /></div>
          <div className="stat-content">
            <div className="stat-label">Pending Inspection</div>
            <div className="stat-value">{stats.completed}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><FaCheck /></div>
          <div className="stat-content">
            <div className="stat-label">Inspected & Ready</div>
            <div className="stat-value">{stats.inspected}</div>
          </div>
        </div>
      </div>

      {/* Housekeeping views */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <button
          className={`btn ${activeTab === 'tasks' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('tasks')}
        >
          <FaBroom /> Tasks ({tasks.length})
        </button>
        <button
          className={`btn ${activeTab === 'rooms' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('rooms')}
        >
          <FaBed /> Room Readiness Overview ({rooms.length})
        </button>
      </div>

      {/* Filter toolbar for tasks */}
      {activeTab === 'tasks' && (
        <div className="card" style={{ marginBottom: 'var(--space-6)', padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <FaFilter style={{ color: 'var(--text-muted)' }} />
              <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>Status:</span>
              <select 
                className="form-control" 
                style={{ width: 'auto', minWidth: '150px' }}
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="All">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="Assigned">Assigned</option>
                <option value="In Progress">In Progress</option>
                <option value="Pending Inspection">Pending Inspection</option>
                <option value="Completed">Completed</option>
                <option value="Inspected">Inspected</option>
                <option value="Needs Recleaning">Needs Recleaning</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>Room:</span>
              <input 
                type="text"
                placeholder="Search Room #"
                className="form-control"
                style={{ width: '130px' }}
                value={filterRoom}
                onChange={(e) => setFilterRoom(e.target.value)}
              />
            </div>

            {(filterStatus !== 'All' || filterRoom) && (
              <button 
                className="btn btn-sm btn-outline" 
                onClick={() => { setFilterStatus('All'); setFilterRoom(''); }}
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {activeTab === 'rooms' ? (
        /* Room Readiness Table */
        <div className="card">
          <div className="card-header">
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <FaBed /> Room Operational & Readiness Status
            </h3>
            <span className="badge badge-info">{rooms.length} Rooms</span>
          </div>
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Type</th>
                  <th>Floor</th>
                  <th>Operational Status</th>
                  <th>Hygiene Status</th>
                  <th>Sellable?</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rooms.map(room => {
                  const task = room.activeCleaningTask;
                  const isBlocked = room.status !== 'Available' || ['Dirty', 'Pickup'].includes(room.cleaningStatus);
                  const pendingInspection = room.status === 'Cleaning' && room.cleaningStatus === 'Clean' && task?.status === 'Completed';
                  return (
                    <tr key={room._id}>
                      <td><strong>#{room.roomNumber}</strong></td>
                      <td>{room.roomType}</td>
                      <td>Floor {room.floor}</td>
                      <td><StatusBadge status={room.status} /></td>
                      <td><StatusBadge status={room.cleaningStatus || 'Dirty'} /></td>
                      <td>
                        {isBlocked ? (
                          <span className={`badge ${pendingInspection ? 'badge-warning' : 'badge-danger'}`}>{pendingInspection ? 'Pending Inspection' : 'Blocked / Unready'}</span>
                        ) : (
                          <span className="badge badge-success">Available for Booking</span>
                        )}
                      </td>
                      <td>
                        <div className="table-actions">{renderCleaningActions(room, task)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Housekeeping Tasks Table */
        <div className="card">
          <div className="card-header">
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <FaBroom /> {isHousekeeper ? 'Assigned and Unassigned Tasks' : 'Operational Housekeeping Tasks'}
            </h3>
            <span className="badge badge-primary">{visibleTasks.length}</span>
          </div>

          {visibleTasks.length === 0 ? (
            <div className="card-body" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 'var(--space-8)' }}>
              <p>No housekeeping tasks found matching current filters.</p>
            </div>
          ) : (
            <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Room</th>
                    <th>Task Type</th>
                    <th>Priority</th>
                    <th>Task Status</th>
                    <th>Assigned To</th>
                    <th>Timestamps</th>
                    <th>Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTasks.map(task => {
                    const roomNumber = task.room?.roomNumber || 'N/A';
                    const roomStatus = task.room?.status;
                    const cleaningStatus = task.room?.cleaningStatus;

                    return (
                      <tr key={task._id}>
                        <td>
                          <strong>#{roomNumber}</strong>
                          <div>{task.room?.roomType}</div>
                          <div style={{ fontSize: '0.75rem', marginTop: '2px' }}>
                            <StatusBadge status={roomStatus} />{' '}
                            <StatusBadge status={cleaningStatus} />
                          </div>
                        </td>
                        <td>
                          <strong>{task.taskType}</strong>
                          {task.reservation && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                              <span>#{task.reservation.reservationNumber || 'Checkout'}</span>
                              {task.reservation.guest && (
                                <span> • {task.reservation.guest.firstName || ''} {task.reservation.guest.lastName || ''}</span>
                              )}
                              {task.reservation.actualCheckOutDate && (
                                <div>Out: {new Date(task.reservation.actualCheckOutDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                              )}
                            </div>
                          )}
                        </td>
                        <td><StatusBadge status={task.priority} /></td>
                        <td><StatusBadge status={task.displayStatus} /></td>
                        <td>
                          {canManage && task.isCurrent && canStartTask(task) ? (
                            <select 
                              className="form-control" 
                              style={{ fontSize: '0.85rem', padding: '2px 6px', height: 'auto' }}
                              value={task.assignedTo?._id || task.assignedTo || ''}
                              onChange={(e) => handleAssignStaff(task._id, e.target.value)}
                            >
                              <option value="">Unassigned</option>
                              {staffList.map(s => (
                                <option key={s._id} value={s._id}>
                                  {s.name} ({s.role})
                                </option>
                              ))}
                            </select>
                          ) : (
                            task.assignedTo?.name || (
                              <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Unassigned</span>
                            )
                          )}
                        </td>
                        <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          <div>Created: {new Date(task.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</div>
                          {task.startedAt && (
                            <div>Started: {new Date(task.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                          )}
                          {task.completedAt && (
                            <div>Completed: {new Date(task.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                          )}
                          {task.inspectedAt && (
                            <div>Inspected: {new Date(task.inspectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                          )}
                        </td>
                        <td style={{ fontSize: '0.85rem', maxWidth: '180px' }}>
                          {task.notes && <div>{task.notes}</div>}
                          {task.lostItems && task.lostItems.length > 0 && (
                            <div style={{ marginTop: '4px', color: 'var(--color-warning)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <FaBox /> Lost: {task.lostItems[0].itemDescription}
                            </div>
                          )}
                          {task.inspectionNotes && (
                            <div style={{ marginTop: '4px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                              Insp: {task.inspectionNotes}
                            </div>
                          )}
                        </td>
                        <td>
                          <div className="table-actions">
                            {task.isCurrent &&
                              renderCleaningActions(task.room, task)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: Complete Cleaning & Lost Items */}
      {showCompleteModal && selectedTask && (
        <div className="modal-overlay" onClick={() => setShowCompleteModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <FaCheck style={{ color: 'var(--color-success)' }} /> Complete Room Cleaning
                </h3>
                <p className="modal-description">
                  Confirm cleaning is complete for Room #{selectedTask.room?.roomNumber}. A supervisor must inspect the room before it can be released.
                </p>
              </div>
              <button className="modal-close" onClick={() => setShowCompleteModal(false)} aria-label="Close">
                ×
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Cleaning Notes</label>
                <textarea 
                  className="form-control"
                  rows="2"
                  placeholder="e.g. Linen changed, surfaces sanitized, bathroom restocked."
                  value={completeData.notes}
                  onChange={(e) => setCompleteData({ ...completeData, notes: e.target.value })}
                />
              </div>

              <div style={{ marginTop: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--bg-muted, #f8f9fa)', borderRadius: '6px' }}>
                <h4 style={{ fontSize: '0.9rem', marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FaBox style={{ color: 'var(--color-warning)' }} /> Lost & Found Item (Optional)
                </h4>
                <div className="form-group">
                  <label className="form-label">Item Description</label>
                  <input 
                    type="text"
                    className="form-control"
                    placeholder="e.g., iPhone charger, black watch (leave blank if none)"
                    value={completeData.itemDescription}
                    onChange={(e) => setCompleteData({ ...completeData, itemDescription: e.target.value })}
                  />
                </div>
                {completeData.itemDescription.trim() && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Location Found</label>
                      <input 
                        type="text"
                        className="form-control"
                        placeholder="e.g., Under side table, closet shelf"
                        value={completeData.location}
                        onChange={(e) => setCompleteData({ ...completeData, location: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Found By</label>
                      <input 
                        type="text"
                        className="form-control"
                        placeholder="Staff Name"
                        value={completeData.foundBy}
                        onChange={(e) => setCompleteData({ ...completeData, foundBy: e.target.value })}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowCompleteModal(false)}>
                Cancel
              </button>
              <button className="btn btn-success" onClick={handleSubmitComplete} disabled={submitting}>
                Submit Cleaning
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Supervisor Room Inspection */}
      {showInspectModal && selectedTask && (
        <div className="modal-overlay" onClick={() => setShowInspectModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <FaClipboardCheck style={{ color: 'var(--color-info)' }} /> Supervisor Inspection
                </h3>
                <p className="modal-description">
                  Confirm the inspection result for Room #{selectedTask.room?.roomNumber}. A rejected room returns to the cleaning queue.
                </p>
              </div>
              <button className="modal-close" onClick={() => setShowInspectModal(false)} aria-label="Close">
                ×
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Inspection Verdict</label>
                <div style={{ display: 'flex', gap: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="verdict" 
                      checked={inspectData.approved === true}
                      onChange={() => setInspectData({ ...inspectData, approved: true })}
                    />
                    <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                      <FaCheck /> Approve (Make Room Available)
                    </span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="verdict" 
                      checked={inspectData.approved === false}
                      onChange={() => setInspectData({ ...inspectData, approved: false })}
                    />
                    <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>
                      <FaTimes /> Reject (Needs Recleaning)
                    </span>
                  </label>
                </div>
              </div>

              <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                <label className="form-label">Supervisor Notes</label>
                <textarea 
                  className="form-control"
                  rows="3"
                  placeholder={
                    inspectData.approved 
                      ? "Inspection passed. Room is clean, stocked, and ready for guests."
                      : "Explain why cleaning was rejected (e.g. bathroom mirror streaked, towels missing)."
                  }
                  value={inspectData.notes}
                  onChange={(e) => setInspectData({ ...inspectData, notes: e.target.value })}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowInspectModal(false)}>
                Cancel
              </button>
              <button 
                className={`btn ${inspectData.approved ? 'btn-success' : 'btn-danger'}`}
                onClick={handleSubmitInspect}
                disabled={submitting}
              >
                {inspectData.approved ? 'Approve & Make Available' : 'Reject Inspection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Create Task */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleCreateTask}>
              <div className="modal-header">
                <div>
                  <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <FaPlus /> Create Housekeeping Task
                  </h3>
                  <p className="modal-description">Schedule room cleaning or inspection.</p>
                </div>
                <button type="button" className="modal-close" onClick={() => setShowCreateModal(false)} aria-label="Close">
                  ×
                </button>
              </div>

              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label" htmlFor="housekeeping-task-room">Select Room *</label>
                  <select 
                    id="housekeeping-task-room"
                    className="form-control"
                    aria-describedby="housekeeping-task-room-help"
                    required
                    value={createTaskData.roomId}
                    onChange={(e) => setCreateTaskData({ ...createTaskData, roomId: e.target.value })}
                  >
                    <option value="" disabled>{loading ? 'Loading rooms…' : 'Choose a room'}</option>
                    {rooms.map(room => (
                      <option key={room._id} value={room._id} disabled={!canProcessRoom(room)}>
                        Room #{room.roomNumber} ({room.roomType} · {room.status} / {room.cleaningStatus})
                        {room.status === 'Occupied' && ' · Awaiting checkout'}
                      </option>
                    ))}
                  </select>
                  <div id="housekeeping-task-room-help" className="text-muted">
                    {rooms.length === 0 && !loading
                      ? 'No rooms are listed for this property. Close this form and refresh Housekeeping.'
                      : 'Occupied rooms can be selected after checkout. Rooms under maintenance must be released first.'}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Task Type</label>
                  <select 
                    className="form-control"
                    value={createTaskData.taskType}
                    onChange={(e) => setCreateTaskData({ ...createTaskData, taskType: e.target.value })}
                  >
                    <option value="Check-out Cleaning">Check-out Cleaning</option>
                    <option value="Daily Cleaning">Daily Cleaning</option>
                    <option value="Deep Cleaning">Deep Cleaning</option>
                    <option value="Touch-up">Touch-up</option>
                    <option value="Inspection">Inspection</option>
                    <option value="Maintenance Cleaning">Maintenance Cleaning</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Priority</label>
                  <select 
                    className="form-control"
                    value={createTaskData.priority}
                    onChange={(e) => setCreateTaskData({ ...createTaskData, priority: e.target.value })}
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Assign Staff (Optional)</label>
                  <select 
                    className="form-control"
                    value={createTaskData.assignedTo}
                    onChange={(e) => setCreateTaskData({ ...createTaskData, assignedTo: e.target.value })}
                  >
                    <option value="">-- Unassigned (Assign Later) --</option>
                    {staffList.map(s => (
                      <option key={s._id} value={s._id}>
                        {s.name} ({s.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Notes / Instructions</label>
                  <textarea 
                    className="form-control"
                    rows="2"
                    placeholder="Specific requests, guest preferences, or areas needing attention"
                    value={createTaskData.notes}
                    onChange={(e) => setCreateTaskData({ ...createTaskData, notes: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading || submitting || !createTaskData.roomId}>
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default HousekeepingEnhanced;
