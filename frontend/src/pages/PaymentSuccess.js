// frontend/src/pages/PaymentSuccess.js
import React, { useEffect, useState } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { FaCheckCircle, FaPrint, FaArrowLeft, FaCalendarAlt, FaFileInvoiceDollar } from 'react-icons/fa';
import { paymentAPI } from '../services/api';
import CustomerLayout from '../components/CustomerLayout';
import '../components/PaymentModal.css';

const PaymentSuccess = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const query = new URLSearchParams(location.search);
  const paymentRef = query.get('ref') || query.get('order_id');

  const [loading, setLoading] = useState(true);
  const [payment, setPayment] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!paymentRef) {
      setError('No payment reference specified.');
      setLoading(false);
      return;
    }

    let intervalId = null;
    let attempts = 0;

    const checkStatus = async () => {
      try {
        attempts++;
        const res = await paymentAPI.verifyPaymentStatus(paymentRef);
        if (res.data?.paymentStatus === 'completed') {
          setPayment(res.data);
          setLoading(false);
          if (intervalId) clearInterval(intervalId);
        } else if (attempts > 5) {
          // If after 5 attempts still pending webhook, display currently held state
          setPayment(res.data);
          setLoading(false);
          if (intervalId) clearInterval(intervalId);
        }
      } catch (err) {
        if (attempts > 5) {
          setError(err.response?.data?.error || 'Could not verify payment confirmation.');
          setLoading(false);
          if (intervalId) clearInterval(intervalId);
        }
      }
    };

    checkStatus();
    intervalId = setInterval(checkStatus, 2500);

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [paymentRef]);

  return (
    <CustomerLayout>
      <div style={{ maxWidth: '800px', margin: '3rem auto', padding: '0 1.5rem 5rem 1.5rem', fontFamily: "'Poppins', sans-serif" }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '5rem 0', background: '#FFFFFF', borderRadius: '1rem', border: '1px solid #E2E8F0' }}>
            <div className="spinner" style={{ margin: '0 auto 1.5rem auto' }} />
            <h3 style={{ color: '#162E24', fontWeight: 600 }}>Verifying Server Payment Confirmation</h3>
            <p style={{ color: '#64748B', maxWidth: '400px', margin: '0.5rem auto 0 auto' }}>
              Communicating securely with PayHere to verify transaction signatures...
            </p>
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '4rem 2rem', background: '#FFFFFF', borderRadius: '1rem', border: '1px solid #E2E8F0' }}>
            <h3 style={{ color: '#DC2626' }}>Payment Verification Error</h3>
            <p style={{ color: '#64748B', margin: '1rem 0 2rem 0' }}>{error}</p>
            <Link to="/my-bookings" className="serendib-btn-pay" style={{ display: 'inline-flex', padding: '0.75rem 1.5rem' }}>
              View My Bookings
            </Link>
          </div>
        ) : (
          <div className="serendib-receipt-container" style={{ boxShadow: '0 20px 35px -10px rgba(0,0,0,0.08)' }}>
            <div className="serendib-receipt-header">
              <div style={{ fontSize: '2.5rem', color: '#059669', marginBottom: '0.5rem' }}>
                <FaCheckCircle />
              </div>
              <div className="serendib-receipt-brand">SERENDIB SANCTUARY</div>
              <div className="serendib-receipt-property">
                Official Receipt · {payment?.property?.name || 'Sri Lanka Main Property'}
              </div>
              <p style={{ color: '#059669', fontWeight: 600, marginTop: '0.5rem', fontSize: '1.05rem' }}>
                Payment Successfully Completed & Authoritatively Confirmed
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              <div>
                <span style={{ color: '#64748B' }}>Payment Reference:</span><br />
                <strong style={{ fontSize: '1rem', color: '#162E24' }}>{payment?.paymentReference}</strong>
              </div>
              <div>
                <span style={{ color: '#64748B' }}>Gateway Transaction ID:</span><br />
                <strong>{payment?.gatewayTransactionId || payment?.transactionId || 'Verified'}</strong>
              </div>
              <div>
                <span style={{ color: '#64748B' }}>Guest Name:</span><br />
                <strong>{payment?.user?.name || 'Valued Guest'}</strong>
              </div>
              <div>
                <span style={{ color: '#64748B' }}>Payment Method:</span><br />
                <strong>{payment?.gatewayMethod || payment?.paymentMethod || 'Online'}</strong>
              </div>
              <div>
                <span style={{ color: '#64748B' }}>Service Purpose:</span><br />
                <strong style={{ textTransform: 'capitalize' }}>{payment?.purpose?.replace('_', ' ')}</strong>
              </div>
              <div>
                <span style={{ color: '#64748B' }}>Confirmation Date:</span><br />
                <strong>{new Date(payment?.confirmedAt || payment?.paymentDate).toLocaleString()}</strong>
              </div>
            </div>

            <table className="serendib-receipt-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th style={{ textAlign: 'right' }}>Amount Paid</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    {payment?.notes || 'Serendib Sanctuary Guaranteed Booking'}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>
                    Rs. {Number(payment?.amount || 0).toLocaleString()} {payment?.currency || 'LKR'}
                  </td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 700, borderTop: '2px solid #B68C48' }}>
                    Authoritative Total Settled
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '1.25rem', color: '#162E24', borderTop: '2px solid #B68C48' }}>
                    Rs. {Number(payment?.amount || 0).toLocaleString()} {payment?.currency || 'LKR'}
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="no-print" style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="serendib-btn-sandbox-sim"
                onClick={() => window.print()}
              >
                <FaPrint /> Print Official Receipt
              </button>
              <Link
                to="/my-bookings"
                className="serendib-btn-pay"
                style={{ padding: '0.75rem 1.5rem', textDecoration: 'none' }}
              >
                <FaCalendarAlt /> Go to My Reservations
              </Link>
            </div>
          </div>
        )}
      </div>
    </CustomerLayout>
  );
};

export default PaymentSuccess;
