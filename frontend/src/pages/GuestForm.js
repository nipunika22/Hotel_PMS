// frontend/src/pages/GuestForm.js
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { guestAPI } from '../services/api';
import { toast } from 'react-toastify';

const GuestForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    alternatePhone: '',
    nationalIdType: 'Passport',
    nationalIdNumber: '',
    nationality: '',
    dateOfBirth: '',
    gender: 'Male',
    company: '',
    guestType: 'Regular',
    address: {
      street: '',
      city: '',
      state: '',
      country: '',
      zipCode: ''
    },
    preferences: {
      roomType: '',
      floor: '',
      smoking: false,
      bedType: '',
      otherPreferences: ''
    },
    notes: ''
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isEdit) {
      fetchGuest();
    }
  }, [id]);

  const fetchGuest = async () => {
    try {
      const response = await guestAPI.getGuest(id);
      setFormData(response.data);
    } catch (error) {
      toast.error('Failed to load guest data');
      navigate('/guests');
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setFormData(prev => ({
        ...prev,
        [parent]: {
          ...prev[parent],
          [child]: type === 'checkbox' ? checked : value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isEdit) {
        await guestAPI.updateGuest(id, formData);
        toast.success('Guest updated successfully');
      } else {
        await guestAPI.createGuest(formData);
        toast.success('Guest created successfully');
      }
      navigate('/guests');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="topbar">
        <h1 className="topbar-title">{isEdit ? 'Edit Guest' : 'Add New Guest'}</h1>
      </div>

      <div className="content-wrapper">
        <div className="card">
          <form onSubmit={handleSubmit}>
            <h3 style={{ marginBottom: '1.5rem' }}>Personal Information</h3>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label required">First Name</label>
                <input
                  type="text"
                  name="firstName"
                  className="form-control"
                  value={formData.firstName}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label required">Last Name</label>
                <input
                  type="text"
                  name="lastName"
                  className="form-control"
                  value={formData.lastName}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  name="email"
                  className="form-control"
                  value={formData.email}
                  onChange={handleChange}
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

              <div className="form-group">
                <label className="form-label">Alternate Phone</label>
                <input
                  type="tel"
                  name="alternatePhone"
                  className="form-control"
                  value={formData.alternatePhone}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Date of Birth</label>
                <input
                  type="date"
                  name="dateOfBirth"
                  className="form-control"
                  value={formData.dateOfBirth?.split('T')[0] || ''}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Gender</label>
                <select name="gender" className="form-control" value={formData.gender} onChange={handleChange}>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label required">Nationality</label>
                <input
                  type="text"
                  name="nationality"
                  className="form-control"
                  value={formData.nationality}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <h3 style={{ marginTop: '2rem', marginBottom: '1.5rem' }}>ID Information</h3>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label required">ID Type</label>
                <select name="nationalIdType" className="form-control" value={formData.nationalIdType} onChange={handleChange} required>
                  <option value="Passport">Passport</option>
                  <option value="National ID">National ID</option>
                  <option value="Driver License">Driver License</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label required">ID Number</label>
                <input
                  type="text"
                  name="nationalIdNumber"
                  className="form-control"
                  value={formData.nationalIdNumber}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Guest Type</label>
                <select name="guestType" className="form-control" value={formData.guestType} onChange={handleChange}>
                  <option value="Regular">Regular</option>
                  <option value="VIP">VIP</option>
                  <option value="Corporate">Corporate</option>
                  <option value="Group">Group</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Company</label>
                <input
                  type="text"
                  name="company"
                  className="form-control"
                  value={formData.company}
                  onChange={handleChange}
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

            <h3 style={{ marginTop: '2rem', marginBottom: '1.5rem' }}>Preferences</h3>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Preferred Room Type</label>
                <input
                  type="text"
                  name="preferences.roomType"
                  className="form-control"
                  value={formData.preferences?.roomType || ''}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Preferred Floor</label>
                <input
                  type="text"
                  name="preferences.floor"
                  className="form-control"
                  value={formData.preferences?.floor || ''}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Preferred Bed Type</label>
                <input
                  type="text"
                  name="preferences.bedType"
                  className="form-control"
                  value={formData.preferences?.bedType || ''}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group" style={{ display: 'flex', alignItems: 'center', paddingTop: '1.75rem' }}>
                <input
                  type="checkbox"
                  name="preferences.smoking"
                  id="smoking"
                  checked={formData.preferences?.smoking || false}
                  onChange={handleChange}
                  style={{ marginRight: '0.5rem' }}
                />
                <label htmlFor="smoking" style={{ marginBottom: 0 }}>Smoking Room</label>
              </div>

              <div className="form-group full-width">
                <label className="form-label">Other Preferences</label>
                <textarea
                  name="preferences.otherPreferences"
                  className="form-control"
                  value={formData.preferences?.otherPreferences || ''}
                  onChange={handleChange}
                  rows="2"
                />
              </div>
            </div>

            <div className="form-group full-width" style={{ marginTop: '1rem' }}>
              <label className="form-label">Notes</label>
              <textarea
                name="notes"
                className="form-control"
                value={formData.notes}
                onChange={handleChange}
                rows="3"
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Saving...' : (isEdit ? 'Update Guest' : 'Create Guest')}
              </button>
              <button type="button" onClick={() => navigate('/guests')} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default GuestForm;