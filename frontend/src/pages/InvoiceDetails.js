// frontend/src/pages/InvoiceDetails.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaPrint, FaMoneyBillWave } from 'react-icons/fa';
import { invoiceAPI } from '../services/api';
import { toast } from 'react-toastify';
import { format } from 'date-fns';

const InvoiceDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentData, setPaymentData] = useState({
    amount: 0,
    paymentMethod: 'Cash',
    transactionId: '',
    notes: ''
  });

  useEffect(() => {
    fetchInvoice();
  }, [id]);

  const fetchInvoice = async () => {
    try {
      const response = await invoiceAPI.getInvoice(id);
      setInvoice(response.data);
      setPaymentData(prev => ({ ...prev, amount: response.data.balanceDue }));
    } catch (error) {
      toast.error('Failed to load invoice');
      navigate('/invoices');
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async (e) => {
    e.preventDefault();

    if (paymentData.amount <= 0) {
      toast.error('Payment amount must be greater than 0');
      return;
    }

    if (paymentData.amount > invoice.balanceDue) {
      toast.error('Payment amount cannot exceed balance due');
      return;
    }

    try {
      await invoiceAPI.addPayment(id, {
        ...paymentData,
        paymentDate: new Date().toISOString()
      });
      toast.success('Payment added successfully');
      setShowPaymentForm(false);
      fetchInvoice();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to add payment');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const getStatusBadge = (status) => {
    const classes = {
      'Unpaid': 'badge-danger',
      'Partial': 'badge-warning',
      'Paid': 'badge-success',
      'Refunded': 'badge-secondary'
    };
    return <span className={`badge ${classes[status]}`}>{status}</span>;
  };

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  if (!invoice) {
    return <div className="empty-state"><h3>Invoice not found</h3></div>;
  }

  return (
    <div>
      <div className="topbar no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => navigate('/invoices')} className="btn btn-outline">
            <FaArrowLeft /> Back
          </button>
          <h1 className="topbar-title">Invoice Details</h1>
        </div>
        <div className="topbar-actions">
          {invoice.balanceDue > 0 && (
            <button onClick={() => setShowPaymentForm(!showPaymentForm)} className="btn btn-success">
              <FaMoneyBillWave /> Add Payment
            </button>
          )}
          <button onClick={handlePrint} className="btn btn-primary">
            <FaPrint /> Print Invoice
          </button>
        </div>
      </div>

      <div className="content-wrapper">
        {/* Payment Form */}
        {showPaymentForm && (
          <div className="card no-print" style={{ borderLeft: '4px solid #10b981', marginBottom: '2rem' }}>
            <h3 style={{ marginBottom: '1.5rem' }}>Add Payment</h3>
            <form onSubmit={handlePayment}>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label required">Amount</label>
                  <input
                    type="number"
                    className="form-control"
                    value={paymentData.amount}
                    onChange={(e) => setPaymentData({ ...paymentData, amount: parseFloat(e.target.value) || 0 })}
                    max={invoice.balanceDue}
                    step="0.01"
                    required
                  />
                  <div className="form-help">Maximum: ₹{invoice.balanceDue.toLocaleString()}</div>
                </div>

                <div className="form-group">
                  <label className="form-label required">Payment Method</label>
                  <select
                    className="form-control"
                    value={paymentData.paymentMethod}
                    onChange={(e) => setPaymentData({ ...paymentData, paymentMethod: e.target.value })}
                    required
                  >
                    <option value="Cash">Cash</option>
                    <option value="Credit Card">Credit Card</option>
                    <option value="Debit Card">Debit Card</option>
                    <option value="UPI">UPI</option>
                    <option value="Net Banking">Net Banking</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Transaction ID</label>
                  <input
                    type="text"
                    className="form-control"
                    value={paymentData.transactionId}
                    onChange={(e) => setPaymentData({ ...paymentData, transactionId: e.target.value })}
                    placeholder="Optional"
                  />
                </div>

                <div className="form-group full-width">
                  <label className="form-label">Notes</label>
                  <textarea
                    className="form-control"
                    value={paymentData.notes}
                    onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })}
                    rows="2"
                    placeholder="Payment notes"
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="submit" className="btn btn-success">
                  Add Payment
                </button>
                <button type="button" onClick={() => setShowPaymentForm(false)} className="btn btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Invoice */}
        <div className="card" id="invoice-content">
          {/* Header */}
          <div style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: '1.5rem', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🏨 HotelPMS</h1>
                <div style={{ color: '#64748b' }}>Hotel Management System</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <h2 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>INVOICE</h2>
                <div><strong>Invoice #:</strong> {invoice.invoiceNumber}</div>
                <div><strong>Date:</strong> {format(new Date(invoice.invoiceDate), 'MMM dd, yyyy')}</div>
                <div style={{ marginTop: '0.5rem' }}>
                  {getStatusBadge(invoice.paymentStatus)}
                </div>
              </div>
            </div>
          </div>

          {/* Guest & Reservation Info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
            <div>
              <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem' }}>Bill To:</h3>
              <div style={{ lineHeight: '1.8' }}>
                <strong>{invoice.guest?.firstName} {invoice.guest?.lastName}</strong><br />
                {invoice.billingAddress?.name && invoice.billingAddress.name !== `${invoice.guest?.firstName} ${invoice.guest?.lastName}` && (
                  <>{invoice.billingAddress.name}<br /></>
                )}
                {invoice.guest?.email}<br />
                {invoice.guest?.phone}<br />
                {invoice.billingAddress?.street && (
                  <>
                    {invoice.billingAddress.street}<br />
                    {invoice.billingAddress.city}, {invoice.billingAddress.state} {invoice.billingAddress.zipCode}
                  </>
                )}
              </div>
            </div>

            <div>
              <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem' }}>Reservation Details:</h3>
              <div style={{ lineHeight: '1.8' }}>
                <strong>Reservation #:</strong> {invoice.reservation?.reservationNumber}<br />
                <strong>Check-In:</strong> {format(new Date(invoice.checkInDate), 'MMM dd, yyyy')}<br />
                <strong>Check-Out:</strong> {format(new Date(invoice.checkOutDate), 'MMM dd, yyyy')}<br />
                <strong>Number of Nights:</strong> {invoice.numberOfNights}<br />
                {invoice.travelAgent && (
                  <>
                    <strong>Travel Agent:</strong> {invoice.travelAgent.companyName} ({invoice.travelAgent.agentCode})
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Room Charges */}
          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem' }}>Room Charges</h3>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th style={{ textAlign: 'right' }}>Nights</th>
                    <th style={{ textAlign: 'right' }}>Rate</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Room Accommodation</td>
                    <td style={{ textAlign: 'right' }}>{invoice.numberOfNights}</td>
                    <td style={{ textAlign: 'right' }}>₹{(invoice.roomCharges / invoice.numberOfNights).toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}><strong>₹{invoice.roomCharges.toLocaleString()}</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Extra Expenses */}
          {invoice.extraExpenses && invoice.extraExpenses.length > 0 && (
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem' }}>Additional Charges</h3>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Category</th>
                      <th>Description</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.extraExpenses.map((expense, index) => (
                      <tr key={index}>
                        <td>{format(new Date(expense.date), 'MMM dd')}</td>
                        <td>{expense.category}</td>
                        <td>{expense.description}</td>
                        <td style={{ textAlign: 'right' }}>₹{expense.amount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ fontWeight: 'bold' }}>
                      <td colSpan="3" style={{ textAlign: 'right' }}>Total Extra Charges:</td>
                      <td style={{ textAlign: 'right' }}>₹{invoice.totalExtraExpenses.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Totals */}
          <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '2px solid #e2e8f0' }}>
            <div style={{ maxWidth: '400px', marginLeft: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <span>Subtotal:</span>
                <span>₹{invoice.subtotal.toLocaleString()}</span>
              </div>

              {invoice.taxAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <span>Tax ({invoice.taxPercentage}%):</span>
                  <span>₹{invoice.taxAmount.toLocaleString()}</span>
                </div>
              )}

              {invoice.discountAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', color: '#10b981' }}>
                  <span>Discount {invoice.discountReason && `(${invoice.discountReason})`}:</span>
                  <span>- ₹{invoice.discountAmount.toLocaleString()}</span>
                </div>
              )}

              {invoice.commissionAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '0.875rem', color: '#64748b' }}>
                  <span>Agent Commission:</span>
                  <span>₹{invoice.commissionAmount.toLocaleString()}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', paddingTop: '0.75rem', borderTop: '2px solid #e2e8f0', fontSize: '1.25rem', fontWeight: 'bold' }}>
                <span>Total Amount:</span>
                <span style={{ color: '#2563eb' }}>₹{invoice.totalAmount.toLocaleString()}</span>
              </div>

              {invoice.advancePaid > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <span>Advance Paid:</span>
                  <span style={{ color: '#10b981' }}>₹{invoice.advancePaid.toLocaleString()}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <span>Total Paid:</span>
                <span style={{ color: '#10b981' }}>₹{invoice.totalPaid.toLocaleString()}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.75rem', borderTop: '2px solid #e2e8f0', fontSize: '1.25rem', fontWeight: 'bold' }}>
                <span>Balance Due:</span>
                <span style={{ color: invoice.balanceDue > 0 ? '#f59e0b' : '#10b981' }}>
                  ₹{invoice.balanceDue.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Payment History */}
          {invoice.payments && invoice.payments.length > 0 && (
            <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '2px solid #e2e8f0' }}>
              <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem' }}>Payment History</h3>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Method</th>
                      <th>Transaction ID</th>
                      <th>Notes</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.payments.map((payment, index) => (
                      <tr key={index}>
                        <td>{format(new Date(payment.paymentDate), 'MMM dd, yyyy HH:mm')}</td>
                        <td>{payment.paymentMethod}</td>
                        <td>{payment.transactionId || '-'}</td>
                        <td>{payment.notes || '-'}</td>
                        <td style={{ textAlign: 'right' }}><strong>₹{payment.amount.toLocaleString()}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Footer */}
          <div style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: '1px solid #e2e8f0', textAlign: 'center', color: '#64748b', fontSize: '0.875rem' }}>
            <p>Thank you for choosing our hotel!</p>
            <p>For any queries, please contact us at info@hotelpms.com</p>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }
          .sidebar {
            display: none !important;
          }
          .main-content {
            margin-left: 0 !important;
          }
          body {
            background: white !important;
          }
        }
      `}</style>
    </div>
  );
};

export default InvoiceDetails;