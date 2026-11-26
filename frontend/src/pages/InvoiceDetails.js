// frontend/src/pages/InvoiceDetails.js
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaPrint, FaMoneyBillWave, FaTimes } from 'react-icons/fa';
import { invoiceAPI } from '../services/api';
import { toast } from 'react-toastify';
import { format } from 'date-fns';

const InvoiceDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentData, setPaymentData] = useState({
    amount: 0,
    paymentMethod: 'Cash',
    transactionReference: '',
    notes: ''
  });
  const paymentKeyRef = useRef(null);

  useEffect(() => {
    fetchInvoice();
  }, [id]);

  const fetchInvoice = async () => {
    try {
      const response = await invoiceAPI.getInvoice(id);
      setInvoice(response.data);
      setPaymentData(prev => ({
        ...prev,
        amount: Math.max(0, Number(response.data.totalAmount || 0) - Number(response.data.totalPaid ?? response.data.advancePaid ?? 0))
      }));
    } catch (error) {
      toast.error('Failed to load invoice');
      navigate('/invoices');
    } finally {
      setLoading(false);
    }
  };

  const openPaymentForm = () => {
    paymentKeyRef.current = `INV-PAY-${id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setPaymentData({
      amount: Math.max(0, Number(invoice.totalAmount || 0) - Number(invoice.totalPaid ?? invoice.advancePaid ?? 0)),
      paymentMethod: 'Cash',
      transactionReference: '',
      notes: ''
    });
    setShowPaymentForm(true);
  };

  const closePaymentForm = () => {
    if (submittingPayment) return;
    setShowPaymentForm(false);
    paymentKeyRef.current = null;
  };

  const handlePayment = async (e) => {
    e.preventDefault();
    const balanceDue = Math.max(0, Number(invoice.totalAmount || 0) - Number(invoice.totalPaid ?? invoice.advancePaid ?? 0));

    if (!Number.isFinite(Number(paymentData.amount)) || Number(paymentData.amount) <= 0) {
      toast.error('Payment amount must be greater than 0');
      return;
    }

    if (Number(paymentData.amount) > balanceDue) {
      toast.error('Payment amount cannot exceed balance due');
      return;
    }

    try {
      setSubmittingPayment(true);
      await invoiceAPI.addPayment(id, {
        amount: Number(paymentData.amount),
        paymentMethod: paymentData.paymentMethod,
        transactionReference: paymentData.transactionReference.trim() || undefined,
        notes: paymentData.notes.trim() || undefined,
        idempotencyKey: paymentKeyRef.current
      });
      toast.success('Payment added successfully');
      setShowPaymentForm(false);
      paymentKeyRef.current = null;
      await fetchInvoice();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to add payment');
    } finally {
      setSubmittingPayment(false);
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
    return <span className={`badge ${classes[status]}`}>{status === 'Paid' ? 'Fully Paid' : status}</span>;
  };

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  if (!invoice) {
    return <div className="empty-state"><h3>Invoice not found</h3></div>;
  }

  const balanceDue = Math.max(0, Number(invoice.totalAmount || 0) - Number(invoice.totalPaid ?? invoice.advancePaid ?? 0));

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
          {balanceDue > 0 && invoice.paymentStatus !== 'Refunded' && (
            <button onClick={openPaymentForm} className="btn btn-success">
              <FaMoneyBillWave /> Record Balance Payment
            </button>
          )}
          <button onClick={handlePrint} className="btn btn-primary">
            <FaPrint /> Print Invoice
          </button>
        </div>
      </div>

      <div className="content-wrapper">
        {/* Balance payment modal */}
        {showPaymentForm && (
          <div
            className="no-print"
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget) closePaymentForm();
            }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1000,
              background: 'rgba(15, 23, 42, 0.55)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem'
            }}
          >
            <div className="card" role="dialog" aria-modal="true" aria-labelledby="balance-payment-title" style={{ width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 id="balance-payment-title" style={{ margin: 0 }}>Record Balance Payment</h3>
                <button type="button" className="btn btn-outline" onClick={closePaymentForm} disabled={submittingPayment} aria-label="Close payment dialog">
                  <FaTimes />
                </button>
              </div>
              <form onSubmit={handlePayment}>
                <div style={{ marginBottom: '1rem', padding: '0.85rem 1rem', background: '#f8fafc', borderRadius: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                  <strong>Current Outstanding Balance</strong>
                  <strong>LKR {balanceDue.toLocaleString()}</strong>
                </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label required">Amount</label>
                  <input
                    type="number"
                    className="form-control"
                    value={paymentData.amount}
                    onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                    max={balanceDue}
                    min="0.01"
                    step="0.01"
                    required
                  />
                  <div className="form-help">Maximum: LKR {balanceDue.toLocaleString()}</div>
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ marginTop: '0.5rem' }}
                    onClick={() => setPaymentData({ ...paymentData, amount: balanceDue })}
                  >
                    Pay Full Balance
                  </button>
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
                    <option value="Card">Card</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Transaction Reference</label>
                  <input
                    type="text"
                    className="form-control"
                    value={paymentData.transactionReference}
                    onChange={(e) => setPaymentData({ ...paymentData, transactionReference: e.target.value })}
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
                <button type="submit" className="btn btn-success" disabled={submittingPayment}>
                  {submittingPayment ? 'Recording...' : 'Confirm Payment'}
                </button>
                <button type="button" onClick={closePaymentForm} className="btn btn-secondary" disabled={submittingPayment}>
                  Cancel
                </button>
              </div>
              </form>
            </div>
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
                    <td style={{ textAlign: 'right' }}>LKR {(invoice.roomCharges / invoice.numberOfNights).toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}><strong>LKR {invoice.roomCharges.toLocaleString()}</strong></td>
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
                        <td style={{ textAlign: 'right' }}>LKR {expense.amount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ fontWeight: 'bold' }}>
                      <td colSpan="3" style={{ textAlign: 'right' }}>Total Extra Charges:</td>
                      <td style={{ textAlign: 'right' }}>LKR {invoice.totalExtraExpenses.toLocaleString()}</td>
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
                <span>LKR {invoice.subtotal.toLocaleString()}</span>
              </div>

              {invoice.taxAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <span>Tax ({invoice.taxPercentage}%):</span>
                  <span>LKR {invoice.taxAmount.toLocaleString()}</span>
                </div>
              )}

              {invoice.discountAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', color: '#10b981' }}>
                  <span>Discount {invoice.discountReason && `(${invoice.discountReason})`}:</span>
                  <span>- LKR {invoice.discountAmount.toLocaleString()}</span>
                </div>
              )}

              {invoice.commissionAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '0.875rem', color: '#64748b' }}>
                  <span>Agent Commission:</span>
                  <span>LKR {invoice.commissionAmount.toLocaleString()}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', paddingTop: '0.75rem', borderTop: '2px solid #e2e8f0', fontSize: '1.25rem', fontWeight: 'bold' }}>
                <span>Total Amount:</span>
                <span style={{ color: '#2563eb' }}>LKR {invoice.totalAmount.toLocaleString()}</span>
              </div>

              {invoice.advancePaid > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <span>Advance Paid:</span>
                  <span style={{ color: '#10b981' }}>LKR {invoice.advancePaid.toLocaleString()}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <span>Total Paid:</span>
                <span style={{ color: '#10b981' }}>LKR {invoice.totalPaid.toLocaleString()}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.75rem', borderTop: '2px solid #e2e8f0', fontSize: '1.25rem', fontWeight: 'bold' }}>
                <span>Balance Due:</span>
                <span style={{ color: invoice.balanceDue > 0 ? '#f59e0b' : '#10b981' }}>
                  LKR {balanceDue.toLocaleString()}
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
                        <td style={{ textAlign: 'right' }}><strong>LKR {payment.amount.toLocaleString()}</strong></td>
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