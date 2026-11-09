// frontend/src/components/ui/EmptyState.js
import React from 'react';
import { FaInbox } from 'react-icons/fa';

const EmptyState = ({ icon: Icon = FaInbox, title, message, action }) => {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <Icon />
      </div>
      <h3>{title || 'No data found'}</h3>
      {message && <p>{message}</p>}
      {action && action}
    </div>
  );
};

export default EmptyState;
