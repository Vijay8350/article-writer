import React, { useState, useEffect } from 'react';
import { Loader2, UserPlus, CheckCircle2, Ban, RotateCcw, Activity as ActivityIcon, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import {
  adminGetUsers, adminGetPlans, adminSetRole, adminCreateUser,
  adminApproveUser, adminSuspendUser, adminReactivateUser, adminGetActivity,
  adminGetUpgradeRequests, adminApproveUpgrade, adminRejectUpgrade,
  adminGetWorkspaces, adminSetWorkspacePlan, adminSuspendWorkspace, adminReactivateWorkspace,
} from '../lib/api';

const STATUS_BADGE = { active: 'badge-success', pending: 'badge-warning', suspended: 'badge-danger' };
const ROLE_BADGE = { superadmin: 'badge-danger', admin: 'badge-warning', user: 'badge-purple' };

export default function Admin() {
  const { user: me } = useAuth();
  const isSuper = me?.role === 'superadmin';
  const [tab, setTab] = useState('workspaces');
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [plans, setPlans] = useState([]);
  const [requests, setRequests] = useState([]);
  const [activity, setActivity] = useState([]);
  const [busy, setBusy] = useState(null);

  const [nu, setNu] = useState({ email: '', password: '', name: '', role: 'user' });
  const [creating, setCreating] = useState(false);

  const loadAll = () => {
    setLoading(true);
    Promise.all([adminGetUsers(), adminGetWorkspaces(), adminGetPlans(), adminGetUpgradeRequests(), adminGetActivity()])
      .then(([u, w, p, r, a]) => {
        setUsers(u.data || []);
        setWorkspaces(w.data || []);
        setPlans(p.data || []);
        setRequests(r.data || []);
        setActivity(a.data || []);
      })
      .catch((err) => { if (err.response?.status === 403) toast.error('Admins only'); })
      .finally(() => setLoading(false));
  };

  useEffect(loadAll, []);

  const act = async (fn, ...args) => {
    setBusy(args[0]);
    try { await fn(...args); toast.success('Done'); loadAll(); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    setBusy(null);
  };

  const createUser = async (e) => {
    e.preventDefault();
    if (!nu.email || nu.password.length < 8) return toast.error('Email + 8-char password required');
    setCreating(true);
    try {
      await adminCreateUser(nu);
      toast.success('User created (with personal workspace)');
      setNu({ email: '', password: '', name: '', role: 'user' });
      loadAll();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    setCreating(false);
  };

  const pendingUsers = users.filter(u => u.status === 'pending');

  if (loading) {
    return <div className="page-container"><div className="empty-state"><div className="spinner spinner-lg" /></div></div>;
  }

  const Tab = ({ id, label, count }) => (
    <button className={`btn btn-sm ${tab === id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab(id)}>
      {label}{count ? ` (${count})` : ''}
    </button>
  );

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <h1>🛡️ Admin Console</h1>
        <p>{isSuper ? 'Superadmin — full control over workspaces, users, and plans' : 'Manage workspaces, users, and upgrade requests'}</p>
      </div>

      <div className="flex gap-8 mb-24" style={{ flexWrap: 'wrap' }}>
        <Tab id="workspaces" label="Workspaces" count={workspaces.length} />
        <Tab id="users" label="Users" count={users.length} />
        <Tab id="pending" label="Pending users" count={pendingUsers.length} />
        <Tab id="upgrades" label="Upgrade requests" count={requests.length} />
        <Tab id="activity" label="Activity" />
        <Tab id="create" label="+ Create user" />
      </div>

      {/* WORKSPACES */}
      {tab === 'workspaces' && (
        <div className="card">
          <div className="card-header"><h2><Building2 size={16} /> Workspaces</h2></div>
          <div className="card-body" style={{ overflowX: 'auto' }}>
            {workspaces.length === 0 ? (
              <div className="empty-state"><p>No workspaces.</p></div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '8px' }}>Workspace</th>
                    <th style={{ padding: '8px' }}>Owner</th>
                    <th style={{ padding: '8px' }}>Status</th>
                    <th style={{ padding: '8px' }}>Plan / Usage</th>
                    <th style={{ padding: '8px' }}>Members</th>
                    <th style={{ padding: '8px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {workspaces.map(w => (
                    <tr key={w.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <td style={{ padding: '8px' }}><strong>{w.name}</strong><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{w.slug}</div></td>
                      <td style={{ padding: '8px' }}>{w.owner_email}</td>
                      <td style={{ padding: '8px' }}><span className={`badge ${STATUS_BADGE[w.status]}`}>{w.status}</span></td>
                      <td style={{ padding: '8px' }}>
                        <select className="form-select" style={{ minWidth: 110, padding: '4px 8px', fontSize: 12 }}
                          value={w.plan_id} disabled={busy === w.id}
                          onChange={e => act(adminSetWorkspacePlan, w.id, e.target.value)}>
                          {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{w.used}/{w.monthly_article_limit} used</div>
                      </td>
                      <td style={{ padding: '8px' }}>{w.member_count}</td>
                      <td style={{ padding: '8px' }}>
                        {w.status === 'active' ? (
                          <button className="btn btn-danger btn-sm" disabled={busy === w.id} onClick={() => act(adminSuspendWorkspace, w.id)}>
                            <Ban size={13} /> Suspend
                          </button>
                        ) : (
                          <button className="btn btn-secondary btn-sm" disabled={busy === w.id} onClick={() => act(adminReactivateWorkspace, w.id)}>
                            <RotateCcw size={13} /> Reactivate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* USERS */}
      {(tab === 'users' || tab === 'pending') && (
        <div className="card">
          <div className="card-header"><h2>{tab === 'pending' ? 'Pending user signups' : 'All users'}</h2></div>
          <div className="card-body" style={{ overflowX: 'auto' }}>
            {(tab === 'pending' ? pendingUsers : users).length === 0 ? (
              <div className="empty-state"><p>{tab === 'pending' ? 'No pending signups.' : 'No users.'}</p></div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '8px' }}>Email</th>
                    <th style={{ padding: '8px' }}>Status</th>
                    <th style={{ padding: '8px' }}>Role</th>
                    <th style={{ padding: '8px' }}>Workspaces</th>
                    <th style={{ padding: '8px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(tab === 'pending' ? pendingUsers : users).map(u => (
                    <tr key={u.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <td style={{ padding: '8px' }}>{u.email}{u.name ? <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{u.name}</div> : null}</td>
                      <td style={{ padding: '8px' }}><span className={`badge ${STATUS_BADGE[u.status]}`}>{u.status}</span></td>
                      <td style={{ padding: '8px' }}>
                        {isSuper && u.id !== me.id ? (
                          <select className="form-select" style={{ minWidth: 110, padding: '4px 8px', fontSize: 12 }}
                            value={u.role} disabled={busy === u.id}
                            onChange={e => act(adminSetRole, u.id, e.target.value)}>
                            <option value="user">user</option>
                            <option value="admin">admin</option>
                            <option value="superadmin">superadmin</option>
                          </select>
                        ) : <span className={`badge ${ROLE_BADGE[u.role]}`}>{u.role}</span>}
                      </td>
                      <td style={{ padding: '8px' }}>{u.workspace_count}</td>
                      <td style={{ padding: '8px' }}>
                        <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
                          {u.status === 'pending' && (
                            <button className="btn btn-success btn-sm" disabled={busy === u.id} onClick={() => act(adminApproveUser, u.id)}>
                              <CheckCircle2 size={13} /> Approve
                            </button>
                          )}
                          {u.status === 'active' && u.id !== me.id && (
                            <button className="btn btn-danger btn-sm" disabled={busy === u.id} onClick={() => act(adminSuspendUser, u.id)}>
                              <Ban size={13} /> Suspend
                            </button>
                          )}
                          {u.status === 'suspended' && (
                            <button className="btn btn-secondary btn-sm" disabled={busy === u.id} onClick={() => act(adminReactivateUser, u.id)}>
                              <RotateCcw size={13} /> Reactivate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* UPGRADE REQUESTS */}
      {tab === 'upgrades' && (
        <div className="card">
          <div className="card-header"><h2>Pending upgrade requests</h2></div>
          <div className="card-body">
            {requests.length === 0 ? (
              <div className="empty-state"><p>No pending requests.</p></div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <tbody>
                  {requests.map(r => (
                    <tr key={r.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <td style={{ padding: '8px' }}><strong>{r.workspace_name}</strong><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.requester_email}</div></td>
                      <td style={{ padding: '8px' }}>→ <strong style={{ textTransform: 'capitalize' }}>{r.requested_plan}</strong></td>
                      <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{new Date(r.created_at).toLocaleString()}</td>
                      <td style={{ padding: '8px' }}>
                        <div className="flex gap-8">
                          <button className="btn btn-success btn-sm" disabled={busy === r.id} onClick={() => act(adminApproveUpgrade, r.id)}>Approve</button>
                          <button className="btn btn-ghost btn-sm" disabled={busy === r.id} onClick={() => act(adminRejectUpgrade, r.id)}>Reject</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ACTIVITY */}
      {tab === 'activity' && (
        <div className="card">
          <div className="card-header"><h2><ActivityIcon size={16} /> Recent activity</h2></div>
          <div className="card-body">
            {activity.length === 0 ? <div className="empty-state"><p>No activity.</p></div> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <tbody>
                  {activity.map(a => (
                    <tr key={a.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '6px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{new Date(a.created_at).toLocaleString()}</td>
                      <td style={{ padding: '6px 8px' }}>{a.email || '—'}</td>
                      <td style={{ padding: '6px 8px' }}><span className="badge badge-purple">{a.action}</span></td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>{a.detail || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* CREATE USER */}
      {tab === 'create' && (
        <div className="card" style={{ maxWidth: 560 }}>
          <div className="card-header"><h2><UserPlus size={16} /> Create user</h2></div>
          <div className="card-body">
            <form onSubmit={createUser}>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input className="form-input" type="email" value={nu.email} onChange={e => setNu({ ...nu, email: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Password (min 8)</label>
                <input className="form-input" type="text" value={nu.password} onChange={e => setNu({ ...nu, password: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Name (optional)</label>
                <input className="form-input" value={nu.name} onChange={e => setNu({ ...nu, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Role</label>
                <select className="form-select" value={nu.role} onChange={e => setNu({ ...nu, role: e.target.value })}>
                  <option value="user">user</option>
                  {isSuper && <option value="admin">admin</option>}
                  {isSuper && <option value="superadmin">superadmin</option>}
                </select>
                <div className="form-helper">A personal workspace is created automatically for the new user.</div>
              </div>
              <button className="btn btn-primary w-full" type="submit" disabled={creating}>
                {creating ? <><Loader2 size={16} className="spinning" /> Creating...</> : <><UserPlus size={16} /> Create User</>}
              </button>
            </form>
          </div>
        </div>
      )}
      <style>{`.spinning { animation: spin 1s linear infinite; }`}</style>
    </div>
  );
}
