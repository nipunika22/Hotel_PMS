// frontend/src/pages/ReservationForm.js
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DatePicker from 'react-datepicker';
import { FaSearch } from 'react-icons/fa';
import { reservationAPI, guestAPI, roomAPI, travelAgentAPI } from '../services/api';
import { toast } from 'react-toastify';

const ReservationForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [availableRooms, setAvailableRooms] = useState([]);
  const [travelAgents, setTravelAgents] = useState([]);

  const [formData, setFormData] = useState({
    guestId: '',
    roomId: '',
    bookingSource: 'Walk-in',
    travelAgentId: '',
    bookingReference: '',
    checkInDate: new Date(),
    checkOutDate: new Date(Date.now() + 86400000), // Tomorrow
    numberOfAdults: 1,
    numberOfChildren: 0,
    roomType: 'Single',
    numberOfRooms: 1,
    ratePerNight: 0,
    taxAmount: 0,
    discountAmount: 0,
    discountReason: '',
    advancePayment: 0,
    mealPlan: 'None',
    specialRequests: '',
    purpose: 'Leisure'
  });

  const [selectedGuest, setSelectedGuest] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState(null);

  useEffect(() => {
    fetchTravelAgents();
    if (isEdit) {
      fetchReservation();
    }
  }, [id]);

  const fetchTravelAgents = async () => {
    try {
      const response = await travelAgentAPI.getActiveAgents();
      setTravelAgents(response.data);
    } catch (error) {
      console.error('Failed to load travel agents');
    }
  };

  const fetchReservation = async () => {
    try {
      const response = await reservationAPI.getReservation(id);
      const data = response.data;
      setFormData({
        ...formData,
        ...data,
        guestId: data.guest._id,
        roomId: data.room?._id || '',
        travelAgentId: data.travelAgent?._id || '',
        checkInDate: new Date(data.checkInDate),
        checkOutDate: new Date(data.checkOutDate)
      });
      setSelectedGuest(data.guest);
      setSelectedRoom(data.room);
      setStep(4);
    } catch (error) {
      toast.error('Failed to load reservation');
      navigate('/reservations');
    }
  };

  const searchGuests = async () => {
    if (searchQuery.length < 2) return;
    try {
      const response = await guestAPI.searchGuests(searchQuery);
      setSearchResults(response.data);
    } catch (error) {
      toast.error('Search failed');
    }
  };

  const selectGuest = (guest) => {
    setSelectedGuest(guest);
    setFormData({ ...formData, guestId: guest._id });
    setSearchResults([]);
    setSearchQuery('');
  };

  const searchAvailableRooms = async () => {
    try {
      const response = await roomAPI.getAvailableRooms(
        formData.checkInDate.toISOString(),
        formData.checkOutDate.toISOString(),
        formData.roomType
      );
      setAvailableRooms(response.data);
    } catch (error) {
      toast.error('Failed to load available rooms');
    }
  };

  const selectRoom = (room) => {
    setSelectedRoom(room);
    setFormData({ 
      ...formData, 
      roomId: room._id,
      ratePerNight: room.basePrice
    });
  };

  const calculateTotal = () => {
    const nights = Math.ceil((formData.checkOutDate - formData.checkInDate) / (1000 * 60 * 60 * 24));
    const roomCharges = formData.ratePerNight * nights * formData.numberOfRooms;
    const total = roomCharges + formData.taxAmount - formData.discountAmount;
    return { nights, roomCharges, total };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.guestId) {
      toast.error('Please select a guest');
      return;
    }

    setLoading(true);

    try {
      const { nights, roomCharges, total } = calculateTotal();
      
      const data = {
        ...formData,
        checkInDate: formData.checkInDate.toISOString(),
        checkOutDate: formData.checkOutDate.toISOString(),
        numberOfNights: nights,
        roomCharges: roomCharges,
        totalAmount: total
      };

      if (isEdit) {
        await reservationAPI.updateReservation(id, data);
        toast.success('Reservation updated successfully');
      } else {
        await reservationAPI.createReservation(data);
        toast.success('Reservation created successfully');
      }
      navigate('/reservations');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  const { nights, roomCharges, total } = calculateTotal();

  return (
    <div>
      <div className="topbar">
        <h1 className="topbar-title">{isEdit ? 'Edit Reservation' : 'New Reservation'}</h1>
      </div>

      <div className="content-wrapper">
        {/* Steps Indicator */}
        {!isEdit && (
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {[1, 2, 3, 4].map((s) => (
                <div 
                  key={s}
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    padding: '1rem',
                    borderBottom: step >= s ? '3px solid #2563eb' : '3px solid #e2e8f0',
                    color: step >= s ? '#2563eb' : '#64748b',
                    fontWeight: step === s ? 'bold' : 'normal'
                  }}
                >
                  Step {s}: {['Guest', 'Dates & Room Type', 'Room Selection', 'Details'][s-1]}
                </div>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Step 1: Select Guest */}
          {step === 1 && (
            <div className="card">
              <h3 style={{ marginBottom: '1.5rem' }}>Select Guest</h3>
              
              {!selectedGuest ? (
                <>
                  <div className="form-group">
                    <label className="form-label">Search Guest</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Search by name, phone, email..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                      <button type="button" onClick={searchGuests} className="btn btn-primary">
                        <FaSearch />
                      </button>
                    </div>
                  </div>

                  {searchResults.length > 0 && (
                    <div className="table-container">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Contact</th>
                            <th>ID</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {searchResults.map((guest) => (
                            <tr key={guest._id}>
                              <td>{guest.firstName} {guest.lastName}</td>
                              <td>{guest.phone}</td>
                              <td>{guest.nationalIdNumber}</td>
                              <td>
                                <button 
                                  type="button"
                                  onClick={() => selectGuest(guest)}
                                  className="btn btn-sm btn-primary"
                                >
                                  Select
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div style={{ marginTop: '1rem' }}>
                    <button 
                      type="button"
                      onClick={() => navigate('/guests/new')}
                      className="btn btn-success"
                    >
                      + Create New Guest
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h4>{selectedGuest.firstName} {selectedGuest.lastName}</h4>
                      <p style={{ color: '#64748b', margin: '0.25rem 0' }}>{selectedGuest.phone}</p>
                      <p style={{ color: '#64748b', margin: '0.25rem 0' }}>{selectedGuest.email}</p>
                    </div>
                    <button 
                      type="button"
                      onClick={() => {
                        setSelectedGuest(null);
                        setFormData({ ...formData, guestId: '' });
                      }}
                      className="btn btn-outline btn-sm"
                    >
                      Change
                    </button>
                  </div>
                </div>
              )}

              <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
                <button 
                  type="button" 
                  onClick={() => navigate('/reservations')} 
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  onClick={() => setStep(2)}
                  className="btn btn-primary"
                  disabled={!selectedGuest}
                >
                  Next: Dates & Room Type
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Dates & Room Type */}
          {step === 2 && (
            <div className="card">
              <h3 style={{ marginBottom: '1.5rem' }}>Dates & Room Details</h3>
              
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label required">Check-In Date</label>
                  <DatePicker
                    selected={formData.checkInDate}
                    onChange={(date) => setFormData({ ...formData, checkInDate: date })}
                    minDate={new Date()}
                    className="form-control"
                    dateFormat="MMM dd, yyyy"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label required">Check-Out Date</label>
                  <DatePicker
                    selected={formData.checkOutDate}
                    onChange={(date) => setFormData({ ...formData, checkOutDate: date })}
                    minDate={formData.checkInDate}
                    className="form-control"
                    dateFormat="MMM dd, yyyy"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label required">Room Type</label>
                  <select
                    className="form-control"
                    value={formData.roomType}
                    onChange={(e) => setFormData({ ...formData, roomType: e.target.value })}
                    required
                  >
                    <option value="Single">Single</option>
                    <option value="Double">Double</option>
                    <option value="Twin">Twin</option>
                    <option value="Suite">Suite</option>
                    <option value="Deluxe">Deluxe</option>
                    <option value="Presidential">Presidential</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label required">Number of Rooms</label>
                  <input
                    type="number"
                    className="form-control"
                    value={formData.numberOfRooms}
                    onChange={(e) => setFormData({ ...formData, numberOfRooms: parseInt(e.target.value) })}
                    min="1"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label required">Adults</label>
                  <input
                    type="number"
                    className="form-control"
                    value={formData.numberOfAdults}
                    onChange={(e) => setFormData({ ...formData, numberOfAdults: parseInt(e.target.value) })}
                    min="1"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Children</label>
                  <input
                    type="number"
                    className="form-control"
                    value={formData.numberOfChildren}
                    onChange={(e) => setFormData({ ...formData, numberOfChildren: parseInt(e.target.value) })}
                    min="0"
                  />
                </div>
              </div>

              <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
                <button type="button" onClick={() => setStep(1)} className="btn btn-secondary">
                  Back
                </button>
                <button 
                  type="button" 
                  onClick={() => {
                    searchAvailableRooms();
                    setStep(3);
                  }}
                  className="btn btn-primary"
                >
                  Next: Select Room
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Room Selection */}
          {step === 3 && (
            <div className="card">
              <h3 style={{ marginBottom: '1.5rem' }}>Select Room (Optional)</h3>
              
              {availableRooms.length === 0 ? (
                <div className="empty-state">
                  <p>No rooms available for selected dates</p>
                  <p>You can skip this step and assign a room later</p>
                </div>
              ) : (
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Room Number</th>
                        <th>Type</th>
                        <th>Floor</th>
                        <th>Price/Night</th>
                        <th>Capacity</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {availableRooms.map((room) => (
                        <tr key={room._id} style={{ background: selectedRoom?._id === room._id ? '#eff6ff' : 'white' }}>
                          <td><strong>{room.roomNumber}</strong></td>
                          <td>{room.roomType}</td>
                          <td>{room.floor}</td>
                          <td>Rs. {room.basePrice.toLocaleString()}</td>
                          <td>{room.capacity.maxOccupancy}</td>
                          <td>
                            <button 
                              type="button"
                              onClick={() => selectRoom(room)}
                              className="btn btn-sm btn-primary"
                            >
                              {selectedRoom?._id === room._id ? 'Selected' : 'Select'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
                <button type="button" onClick={() => setStep(2)} className="btn btn-secondary">
                  Back
                </button>
                <button type="button" onClick={() => setStep(4)} className="btn btn-primary">
                  Next: Final Details
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Final Details */}
          {step === 4 && (
            <div className="card">
              <h3 style={{ marginBottom: '1.5rem' }}>Booking Details</h3>
              
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label required">Booking Source</label>
                  <select
                    className="form-control"
                    value={formData.bookingSource}
                    onChange={(e) => setFormData({ ...formData, bookingSource: e.target.value })}
                    required
                  >
                    <option value="Walk-in">Walk-in</option>
                    <option value="Booking.com">Booking.com</option>
                    <option value="Agoda">Agoda</option>
                    <option value="Airbnb">Airbnb</option>
                    <option value="Travel Agent">Travel Agent</option>
                    <option value="Hotel Website">Hotel Website</option>
                    <option value="Phone">Phone</option>
                    <option value="Email">Email</option>
                  </select>
                </div>

                {formData.bookingSource === 'Travel Agent' && (
                  <div className="form-group">
                    <label className="form-label required">Travel Agent</label>
                    <select
                      className="form-control"
                      value={formData.travelAgentId}
                      onChange={(e) => setFormData({ ...formData, travelAgentId: e.target.value })}
                      required
                    >
                      <option value="">Select Agent</option>
                      {travelAgents.map((agent) => (
                        <option key={agent._id} value={agent._id}>
                          {agent.companyName} ({agent.agentCode})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Booking Reference</label>
                  <input
                    type="text"
                    className="form-control"
                    value={formData.bookingReference}
                    onChange={(e) => setFormData({ ...formData, bookingReference: e.target.value })}
                    placeholder="External booking reference"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label required">Rate per Night</label>
                  <input
                    type="number"
                    className="form-control"
                    value={formData.ratePerNight}
                    onChange={(e) => setFormData({ ...formData, ratePerNight: parseFloat(e.target.value) })}
                    min="0"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Tax Amount</label>
                  <input
                    type="number"
                    className="form-control"
                    value={formData.taxAmount}
                    onChange={(e) => setFormData({ ...formData, taxAmount: parseFloat(e.target.value) || 0 })}
                    min="0"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Discount Amount</label>
                  <input
                    type="number"
                    className="form-control"
                    value={formData.discountAmount}
                    onChange={(e) => setFormData({ ...formData, discountAmount: parseFloat(e.target.value) || 0 })}
                    min="0"
                  />
                </div>

                {formData.discountAmount > 0 && (
                  <div className="form-group">
                    <label className="form-label">Discount Reason</label>
                    <input
                      type="text"
                      className="form-control"
                      value={formData.discountReason}
                      onChange={(e) => setFormData({ ...formData, discountReason: e.target.value })}
                    />
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Advance Payment</label>
                  <input
                    type="number"
                    className="form-control"
                    value={formData.advancePayment}
                    onChange={(e) => setFormData({ ...formData, advancePayment: parseFloat(e.target.value) || 0 })}
                    min="0"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Meal Plan</label>
                  <select
                    className="form-control"
                    value={formData.mealPlan}
                    onChange={(e) => setFormData({ ...formData, mealPlan: e.target.value })}
                  >
                    <option value="None">None</option>
                    <option value="Breakfast">Breakfast</option>
                    <option value="Half Board">Half Board</option>
                    <option value="Full Board">Full Board</option>
                    <option value="All Inclusive">All Inclusive</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Purpose</label>
                  <select
                    className="form-control"
                    value={formData.purpose}
                    onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                  >
                    <option value="Business">Business</option>
                    <option value="Leisure">Leisure</option>
                    <option value="Conference">Conference</option>
                    <option value="Wedding">Wedding</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="form-group full-width">
                  <label className="form-label">Special Requests</label>
                  <textarea
                    className="form-control"
                    value={formData.specialRequests}
                    onChange={(e) => setFormData({ ...formData, specialRequests: e.target.value })}
                    rows="3"
                    placeholder="Any special requests or requirements"
                  />
                </div>
              </div>

              {/* Pricing Summary */}
              <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#f8fafc', borderRadius: '8px' }}>
                <h4 style={{ marginBottom: '1rem' }}>Pricing Summary</h4>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span>Number of Nights:</span>
                  <strong>{nights}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span>Rate per Night:</span>
                  <strong>Rs. {formData.ratePerNight.toLocaleString()}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span>Number of Rooms:</span>
                  <strong>{formData.numberOfRooms}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span>Room Charges:</span>
                  <strong>Rs. {roomCharges.toLocaleString()}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span>Tax:</span>
                  <strong>Rs. {formData.taxAmount.toLocaleString()}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span>Discount:</span>
                  <strong>- Rs. {formData.discountAmount.toLocaleString()}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', paddingTop: '0.5rem', borderTop: '2px solid #e2e8f0' }}>
                  <span><strong>Total Amount:</strong></span>
                  <strong style={{ fontSize: '1.25rem', color: '#2563eb' }}>Rs. {total.toLocaleString()}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Advance Paid:</span>
                  <strong>Rs. {formData.advancePayment.toLocaleString()}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.5rem', borderTop: '1px solid #e2e8f0', marginTop: '0.5rem' }}>
                  <span><strong>Balance Due:</strong></span>
                  <strong style={{ color: '#f59e0b' }}>Rs. {(total - formData.advancePayment).toLocaleString()}</strong>
                </div>
              </div>

              <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
                {!isEdit && (
                  <button type="button" onClick={() => setStep(3)} className="btn btn-secondary">
                    Back
                  </button>
                )}
                <button type="button" onClick={() => navigate('/reservations')} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Saving...' : (isEdit ? 'Update Reservation' : 'Create Reservation')}
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default ReservationForm;