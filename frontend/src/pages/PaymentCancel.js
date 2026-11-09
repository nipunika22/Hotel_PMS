// frontend/src/pages/PaymentCancel.js
import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { FaInfoCircle, FaCalendarAlt, FaRedo } from 'react-icons/fa';
import CustomerLayout from '../components/CustomerLayout';
import '../components/PaymentModal.css';

const PaymentCancel = () => {
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const paymentRef = query.get('ref') || query.get('order_id');

  return (
    <CustomerLayout>
      <div style={{ maxWidth: '680px', margin: '4rem auto', padding: '0 1.5rem 5rem 1.5rem', fontFamily: "'Poppins', sans-serif" }}>
        <div style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '1rem',
          padding: '3rem 2rem',
          textAlign: 'center',
          boxShadow: '0 20px 35px -10px rgba(0,0,0,0.06)'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(217, 119, 6, 0.12)',
            color: '#D97706',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.75rem',
            margin: '0 auto 1.5rem auto'
          }}>
            <FaInfoCircle />
          </div>

          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#162E24', marginBottom: '0.75rem' }}>
            Payment Interrupted
          </h2>

          <p style={{ color: '#64748B', lineHeight: 1.6, maxWidth: '480px', margin: '0 auto 1.5rem auto', fontSize: '0.95rem' }}>
            Your transaction checkout was cancelled or not completed. No funds have been debited from your card or account.
            {paymentRef && (
              <span style={{ display: 'block', marginTop: '0.5rem', fontWeight: 600, color: '#162E24' }}>
                Reference: {paymentRef}
              </span>
            )}
          </p>

          <div style={{
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '0.75rem',
            padding: '1.25rem',
            marginBottom: '2rem',
            textAlign: 'left',
            fontSize: '0.875rem',
            color: '#475569'
          }}>
            <strong>What happens now?</strong>
            <ul style={{ margin: '0.5rem 0 0 1.25rem', padding: 0 }}>
              <li>Your reservation remains in our system under pending status.</li>
              <li>You can complete payment at your convenience from your reservations portal.</li>
              <li>If you need assistance, our 24/7 Serendib concierge is available to help.</li>
            </ul>
          </div>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/my-bookings" className="serendib-btn-pay" style={{ textDecoration: 'none' }}>
              <FaCalendarAlt /> Go to My Reservations
            </Link>
            <Link to="/" className="serendib-btn-sandbox-sim" style={{ textDecoration: 'none' }}>
              Return to Sanctuary Home
            </Link>
          </div>
        </div>
      </div>
    </CustomerLayout>
  );
};

export default PaymentCancel;
