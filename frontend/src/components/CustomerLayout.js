// frontend/src/components/CustomerLayout.js
import React from 'react';
import CustomerNavbar from './CustomerNavbar';
import DestinationFooter from './DestinationFooter';
import DestinationConcierge from './DestinationConcierge';
import '../pages/LuxuryDestinationHome.css';
import '../pages/CustomerPortal.css';

const CustomerLayout = ({ children, variant = 'solid' }) => {
  return (
    <div className="dest-page-root guest-portal-root">
      {/* Consolidated Canonical Customer Navigation Bar */}
      <CustomerNavbar variant={variant} />

      <main 
        className="guest-portal-main" 
        style={{ 
          paddingTop: variant === 'solid' ? '6rem' : '0',
          minHeight: 'calc(100vh - 420px)'
        }}
      >
        {children}
      </main>

      {/* Floating AI Concierge for Guest Portal */}
      <DestinationConcierge />

      {/* Consolidated Canonical Customer Footer */}
      <DestinationFooter />
    </div>
  );
};

export default CustomerLayout;
