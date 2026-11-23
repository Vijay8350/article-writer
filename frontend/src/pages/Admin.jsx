import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, UserPlus, CheckCircle2, Ban, RotateCcw, Activity as ActivityIcon, Building2, KeyRound, Settings2, X, Copy, Trash2, Plus, ShieldCheck, LogIn, ExternalLink, Image as ImageIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import {
  adminGetUsers, adminGetUser, adminGetPlans, adminSetRole, adminCreateUser,
  adminApproveUser, adminSuspendUser, adminReactivateUser, adminGetActivity,
  adminGetUpgradeRequests, adminApproveUpgrade, adminRejectUpgrade,
  adminGetWorkspaces, adminSetWorkspacePlan, adminSuspendWorkspace, adminReactivateWorkspace,
  adminSetPassword, adminAddToWorkspace, adminSetWorkspaceRole, adminRemoveFromWorkspace,
  adminGetImageEngine, adminStartCodexLogin, adminCheckCodexLogin, adminTestImageEngine,
  adminGetOverview, adminGetCustomers,
} from '../lib/api';
import { ColumnChart, BarList, Kpi, compact } from '../components/insights/Charts';

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
  ['See customers, their plans and usage', false, true, true],
  ['Suspend and reactivate users', false, 'Users only', true],
  ['Set a user\'s password', false, 'Users only', true],
  ['Add users to workspaces, change or remove their workspace role', false, 'Users only', true],
  ['Create user accounts', false, 'Users only', 'Any role'],
  ['Change plans, suspend workspaces, handle upgrade requests', false, true, true],
  ['Change platform roles (user / admin / superadmin)', false, false, true],
  ['Sign the image engine in to ChatGPT and test it', false, false, true],
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

const when = (iso) => (iso ? new Date(iso).toLocaleString() : '—');
const day = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const ago = (iso) => {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - new Date(iso)) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};
const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const PLAN_BADGE = { free: 'badge-info', pro: 'badge-purple', business: 'badge-success' };

// The last 30 days, one bar per day (days without sign-ups show as 0).
function signupDays(rows) {
  const byDay = Object.fromEntries((rows || []).map((r) => [r.day, r.signups]));
  return Array.from({ length: 30 }, (_, k) => {
    const d = new Date(); d.setDate(d.getDate() - (29 - k));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const label = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    return { key, label, title: label, value: byDay[key] || 0 };
  });
}

// Usage of one limit, e.g. "3 / 5", red when it's used up.
const Used = ({ used, limit }) => (
  <span style={{ fontVariantNumeric: 'tabular-nums', color: limit && used >= limit ? 'var(--accent-danger)' : undefined }}>{used} / {limit ?? '—'}</span>
);

// Overview: how many people signed up and use the app, which plans they're on, and every
// account with its plan and this month's usage. `onManage` opens an account's panel.
function Overview({ onManage }) {
  const [data, setData] = useState(null);
  const [people, setPeople] = useState([]);
  const [search, setSearch] = useState('');
  const [plan, setPlan] = useState('');
  const [status, setStatus] = useState('');
  const load = useCallback(() => {
    Promise.all([adminGetOverview(), adminGetCustomers()])
      .then(([o, c]) => { setData(o.data); setPeople(c.data || []); })
      .catch((err) => toast.error(errMsg(err)));
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!data) return <div className="card"><div className="card-body"><div className="spinner" /></div></div>;

  const u = data.users;
  const q = search.trim().toLowerCase();
  const shown = people.filter((p) => (!q || `${p.email} ${p.name || ''} ${p.workspaces.map((w) => w.name).join(' ')}`.toLowerCase().includes(q))
    && (!plan || p.workspaces.some((w) => w.plan_id === plan))
    && (!status || p.status === status));
  const planRows = data.plans.map((p) => ({ key: p.id, label: `${p.name} · ${rupees(p.price_inr)}/mo`, value: p.active }));

  return (
    <>
      <div className="flex items-center justify-between mb-16">
        <p className="form-helper" style={{ margin: 0 }}>Customers are accounts that signed up themselves (platform role "user"); your own admin accounts aren't counted.</p>
        <button className="btn btn-ghost btn-sm" onClick={load}><RotateCcw size={14} /> Refresh</button>
      </div>
      <div className="kpi-grid mb-24">
        <Kpi label="Customers" value={compact(u.total)} sub={`+${u.new_today} today · +${u.new_week} this week · +${u.new_month} in 30 days`} />
        <Kpi label="Active this week" value={compact(u.active_week)} sub={`${u.active_day} in the last 24 hours`} hint="Customers who signed in or did anything in the last 7 days" />
        <Kpi label="Paying workspaces" value={compact(data.paying)} sub={`of ${data.workspaces} workspaces · ${u.suspended} suspended accounts`} />
        <Kpi label="Monthly plan value" value={rupees(data.monthly_value_inr)} sub="active paid plans, at list price" />
        <Kpi label={`Used this month (${data.period})`} value={compact(data.usage.articles)} sub={`articles · ${compact(data.usage.ig_posts)} AI Instagram images`} />
      </div>
      {data.pending_upgrades > 0 && (
        <div className="card mb-16"><div className="card-body" style={{ fontSize: 14 }}>
          {data.pending_upgrades} plan upgrade request{data.pending_upgrades === 1 ? '' : 's'} waiting: see the <strong>Upgrade requests</strong> tab.
        </div></div>
      )}
      <div className="ig-two-col mb-24">
        <div className="card">
          <div className="card-header"><h3>New sign-ups per day</h3><span className="badge badge-info">30 days</span></div>
          <div className="card-body">
            {data.signups.length ? <ColumnChart data={signupDays(data.signups)} label="Day" valueLabel="Sign-ups" /> : <p className="form-helper">No sign-ups in the last 30 days.</p>}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h3>Active workspaces per plan</h3></div>
          <div className="card-body">
            <BarList rows={planRows} total={planRows.reduce((n, r) => n + r.value, 0)} label="Workspaces per plan" />
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 12 }}>
              <thead><tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}><th style={cell}>Plan</th><th style={cell}>Price</th><th style={cell}>Articles / mo</th><th style={cell}>AI images / mo</th></tr></thead>
              <tbody>{data.plans.map((p) => (
                <tr key={p.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                  <td style={cell}><span className={`badge ${PLAN_BADGE[p.id] || 'badge-info'}`}>{p.name}</span></td>
                  <td style={cell}>{rupees(p.price_inr)}</td><td style={cell}>{p.monthly_article_limit}</td><td style={cell}>{p.monthly_ig_post_limit}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2>Users & plans ({shown.length})</h2></div>
        <div className="card-body">
          <div className="flex gap-8 mb-16" style={{ flexWrap: 'wrap' }}>
            <input className="form-input" style={{ maxWidth: 280 }} placeholder="Search email, name or workspace" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="form-select" style={{ maxWidth: 160 }} value={plan} onChange={(e) => setPlan(e.target.value)}>
              <option value="">All plans</option>
              {data.plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select className="form-select" style={{ maxWidth: 160 }} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Any status</option><option value="active">Active</option><option value="suspended">Suspended</option>
            </select>
          </div>
          {!shown.length ? <div className="empty-state"><p>No accounts match.</p></div> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={cell}>Account</th><th style={cell}>Joined</th><th style={cell}>Last sign-in</th>
                  <th style={cell}>Workspace · plan</th><th style={cell}>Articles</th><th style={cell}>AI images</th><th style={cell}>Connected</th><th style={cell} />
                </tr></thead>
                <tbody>
                  {shown.map((p) => {
                    const rows = p.workspaces.length ? p.workspaces : [null];
                    return rows.map((w, k) => (
                      <tr key={`${p.id}-${w?.id || 'none'}`} style={{ borderTop: k ? '1px dashed var(--border-color)' : '1px solid var(--border-color)', verticalAlign: 'top' }}>
                        {k === 0 && (
                          <>
                            <td style={cell} rowSpan={rows.length}>
                              <div style={{ fontWeight: 600 }}>{p.name || p.email.split('@')[0]}</div>
                              <div style={muted}>{p.email}</div>
                              <div className="flex gap-8" style={{ marginTop: 4 }}>
                                <span className={`badge ${STATUS_BADGE[p.status] || ''}`}>{p.status}</span>
                                {p.role !== 'user' && <span className={`badge ${ROLE_BADGE[p.role] || ''}`}>{p.role}</span>}
                              </div>
                            </td>
                            <td style={cell} rowSpan={rows.length}>{day(p.created_at)}</td>
                            <td style={cell} rowSpan={rows.length} title={when(p.last_login)}>{ago(p.last_login)}</td>
                          </>
                        )}
                        {w ? (
                          <>
                            <td style={cell}>
                              <div>{w.name}{w.role !== 'owner' && <span style={muted}> ({w.role})</span>}</div>
                              <span className={`badge ${PLAN_BADGE[w.plan_id] || 'badge-info'}`}>{w.plan_name || w.plan_id}{Number(w.price_inr) > 0 ? ` · ${rupees(w.price_inr)}` : ''}</span>
                              {w.status !== 'active' && <span className="badge badge-danger" style={{ marginLeft: 6 }}>{w.status}</span>}
                            </td>
                            <td style={cell}><Used used={w.articles_used} limit={w.articles_limit} /></td>
                            <td style={cell}><Used used={w.ig_used} limit={w.ig_limit} /></td>
                            <td style={cell}>
                              <div style={muted}>{w.store ? '✓ Shopify store' : '— no store'}</div>
                              <div style={muted}>{w.instagram ? `✓ ${w.instagram} Instagram` : '— no Instagram'}</div>
                            </td>
                          </>
                        ) : <td style={cell} colSpan={4}><span style={muted}>No workspace</span></td>}
                        {k === 0 && (
                          <td style={cell} rowSpan={rows.length}>
                            <button className="btn btn-secondary btn-sm" onClick={() => onManage(p)}><Settings2 size={14} /> Manage</button>
                          </td>
                        )}
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// Superadmin: the platform's image engine. Codex makes the app's images with a ChatGPT
// plan; this signs the server in to it with OpenAI's one-time code (no shell needed)
// and makes a test image to prove it works.
function ImageEngine() {
  const [info, setInfo] = useState(null);
  const [login, setLogin] = useState(null); // { id, userCode, verificationUrl, interval, expiresAt }
  const [state, setState] = useState('');   // '' | 'starting' | 'waiting' | 'done' | 'expired' | 'error'
  const [test, setTest] = useState(null);
  const [testing, setTesting] = useState(false);
  const load = useCallback(() => adminGetImageEngine().then((r) => setInfo(r.data)).catch((err) => toast.error(errMsg(err))), []);
  useEffect(() => { load(); }, [load]);

  // While a code waits for approval, ask the server every few seconds whether it went through.
  useEffect(() => {
    if (!login || state !== 'waiting') return undefined;
    let timer;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        const r = await adminCheckCodexLogin(login.id);
        if (stopped) return;
        if (r.data.status === 'done') { setState('done'); toast.success(`Signed in${r.data.account?.email ? ` as ${r.data.account.email}` : ''}`); load(); return; }
        if (r.data.status === 'expired') { setState('expired'); return; }
      } catch (err) { if (!stopped) { setState('error'); toast.error(errMsg(err)); } return; }
      timer = setTimeout(tick, login.interval * 1000);
    };
    timer = setTimeout(tick, login.interval * 1000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [login, state, load]);

  const start = async () => {
    setState('starting'); setTest(null);
    try { const r = await adminStartCodexLogin(); setLogin(r.data); setState('waiting'); }
    catch (err) { setState('error'); toast.error(errMsg(err)); }
  };
  const copyCode = () => navigator.clipboard?.writeText(login.userCode).then(() => toast.success('Code copied'));
  const runTest = async () => {
    setTesting(true); setTest(null);
    try { const r = await adminTestImageEngine(); setTest(r.data); }
    catch (err) { setTest({ error: errMsg(err) }); }
    setTesting(false);
  };

  if (!info) return <div className="card"><div className="card-body"><div className="spinner" /></div></div>;
  const codex = info.codex || {};
  return (
    <>
      <div className="card mb-16">
        <div className="card-header"><h2><ImageIcon size={16} /> Image engine</h2></div>
        <div className="card-body">
          <p className="form-helper mb-16">
            Every AI image in the app (Instagram product posts, Studio posts, blog images) is made by this engine.
            It is <strong>{info.provider}</strong>{info.configured !== info.provider ? ` (setting: ${info.configured})` : ''}.
            {info.provider !== 'codex' && ' The ChatGPT sign-in below is only used when the server is set to Codex.'}
          </p>
          <table style={{ fontSize: 13, borderCollapse: 'collapse' }}>
            <tbody>
              <tr><td style={{ ...cell, color: 'var(--text-muted)' }}>ChatGPT sign-in</td><td style={cell}>{codex.signedIn ? <span className="badge badge-success">Signed in</span> : <span className="badge badge-danger">Not signed in</span>}</td></tr>
              {codex.signedIn && <>
                <tr><td style={{ ...cell, color: 'var(--text-muted)' }}>Account</td><td style={cell}>{codex.email || '—'}{codex.plan ? ` · ${codex.plan} plan` : ''}</td></tr>
                <tr><td style={{ ...cell, color: 'var(--text-muted)' }}>Access renewed</td><td style={cell}>{when(codex.lastRefresh)} (renews itself; valid until {when(codex.tokenExpiresAt)})</td></tr>
              </>}
              {!codex.signedIn && codex.detail && <tr><td style={{ ...cell, color: 'var(--text-muted)' }}>Detail</td><td style={cell}>{codex.detail}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card mb-16">
        <div className="card-header"><h2><LogIn size={16} /> Sign in with ChatGPT</h2></div>
        <div className="card-body">
          <p className="form-helper mb-16">
            Use a ChatGPT account whose plan includes image generation (Plus, Pro or Business). Its image limits are shared with
            that account's own ChatGPT use. You type your password only on OpenAI's page; the server keeps the sign-in, never your password.
          </p>
          {(state === 'waiting' && login) ? (
            <div>
              <div className="mb-16"><strong>1.</strong> Open OpenAI's sign-in page and log in with the ChatGPT account:{' '}
                <a className="btn btn-sm btn-primary" href={login.verificationUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Open sign-in page</a>
              </div>
              <div className="mb-16"><strong>2.</strong> Enter this one-time code there:
                <div className="flex items-center gap-8" style={{ marginTop: 8 }}>
                  <code style={{ fontSize: 26, letterSpacing: 4, padding: '6px 14px', border: '1px solid var(--border-color)', borderRadius: 8 }}>{login.userCode}</code>
                  <button className="btn btn-sm btn-ghost" onClick={copyCode}><Copy size={14} /> Copy</button>
                </div>
              </div>
              <div className="flex items-center gap-8"><Loader2 size={14} className="spinning" /> Waiting for you to approve it… (the code expires at {new Date(login.expiresAt).toLocaleTimeString()})
                <button className="btn btn-sm btn-ghost" onClick={() => { setState(''); setLogin(null); }}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-8" style={{ flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={start} disabled={state === 'starting'}>
                {state === 'starting' ? <Loader2 size={14} className="spinning" /> : <LogIn size={14} />} {codex.signedIn ? 'Sign in again (or with another account)' : 'Sign in with ChatGPT'}
              </button>
              {state === 'done' && <span style={{ color: 'var(--accent-success)' }}><CheckCircle2 size={14} /> Signed in. Make a test image to check it can draw.</span>}
              {state === 'expired' && <span className="form-helper">The code expired before it was approved. Start again.</span>}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2><ImageIcon size={16} /> Test</h2></div>
        <div className="card-body">
          <p className="form-helper mb-16">Makes one small image with the engine (uses one image from its limit) to prove it works.</p>
          <button className="btn btn-secondary" onClick={runTest} disabled={testing}>
            {testing ? <><Loader2 size={14} className="spinning" /> Drawing… (up to a minute)</> : 'Make a test image'}
          </button>
          {test?.image && <div style={{ marginTop: 16 }}><img src={test.image} alt="Test from the image engine" style={{ width: 220, borderRadius: 8 }} /><div style={{ ...muted, marginTop: 6 }}>Made by {test.provider}: the engine works.</div></div>}
          {test?.error && <div style={{ marginTop: 16, color: 'var(--accent-danger)' }}>The engine failed: {test.error}</div>}
        </div>
      </div>
    </>
  );
}

export default function Admin() {
  const { user: me } = useAuth();
  const isSuper = me?.role === 'superadmin';
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') || 'overview');
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
        <p>Who signed up, which plans they're on and how much they use{isSuper ? ' — superadmin: full control over workspaces, users and plans' : ''}</p>
      </div>

      <div className="flex gap-8 mb-24" style={{ flexWrap: 'wrap' }}>
        <Tab id="overview" label="Overview" />
        <Tab id="workspaces" label="Workspaces" count={workspaces.length} />
        <Tab id="users" label="Users" count={users.length} />
        {pendingUsers.length > 0 && <Tab id="pending" label="Pending users" count={pendingUsers.length} />}
        <Tab id="upgrades" label="Upgrade requests" count={requests.length} />
        <Tab id="activity" label="Activity" />
        <Tab id="roles" label="Roles & permissions" />
        {isSuper && <Tab id="engine" label="Image engine" />}
        <Tab id="create" label="+ Create user" />
      </div>

      {tab === 'overview' && <Overview onManage={(u) => setManaging(u)} />}
      {tab === 'engine' && isSuper && <ImageEngine />}

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
