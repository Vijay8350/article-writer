import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, UserPlus, CheckCircle2, Ban, RotateCcw, Activity as ActivityIcon, Building2, KeyRound, Settings2, X, Copy, Trash2, Plus, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import {
  adminGetUsers, adminGetUser, adminGetPlans, adminSetRole, adminCreateUser,
  adminApproveUser, adminSuspendUser, adminReactivateUser, adminGetActivity,
  adminGetUpgradeRequests, adminApproveUpgrade, adminRejectUpgrade,
  adminGetWorkspaces, adminSetWorkspacePlan, adminSuspendWorkspace, adminReactivateWorkspace,
  adminSetPassword, adminAddToWorkspace, adminSetWorkspaceRole, adminRemoveFromWorkspace,
} from '../lib/api';

const STATUS_BADGE = { active: 'badge-success', pending: 'badge-warning', suspended: 'badge-danger' };
const ROLE_BADGE = { superadmin: 'badge-danger', admin: 'badge-warning', user: 'badge-purple' };
const WORKSPACE_ROLES = ['owner', 'admin', 'member'];
const errMsg = (err) => err.response?.data?.error || 'Failed';
const cell = { padding: '8px' };
const muted = { color: 'var(--text-muted)', fontSize: 11 };

// What each role may do. Matches the checks in the backend (routes/admin.js and the
// requireWorkspaceRole guards); change both together.
const PLATFORM_PERMISSIONS = [
  ['Use the app in their own workspaces', true, true, true],
  ['Open this Admin console', false, true, true],
  ['Approve, suspend and reactivate users', false, 'Users only', true],
  ['Set a user\'s password', false, 'Users only', true],
  ['Add users to workspaces, change or remove their workspace role', false, 'Users only', true],
  ['Create user accounts', false, 'Users only', 'Any role'],
  ['Change plans, suspend workspaces, handle upgrade requests', false, true, true],
  ['Change platform roles (user / admin / superadmin)', false, false, true],
];
const WORKSPACE_PERMISSIONS = [
  ['See everything in the workspace', true, true, true],
  ['Generate, publish and edit articles, campaigns and scheduled posts', true, true, true],
  ['Fetch and sync Business DNA', true, true, true],
  ['Connect Shopify, AI keys and AI preferences; rename the workspace', false, true, true],
  ['Connect Instagram accounts and manage Studio, posts and comments', false, true, true],
  ['Change SEO automation, fix and undo SEO changes', false, true, true],
  ['Invite members, remove members, reset a member\'s password', false, true, true],
  ['Request a plan upgrade', false, true, true],
  ['Change member roles, remove admins, reset an admin\'s password', false, false, true],
];

const Mark = ({ value }) => (value === true
  ? <span style={{ color: 'var(--accent-success)' }}>✓</span>
  : value ? <span style={{ fontSize: 12 }}>{value}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>);

function PermissionTable({ title, columns, rows }) {
  return (
    <div className="card mb-24">
      <div className="card-header"><h2>{title}</h2></div>
      <div className="card-body" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
              <th style={cell}>Can…</th>
              {columns.map((c) => <th key={c} style={{ ...cell, textAlign: 'center' }}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, ...marks]) => (
              <tr key={label} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <td style={cell}>{label}</td>
                {marks.map((m, i) => <td key={i} style={{ ...cell, textAlign: 'center' }}><Mark value={m} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// One user: their password and the workspaces they belong to.
function UserPanel({ userId, workspaces, canManage, onClose, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [password, setPassword] = useState('');
  const [generated, setGenerated] = useState(null);
  const [addWs, setAddWs] = useState('');
  const [addRole, setAddRole] = useState('member');
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => adminGetUser(userId)
    .then((res) => setDetail(res.data))
    .catch((err) => { toast.error(errMsg(err)); onClose(); }), [userId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async (key, fn) => {
    setBusy(key);
    try {
      const res = await fn();
      toast.success(res.message || 'Done');
      await load();
      onChanged();
      return res;
    } catch (err) {
      toast.error(errMsg(err), { duration: 8000 });
      return null;
    } finally { setBusy(null); }
  };

  const savePassword = async () => {
    if (password && password.length < 8) return toast.error('Use at least 8 characters, or leave it empty to generate one');
    const res = await run('password', () => adminSetPassword(userId, password));
    if (res) { setGenerated(res.data.generatedPassword || null); setPassword(''); }
    return undefined;
  };

  const memberOf = new Set((detail?.workspaces || []).map((w) => w.id));
  const available = workspaces.filter((w) => !memberOf.has(w.id));

  return (
    <div className="app-modal" role="dialog" aria-modal="true" aria-label="Manage user" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="app-modal__card" style={{ maxWidth: 640 }}>
        <button className="app-modal__close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        {!detail ? <div className="spinner" /> : (
          <>
            <h3 style={{ marginBottom: 4, overflowWrap: 'anywhere' }}>{detail.email}</h3>
            <div className="flex gap-8 mb-16" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <span className={`badge ${STATUS_BADGE[detail.status]}`}>{detail.status}</span>
              <span className={`badge ${ROLE_BADGE[detail.role]}`}>{detail.role}</span>
              {detail.name && <span style={muted}>{detail.name}</span>}
            </div>
            {!canManage && <div className="form-helper mb-16">Only a superadmin can change an admin or superadmin account.</div>}

            <h4 style={{ fontSize: 13, marginBottom: 8 }}><KeyRound size={14} /> Password</h4>
            <div className="flex gap-8 mb-8" style={{ flexWrap: 'wrap' }}>
              <input className="form-input" style={{ flex: '1 1 220px' }} type="text" autoComplete="new-password" placeholder="New password, or leave empty to generate one"
                value={password} disabled={!canManage || busy === 'password'} onChange={(e) => setPassword(e.target.value)} />
              <button className="btn btn-secondary" disabled={!canManage || busy === 'password'} onClick={savePassword}>
                {busy === 'password' ? <Loader2 size={14} className="spinning" /> : <KeyRound size={14} />} {password ? 'Set password' : 'Generate new password'}
              </button>
            </div>
            {generated && (
              <div className="pwd-box mb-8">
                <code>{generated}</code>
                <button className="btn btn-secondary btn-sm" onClick={() => { navigator.clipboard.writeText(generated); toast.success('Copied'); }}><Copy size={13} /> Copy</button>
              </div>
            )}
            <p className="form-helper mb-16">{generated ? 'Shown once. Give it to the user; they can change it under Account after signing in.' : 'There is no email, so give the new password to the user yourself.'}</p>

            <h4 style={{ fontSize: 13, marginBottom: 8 }}><Building2 size={14} /> Workspaces</h4>
            {detail.workspaces.length === 0 ? <p className="form-helper">Not in any workspace.</p> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }} className="mb-16">
                <tbody>
                  {detail.workspaces.map((w) => (
                    <tr key={w.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <td style={cell}>{w.name}<div style={muted}>{w.plan_id} plan · {w.status}</div></td>
                      <td style={cell}>
                        <select className="form-select" style={{ minWidth: 110, padding: '4px 8px', fontSize: 12 }} value={w.role}
                          disabled={!canManage || !!busy} aria-label={`Role in ${w.name}`}
                          onChange={(e) => run(`role-${w.id}`, () => adminSetWorkspaceRole(userId, w.id, e.target.value))}>
                          {WORKSPACE_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </td>
                      <td style={{ ...cell, textAlign: 'right' }}>
                        <button className="btn btn-ghost btn-sm" disabled={!canManage || !!busy} title="Remove from this workspace"
                          onClick={() => run(`remove-${w.id}`, () => adminRemoveFromWorkspace(userId, w.id))}>
                          {busy === `remove-${w.id}` ? <Loader2 size={13} className="spinning" /> : <Trash2 size={13} />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {canManage && (
              <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
                <select className="form-select" style={{ flex: '1 1 220px' }} value={addWs} onChange={(e) => setAddWs(e.target.value)} aria-label="Workspace to add to">
                  <option value="">{available.length ? 'Add to a workspace…' : 'Already in every workspace'}</option>
                  {available.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.owner_email || 'no owner'})</option>)}
                </select>
                <select className="form-select" style={{ width: 'auto' }} value={addRole} onChange={(e) => setAddRole(e.target.value)} aria-label="Role in that workspace">
                  {WORKSPACE_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <button className="btn btn-primary" disabled={!addWs || !!busy}
                  onClick={async () => { if (await run('add', () => adminAddToWorkspace(userId, addWs, addRole))) setAddWs(''); }}>
                  {busy === 'add' ? <Loader2 size={14} className="spinning" /> : <Plus size={14} />} Add
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function Admin() {
  const { user: me } = useAuth();
  const isSuper = me?.role === 'superadmin';
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') || 'workspaces');
  useEffect(() => { if (params.get('tab')) setTab(params.get('tab')); }, [params]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [plans, setPlans] = useState([]);
  const [requests, setRequests] = useState([]);
  const [activity, setActivity] = useState([]);
  const [busy, setBusy] = useState(null);

  const EMPTY_USER = { email: '', password: '', name: '', role: 'user', workspaceId: '', workspaceRole: 'member' };
  const [nu, setNu] = useState(EMPTY_USER);
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState(null);
  const closePanel = useCallback(() => setManaging(null), []);
  // An admin manages ordinary users; a superadmin manages everyone.
  const canManageUser = (u) => isSuper || u.role === 'user';

  // `quiet` refreshes the lists without the full-page spinner, so an open panel stays put.
  const loadAll = (quiet) => {
    if (quiet !== true) setLoading(true);
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
      await adminCreateUser({ ...nu, workspaceId: nu.workspaceId || undefined });
      const ws = workspaces.find((w) => w.id === nu.workspaceId);
      toast.success(ws ? `User created and added to ${ws.name} as ${nu.workspaceRole}` : 'User created with a personal workspace');
      setNu(EMPTY_USER);
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
        <Tab id="roles" label="Roles & permissions" />
        <Tab id="create" label="+ Create user" />
      </div>

      {/* ROLES & PERMISSIONS */}
      {tab === 'roles' && (
        <>
          <p className="form-helper mb-16">
            <ShieldCheck size={13} /> Two kinds of role. A <strong>platform role</strong> decides who runs this Admin console. A
            <strong> workspace role</strong> decides what someone can do inside one workspace (a store). One person can be an owner in
            one workspace and a member in another.
          </p>
          <PermissionTable title="Platform roles" columns={['user', 'admin', 'superadmin']} rows={PLATFORM_PERMISSIONS} />
          <PermissionTable title="Workspace roles" columns={['member', 'admin', 'owner']} rows={WORKSPACE_PERMISSIONS} />
        </>
      )}

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
                          <button className="btn btn-secondary btn-sm" onClick={() => setManaging(u)} title="Password and workspaces">
                            <Settings2 size={13} /> Manage
                          </button>
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
                <div className="form-helper">Platform role. Almost everyone should be "user"; see Roles &amp; permissions.</div>
              </div>
              <div className="form-group">
                <label className="form-label">Workspace</label>
                <select className="form-select" value={nu.workspaceId} onChange={e => setNu({ ...nu, workspaceId: e.target.value })}>
                  <option value="">A new workspace of their own</option>
                  {workspaces.map(w => <option key={w.id} value={w.id}>{w.name} ({w.owner_email || 'no owner'})</option>)}
                </select>
              </div>
              {nu.workspaceId && (
                <div className="form-group">
                  <label className="form-label">Role in that workspace</label>
                  <select className="form-select" value={nu.workspaceRole} onChange={e => setNu({ ...nu, workspaceRole: e.target.value })}>
                    {WORKSPACE_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              )}
              <button className="btn btn-primary w-full" type="submit" disabled={creating}>
                {creating ? <><Loader2 size={16} className="spinning" /> Creating...</> : <><UserPlus size={16} /> Create User</>}
              </button>
            </form>
          </div>
        </div>
      )}
      {managing && (
        <UserPanel userId={managing.id} workspaces={workspaces} canManage={canManageUser(managing)} onClose={closePanel} onChanged={() => loadAll(true)} />
      )}
      <style>{`.spinning { animation: spin 1s linear infinite; }`}</style>
    </div>
  );
}
