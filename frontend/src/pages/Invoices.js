// frontend/src/pages/Invoices.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaEye, FaSearch, FaFileInvoiceDollar } from 'react-icons/fa';
import { invoiceAPI } from '../services/api';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import EmptyState from '../components/ui/EmptyState';
import { TableSkeleton } from '../components/ui/LoadingSkeleton';

const Invoices = () => {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchInvoices();
  }, []);

  const fetchInvoices = async () => {
    try {
      const response = await invoiceAPI.getInvoices();
      setInvoices(response.data);
    } catch (error) {
      toast.error('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch = !searchTerm || 
      inv.invoiceNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.guest?.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.guest?.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.reservation?.reservationNumber?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || inv.paymentStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div>
      <div className="content-wrapper">
        <PageHeader 
          title="Invoices" 
          subtitle="Track billing, payments and outstanding balances."
        />

        {/* Filters */}
        <div className="filters">
          <div className="filter-row">
            <div className="search-box">
              <FaSearch />
              <input
                type="text"
                placeholder="Search invoice, guest or reservation..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <select
              className="form-control"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ maxWidth: '180px' }}
            >
              <option value="all">All Status</option>
              <option value="Paid">Paid</option>
              <option value="Partial">Partially Paid</option>
              <option value="Unpaid">Unpaid</option>
            </select>
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={6} cols={8} />
        ) : filteredInvoices.length === 0 ? (
          <EmptyState 
            icon={FaFileInvoiceDollar}
            title="No invoices found"
            message={searchTerm ? "Try adjusting your search or filters." : "Invoices are generated when guests check out."}
          />
        ) : (
          <div className="card" style={{ marginBottom: 0 }}>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Guest</th>
                    <th>Reservation</th>
                    <th>Date</th>
                    <th>Total</th>
                    <th>Paid</th>
                    <th>Balance</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.map((invoice) => (
                    <tr key={invoice._id}>
                      <td><strong>{invoice.invoiceNumber}</strong></td>
                      <td>
                        <div style={{ fontWeight: 500 }}>
                          {invoice.guest?.firstName} {invoice.guest?.lastName}
                        </div>
                        <div className="table-cell-sub">{invoice.guest?.phone}</div>
                      </td>
                      <td>{invoice.reservation?.reservationNumber || '—'}</td>
                      <td>{format(new Date(invoice.invoiceDate), 'MMM dd, yyyy')}</td>
                      <td><strong>₹{invoice.totalAmount?.toLocaleString()}</strong></td>
                      <td style={{ color: 'var(--color-success)' }}>
                        ₹{(invoice.totalPaid || 0).toLocaleString()}
                      </td>
                      <td style={{ 
                        color: invoice.balanceDue > 0 ? 'var(--color-danger)' : 'var(--color-success)',
                        fontWeight: 600
                      }}>
                        ₹{invoice.balanceDue?.toLocaleString()}
                      </td>
                      <td><StatusBadge status={invoice.paymentStatus} /></td>
                      <td>
                        <div className="table-actions">
                          <button
                            onClick={() => navigate(`/invoices/${invoice._id}`)}
                            className="btn btn-icon btn-ghost btn-sm"
                            title="View Invoice"
                            aria-label="View invoice details"
                          >
                            <FaEye />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Invoices;