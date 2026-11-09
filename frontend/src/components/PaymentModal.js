// frontend/src/components/PaymentModal.js
import React, { useState, useEffect } from 'react';
import { 
  FaTimes, 
  FaLock, 
  FaCreditCard, 
  FaCheckCircle, 
  FaExclamationTriangle, 
  FaPrint, 
  FaArrowRight,
  FaShieldAlt,
  FaHotel,
  FaReceipt
} from 'react-icons/fa';
import { paymentAPI } from '../services/api';
import { toast } from 'react-toastify';
import './PaymentModal.css';

const PaymentModal = ({
  isOpen,
  onClose,
  purpose = 'room_booking',
  targetId,
  itemSummary = {},
  onPaymentSuccess
}) => {
  const [loading, setLoading] = useState(false);
  const [paymentData, setPaymentData] = useState(null);
  const [confirmedPayment, setConfirmedPayment] = useState(null);
  const [error, setError] = useState(null);
  const [simulating, setSimulating] = useState(false);

  // Reset state when modal opens or targetId changes
  useEffect(() => {
    if (isOpen && targetId) {
      setConfirmedPayment(null);
      setError(null);
      fetchInitiationDetails();
    }
  }, [isOpen, targetId, purpose]);

  const fetchInitiationDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await paymentAPI.initiatePayment({
        purpose,
        targetId
      });
      if (res.data?.success) {
        setPaymentData(res.data);
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to prepare secure checkout.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handlePayHereHostedCheckout = () => {
    if (!paymentData?.payHereParams || !paymentData?.checkoutUrl) {
      toast.error('Payment parameters not ready.');
      return;
    }

    // Standard official PayHere form POST redirect
    const form = document.createElement('form');
    form.setAttribute('method', 'POST');
    form.setAttribute('action', paymentData.checkoutUrl);
    form.setAttribute('target', '_self');

    Object.entries(paymentData.payHereParams).forEach(([key, val]) => {
      const hiddenInput = document.createElement('input');
      hiddenInput.setAttribute('type', 'hidden');
      hiddenInput.setAttribute('name', key);
      hiddenInput.setAttribute('value', String(val));
      form.appendChild(hiddenInput);
    });

    document.body.appendChild(form);
    form.submit();
  };

  // Instant sandbox confirmation simulation for developers / demo testers
  const handleSimulateSandboxPayment = async () => {
    if (!paymentData?.paymentReference) return;
    try {
      setSimulating(true);
      const res = await paymentAPI.simulateSandboxPayment({
        paymentReference: paymentData.paymentReference
      });

      if (res.data?.status === 200) {
        toast.success('Sandbox payment verified and confirmed!');
        // Fetch verified payment record
        const verifyRes = await paymentAPI.verifyPaymentStatus(paymentData.paymentReference);
        setConfirmedPayment(verifyRes.data);
        if (onPaymentSuccess) {
          onPaymentSuccess(verifyRes.data);
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Sandbox simulation failed.');
    } finally {
      setSimulating(false);
    }
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div className="serendib-pay-backdrop" onClick={onClose}>
      <div className="serendib-pay-modal" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="serendib-pay-header">
          <div className="serendib-pay-header-left">
            <div className="serendib-pay-badge-icon">
              {confirmedPayment ? <FaReceipt /> : <FaCreditCard />}
            </div>
            <div>
              <h3 className="serendib-pay-title">
                {confirmedPayment ? 'Payment Confirmed' : 'Serendib Secure Payment'}
              </h3>
              <p className="serendib-pay-subtitle">
                {confirmedPayment
                  ? `Receipt #${confirmedPayment.paymentReference}`
                  : 'Official PayHere Gateway · Sri Lanka'}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="serendib-pay-close-btn no-print"
            onClick={onClose}
            aria-label="Close modal"
          >
            <FaTimes />
          </button>
        </div>

        {/* Modal Body */}
        <div className="serendib-pay-body">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem 0', color: '#5E6963' }}>
              <div className="spinner" style={{ margin: '0 auto 1rem auto' }} />
              <p>Preparing authoritative payment summary...</p>
            </div>
          ) : error ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
              <FaExclamationTriangle size={42} style={{ color: '#D97706', marginBottom: '1rem' }} />
              <h4 style={{ color: '#162E24', marginBottom: '0.5rem' }}>Unable to Proceed</h4>
              <p style={{ color: '#5E6963', fontSize: '0.9rem', marginBottom: '1.5rem' }}>{error}</p>
              <button
                type="button"
                className="serendib-btn-pay"
                style={{ margin: '0 auto', background: '#345B4A' }}
                onClick={fetchInitiationDetails}
              >
                Try Again
              </button>
            </div>
          ) : confirmedPayment ? (
            /* Confirmed Luxury Receipt View */
            <div className="serendib-receipt-container">
              <div className="serendib-receipt-header">
                <div className="serendib-receipt-brand">SERENDIB SANCTUARY</div>
                <div className="serendib-receipt-property">
                  {confirmedPayment.property?.name || 'Sri Lanka Main Property'} · Colombo, Sri Lanka
                </div>
                <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.4rem', color: '#059669', fontWeight: 600, fontSize: '0.95rem' }}>
                  <FaCheckCircle /> Payment Completed & Verified
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.85rem', marginBottom: '1rem' }}>
                <div>
                  <span style={{ color: 'var(--serendib-text-muted)' }}>Payment Reference:</span><br />
                  <strong>{confirmedPayment.paymentReference}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--serendib-text-muted)' }}>Gateway Transaction ID:</span><br />
                  <strong>{confirmedPayment.gatewayTransactionId || confirmedPayment.transactionId || 'Verified'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--serendib-text-muted)' }}>Guest Name:</span><br />
                  <strong>{confirmedPayment.user?.name || 'Valued Guest'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--serendib-text-muted)' }}>Date & Time:</span><br />
                  <strong>{new Date(confirmedPayment.paymentDate || confirmedPayment.createdAt).toLocaleString()}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--serendib-text-muted)' }}>Payment Method:</span><br />
                  <strong>{confirmedPayment.gatewayMethod || confirmedPayment.paymentMethod || 'Online Card'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--serendib-text-muted)' }}>Payment Purpose:</span><br />
                  <strong style={{ textTransform: 'capitalize' }}>{confirmedPayment.purpose?.replace('_', ' ')}</strong>
                </div>
              </div>

              <table className="serendib-receipt-table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      {itemSummary.title || confirmedPayment.notes || 'Hospitality Reservation'}
                      {itemSummary.subtitle && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--serendib-text-muted)' }}>
                          {itemSummary.subtitle}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      Rs. {Number(confirmedPayment.amount || 0).toLocaleString()}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 700, borderTop: '2px solid var(--serendib-brass)' }}>
                      Total Paid (LKR)
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '1.15rem', color: 'var(--serendib-forest-deep)', borderTop: '2px solid var(--serendib-brass)' }}>
                      Rs. {Number(confirmedPayment.amount || 0).toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="no-print" style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  className="serendib-btn-sandbox-sim"
                  onClick={handlePrintReceipt}
                >
                  <FaPrint /> Print Official Receipt
                </button>
                <button
                  type="button"
                  className="serendib-btn-pay"
                  style={{ padding: '0.75rem 1.25rem', fontSize: '0.85rem' }}
                  onClick={onClose}
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            /* Checkout Initiation View */
            <>
              {/* Order Item Overview Card */}
              <div className="serendib-order-card">
                <div className="serendib-order-header">RESERVATION SUMMARY</div>
                <div className="serendib-order-item-title">
                  {itemSummary.title || paymentData?.payHereParams?.items || 'Serendib Sanctuary Reservation'}
                </div>
                {itemSummary.subtitle && (
                  <div className="serendib-order-item-desc">
                    {itemSummary.subtitle}
                  </div>
                )}
                {itemSummary.dates && (
                  <div className="serendib-order-item-desc" style={{ marginTop: '0.35rem' }}>
                    <strong>Dates:</strong> {itemSummary.dates}
                  </div>
                )}
                {itemSummary.guests && (
                  <div className="serendib-order-item-desc">
                    <strong>Guests:</strong> {itemSummary.guests}
                  </div>
                )}

                <div className="serendib-price-breakdown">
                  <div className="serendib-price-row">
                    <span>Applicable Hospitality Charges</span>
                    <span>Rs. {Number(paymentData?.amount || 0).toLocaleString()}</span>
                  </div>
                  <div className="serendib-price-row">
                    <span>Service Charges & Taxes</span>
                    <span style={{ color: '#059669', fontWeight: 500 }}>Included</span>
                  </div>
                  <div className="serendib-price-total-row">
                    <span>Total Amount Payable</span>
                    <span>Rs. {Number(paymentData?.amount || 0).toLocaleString()} {paymentData?.currency || 'LKR'}</span>
                  </div>
                </div>
              </div>

              {/* Gateway Banner */}
              <div className="serendib-gateway-box">
                <div className="serendib-gateway-left">
                  <span className="serendib-payhere-pill">PayHere</span>
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--serendib-forest-deep)' }}>
                      Central Bank Approved Sri Lankan Gateway
                    </div>
                    <div className="serendib-gateway-methods">
                      Visa · MasterCard · American Express · FriMi · Genie · eZ Cash
                    </div>
                  </div>
                </div>
                <FaLock style={{ color: 'var(--serendib-brass)', fontSize: '1.1rem' }} />
              </div>

              {/* Actions */}
              <div className="serendib-pay-actions no-print">
                <button
                  type="button"
                  className="serendib-btn-pay"
                  onClick={handlePayHereHostedCheckout}
                >
                  <span>Pay Securely with PayHere</span>
                  <FaArrowRight size={13} />
                </button>

                {paymentData?.payHereParams?.sandbox && (
                  <button
                    type="button"
                    className="serendib-btn-sandbox-sim"
                    onClick={handleSimulateSandboxPayment}
                    disabled={simulating}
                  >
                    <FaShieldAlt />
                    <span>{simulating ? 'Verifying Sandbox Payment...' : 'Instant Sandbox Payment Verification'}</span>
                  </button>
                )}
              </div>

              <div className="serendib-pay-security-note no-print">
                <FaLock size={11} />
                <span>256-bit SSL encrypted. Payment credentials are handled directly by PayHere.</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;
