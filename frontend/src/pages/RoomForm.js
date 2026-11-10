// frontend/src/pages/RoomForm.js
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { roomAPI } from '../services/api';
import { toast } from 'react-toastify';

const RoomForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const [formData, setFormData] = useState({
    roomNumber: '',
    roomType: 'Single',
    floor: 1,
    building: 'Main',
    basePrice: 0,
    weekendPrice: 0,
    capacity: {
      maxAdults: 1,
      maxChildren: 0,
      maxOccupancy: 1
    },
    bedConfiguration: 'Single Bed',
    roomSize: '',
    view: 'City View',
    amenities: [],
    features: {
      smoking: false,
      petFriendly: false,
      accessible: false,
      balcony: false,
      kitchenette: false
    },
    description: ''
  });

  const [loading, setLoading] = useState(false);
  const [amenityInput, setAmenityInput] = useState('');

  useEffect(() => {
    if (isEdit) {
      fetchRoom();
    }
  }, [id]);

  const fetchRoom = async () => {
    try {
      const response = await roomAPI.getRoom(id);
      const data = response.data;
      setFormData({
        ...data,
        amenities: data.amenities || [],
        features: data.features || {
          smoking: false,
          petFriendly: false,
          accessible: false,
          balcony: false,
          kitchenette: false
        }
      });
    } catch (error) {
      toast.error('Failed to load room data');
      navigate('/rooms');
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (name.startsWith('capacity.')) {
      const field = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        capacity: {
          ...prev.capacity,
          [field]: parseInt(value) || 0
        }
      }));
    } else if (name.startsWith('features.')) {
      const field = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        features: {
          ...prev.features,
          [field]: checked
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: type === 'number' ? (parseFloat(value) || 0) : value
      }));
    }
  };

  const addAmenity = () => {
    if (amenityInput.trim()) {
      setFormData(prev => ({
        ...prev,
        amenities: [...prev.amenities, amenityInput.trim()]
      }));
      setAmenityInput('');
    }
  };

  const removeAmenity = (index) => {
    setFormData(prev => ({
      ...prev,
      amenities: prev.amenities.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Set weekend price to base price if not specified
      const dataToSend = {
        ...formData,
        weekendPrice: formData.weekendPrice || formData.basePrice
      };

      if (isEdit) {
        await roomAPI.updateRoom(id, dataToSend);
        toast.success('Room updated successfully');
      } else {
        await roomAPI.createRoom(dataToSend);
        toast.success('Room created successfully');
      }
      navigate('/rooms');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="topbar">
        <h1 className="topbar-title">{isEdit ? 'Edit Room' : 'Add New Room'}</h1>
      </div>

      <div className="content-wrapper">
        <div className="card">
          <form onSubmit={handleSubmit}>
            {/* Basic Information */}
            <h3 style={{ marginBottom: '1.5rem' }}>Basic Information</h3>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label required">Room Number</label>
                <input
                  type="text"
                  name="roomNumber"
                  className="form-control"
                  value={formData.roomNumber}
                  onChange={handleChange}
                  required
                  placeholder="e.g., 101, 205"
                />
              </div>

              <div className="form-group">
                <label className="form-label required">Room Type</label>
                <select
                  name="roomType"
                  className="form-control"
                  value={formData.roomType}
                  onChange={handleChange}
                  required
                >
                  <option value="Single">Single</option>
                  <option value="Double">Double</option>
                  <option value="Twin">Twin</option>
                  <option value="Suite">Suite</option>
                  <option value="Deluxe">Deluxe</option>
                  <option value="Presidential">Presidential</option>
                  <option value="Family">Family</option>
                  <option value="Connecting">Connecting</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label required">Floor</label>
                <input
                  type="number"
                  name="floor"
                  className="form-control"
                  value={formData.floor}
                  onChange={handleChange}
                  min="0"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Building</label>
                <input
                  type="text"
                  name="building"
                  className="form-control"
                  value={formData.building}
                  onChange={handleChange}
                  placeholder="e.g., Main, Tower A"
                />
              </div>

              <div className="form-group">
                <label className="form-label required">Base Price (per night)</label>
                <input
                  type="number"
                  name="basePrice"
                  className="form-control"
                  value={formData.basePrice}
                  onChange={handleChange}
                  min="0"
                  step="0.01"
                  required
                  placeholder="Weekday price"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Weekend Price (per night)</label>
                <input
                  type="number"
                  name="weekendPrice"
                  className="form-control"
                  value={formData.weekendPrice}
                  onChange={handleChange}
                  min="0"
                  step="0.01"
                  placeholder="Leave empty to use base price"
                />
              </div>

              <div className="form-group">
                <label className="form-label required">Bed Configuration</label>
                <select
                  name="bedConfiguration"
                  className="form-control"
                  value={formData.bedConfiguration}
                  onChange={handleChange}
                  required
                >
                  <option value="Single Bed">Single Bed</option>
                  <option value="Double Bed">Double Bed</option>
                  <option value="Twin Beds">Twin Beds</option>
                  <option value="King Bed">King Bed</option>
                  <option value="Queen Bed">Queen Bed</option>
                  <option value="Multiple Beds">Multiple Beds</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Room Size (sq ft)</label>
                <input
                  type="number"
                  name="roomSize"
                  className="form-control"
                  value={formData.roomSize}
                  onChange={handleChange}
                  min="0"
                  placeholder="e.g., 250"
                />
              </div>

              <div className="form-group">
                <label className="form-label">View</label>
                <select
                  name="view"
                  className="form-control"
                  value={formData.view}
                  onChange={handleChange}
                >
                  <option value="City View">City View</option>
                  <option value="Sea View">Sea View</option>
                  <option value="Garden View">Garden View</option>
                  <option value="Pool View">Pool View</option>
                  <option value="Mountain View">Mountain View</option>
                  <option value="No View">No View</option>
                </select>
              </div>
            </div>

            {/* Capacity */}
            <h3 style={{ marginTop: '2rem', marginBottom: '1.5rem' }}>Capacity</h3>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label required">Max Adults</label>
                <input
                  type="number"
                  name="capacity.maxAdults"
                  className="form-control"
                  value={formData.capacity.maxAdults}
                  onChange={handleChange}
                  min="1"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Max Children</label>
                <input
                  type="number"
                  name="capacity.maxChildren"
                  className="form-control"
                  value={formData.capacity.maxChildren}
                  onChange={handleChange}
                  min="0"
                />
              </div>

              <div className="form-group">
                <label className="form-label required">Max Total Occupancy</label>
                <input
                  type="number"
                  name="capacity.maxOccupancy"
                  className="form-control"
                  value={formData.capacity.maxOccupancy}
                  onChange={handleChange}
                  min="1"
                  required
                />
              </div>
            </div>

            {/* Features */}
            <h3 style={{ marginTop: '2rem', marginBottom: '1.5rem' }}>Features</h3>
            <div className="form-grid">
              <div className="form-group">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    name="features.smoking"
                    id="smoking"
                    checked={formData.features.smoking}
                    onChange={handleChange}
                  />
                  <label htmlFor="smoking" style={{ marginBottom: 0 }}>Smoking Allowed</label>
                </div>
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    name="features.petFriendly"
                    id="petFriendly"
                    checked={formData.features.petFriendly}
                    onChange={handleChange}
                  />
                  <label htmlFor="petFriendly" style={{ marginBottom: 0 }}>Pet Friendly</label>
                </div>
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    name="features.accessible"
                    id="accessible"
                    checked={formData.features.accessible}
                    onChange={handleChange}
                  />
                  <label htmlFor="accessible" style={{ marginBottom: 0 }}>Wheelchair Accessible</label>
                </div>
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    name="features.balcony"
                    id="balcony"
                    checked={formData.features.balcony}
                    onChange={handleChange}
                  />
                  <label htmlFor="balcony" style={{ marginBottom: 0 }}>Has Balcony</label>
                </div>
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    name="features.kitchenette"
                    id="kitchenette"
                    checked={formData.features.kitchenette}
                    onChange={handleChange}
                  />
                  <label htmlFor="kitchenette" style={{ marginBottom: 0 }}>Has Kitchenette</label>
                </div>
              </div>
            </div>

            {/* Amenities */}
            <h3 style={{ marginTop: '2rem', marginBottom: '1.5rem' }}>Amenities</h3>
            <div className="form-group">
              <label className="form-label">Add Amenities</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  className="form-control"
                  value={amenityInput}
                  onChange={(e) => setAmenityInput(e.target.value)}
                  placeholder="e.g., WiFi, AC, TV"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addAmenity();
                    }
                  }}
                />
                <button type="button" onClick={addAmenity} className="btn btn-primary">
                  Add
                </button>
              </div>
            </div>

            {formData.amenities.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem' }}>
                {formData.amenities.map((amenity, index) => (
                  <span 
                    key={index} 
                    className="badge badge-info" 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.5rem',
                      padding: '0.5rem 0.75rem',
                      cursor: 'pointer'
                    }}
                    onClick={() => removeAmenity(index)}
                  >
                    {amenity}
                    <span style={{ marginLeft: '0.25rem' }}>×</span>
                  </span>
                ))}
              </div>
            )}
            <p className="form-help">Common amenities: WiFi, AC, TV, Mini Bar, Safe, Coffee Maker, Hair Dryer, Iron, Microwave</p>

            {/* Description */}
            <h3 style={{ marginTop: '2rem', marginBottom: '1.5rem' }}>Description</h3>
            <div className="form-group full-width">
              <label className="form-label">Room Description</label>
              <textarea
                name="description"
                className="form-control"
                value={formData.description}
                onChange={handleChange}
                rows="4"
                placeholder="Describe the room features, decor, and highlights..."
              />
            </div>

            {/* Submit Buttons */}
            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Saving...' : (isEdit ? 'Update Room' : 'Create Room')}
              </button>
              <button type="button" onClick={() => navigate('/rooms')} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default RoomForm;