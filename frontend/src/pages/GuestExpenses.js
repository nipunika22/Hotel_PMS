// frontend/src/pages/GuestExpenses.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaPlus, FaEdit, FaTrash, FaSearch, FaReceipt } from 'react-icons/fa';
import { guestExpenseAPI } from '../services/api';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import EmptyState from '../components/ui/EmptyState';
import { TableSkeleton } from '../components/ui/LoadingSkeleton';

const GuestExpenses = () => {
  const navigate = useNavigate();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  useEffect(() => {
    fetchExpenses();
  }, []);

  const fetchExpenses = async () => {
    try {
      const response = await guestExpenseAPI.getExpenses();
      setExpenses(response.data);
    } catch (error) {
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this expense?')) return;
    try {
      await guestExpenseAPI.deleteExpense(id);
      toast.success('Expense deleted successfully');
      fetchExpenses();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete expense');
    }
  };

  const categories = [...new Set(expenses.map(e => e.category))];

  const filteredExpenses = expenses.filter(exp => {
    const matchesSearch = !searchTerm || 
      exp.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      exp.guest?.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      exp.guest?.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      exp.reservation?.reservationNumber?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || exp.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div>
      <div className="content-wrapper">
        <PageHeader 
          title="Guest Expenses" 
          subtitle="Track in-stay charges for room service, dining, spa and more."
        >
          <button onClick={() => navigate('/expenses/new')} className="btn btn-primary">
            <FaPlus /> Add Expense
          </button>
        </PageHeader>

        {/* Filters */}
        <div className="filters">
          <div className="filter-row">
            <div className="search-box">
              <FaSearch />
              <input
                type="text"
                placeholder="Search by description, guest or reservation..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <select
              className="form-control"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{ maxWidth: '200px' }}
            >
              <option value="all">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={6} cols={8} />
        ) : filteredExpenses.length === 0 ? (
          <EmptyState 
            icon={FaReceipt}
            title="No expenses found"
            message={searchTerm || categoryFilter !== 'all' ? "Try adjusting your filters." : "Record guest charges during their stay."}
            action={
              !searchTerm && categoryFilter === 'all' && (
                <button onClick={() => navigate('/expenses/new')} className="btn btn-primary">
                  <FaPlus /> Add Expense
                </button>
              )
            }
          />
        ) : (
          <div className="card" style={{ marginBottom: 0 }}>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Guest</th>
                    <th>Reservation</th>
                    <th>Category</th>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.map((expense) => (
                    <tr key={expense._id}>
                      <td>{format(new Date(expense.expenseDate), 'MMM dd, yyyy')}</td>
                      <td>
                        <div style={{ fontWeight: 500 }}>
                          {expense.guest?.firstName} {expense.guest?.lastName}
                        </div>
                      </td>
                      <td>{expense.reservation?.reservationNumber || '—'}</td>
                      <td><StatusBadge status={expense.category} /></td>
                      <td>{expense.description}</td>
                      <td>{expense.quantity}</td>
                      <td><strong>₹{expense.totalAmount?.toLocaleString()}</strong></td>
                      <td><StatusBadge status={expense.paymentStatus} /></td>
                      <td>
                        <div className="table-actions">
                          <button
                            onClick={() => navigate(`/expenses/${expense._id}/edit`)}
                            className="btn btn-icon btn-ghost btn-sm"
                            title="Edit"
                            aria-label="Edit expense"
                          >
                            <FaEdit />
                          </button>
                          <button
                            onClick={() => handleDelete(expense._id)}
                            className="btn btn-icon btn-ghost btn-sm"
                            title="Delete"
                            aria-label="Delete expense"
                            style={{ color: 'var(--color-danger)' }}
                          >
                            <FaTrash />
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

export default GuestExpenses;