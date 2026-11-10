// frontend/src/pages/TravelAgentForm.js
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DatePicker from 'react-datepicker';
import { travelAgentAPI } from '../services/api';
import { toast } from 'react-toastify';

const TravelAgentForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const [formData, setFormData] = useState({
    agentName: '',
    companyName: '',
    agentCode: '',
    contactPerson: '',
    email: '',
    phone: '',
    address: {
      street: '',
      city: '',
      state: '',
      country: '',
      zipCode: ''
    },
    licenseNumber: '',
    commissionRate: 10,
    paymentTerms: 'Credit',
    creditLimit: 0,
    contractStartDate: new Date(),
    contractEndDate: null,
    status: 'Active'
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isEdit) {
      fetchAgent();
    }
  }, [id]);

  const fetchAgent = async () => {
    try {
      const response = await travelAgentAPI.getAgent(id);
      const data = response.data;
      setFormData({
        ...data,
        contractStartDate: data.contractStartDate ? new Date(data.contractStartDate) : new Date(),
        contractEndDate: data.contractEndDate ? new Date(data.contractEndDate) : null
      });
    } catch (error) {
      toast.error('Failed to load agent data');
      navigate('/travel-agents');
    }
  };

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    
    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setFormData(prev => ({
        ...prev,
        [parent]: {
          ...prev[parent],
          [child]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: type === 'number' ? (parseFloat(value) || 0) : value
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const dataToSend = {
        ...formData,
        contractStartDate: formData.contractStartDate?.toISOString(),
        contractEndDate: formData.contractEndDate?.toISOString() || null
      };

      if (isEdit) {
        await travelAgentAPI.updateAgent(id, dataToSend);
        toast.success('Travel agent updated successfully');
      } else {
        await travelAgentAPI.createAgent(dataToSend);
        toast.success('Travel agent created successfully');
      }
      navigate('/travel-agents');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="topbar">
        <h1 className="topbar-title">{isEdit ? 'Edit Travel Agent' : 'Add New Travel Agent'}</h1>
      </div>

      <div className="content-wrapper">
        <div className="card">
          <form onSubmit={handleSubmit}>
            <h3 style={{ marginBottom: '1.5rem' }}>Company Information</h3>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label required">Company Name</label>
                <input
                  type="text"
                  name="companyName"
                  className="form-control"
                  value={formData.companyName}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label required">Agent Name</label>
                <input
                  type="text"
                  name="agentName"
                  className="form-control"
                  value={formData.agentName}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label required">Agent Code</label>
                <input
                  type="text"
                  name="agentCode"
                  className="form-control"
                  value={formData.agentCode}
                  onChange={handleChange}
                  required
                  placeholder="Unique code (e.g., TA001)"
                  style={{ textTransform: 'uppercase' }}
                />
                <div className="form-help">Must be unique and uppercase</div>
              </div>

              <div className="form-group">
                <label className="form-label">License Number</label>
                <input
                  type="text"
                  name="licenseNumber"
                  className="form-control"
                  value={formData.licenseNumber}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Status</label>
                <select
                  name="status"
                  className="form-control"
                  value={formData.status}
                  onChange={handleChange}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Suspended">Suspended</option>
                </select>
              </div>
            </div>

            <h3 style={{ marginTop: '2rem', marginBottom: '1.5rem' }}>Contact Information</h3>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label required">Contact Person</label>
                <input
                  type="text"
                  name="contactPerson"
                  className="form-control"
                  value={formData.contactPerson}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label required">Email</label>
                <input
                  type="email"
                  name="email"
                  className="form-control"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label required">Phone</label>
                <input
                  type="tel"
                  name="phone"
                  className="form-control"
                  value={formData.phone}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <h3 style={{ marginTop: '2rem', marginBottom: '1.5rem' }}>Address</h3>
            <div className="form-grid">
              <div className="form-group full-width">
                <label className="form-label">Street</label>
                <input
                  type="text"
                  name="address.street"
                  className="form-control"
                  value={formData.address?.street || ''}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label className="form-label">City</label>
                <input
                  type="text"
                  name="address.city"
                  className="form-control"
                  value={formData.address?.city || ''}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label className="form-label">State</label>
                <input
                  type="text"
                  name="address.state"
                  className="form-control"
                  value={formData.address?.state || ''}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Country</label>
                <input
                  type="text"
                  name="address.country"
                  className="form-control"
                  value={formData.address?.country || ''}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Zip Code</label>
                <input
                  type="text"
                  name="address.zipCode"
                  className="form-control"
                  value={formData.address?.zipCode || ''}
                  onChange={handleChange}
                />
              </div>
            </div>

            <h3 style={{ marginTop: '2rem', marginBottom: '1.5rem' }}>Financial Terms</h3>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label required">Commission Rate (%)</label>
                <input
                  type="number"
                  name="commissionRate"
                  className="form-control"
                  value={formData.commissionRate}
                  onChange={handleChange}
                  min="0"
                  max="100"
                  step="0.1"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label required">Payment Terms</label>
                <select
                  name="paymentTerms"
                  className="form-control"
                  value={formData.paymentTerms}
                  onChange={handleChange}
                  required
                >
                  <option value="Prepaid">Prepaid</option>
                  <option value="Credit">Credit</option>
                  <option value="COD">COD (Cash on Delivery)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Credit Limit</label>
                <input
                  type="number"
                  name="creditLimit"
                  className="form-control"
                  value={formData.creditLimit}
                  onChange={handleChange}
                  min="0"
                  step="0.01"
                />
                <div className="form-help">Maximum outstanding balance allowed</div>
              </div>
            </div>

            <h3 style={{ marginTop: '2rem', marginBottom: '1.5rem' }}>Contract Details</h3>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label required">Contract Start Date</label>
                <DatePicker
                  selected={formData.contractStartDate}
                  onChange={(date) => setFormData({ ...formData, contractStartDate: date })}
                  className="form-control"
                  dateFormat="MMM dd, yyyy"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Contract End Date</label>
                <DatePicker
                  selected={formData.contractEndDate}
                  onChange={(date) => setFormData({ ...formData, contractEndDate: date })}
                  minDate={formData.contractStartDate}
                  className="form-control"
                  dateFormat="MMM dd, yyyy"
                  isClearable
                  placeholderText="No end date (ongoing)"
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Saving...' : (isEdit ? 'Update Agent' : 'Create Agent')}
              </button>
              <button type="button" onClick={() => navigate('/travel-agents')} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default TravelAgentForm;