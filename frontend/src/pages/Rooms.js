// frontend/src/pages/Rooms.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaPlus, FaEdit, FaTrash, FaSearch, FaBed, FaTools, FaTimes, FaBroom, FaShieldAlt, FaEye } from 'react-icons/fa';
import { roomAPI, maintenanceAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import EmptyState from '../components/ui/EmptyState';
import { StatsSkeleton } from '../components/ui/LoadingSkeleton';

const Rooms = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userRole = (user?.role || '').toLowerCase().trim();
  const canManageMaintenance = ['admin', 'manager', 'staff', 'housekeeping', 'maintenance'].includes(userRole);
  const isSupervisor = ['admin', 'manager'].includes(userRole);

  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  // Maintenance action modal
  const [showMntModal, setShowMntModal] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [detailRoom, setDetailRoom] = useState(null);
  const [mntData, setMntData] = useState({
    issueCategory: 'Plumbing',
    description: '',
    priority: 'Medium',
    estimatedCost: 0,
    isBlocking: false
  });

  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      const response = await roomAPI.getRooms();
      setRooms(response.data);
    } catch (error) {
      toast.error('Failed to load rooms');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Deactivate this room? Rooms linked to reservation history are retained.')) return;
    try {
      await roomAPI.deleteRoom(id);
      toast.success('Room deactivated successfully');
      fetchRooms();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete room');
    }
  };

  const handleOpenMaintenanceModal = (room) => {
    setSelectedRoom(room);
    setMntData({
      issueCategory: 'Plumbing',
      description: '',
      priority: 'Medium',
      estimatedCost: 0,
      isBlocking: room.status !== 'Maintenance' && isSupervisor
    });
    setShowMntModal(true);
  };

  const handleSubmitMaintenance = async (e) => {
    e.preventDefault();
    if (!selectedRoom || !mntData.description.trim()) {
      toast.error('Please enter the issue description');
      return;
    }

    try {
      await maintenanceAPI.createTicket({
        roomId: selectedRoom._id,
        issueCategory: mntData.issueCategory,
        description: mntData.description,
        priority: mntData.priority,
        estimatedCost: mntData.estimatedCost,
        isBlocking: mntData.isBlocking
      });

      toast.success('Maintenance ticket reported successfully');
      setShowMntModal(false);
      setSelectedRoom(null);
      fetchRooms();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit maintenance ticket');
    }
  };

  const handleReleaseRoom = async (roomId) => {
    if (!window.confirm('Release this room from maintenance? It will transition to Cleaning (Dirty) and trigger a Maintenance Cleaning task.')) {
      return;
    }
    try {
      await maintenanceAPI.releaseRoom({ roomId });
      toast.success('Room released to Cleaning! Housekeeper inspection required before Available.');
      setShowMntModal(false);
      setSelectedRoom(null);
      fetchRooms();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to release room');
    }
  };

  const filteredRooms = rooms.filter(room => {
    const matchesSearch = !searchTerm || 
      room.roomNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      room.roomType?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || room.status === statusFilter;
    const matchesType = typeFilter === 'all' || room.roomType === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const roomTypes = [...new Set(rooms.map(r => r.roomType))];

  if (loading) {
    return (
      <div className="content-wrapper">
        <div style={{ marginBottom: '2rem' }}>
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-text" style={{ width: '260px' }} />
        </div>
        <StatsSkeleton count={4} />
      </div>
    );
  }

  return (
    <div>
      <div className="content-wrapper">
        <PageHeader 
          title="Rooms" 
          subtitle="Manage room inventory, availability and status."
        >
          <button onClick={() => navigate('/rooms/new')} className="btn btn-primary">
            <FaPlus /> Add Room
          </button>
        </PageHeader>

        {/* Filters */}
        <div className="filters">
          <div className="filter-row">
            <div className="search-box">
              <FaSearch />
              <input
                type="text"
                placeholder="Search room number or type..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <select
              className="form-control"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ maxWidth: '180px' }}
            >
              <option value="all">All Status</option>
              <option value="Available">Available</option>
              <option value="Occupied">Occupied</option>
              <option value="Reserved">Reserved</option>
              <option value="Cleaning">Cleaning</option>
              <option value="Maintenance">Maintenance</option>
              <option value="Out of Order">Out of Order</option>
            </select>
            <select
              className="form-control"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{ maxWidth: '180px' }}
            >
              <option value="all">All Types</option>
              {roomTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
        </div>

        {filteredRooms.length === 0 ? (
          <EmptyState 
            icon={FaBed}
            title="No rooms found"
            message={searchTerm || statusFilter !== 'all' ? "Try adjusting your filters." : "Add your first room to get started."}
            action={
              !searchTerm && statusFilter === 'all' && (
                <button onClick={() => navigate('/rooms/new')} className="btn btn-primary">
                  <FaPlus /> Add Room
                </button>
              )
            }
          />
        ) : (
          <div className="room-cards-grid">
            {filteredRooms.map((room) => (
              <div key={room._id} className="room-card">
                <div className="room-card-header">
                  <div className="room-card-number">#{room.roomNumber}</div>
                  <StatusBadge status={room.status} />
                </div>
                <div className="room-card-type">{room.roomType}</div>
                <div className="room-card-info">
                  <span>Floor {room.floor}</span>
                  <span>{room.bedConfiguration}</span>
                  {room.capacity && <span>Max {room.capacity.maxOccupancy} guests</span>}
                </div>
                {room.cleaningStatus && room.cleaningStatus !== 'Clean' && (
                  <div style={{ marginBottom: 'var(--space-3)' }}>
                    <StatusBadge status={room.cleaningStatus} />
                  </div>
                )}
                <div className="room-card-footer">
                  <div className="room-card-price">
                    ₹{room.basePrice?.toLocaleString()}
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', fontWeight: 400 }}>/night</span>
                  </div>
                  <div className="table-actions">
                    <button type="button" onClick={() => setDetailRoom(room)} className="btn btn-icon btn-ghost btn-sm" title="View Room Details" aria-label="View room details"><FaEye /></button>
                    {/* Maintenance Action Button */}
                    {canManageMaintenance && (
                      <button
                        onClick={() => handleOpenMaintenanceModal(room)}
                        className="btn btn-icon btn-ghost btn-sm"
                        title="Report Maintenance Issue / Work Order"
                        aria-label="Maintenance"
                        style={{ color: 'var(--color-warning)' }}
                      >
                        <FaTools />
                      </button>
                    )}
                    <button
                      onClick={() => navigate(`/rooms/${room._id}/edit`)}
                      className="btn btn-icon btn-ghost btn-sm"
                      title="Edit Room"
                      aria-label="Edit room"
                    >
                      <FaEdit />
                    </button>
                    <button
                      onClick={() => handleDelete(room._id)}
                      className="btn btn-icon btn-ghost btn-sm"
                      title="Deactivate Room"
                      aria-label="Deactivate room"
                      style={{ color: 'var(--color-danger)' }}
                    >
                      <FaTrash />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Maintenance Action Modal */}
      {detailRoom && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailRoom(null); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="room-detail-title"><div className="modal-header"><h2 id="room-detail-title">Room #{detailRoom.roomNumber}</h2><button type="button" className="btn btn-ghost btn-sm" onClick={() => setDetailRoom(null)} aria-label="Close room details"><FaTimes /></button></div><div className="modal-body"><p><strong>Type:</strong> {detailRoom.roomType}</p><p><strong>Status:</strong> {detailRoom.status}</p><p><strong>Capacity:</strong> {detailRoom.capacity?.maxOccupancy ?? '—'} guests</p><p><strong>Price:</strong> {detailRoom.basePrice?.toLocaleString()} / night</p><p><strong>Description:</strong> {detailRoom.description || 'No description provided.'}</p><p><strong>Amenities:</strong> {detailRoom.amenities?.length ? detailRoom.amenities.join(', ') : 'None listed'}</p>{detailRoom.images?.length > 0 && <div className="room-detail-images">{detailRoom.images.map((image, index) => <img key={`${image}-${index}`} src={image} alt={`Room ${detailRoom.roomNumber} ${index + 1}`} loading="lazy" />)}</div>}</div></section></div>}
      {showMntModal && selectedRoom && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3>Maintenance — Room #{selectedRoom.roomNumber}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowMntModal(false)}>
                <FaTimes />
              </button>
            </div>
            <form onSubmit={handleSubmitMaintenance}>
              <div className="modal-body">
                <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Current Status: <StatusBadge status={selectedRoom.status} />
                </p>

                {/* If already in maintenance, offer direct release option */}
                {['Maintenance', 'Out of Order'].includes(selectedRoom.status) && isSupervisor && (
                  <div style={{ marginBottom: '1.25rem', padding: '0.75rem', background: 'rgba(59, 130, 246, 0.08)', borderRadius: '6px' }}>
                    <p style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                      This room is currently out of service. When repairs are finished, release it to initiate cleaning.
                    </p>
                    <button 
                      type="button" 
                      className="btn btn-sm btn-info"
                      onClick={() => handleReleaseRoom(selectedRoom._id)}
                    >
                      <FaBroom /> Release Room to Cleaning
                    </button>
                  </div>
                )}

                <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label required">Category</label>
                    <select
                      className="form-control"
                      value={mntData.issueCategory}
                      onChange={(e) => setMntData({ ...mntData, issueCategory: e.target.value })}
                    >
                      <option value="Plumbing">Plumbing</option>
                      <option value="Electrical">Electrical</option>
                      <option value="HVAC">HVAC</option>
                      <option value="Furniture">Furniture</option>
                      <option value="Appliance">Appliance</option>
                      <option value="Carpentry">Carpentry</option>
                      <option value="Painting">Painting</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label required">Priority</label>
                    <select
                      className="form-control"
                      value={mntData.priority}
                      onChange={(e) => setMntData({ ...mntData, priority: e.target.value })}
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
                    placeholder="Describe issue (e.g., leaking shower, broken light fixture)..."
                    value={mntData.description}
                    onChange={(e) => setMntData({ ...mntData, description: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Estimated Cost (₹)</label>
                  <input
                    type="number"
                    min="0"
                    className="form-control"
                    value={mntData.estimatedCost}
                    onChange={(e) => setMntData({ ...mntData, estimatedCost: parseFloat(e.target.value) || 0 })}
                  />
                </div>

                {isSupervisor && selectedRoom.status !== 'Maintenance' && (
                  <div className="form-group" style={{ padding: '0.75rem', background: 'var(--bg-muted, #f8f9fa)', borderRadius: '6px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: 0 }}>
                      <input
                        type="checkbox"
                        checked={mntData.isBlocking}
                        onChange={(e) => setMntData({ ...mntData, isBlocking: e.target.checked })}
                      />
                      <span><strong>Block Room Now</strong> (Sets status to Maintenance if unoccupied)</span>
                    </label>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowMntModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <FaTools /> Submit Work Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Rooms;
