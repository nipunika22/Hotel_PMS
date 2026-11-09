// frontend/src/components/ui/LoadingSkeleton.js
import React from 'react';

export const SkeletonText = ({ width = '100%', height = '14px', className = '' }) => (
  <div className={`skeleton ${className}`} style={{ width, height }} />
);

export const SkeletonCard = ({ height = '100px', className = '' }) => (
  <div className={`skeleton ${className}`} style={{ height, borderRadius: '12px' }} />
);

export const TableSkeleton = ({ rows = 5, cols = 6 }) => (
  <div className="card">
    <div className="table-container">
      <table className="table">
        <thead>
          <tr>
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i}><SkeletonText width="80%" height="12px" /></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c}><SkeletonText width={`${60 + Math.random() * 30}%`} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

export const StatsSkeleton = ({ count = 5 }) => (
  <div className="stats-grid">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="stat-card" style={{ opacity: 0.6 }}>
        <div className="skeleton" style={{ width: 48, height: 48, borderRadius: 8 }} />
        <div className="stat-content">
          <SkeletonText width="60%" height="12px" className="mb-2" />
          <SkeletonText width="50%" height="28px" />
        </div>
      </div>
    ))}
  </div>
);

export const DashboardSkeleton = () => (
  <div className="content-wrapper">
    <div style={{ marginBottom: '2rem' }}>
      <SkeletonText width="280px" height="28px" className="mb-2" />
      <SkeletonText width="360px" height="14px" />
    </div>
    <StatsSkeleton count={5} />
    <SkeletonCard height="200px" />
  </div>
);

const LoadingSkeleton = ({ type = 'page' }) => {
  switch (type) {
    case 'table':
      return <TableSkeleton />;
    case 'stats':
      return <StatsSkeleton />;
    case 'dashboard':
      return <DashboardSkeleton />;
    default:
      return (
        <div className="loading">
          <div className="spinner" />
        </div>
      );
  }
};

export default LoadingSkeleton;
