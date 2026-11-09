// frontend/src/components/ui/PageHeader.js
import React from 'react';

const PageHeader = ({ title, subtitle, children }) => {
  return (
    <div className="page-header">
      <div className="page-header-row">
        <div>
          <h1 className="page-header-title">{title}</h1>
          {subtitle && <p className="page-header-subtitle">{subtitle}</p>}
        </div>
        {children && (
          <div className="page-header-actions">
            {children}
          </div>
        )}
      </div>
    </div>
  );
};

export default PageHeader;
