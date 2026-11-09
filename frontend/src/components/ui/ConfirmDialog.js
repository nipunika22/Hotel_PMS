// frontend/src/components/ui/ConfirmDialog.js
import React from 'react';
import { FaTimes, FaExclamationTriangle } from 'react-icons/fa';

const ConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger'
}) => {
  if (!isOpen) return null;

  const btnClass = variant === 'danger' ? 'btn-danger' : 'btn-primary';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
        <div className="modal-header">
          <div>
            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FaExclamationTriangle style={{ color: variant === 'danger' ? 'var(--color-danger)' : 'var(--color-warning)' }} />
              {title}
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <FaTimes />
          </button>
        </div>
        <div className="modal-body">
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>{message}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>{cancelText}</button>
          <button className={`btn ${btnClass}`} onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
