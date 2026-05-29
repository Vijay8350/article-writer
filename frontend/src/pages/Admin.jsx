import React, { useState, useEffect } from 'react';
import { Shield, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminGetUsers, adminGetPlans, adminSetPlan } from '../lib/api';

export default function Admin() {
  const [users, setUsers] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([adminGetUsers(), adminGetPlans()])
      .then(([u, p]) => {
        setUsers(u.data || []);
        setPlans(p.data || []);
      })
      .catch((err) => {
        if (err.response?.status === 403) toast.error('Admins only');
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handlePlanChange = async (userId, planId) => {
    setSavingId(userId);
    try {
      await adminSetPlan(userId, planId);
      toast.success('Plan updated');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update plan');
    }
    setSavingId(null);
  };

  if (loading) {
    return <div className="page-container"><div className="empty-state"><div className="spinner spinner-lg" /></div></div>;
  }

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <h1>🛡️ Admin</h1>
        <p>Manage users and assign plans</p>
      </div>

      <div className="card">
        <div className="card-header"><h2>Users ({users.length})</h2></div>
        <div className="card-body">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '8px 12px' }}>Email</th>
                  <th style={{ padding: '8px 12px' }}>Role</th>
                  <th style={{ padding: '8px 12px' }}>Usage (mo)</th>
                  <th style={{ padding: '8px 12px' }}>Plan</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <td style={{ padding: '10px 12px' }}>{u.email}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span className={`badge ${u.role === 'admin' ? 'badge-warning' : 'badge-purple'}`}>{u.role}</span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>{u.used} / {u.monthly_article_limit}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <select
                        className="form-select"
                        style={{ minWidth: 120 }}
                        value={u.plan_id}
                        disabled={savingId === u.id}
                        onChange={e => handlePlanChange(u.id, e.target.value)}
                      >
                        {plans.map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({p.monthly_article_limit}/mo)</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
