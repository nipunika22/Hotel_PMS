// frontend/src/pages/TravelAgents.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaPlus, FaEdit, FaTrash, FaSearch, FaPlane } from 'react-icons/fa';
import { travelAgentAPI } from '../services/api';
import { toast } from 'react-toastify';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import EmptyState from '../components/ui/EmptyState';
import { TableSkeleton } from '../components/ui/LoadingSkeleton';

const TravelAgents = () => {
  const navigate = useNavigate();
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      const response = await travelAgentAPI.getAgents();
      setAgents(response.data);
    } catch (error) {
      toast.error('Failed to load travel agents');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this travel agent?')) return;
    try {
      await travelAgentAPI.deleteAgent(id);
      toast.success('Travel agent deleted successfully');
      fetchAgents();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete travel agent');
    }
  };

  const filteredAgents = agents.filter(agent => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      agent.agentName?.toLowerCase().includes(term) ||
      agent.companyName?.toLowerCase().includes(term) ||
      agent.agentCode?.toLowerCase().includes(term) ||
      agent.email?.toLowerCase().includes(term)
    );
  });

  return (
    <div>
      <div className="content-wrapper">
        <PageHeader 
          title="Travel Agents" 
          subtitle="Manage partner agencies, commissions and booking attributions."
        >
          <button onClick={() => navigate('/travel-agents/new')} className="btn btn-primary">
            <FaPlus /> Add Agent
          </button>
        </PageHeader>

        {/* Search */}
        <div className="filters">
          <div className="filter-row">
            <div className="search-box">
              <FaSearch />
              <input
                type="text"
                placeholder="Search agent name, company or code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={5} cols={7} />
        ) : filteredAgents.length === 0 ? (
          <EmptyState 
            icon={FaPlane}
            title="No travel agents found"
            message={searchTerm ? "Try adjusting your search." : "Add your first travel agent partner."}
            action={
              !searchTerm && (
                <button onClick={() => navigate('/travel-agents/new')} className="btn btn-primary">
                  <FaPlus /> Add Agent
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
                    <th>Code</th>
                    <th>Agency</th>
                    <th>Contact</th>
                    <th>Commission</th>
                    <th>Payment Terms</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAgents.map((agent) => (
                    <tr key={agent._id}>
                      <td><strong>{agent.agentCode}</strong></td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{agent.companyName}</div>
                        <div className="table-cell-sub">{agent.agentName}</div>
                      </td>
                      <td>
                        <div>{agent.phone}</div>
                        <div className="table-cell-sub">{agent.email}</div>
                      </td>
                      <td><strong>{agent.commissionRate}%</strong></td>
                      <td><StatusBadge status={agent.paymentTerms || 'Credit'} /></td>
                      <td><StatusBadge status={agent.status || 'Active'} /></td>
                      <td>
                        <div className="table-actions">
                          <button
                            onClick={() => navigate(`/travel-agents/${agent._id}/edit`)}
                            className="btn btn-icon btn-ghost btn-sm"
                            title="Edit"
                            aria-label="Edit agent"
                          >
                            <FaEdit />
                          </button>
                          <button
                            onClick={() => handleDelete(agent._id)}
                            className="btn btn-icon btn-ghost btn-sm"
                            title="Delete"
                            aria-label="Delete agent"
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

export default TravelAgents;