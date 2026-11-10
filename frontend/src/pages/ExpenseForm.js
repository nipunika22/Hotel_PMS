// frontend/src/pages/ExpenseForm.js
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DatePicker from 'react-datepicker';
import { guestExpenseAPI, reservationAPI } from '../services/api';
import { toast } from 'react-toastify';

const ExpenseForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const [formData, setFormData] = useState({
    reservationId: '',
    guestId: '',
    expenseDate: new Date(),
    category: 'Room Service',
    description: '',
    quantity: 1,
    unitPrice: 0,
    taxPercentage: 0,
    paymentStatus: 'Pending',
    notes: ''
  });

  const [loading, setLoading] = useState(false);
  const [reservations, setReservations] = useState([]);
  const [selectedReservation, setSelectedReservation] = useState(null);

  useEffect(() => {
    fetchActiveReservations();
    if (isEdit) {
      fetchExpense();
    }
  }, [id]);

  const fetchActiveReservations = async () => {
    try {
      const response = await reservationAPI.getReservationsByStatus('Checked-In');
      setReservations(response.data);
    } catch (error) {
      toast.error('Failed to load active reservations');
    }
  };

  const fetchExpense = async () => {
    try {
      const response = await guestExpenseAPI.getExpense(id);
      const data = response.data;
      setFormData({
        ...data,
        reservationId: data.reservation._id,
        guestId: data.guest._id,
        expenseDate: new Date(data.expenseDate)
      });
      setSelectedReservation(data.reservation);
    } catch (error) {
      toast.error('Failed to load expense');
      navigate('/expenses');
    }
  };

  const handleReservationChange = (e) => {
    const resId = e.target.value;
    const reservation = reservations.find(r => r._id === resId);
    setSelectedReservation(reservation);
    setFormData({
      ...formData,
      reservationId: resId,
      guestId: reservation?.guest?._id || ''
    });
  };

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? (parseFloat(value) || 0) : value
    }));
  };

  const calculateTotals = () => {
    const amount = formData.quantity * formData.unitPrice;
    const taxAmount = (amount * formData.taxPercentage) / 100;
    const totalAmount = amount + taxAmount;
    return { amount, taxAmount, totalAmount };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.reservationId) {
      toast.error('Please select a reservation');
      return;
    }

    setLoading(true);

    try {
      const dataToSend = {
        ...formData,
        expenseDate: formData.expenseDate.toISOString()
      };

      if (isEdit) {
        await guestExpenseAPI.updateExpense(id, dataToSend);
        toast.success('Expense updated successfully');
      } else {
        await guestExpenseAPI.createExpense(dataToSend);
        toast.success('Expense added successfully');
      }
      navigate('/expenses');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  const { amount, taxAmount, totalAmount } = calculateTotals();

  return (
    <div>
      <div className="topbar">
        <h1 className="topbar-title">{isEdit ? 'Edit Expense' : 'Add Guest Expense'}</h1>
      </div>

      <div className="content-wrapper">
        <div className="card">
          <form onSubmit={handleSubmit}>
            <h3 style={{ marginBottom: '1.5rem' }}>Expense Details</h3>

            {!isEdit && (
              <div className="form-group">
                <label className="form-label required">Select Checked-In Guest</label>
                <select
                  className="form-control"
                  value={formData.reservationId}
                  onChange={handleReservationChange}
                  required
                >
                  <option value="">-- Select Reservation --</option>
                  {reservations.map(res => (
                    <option key={res._id} value={res._id}>
                      {res.reservationNumber} - {res.guest?.firstName} {res.guest?.lastName} - Room {res.room?.roomNumber}
                    </option>
                  ))}
                </select>
                {reservations.length === 0 && (
                  <div className="form-help" style={{ color: '#f59e0b' }}>
                    No checked-in guests found. Please check in a guest first.
                  </div>
                )}
              </div>
            )}

            {selectedReservation && (
              <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '8px', marginBottom: '1.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                  <div>
                    <strong>Guest:</strong> {selectedReservation.guest?.firstName} {selectedReservation.guest?.lastName}
                  </div>
                  <div>
                    <strong>Room:</strong> {selectedReservation.room?.roomNumber}
                  </div>
                  <div>
                    <strong>Reservation:</strong> {selectedReservation.reservationNumber}
                  </div>
                </div>
              </div>
            )}

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label required">Expense Date</label>
                <DatePicker
                  selected={formData.expenseDate}
                  onChange={(date) => setFormData({ ...formData, expenseDate: date })}
                  className="form-control"
                  dateFormat="MMM dd, yyyy"
                  maxDate={new Date()}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label required">Category</label>
                <select
                  name="category"
                  className="form-control"
                  value={formData.category}
                  onChange={handleChange}
                  required
                >
                  <option value="Room Service">Room Service</option>
                  <option value="Restaurant">Restaurant</option>
                  <option value="Bar">Bar</option>
                  <option value="Laundry">Laundry</option>
                  <option value="Spa">Spa</option>
                  <option value="Gym">Gym</option>
                  <option value="Minibar">Minibar</option>
                  <option value="Telephone">Telephone</option>
                  <option value="Internet">Internet</option>
                  <option value="Parking">Parking</option>
                  <option value="Transportation">Transportation</option>
                  <option value="Extra Bed">Extra Bed</option>
                  <option value="Late Checkout">Late Checkout</option>
                  <option value="Early Checkin">Early Checkin</option>
                  <option value="Damage Charges">Damage Charges</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="form-group full-width">
                <label className="form-label required">Description</label>
                <input
                  type="text"
                  name="description"
                  className="form-control"
                  value={formData.description}
                  onChange={handleChange}
                  required
                  placeholder="e.g., Club Sandwich, Spa Treatment"
                />
              </div>

              <div className="form-group">
                <label className="form-label required">Quantity</label>
                <input
                  type="number"
                  name="quantity"
                  className="form-control"
                  value={formData.quantity}
                  onChange={handleChange}
                  min="1"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label required">Unit Price</label>
                <input
                  type="number"
                  name="unitPrice"
                  className="form-control"
                  value={formData.unitPrice}
                  onChange={handleChange}
                  min="0"
                  step="0.01"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Tax (%)</label>
                <input
                  type="number"
                  name="taxPercentage"
                  className="form-control"
                  value={formData.taxPercentage}
                  onChange={handleChange}
                  min="0"
                  max="100"
                  step="0.1"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Payment Status</label>
                <select
                  name="paymentStatus"
                  className="form-control"
                  value={formData.paymentStatus}
                  onChange={handleChange}
                >
                  <option value="Pending">Pending</option>
                  <option value="Paid">Paid</option>
                  <option value="Added to Bill">Added to Bill</option>
                </select>
              </div>

              <div className="form-group full-width">
                <label className="form-label">Notes</label>
                <textarea
                  name="notes"
                  className="form-control"
                  value={formData.notes}
                  onChange={handleChange}
                  rows="2"
                  placeholder="Any additional notes"
                />
              </div>
            </div>

            {/* Calculation Summary */}
            <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#f8fafc', borderRadius: '8px' }}>
              <h4 style={{ marginBottom: '1rem' }}>Calculation</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Quantity × Unit Price:</span>
                  <span>{formData.quantity} × ₹{formData.unitPrice.toLocaleString()} = <strong>₹{amount.toLocaleString()}</strong></span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Tax ({formData.taxPercentage}%):</span>
                  <strong>₹{taxAmount.toLocaleString()}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.5rem', borderTop: '2px solid #e2e8f0' }}>
                  <span><strong>Total Amount:</strong></span>
                  <strong style={{ fontSize: '1.25rem', color: '#2563eb' }}>₹{totalAmount.toLocaleString()}</strong>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Saving...' : (isEdit ? 'Update Expense' : 'Add Expense')}
              </button>
              <button type="button" onClick={() => navigate('/expenses')} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ExpenseForm;