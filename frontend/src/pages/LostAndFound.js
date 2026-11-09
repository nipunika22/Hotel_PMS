// frontend/src/pages/LostAndFound.js
import React, { useState, useEffect, useCallback } from 'react';
import { 
  FaBoxOpen, 
  FaPlus, 
  FaCheck, 
  FaTrash, 
  FaSearch, 
  FaSyncAlt, 
  FaTimes,
  FaBed,
  FaUserCheck,
  FaCalendarAlt,
  FaMapMarkerAlt
} from 'react-icons/fa';
import { lostItemAPI, roomAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import EmptyState from '../components/ui/EmptyState';
import { StatsSkeleton } from '../components/ui/LoadingSkeleton';

const LostAndFound = () => {
  const { user } = useAuth();
  const userRole = (user?.role || '').toLowerCase().trim();
  const isSupervisor = ['admin', 'manager'].includes(userRole);
  const canClaim = ['admin', 'manager', 'staff'].includes(userRole);

  // States
  const [items, setItems] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [roomFilter, setRoomFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [showReportModal, setShowReportModal] = useState(false);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [showDisposeModal, setShowDisposeModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  // Form states
  const [reportData, setReportData] = useState({
    itemDescription: '',
    category: 'Electronics',
    roomId: '',
    location: '',
    foundBy: user?.name || '',
    storageLocation: 'Front Desk Storage',
    notes: ''
  });

  const [claimData, setClaimData] = useState({
    claimantName: '',
    claimantPhone: '',
    claimantEmail: '',
    handoverVerification: '',
    notes: ''
  });

  const [disposeData, setDisposeData] = useState({
    disposalReason: '',
    notes: ''
  });

  const fetchData = useCallback(async () => {
    try {
      const [itemsRes, roomsRes] = await Promise.all([
        lostItemAPI.getItems(),
        roomAPI.getRooms()
      ]);
      setItems(itemsRes.data);
      setRooms(roomsRes.data);
    } catch (err) {
      console.error('Fetch lost items error:', err);
      toast.error('Failed to load lost & found items');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Actions
  const handleReportItem = async (e) => {
    e.preventDefault();
    if (!reportData.itemDescription.trim() || !reportData.location.trim() || !reportData.foundBy.trim()) {
      toast.error('Item description, location, and finder are required');
      return;
    }

    try {
      await lostItemAPI.createItem(reportData);
      toast.success('Lost item registered in registry successfully');
      setShowReportModal(false);
      setReportData({
        itemDescription: '',
        category: 'Electronics',
        roomId: '',
        location: '',
        foundBy: user?.name || '',
        storageLocation: 'Front Desk Storage',
        notes: ''
      });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to record lost item');
    }
  };

  const handleClaimItem = async (e) => {
    e.preventDefault();
    if (!selectedItem || !claimData.claimantName.trim() || (!claimData.claimantPhone.trim() && !claimData.claimantEmail.trim())) {
      toast.error('Claimant name and contact phone or email are required');
      return;
    }

    try {
      await lostItemAPI.claimItem(selectedItem._id, claimData);
      toast.success('Item claimed and handover recorded successfully');
      setShowClaimModal(false);
      setSelectedItem(null);
      setClaimData({ claimantName: '', claimantPhone: '', claimantEmail: '', handoverVerification: '', notes: '' });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to claim item');
    }
  };

  const handleDisposeItem = async (e) => {
    e.preventDefault();
    if (!selectedItem || !disposeData.disposalReason.trim()) {
      toast.error('Disposal reason is required');
      return;
    }

    try {
      await lostItemAPI.disposeItem(selectedItem._id, disposeData);
      toast.success('Item marked as disposed per policy');
      setShowDisposeModal(false);
      setSelectedItem(null);
      setDisposeData({ disposalReason: '', notes: '' });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to dispose item');
    }
  };

  // Filter items
  const filteredItems = items.filter(item => {
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
    const matchesRoom = roomFilter === 'all' || (item.room?._id === roomFilter || item.room === roomFilter);
    const matchesSearch = !searchTerm || 
      item.itemNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.itemDescription?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.foundBy?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.claimantName?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesCategory && matchesRoom && matchesSearch;
  });

  // Calculate stats
  const totalCount = items.length;
  const foundCount = items.filter(i => i.status === 'Found').length;
  const claimedCount = items.filter(i => i.status === 'Claimed').length;
  const disposedCount = items.filter(i => i.status === 'Disposed').length;

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
        title="Lost & Found" 
        subtitle="Manage lost items inventory, track guest claims, and record verified handovers."
      >
        <button className="btn btn-primary" onClick={() => setShowReportModal(true)}>
          <FaPlus /> Report Found Item
        </button>
      </PageHeader>

      {/* KPI Stats */}
      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-label">Total Logged Items</div>
          <div className="stat-value">{totalCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">In Storage / Unclaimed</div>
          <div className="stat-value" style={{ color: 'var(--color-warning)' }}>{foundCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Claimed & Returned</div>
          <div className="stat-value" style={{ color: 'var(--color-success)' }}>{claimedCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Disposed Items</div>
          <div className="stat-value" style={{ color: 'var(--text-muted)' }}>{disposedCount}</div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="filters" style={{ marginBottom: '1.5rem' }}>
        <div className="filter-row" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div className="search-box" style={{ flex: 1, minWidth: '220px' }}>
            <FaSearch />
            <input 
              type="text"
              placeholder="Search item #, description, location, or claimant..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-control"
            />
          </div>

          <select 
            className="form-control"
            style={{ maxWidth: '160px' }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="Found">Found (In Storage)</option>
            <option value="Claimed">Claimed</option>
            <option value="Disposed">Disposed</option>
          </select>

          <select 
            className="form-control"
            style={{ maxWidth: '170px' }}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">All Categories</option>
            <option value="Electronics">Electronics</option>
            <option value="Clothing">Clothing</option>
            <option value="Jewelry">Jewelry</option>
            <option value="Documents/Cards">Documents/Cards</option>
            <option value="Luggage/Bags">Luggage/Bags</option>
            <option value="Keys">Keys</option>
            <option value="Eyewear">Eyewear</option>
            <option value="Personal Accessories">Personal Accessories</option>
            <option value="Other">Other</option>
          </select>

          <select 
            className="form-control"
            style={{ maxWidth: '170px' }}
            value={roomFilter}
            onChange={(e) => setRoomFilter(e.target.value)}
          >
            <option value="all">All Rooms</option>
            {rooms.map(r => (
              <option key={r._id} value={r._id}>Room #{r.roomNumber}</option>
            ))}
          </select>

          <button className="btn btn-ghost" onClick={fetchData} title="Refresh">
            <FaSyncAlt />
          </button>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <EmptyState 
          icon={FaBoxOpen}
          title="No lost items found"
          message={searchTerm || statusFilter !== 'all' ? "Try adjusting your filters or search." : "No lost and found items have been recorded yet."}
          action={
            <button className="btn btn-primary" onClick={() => setShowReportModal(true)}>
              <FaPlus /> Report Found Item
            </button>
          }
        />
      ) : (
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Item #</th>
                <th>Description</th>
                <th>Category</th>
                <th>Found At</th>
                <th>Found By</th>
                <th>Date Found</th>
                <th>Storage</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map(item => (
                <tr key={item._id}>
                  <td><strong>{item.itemNumber}</strong></td>
                  <td>
                    <div><strong>{item.itemDescription}</strong></div>
                    {item.claimantName && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-success)', marginTop: '3px' }}>
                        Claimed by: {item.claimantName} ({item.claimantPhone || item.claimantEmail})
                      </div>
                    )}
                    {item.disposalReason && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '3px' }}>
                        Disposed: {item.disposalReason}
                      </div>
                    )}
                  </td>
                  <td><span className="badge badge-info">{item.category}</span></td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <FaMapMarkerAlt style={{ color: 'var(--text-muted)' }} />
                      <span>{item.room ? `Room #${item.room.roomNumber}` : item.location}</span>
                    </div>
                  </td>
                  <td>{item.foundBy}</td>
                  <td style={{ fontSize: '0.85rem' }}>{new Date(item.foundDate).toLocaleDateString()}</td>
                  <td style={{ fontSize: '0.85rem' }}>{item.storageLocation}</td>
                  <td><StatusBadge status={item.status} /></td>
                  <td>
                    <div className="table-actions" style={{ display: 'flex', gap: '0.4rem' }}>
                      {item.status === 'Found' && canClaim && (
                        <button 
                          className="btn btn-sm btn-success"
                          onClick={() => {
                            setSelectedItem(item);
                            setShowClaimModal(true);
                          }}
                          title="Claim Item"
                        >
                          <FaUserCheck /> Claim
                        </button>
                      )}

                      {item.status === 'Found' && isSupervisor && (
                        <button 
                          className="btn btn-sm btn-ghost"
                          style={{ color: 'var(--color-danger)' }}
                          onClick={() => {
                            setSelectedItem(item);
                            setShowDisposeModal(true);
                          }}
                          title="Authorize Disposal"
                        >
                          <FaTrash /> Dispose
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

      {/* MODAL 1: Report Lost Item */}
      {showReportModal && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h3>Report Found Item</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowReportModal(false)}>
                <FaTimes />
              </button>
            </div>
            <form onSubmit={handleReportItem}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label required">Item Description</label>
                  <input 
                    type="text"
                    className="form-control"
                    placeholder="e.g., Black Leather Wallet, Silver iPhone 14 Pro"
                    value={reportData.itemDescription}
                    onChange={(e) => setReportData({ ...reportData, itemDescription: e.target.value })}
                    required
                  />
                </div>

                <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label required">Category</label>
                    <select 
                      className="form-control"
                      value={reportData.category}
                      onChange={(e) => setReportData({ ...reportData, category: e.target.value })}
                    >
                      <option value="Electronics">Electronics</option>
                      <option value="Clothing">Clothing</option>
                      <option value="Jewelry">Jewelry</option>
                      <option value="Documents/Cards">Documents/Cards</option>
                      <option value="Luggage/Bags">Luggage/Bags</option>
                      <option value="Keys">Keys</option>
                      <option value="Eyewear">Eyewear</option>
                      <option value="Personal Accessories">Personal Accessories</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Related Room (Optional)</label>
                    <select 
                      className="form-control"
                      value={reportData.roomId}
                      onChange={(e) => setReportData({ ...reportData, roomId: e.target.value })}
                    >
                      <option value="">Public / Not in Room</option>
                      {rooms.map(r => (
                        <option key={r._id} value={r._id}>Room #{r.roomNumber}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label required">Location Found</label>
                  <input 
                    type="text"
                    className="form-control"
                    placeholder="e.g., Under bed side table, Pool deck chair 3, Lobby lounge"
                    value={reportData.location}
                    onChange={(e) => setReportData({ ...reportData, location: e.target.value })}
                    required
                  />
                </div>

                <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label required">Found By</label>
                    <input 
                      type="text"
                      className="form-control"
                      placeholder="Staff or Finder Name"
                      value={reportData.foundBy}
                      onChange={(e) => setReportData({ ...reportData, foundBy: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Storage Location</label>
                    <input 
                      type="text"
                      className="form-control"
                      placeholder="e.g., Safe B-1, Lost & Found Bin 2"
                      value={reportData.storageLocation}
                      onChange={(e) => setReportData({ ...reportData, storageLocation: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Additional Notes</label>
                  <textarea 
                    className="form-control"
                    rows="2"
                    placeholder="Distinguishing marks, condition, serial number..."
                    value={reportData.notes}
                    onChange={(e) => setReportData({ ...reportData, notes: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowReportModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save to Registry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Claim Item */}
      {showClaimModal && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3>Claim Lost Item</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowClaimModal(false)}>
                <FaTimes />
              </button>
            </div>
            <form onSubmit={handleClaimItem}>
              <div className="modal-body">
                <p style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>
                  Processing claim for: <strong>{selectedItem?.itemDescription}</strong> ({selectedItem?.itemNumber})
                </p>

                <div className="form-group">
                  <label className="form-label required">Claimant Full Name</label>
                  <input 
                    type="text"
                    className="form-control"
                    placeholder="Guest name who is claiming the item"
                    value={claimData.claimantName}
                    onChange={(e) => setClaimData({ ...claimData, claimantName: e.target.value })}
                    required
                  />
                </div>

                <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Phone Number</label>
                    <input 
                      type="text"
                      className="form-control"
                      placeholder="e.g., +1 555 123 4567"
                      value={claimData.claimantPhone}
                      onChange={(e) => setClaimData({ ...claimData, claimantPhone: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email Address</label>
                    <input 
                      type="email"
                      className="form-control"
                      placeholder="guest@example.com"
                      value={claimData.claimantEmail}
                      onChange={(e) => setClaimData({ ...claimData, claimantEmail: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Handover Verification</label>
                  <textarea 
                    className="form-control"
                    rows="2"
                    placeholder="e.g., Verified guest ID, matched phone lock screen wallpaper, confirmed serial number"
                    value={claimData.handoverVerification}
                    onChange={(e) => setClaimData({ ...claimData, handoverVerification: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowClaimModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-success">
                  <FaCheck /> Confirm Handover & Claim
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Dispose Item */}
      {showDisposeModal && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: '460px' }}>
            <div className="modal-header">
              <h3>Authorize Item Disposal</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowDisposeModal(false)}>
                <FaTimes />
              </button>
            </div>
            <form onSubmit={handleDisposeItem}>
              <div className="modal-body">
                <p style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>
                  Disposing item: <strong>{selectedItem?.itemDescription}</strong> ({selectedItem?.itemNumber})
                </p>

                <div className="form-group">
                  <label className="form-label required">Disposal Reason</label>
                  <textarea 
                    className="form-control"
                    rows="3"
                    placeholder="e.g., Exceeded 90-day hotel retention policy without claim, perishable food/toiletries, damaged beyond repair"
                    value={disposeData.disposalReason}
                    onChange={(e) => setDisposeData({ ...disposeData, disposalReason: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowDisposeModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-danger">
                  <FaTrash /> Authorize Disposal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LostAndFound;
