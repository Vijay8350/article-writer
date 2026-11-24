import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Loader2, UserPlus, CheckCircle2, Ban, RotateCcw, Activity as ActivityIcon, Building2, KeyRound, Settings2, Copy, Trash2, Plus,
  ShieldCheck, LogIn, ExternalLink, Image as ImageIcon, Search, Users as UsersIcon, Inbox, Info, AlertTriangle, Check, Minus,
  ArrowUpCircle,
} from 'lucide-react';
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
  adminUpdatePlan, adminCreatePlan, adminGetWorkspacePlan, adminSetWorkspaceOverrides,
} from '../lib/api';
import { ColumnChart, BarList, Kpi, compact } from '../components/insights/Charts';
import { PageHeader, Sheet, Segmented, EmptyState, Section, Switch, SettingRow } from '../components/ui';
import '../styles/admin.css';

const STATUS_BADGE = { active: 'badge-success', pending: 'badge-warning', suspended: 'badge-danger' };
const ROLE_BADGE = { superadmin: 'badge-danger', admin: 'badge-warning', user: 'badge-purple' };
const PLAN_BADGE = { free: 'badge-info', pro: 'badge-purple', business: 'badge-success' };
const WORKSPACE_ROLES = ['owner', 'admin', 'member'];
const errMsg = (err) => err.response?.data?.error || 'Failed';

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

const Loading = () => <div className="empty-state"><div className="spinner spinner-lg" /></div>;

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
  ["Change a workspace's plan and give one customer their own features and limits", false, true, true],
  ['Edit what each plan includes, feature by feature; create plans', false, false, true],
  ['Suspend workspaces, handle upgrade requests', false, true, true],
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

const Mark = ({ value }) => {
  if (value === true) return <span className="admin-mark admin-mark--yes"><Check size={16} aria-hidden="true" /><span className="sr-only">Yes</span></span>;
  if (value) return <span className="admin-mark admin-mark--text">{value}</span>;
  return <span className="admin-mark admin-mark--no"><Minus size={16} aria-hidden="true" /><span className="sr-only">No</span></span>;
};

function PermissionTable({ title, description, columns, rows }) {
  return (
    <Section title={title} description={description} flush>
      <div className="table-container">
        <table className="data-table admin-table admin-perm-table">
          <thead>
            <tr>
              <th scope="col">Can…</th>
              {columns.map((c) => <th key={c} scope="col" className="admin-center">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, ...marks]) => (
              <tr key={label}>
                <td>{label}</td>
                {marks.map((m, i) => <td key={i} className="admin-center"><Mark value={m} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// One workspace's plan in the Manage panel: which plan, and this customer's own changes,
// feature by feature (anything left on "Plan" follows the plan as it is).
function WorkspacePlan({ workspaceId, plans, catalogue, canManage, onChanged }) {
  const [info, setInfo] = useState(null);
  const [feat, setFeat] = useState({});   // key → 'plan' | 'on' | 'off'
  const [lim, setLim] = useState({});     // key → { mode: 'plan' | 'custom' | 'unlimited', value }
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => adminGetWorkspacePlan(workspaceId).then((r) => {
    const d = r.data; setInfo(d);
    const o = d.overrides || {};
    setFeat(Object.fromEntries(catalogue.features.map((f) => [f.key, o.features && f.key in o.features ? (o.features[f.key] ? 'on' : 'off') : 'plan'])));
    setLim(Object.fromEntries(catalogue.limits.map((l) => {
      const has = o.limits && l.key in o.limits;
      return [l.key, { mode: !has ? 'plan' : o.limits[l.key] === null ? 'unlimited' : 'custom', value: has && o.limits[l.key] !== null ? String(o.limits[l.key]) : '' }];
    })));
  }).catch((err) => toast.error(errMsg(err))), [workspaceId, catalogue]);
  useEffect(() => { load(); }, [load]);
  if (!info) return <div className="admin-loading-sm"><div className="spinner" /></div>;

  const shown = (v) => (v === null || v === undefined ? 'unlimited' : v);
  const save = async (reset = false) => {
    const body = { features: {}, limits: {} };
    if (!reset) {
      for (const [k, v] of Object.entries(feat)) if (v !== 'plan') body.features[k] = v === 'on';
      for (const [k, v] of Object.entries(lim)) {
        if (v.mode === 'unlimited') body.limits[k] = null;
        else if (v.mode === 'custom') {
          if (v.value === '' || !/^\d+$/.test(v.value)) return toast.error('Enter a whole number for each custom limit');
          body.limits[k] = Number(v.value);
        }
      }
    }
    setSaving(true);
    try { const r = await adminSetWorkspaceOverrides(workspaceId, body); toast.success(r.message || 'Saved'); await load(); onChanged?.(); }
    catch (err) { toast.error(errMsg(err)); }
    setSaving(false);
    return undefined;
  };
  const changePlan = async (planId) => {
    setSaving(true);
    try { await adminSetWorkspacePlan(workspaceId, planId); toast.success('Plan changed'); await load(); onChanged?.(); }
    catch (err) { toast.error(errMsg(err)); }
    setSaving(false);
  };
  const custom = Object.values(feat).some((v) => v !== 'plan') || Object.values(lim).some((v) => v.mode !== 'plan');
  const planSelectId = `admin-ws-plan-${workspaceId}`;

  return (
    <div className="admin-plan-box">
      <div className="admin-plan-box__head">
        <label className="form-label" htmlFor={planSelectId}>Plan</label>
        <select id={planSelectId} className="form-select admin-inline-select" value={info.planId} disabled={!canManage || saving}
          onChange={(e) => changePlan(e.target.value)}>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name} · {rupees(p.price_inr)}/mo{p.is_active === false ? ' (not offered)' : ''}</option>)}
        </select>
        {custom && <span className="badge badge-warning">Custom for this customer</span>}
      </div>

      <div className="admin-plan-group">Features</div>
      <div className="admin-plan-rows">
        {catalogue.features.map((f) => (
          <SettingRow key={f.key} title={f.label} description={f.help}>
            <Segmented size="sm" ariaLabel={`${f.label} for this customer`} disabled={!canManage} value={feat[f.key]}
              onChange={(v) => setFeat((s) => ({ ...s, [f.key]: v }))}
              options={[
                { value: 'plan', label: `Plan (${info.plan.features[f.key] ? 'on' : 'off'})` },
                { value: 'on', label: 'On' },
                { value: 'off', label: 'Off' },
              ]} />
          </SettingRow>
        ))}
      </div>

      <div className="admin-plan-group">Limits</div>
      <div className="admin-plan-rows">
        {catalogue.limits.map((l) => (
          <SettingRow key={l.key} title={l.label} description={`Plan gives ${shown(info.plan.limits[l.key])}`}>
            <Segmented size="sm" ariaLabel={`${l.label} for this customer`} disabled={!canManage} value={lim[l.key]?.mode}
              onChange={(v) => setLim((s) => ({ ...s, [l.key]: { ...s[l.key], mode: v } }))}
              options={[
                { value: 'plan', label: 'Plan' },
                { value: 'custom', label: 'Custom' },
                ...(!l.metered ? [{ value: 'unlimited', label: 'Unlimited' }] : []),
              ]} />
            {lim[l.key]?.mode === 'custom' && (
              <input className="form-input admin-num-input" inputMode="numeric" value={lim[l.key].value}
                onChange={(e) => setLim((s) => ({ ...s, [l.key]: { ...s[l.key], value: e.target.value.replace(/\D/g, '') } }))} aria-label={`${l.label} custom value`} />
            )}
          </SettingRow>
        ))}
      </div>

      {canManage && (
        <div className="form-actions admin-plan-box__actions">
          {custom && <button className="btn btn-ghost btn-sm" disabled={saving} onClick={() => save(true)}><RotateCcw size={13} /> Back to the plan</button>}
          <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => save(false)}>{saving ? <Loader2 size={13} className="spinning" /> : <CheckCircle2 size={13} />} Save custom plan</button>
        </div>
      )}
    </div>
  );
}

// A plan as the editor holds it (strings for the number fields).
function planDraft(p, catalogue) {
  return {
    name: p.name, price_inr: String(p.price_inr ?? 0), price_usd: p.price_usd == null ? '' : String(Number(p.price_usd)), description: p.description || '', is_active: p.is_active !== false,
    features: { ...p.features },
    limits: Object.fromEntries(catalogue.limits.map((l) => [l.key, p.limits[l.key] === null || p.limits[l.key] === undefined ? '' : String(p.limits[l.key])])),
  };
}

// Whether the editor's copy of a plan differs from the saved plan (only for the "Unsaved changes" hint).
function draftChanged(d, p, catalogue) {
  if (!d || !catalogue) return false;
  const o = planDraft(p, catalogue);
  if (d.name !== o.name || d.price_inr !== o.price_inr || d.price_usd !== o.price_usd || d.description !== o.description || d.is_active !== o.is_active) return true;
  if (catalogue.features.some((f) => (d.features?.[f.key] !== false) !== (o.features[f.key] !== false))) return true;
  return catalogue.limits.some((l) => (d.limits?.[l.key] ?? '') !== o.limits[l.key]);
}

// The plans, feature by feature: a column per plan. Superadmins edit and add plans;
// a change applies to every workspace on that plan (customers' own changes still win).
function PlansEditor({ plans, catalogue, isSuper, onSaved }) {
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(null);
  const [np, setNp] = useState({ id: '', name: '', price_inr: '' });
  const [newOpen, setNewOpen] = useState(false);
  const closeNew = useCallback(() => setNewOpen(false), []);
  useEffect(() => {
    if (!catalogue) return;
    setDraft(Object.fromEntries(plans.map((p) => [p.id, planDraft(p, catalogue)])));
  }, [plans, catalogue]);
  if (!catalogue) return <Loading />;
  const set = (id, patch) => setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  const save = async (id) => {
    const d = draft[id];
    const limits = {};
    for (const l of catalogue.limits) {
      const v = d.limits[l.key];
      if (v === '' && l.metered) return toast.error(`${l.label} needs a number`);
      limits[l.key] = v === '' ? null : Number(v);
    }
    setBusy(id);
    try {
      const r = await adminUpdatePlan(id, { name: d.name, price_inr: Number(d.price_inr || 0), price_usd: d.price_usd === '' ? null : d.price_usd, description: d.description, is_active: d.is_active, features: d.features, limits });
      toast.success(r.message || 'Saved'); onSaved();
    } catch (err) { toast.error(errMsg(err)); }
    setBusy(null);
    return undefined;
  };
  const create = async (e) => {
    e.preventDefault();
    setBusy('new');
    try { const r = await adminCreatePlan({ id: np.id, name: np.name, price_inr: Number(np.price_inr || 0) }); toast.success(r.message || 'Plan created'); setNp({ id: '', name: '', price_inr: '' }); setNewOpen(false); onSaved(); }
    catch (err) { toast.error(errMsg(err)); }
    setBusy(null);
  };
  const ro = !isSuper;
  const cols = plans.length + 1;
  return (
    <>
      <div className="toolbar">
        <p className="admin-intro">
          What each plan includes, feature by feature. A change applies to every workspace on that plan straight away; switched-off
          features disappear from the customer's menu and stop their background jobs. To change it for one customer only, use
          <strong> Manage</strong> on their row in Overview.
        </p>
        {isSuper && <button className="btn btn-secondary" onClick={() => setNewOpen(true)}><Plus size={16} /> New plan</button>}
      </div>
      {ro && <div className="callout callout--info mb-16"><Info size={16} /><span>Only a superadmin can edit plans. You can see what each plan includes.</span></div>}

      <div className="card admin-plans">
        <div className="admin-plans__scroll">
          <table className="admin-plans__table">
            <thead>
              <tr>
                <th scope="col" className="admin-plans__corner">Plan</th>
                {plans.map((p) => {
                  const changed = isSuper && draftChanged(draft[p.id], p, catalogue);
                  return (
                    <th key={p.id} scope="col">
                      <div className="admin-plans__plan">
                        <span className={`badge ${PLAN_BADGE[p.id] || 'badge-info'}`}>{p.id}</span>
                        <span className="admin-sub">{p.workspaces} workspace{p.workspaces === 1 ? '' : 's'}</span>
                      </div>
                      {isSuper && (
                        <button className={`btn btn-sm ${changed ? 'btn-primary' : 'btn-secondary'}`} disabled={!!busy} onClick={() => save(p.id)}>
                          {busy === p.id ? <Loader2 size={13} className="spinning" /> : <CheckCircle2 size={13} />} Save {p.name}
                        </button>
                      )}
                      {changed && <div className="admin-plans__dirty">Unsaved changes</div>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Name</th>
                {plans.map((p) => <td key={p.id}><input className="form-input" disabled={ro} value={draft[p.id]?.name || ''} onChange={(e) => set(p.id, { name: e.target.value })} aria-label={`${p.id} name`} /></td>)}
              </tr>
              <tr>
                <th scope="row">Price (₹ / month)</th>
                {plans.map((p) => <td key={p.id}><input className="form-input" inputMode="numeric" disabled={ro} value={draft[p.id]?.price_inr || ''} onChange={(e) => set(p.id, { price_inr: e.target.value.replace(/\D/g, '') })} aria-label={`${p.id} price`} /></td>)}
              </tr>
              <tr>
                <th scope="row">Price on Shopify ($ / month)<div className="form-helper" style={{ fontWeight: 400 }}>Shopify Billing for stores outside India; blank = not sold there</div></th>
                {plans.map((p) => <td key={p.id}><input className="form-input" inputMode="decimal" disabled={ro || p.id === 'free'} placeholder={p.id === 'free' ? 'Free' : 'e.g. 12'} value={draft[p.id]?.price_usd || ''} onChange={(e) => set(p.id, { price_usd: e.target.value.replace(/[^\d.]/g, '') })} aria-label={`${p.id} price in US dollars`} /></td>)}
              </tr>
              <tr>
                <th scope="row">Short description</th>
                {plans.map((p) => <td key={p.id}><input className="form-input" disabled={ro} value={draft[p.id]?.description || ''} maxLength={300} onChange={(e) => set(p.id, { description: e.target.value })} aria-label={`${p.id} description`} /></td>)}
              </tr>
              <tr>
                <th scope="row">Offered to customers{plans.some((p) => p.id === 'free') && <span className="admin-sub">The free plan is always offered</span>}</th>
                {plans.map((p) => {
                  const on = draft[p.id]?.is_active ?? true;
                  return (
                    <td key={p.id}>
                      <div className="admin-switch-cell">
                        <Switch checked={on} disabled={ro || p.id === 'free'} onChange={(v) => set(p.id, { is_active: v })} label={`${p.id} offered`} />
                        <span>{on ? 'Offered' : 'Not offered'}</span>
                      </div>
                    </td>
                  );
                })}
              </tr>

              <tr className="admin-plans__group">
                <th scope="rowgroup" colSpan={cols}><span className="admin-plans__group-label">Limits <span className="admin-sub">Empty means unlimited, except the monthly ones</span></span></th>
              </tr>
              {catalogue.limits.map((l) => (
                <tr key={l.key}>
                  <th scope="row">{l.label}</th>
                  {plans.map((p) => (
                    <td key={p.id}>
                      <input className="form-input" inputMode="numeric" disabled={ro} placeholder={l.metered ? '' : 'unlimited'} value={draft[p.id]?.limits?.[l.key] ?? ''}
                        onChange={(e) => set(p.id, { limits: { ...draft[p.id].limits, [l.key]: e.target.value.replace(/\D/g, '') } })} aria-label={`${p.id} ${l.label}`} />
                    </td>
                  ))}
                </tr>
              ))}

              <tr className="admin-plans__group">
                <th scope="rowgroup" colSpan={cols}><span className="admin-plans__group-label">Features</span></th>
              </tr>
              {catalogue.features.map((f) => (
                <tr key={f.key}>
                  <th scope="row" title={f.help}>{f.label}{f.help && <span className="admin-sub">{f.help}</span>}</th>
                  {plans.map((p) => {
                    const on = draft[p.id]?.features?.[f.key] !== false;
                    return (
                      <td key={p.id}>
                        <div className="admin-switch-cell">
                          <Switch checked={on} disabled={ro} label={`${p.id}: ${f.label}`}
                            onChange={(v) => set(p.id, { features: { ...draft[p.id].features, [f.key]: v } })} />
                          <span>{on ? 'Included' : 'Not included'}</span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isSuper && (
        <Sheet open={newOpen} title="New plan" subtitle="It starts with every feature on, 10 articles and 20 AI images a month. Then set it up in the table."
          onClose={closeNew} busy={busy === 'new'} width={480}
          footer={(
            <>
              <button type="button" className="btn btn-ghost" onClick={closeNew} disabled={busy === 'new'}>Cancel</button>
              <button type="submit" form="admin-new-plan" className="btn btn-primary" disabled={!np.id || !np.name || busy === 'new'}>
                {busy === 'new' ? <Loader2 size={14} className="spinning" /> : <Plus size={14} />} Add plan
              </button>
            </>
          )}>
          <form id="admin-new-plan" onSubmit={create}>
            <div className="form-group">
              <label className="form-label" htmlFor="admin-np-id">Plan ID</label>
              <input id="admin-np-id" className="form-input" placeholder="e.g. starter" value={np.id} onChange={(e) => setNp({ ...np, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} />
              <div className="form-helper">Lowercase letters, numbers and dashes.</div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="admin-np-name">Name</label>
              <input id="admin-np-name" className="form-input" placeholder="e.g. Starter" value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="admin-np-price">Price (₹ / month)</label>
              <input id="admin-np-price" className="form-input" placeholder="0" inputMode="numeric" value={np.price_inr} onChange={(e) => setNp({ ...np, price_inr: e.target.value.replace(/\D/g, '') })} />
            </div>
          </form>
        </Sheet>
      )}
    </>
  );
}

// One user: their password, the workspaces they belong to, and each workspace's plan.
function UserPanel({ userId, workspaces, plans, catalogue, canManage, onClose, onChanged }) {
  const [planWs, setPlanWs] = useState(null);
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
  const planFor = detail ? (detail.workspaces.find((w) => w.id === planWs) || detail.workspaces[0] || null) : null;

  return (
    <Sheet open title={detail?.email || 'Manage user'} subtitle={detail?.name || undefined} onClose={onClose} width={640}
      footer={<button type="button" className="btn btn-secondary" onClick={onClose}>Done</button>}>
      {!detail ? <Loading /> : (
        <div className="admin-user">
          <div className="admin-user__badges">
            <span className={`badge ${STATUS_BADGE[detail.status]}`}>{detail.status}</span>
            <span className={`badge ${ROLE_BADGE[detail.role]}`}>{detail.role}</span>
          </div>
          {!canManage && <div className="callout callout--info"><Info size={16} /><span>Only a superadmin can change an admin or superadmin account.</span></div>}

          <section className="form-section">
            <h3 className="form-section__title"><KeyRound size={15} /> Password</h3>
            <p className="form-section__desc">There is no email, so give the new password to the user yourself.</p>
            <div className="admin-inline-form">
              <input className="form-input" type="text" autoComplete="new-password" placeholder="New password, or leave empty to generate one"
                aria-label="New password" value={password} disabled={!canManage || busy === 'password'} onChange={(e) => setPassword(e.target.value)} />
              <button className="btn btn-secondary" disabled={!canManage || busy === 'password'} onClick={savePassword}>
                {busy === 'password' ? <Loader2 size={14} className="spinning" /> : <KeyRound size={14} />} {password ? 'Set password' : 'Generate new password'}
              </button>
            </div>
            {generated && (
              <>
                <div className="pwd-box">
                  <code>{generated}</code>
                  <button className="btn btn-secondary btn-sm" onClick={() => { navigator.clipboard.writeText(generated); toast.success('Copied'); }}><Copy size={13} /> Copy</button>
                </div>
                <p className="form-helper">Shown once. Give it to the user; they can change it under Account after signing in.</p>
              </>
            )}
          </section>

          <section className="form-section">
            <h3 className="form-section__title"><Building2 size={15} /> Workspaces</h3>
            <p className="form-section__desc">The workspaces they belong to and their role in each.</p>
            {detail.workspaces.length === 0 ? <p className="admin-empty-line">Not in any workspace.</p> : (
              <div className="admin-box list">
                {detail.workspaces.map((w) => (
                  <div key={w.id} className="list-item">
                    <div className="list-item__main">
                      <div className="list-item__title">{w.name}</div>
                      <div className="list-item__meta"><span>{w.plan_id} plan</span><span>{w.status}</span></div>
                    </div>
                    <div className="list-item__actions">
                      <select className="form-select admin-inline-select" value={w.role}
                        disabled={!canManage || !!busy} aria-label={`Role in ${w.name}`}
                        onChange={(e) => run(`role-${w.id}`, () => adminSetWorkspaceRole(userId, w.id, e.target.value))}>
                        {WORKSPACE_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <button className="btn btn-ghost btn-sm admin-btn-danger" disabled={!canManage || !!busy} title="Remove from this workspace" aria-label={`Remove from ${w.name}`}
                        onClick={() => run(`remove-${w.id}`, () => adminRemoveFromWorkspace(userId, w.id))}>
                        {busy === `remove-${w.id}` ? <Loader2 size={13} className="spinning" /> : <Trash2 size={13} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {canManage && (
              <div className="admin-inline-form">
                <select className="form-select" value={addWs} onChange={(e) => setAddWs(e.target.value)} aria-label="Workspace to add to">
                  <option value="">{available.length ? 'Add to a workspace…' : 'Already in every workspace'}</option>
                  {available.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.owner_email || 'no owner'})</option>)}
                </select>
                <select className="form-select admin-inline-select" value={addRole} onChange={(e) => setAddRole(e.target.value)} aria-label="Role in that workspace">
                  {WORKSPACE_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <button className="btn btn-secondary" disabled={!addWs || !!busy}
                  onClick={async () => { if (await run('add', () => adminAddToWorkspace(userId, addWs, addRole))) setAddWs(''); }}>
                  {busy === 'add' ? <Loader2 size={14} className="spinning" /> : <Plus size={14} />} Add
                </button>
              </div>
            )}
          </section>

          {catalogue && (
            <section className="form-section">
              <h3 className="form-section__title"><Settings2 size={15} /> Plan &amp; features</h3>
              <p className="form-section__desc">
                {planFor && detail.workspaces.length === 1 ? <>For <strong>{planFor.name}</strong>. </> : null}
                The workspace's plan, and this customer's own features and limits. Anything left on "Plan" follows the plan.
              </p>
              {!planFor ? <p className="admin-empty-line">Add them to a workspace first.</p> : (
                <>
                  {detail.workspaces.length > 1 && (
                    <div className="form-group">
                      <label className="form-label" htmlFor="admin-plan-ws">Workspace</label>
                      <select id="admin-plan-ws" className="form-select" value={planFor.id} onChange={(e) => setPlanWs(e.target.value)}>
                        {detail.workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                      </select>
                    </div>
                  )}
                  <WorkspacePlan key={planFor.id} workspaceId={planFor.id} plans={plans} catalogue={catalogue} canManage onChanged={() => { load(); onChanged(); }} />
                </>
              )}
            </section>
          )}
        </div>
      )}
    </Sheet>
  );
}

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
  <span className={`admin-used${limit && used >= limit ? ' is-full' : ''}`}>{used} / {limit ?? '—'}</span>
);

// Overview: how many people signed up and use the app, which plans they're on, and every
// account with its plan and this month's usage. `onManage` opens an account's panel.
function Overview({ onManage, onOpenTab, onCreate }) {
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
  if (!data) return <Loading />;

  const u = data.users;
  const q = search.trim().toLowerCase();
  const shown = people.filter((p) => (!q || `${p.email} ${p.name || ''} ${p.workspaces.map((w) => w.name).join(' ')}`.toLowerCase().includes(q))
    && (!plan || p.workspaces.some((w) => w.plan_id === plan))
    && (!status || p.status === status));
  const planRows = data.plans.map((p) => ({ key: p.id, label: `${p.name} · ${rupees(p.price_inr)}/mo`, value: p.active }));
  const filtered = !!(q || plan || status);

  return (
    <>
      <div className="toolbar">
        <p className="admin-intro">Customers are accounts that signed up themselves (platform role "user"); your own admin accounts aren't counted.</p>
        <button className="btn btn-ghost btn-sm" onClick={load}><RotateCcw size={14} /> Refresh</button>
      </div>

      <div className="stat-row admin-stats" style={{ '--cols': 5 }}>
        <Kpi label="Customers" value={compact(u.total)} sub={`+${u.new_today} today · +${u.new_week} this week · +${u.new_month} in 30 days`} />
        <Kpi label="Active this week" value={compact(u.active_week)} sub={`${u.active_day} in the last 24 hours`} hint="Customers who signed in or did anything in the last 7 days" />
        <Kpi label="Paying workspaces" value={compact(data.paying)} sub={`of ${data.workspaces} workspaces · ${u.suspended} suspended accounts`} />
        <Kpi label="Monthly plan value" value={rupees(data.monthly_value_inr)} sub="active paid plans, at list price" />
        <Kpi label={`Used this month (${data.period})`} value={compact(data.usage.articles)} sub={`articles · ${compact(data.usage.ig_posts)} AI Instagram images`} />
      </div>

      {data.pending_upgrades > 0 && (
        <div className="callout callout--warning admin-callout">
          <AlertTriangle size={16} />
          <span className="admin-callout__text">{data.pending_upgrades} plan upgrade request{data.pending_upgrades === 1 ? '' : 's'} waiting for you.</span>
          <button className="btn btn-secondary btn-sm" onClick={() => onOpenTab('upgrades')}>Review requests</button>
        </div>
      )}

      <div className="grid-2 mb-24">
        <Section title="New sign-ups per day" actions={<span className="badge badge-info">30 days</span>}>
          {data.signups.length ? <ColumnChart data={signupDays(data.signups)} label="Day" valueLabel="Sign-ups" /> : <p className="admin-empty-line">No sign-ups in the last 30 days.</p>}
        </Section>
        <Section title="Active workspaces per plan">
          <BarList rows={planRows} total={planRows.reduce((n, r) => n + r.value, 0)} label="Workspaces per plan" />
          <div className="table-container admin-mini-table">
            <table className="data-table admin-table admin-table--compact">
              <thead><tr><th scope="col">Plan</th><th scope="col" className="num">Price</th><th scope="col" className="num">Articles / mo</th><th scope="col" className="num">AI images / mo</th></tr></thead>
              <tbody>{data.plans.map((p) => (
                <tr key={p.id}>
                  <td><span className={`badge ${PLAN_BADGE[p.id] || 'badge-info'}`}>{p.name}</span></td>
                  <td className="num">{rupees(p.price_inr)}</td><td className="num">{p.monthly_article_limit}</td><td className="num">{p.monthly_ig_post_limit}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Section>
      </div>

      <Section title={`Users & plans (${shown.length})`} description="Every account with its workspaces, plan and this month's usage." flush>
        <div className="admin-toolbar-pad">
          <div className="toolbar">
            <div className="admin-search">
              <Search size={15} aria-hidden="true" />
              <input className="form-input" type="search" placeholder="Search email, name or workspace" aria-label="Search accounts" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className="form-select" aria-label="Filter by plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
              <option value="">All plans</option>
              {data.plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <Segmented size="sm" ariaLabel="Filter by account status" value={status || 'all'} onChange={(v) => setStatus(v === 'all' ? '' : v)}
              options={[{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }]} />
          </div>
        </div>
        {!shown.length ? (
          filtered ? (
            <EmptyState icon={Search} title="No accounts match" text="Try another search, or clear the filters to see every account."
              action={<button className="btn btn-secondary" onClick={() => { setSearch(''); setPlan(''); setStatus(''); }}>Clear filters</button>} />
          ) : (
            <EmptyState icon={UsersIcon} title="No customers yet" text="Accounts appear here as soon as someone signs up."
              action={<button className="btn btn-secondary" onClick={onCreate}><UserPlus size={16} /> Create user</button>} />
          )
        ) : (
          <div className="table-container">
            <table className="data-table admin-table admin-customers">
              <thead><tr>
                <th scope="col">Account</th><th scope="col">Joined</th><th scope="col">Last sign-in</th>
                <th scope="col">Workspace and plan</th><th scope="col" className="num">Articles</th><th scope="col" className="num">AI images</th>
                <th scope="col">Connected</th><th scope="col"><span className="sr-only">Actions</span></th>
              </tr></thead>
              <tbody>
                {shown.map((p) => {
                  const rows = p.workspaces.length ? p.workspaces : [null];
                  return rows.map((w, k) => {
                    const g = k < rows.length - 1 ? ' is-grouped' : '';
                    return (
                      <tr key={`${p.id}-${w?.id || 'none'}`}>
                        {k === 0 && (
                          <>
                            <td rowSpan={rows.length}>
                              <div className="admin-cell-title">{p.name || p.email.split('@')[0]}</div>
                              <div className="admin-sub">{p.email}</div>
                              <div className="admin-badges">
                                <span className={`badge ${STATUS_BADGE[p.status] || ''}`}>{p.status}</span>
                                {p.role !== 'user' && <span className={`badge ${ROLE_BADGE[p.role] || ''}`}>{p.role}</span>}
                                {p.kind === 'shopify'
                                  ? <span className="badge badge-info" title="Installed the app from Shopify">Shopify app</span>
                                  : <span className="badge badge-purple" title="Signed up on the website">Website</span>}
                              </div>
                            </td>
                            <td rowSpan={rows.length} className="admin-nowrap">{day(p.created_at)}</td>
                            <td rowSpan={rows.length} title={when(p.last_login)} className="admin-nowrap">{ago(p.last_login)}</td>
                          </>
                        )}
                        {w ? (
                          <>
                            <td className={g.trim() || undefined}>
                              <div>{w.name}{w.role !== 'owner' && <span className="admin-sub"> ({w.role})</span>}</div>
                              <div className="admin-badges">
                                <span className={`badge ${PLAN_BADGE[w.plan_id] || 'badge-info'}`}>{w.plan_name || w.plan_id}{Number(w.price_inr) > 0 ? ` · ${rupees(w.price_inr)}` : ''}</span>
                                {w.status !== 'active' && <span className="badge badge-danger">{w.status}</span>}
                              </div>
                            </td>
                            <td className={`num${g}`}><Used used={w.articles_used} limit={w.articles_limit} /></td>
                            <td className={`num${g}`}><Used used={w.ig_used} limit={w.ig_limit} /></td>
                            <td className={g.trim() || undefined}>
                              <div className="admin-connected">
                                <span className={`status ${w.store ? 'status--on' : 'status--off'}`}>{w.store ? 'Shopify store' : 'No store'}</span>
                                <span className={`status ${w.instagram ? 'status--on' : 'status--off'}`}>{w.instagram ? `${w.instagram} Instagram` : 'No Instagram'}</span>
                              </div>
                            </td>
                          </>
                        ) : <td colSpan={4}><span className="admin-sub">No workspace</span></td>}
                        {k === 0 && (
                          <td rowSpan={rows.length}>
                            <div className="admin-row-actions">
                              <button className="btn btn-secondary btn-sm" onClick={() => onManage(p)}><Settings2 size={14} /> Manage</button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}

// Every account in a table: status, platform role, workspaces and the row's actions.
function UsersTable({ list, isSuper, me, busy, act, onManage }) {
  return (
    <div className="table-container">
      <table className="data-table admin-table">
        <thead>
          <tr>
            <th scope="col">Account</th>
            <th scope="col">Status</th>
            <th scope="col">Platform role</th>
            <th scope="col" className="num">Workspaces</th>
            <th scope="col"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {list.map((u) => (
            <tr key={u.id}>
              <td><div className="admin-cell-title">{u.email}</div>{u.name ? <div className="admin-sub">{u.name}</div> : null}</td>
              <td><span className={`badge ${STATUS_BADGE[u.status]}`}>{u.status}</span></td>
              <td>
                {isSuper && u.id !== me.id ? (
                  <select className="form-select admin-inline-select" aria-label={`Platform role for ${u.email}`}
                    value={u.role} disabled={busy === u.id}
                    onChange={(e) => act(adminSetRole, u.id, e.target.value)}>
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                    <option value="superadmin">superadmin</option>
                  </select>
                ) : <span className={`badge ${ROLE_BADGE[u.role]}`}>{u.role}</span>}
              </td>
              <td className="num">{u.workspace_count}</td>
              <td>
                <div className="admin-row-actions">
                  {u.status === 'pending' && (
                    <button className="btn btn-success btn-sm" disabled={busy === u.id} onClick={() => act(adminApproveUser, u.id)}>
                      <CheckCircle2 size={13} /> Approve
                    </button>
                  )}
                  {u.status === 'active' && u.id !== me.id && (
                    <button className="btn btn-ghost btn-sm admin-btn-danger" disabled={busy === u.id} onClick={() => act(adminSuspendUser, u.id)}>
                      <Ban size={13} /> Suspend
                    </button>
                  )}
                  {u.status === 'suspended' && (
                    <button className="btn btn-ghost btn-sm" disabled={busy === u.id} onClick={() => act(adminReactivateUser, u.id)}>
                      <RotateCcw size={13} /> Reactivate
                    </button>
                  )}
                  <button className="btn btn-secondary btn-sm" onClick={() => onManage(u)} title="Password and workspaces">
                    <Settings2 size={13} /> Manage
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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

  if (!info) return <Loading />;
  const codex = info.codex || {};
  const waiting = state === 'waiting' && !!login;
  const done = state === 'done';
  const stepClass = (n) => {
    const current = waiting ? 2 : done ? 4 : 1;
    if (n < current) return 'is-done';
    return n === current ? 'is-active' : undefined;
  };

  return (
    <div className="stack">
      <div className="card">
        <div className="status-card">
          <div className={`status-card__icon${codex.signedIn ? ' is-on' : ''}`}><ImageIcon size={20} /></div>
          <div className="status-card__main">
            <div className="status-card__title">
              Image engine
              <span className={`status ${codex.signedIn ? 'status--on' : 'status--error'}`}>{codex.signedIn ? 'Signed in to ChatGPT' : 'Not signed in to ChatGPT'}</span>
            </div>
            <div className="status-card__text">Every AI image in the app (Instagram product posts, Studio posts, blog images) is made by this engine.</div>
          </div>
        </div>
        <div className="card-body admin-engine-kv">
          <dl className="kv">
            <dt>Engine</dt>
            <dd><strong>{info.provider}</strong>{info.configured !== info.provider ? ` (setting: ${info.configured})` : ''}</dd>
            {codex.signedIn && <>
              <dt>Account</dt>
              <dd>{codex.email || '—'}{codex.plan ? ` · ${codex.plan} plan` : ''}</dd>
              <dt>Access renewed</dt>
              <dd>{when(codex.lastRefresh)} (renews itself; valid until {when(codex.tokenExpiresAt)})</dd>
            </>}
            {!codex.signedIn && codex.detail && <>
              <dt>Detail</dt>
              <dd>{codex.detail}</dd>
            </>}
          </dl>
          {info.provider !== 'codex' && (
            <div className="callout callout--info mt-16"><Info size={16} /><span>The ChatGPT sign-in below is only used when the server is set to Codex.</span></div>
          )}
        </div>
      </div>

      <Section title="Sign in with ChatGPT"
        description="Use a ChatGPT account whose plan includes image generation (Plus, Pro or Business). Its image limits are shared with that account's own ChatGPT use.">
        <ol className="steps-list admin-steps">
          <li className={stepClass(1)}>
            <div>
              <div className="admin-step__title">Get a one-time code</div>
              {waiting ? <div className="admin-step__text">Code ready. It expires at {new Date(login.expiresAt).toLocaleTimeString()}.</div> : (
                <div className="admin-step__body">
                  <button className="btn btn-primary" onClick={start} disabled={state === 'starting'}>
                    {state === 'starting' ? <Loader2 size={14} className="spinning" /> : <LogIn size={14} />} {codex.signedIn ? 'Sign in again (or with another account)' : 'Sign in with ChatGPT'}
                  </button>
                </div>
              )}
            </div>
          </li>
          <li className={stepClass(2)}>
            <div>
              <div className="admin-step__title">Sign in at OpenAI and enter the code</div>
              <div className="admin-step__text">You type your password only on OpenAI's page; the server keeps the sign-in, never your password.</div>
              {waiting && (
                <div className="admin-step__body">
                  <a className="btn btn-sm btn-primary" href={login.verificationUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Open sign-in page</a>
                  <div className="admin-code-row">
                    <code className="admin-code">{login.userCode}</code>
                    <button className="btn btn-sm btn-ghost" onClick={copyCode}><Copy size={14} /> Copy</button>
                  </div>
                  <div className="admin-waiting">
                    <Loader2 size={14} className="spinning" /> Waiting for you to approve it…
                    <button className="btn btn-sm btn-ghost" onClick={() => { setState(''); setLogin(null); }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </li>
          <li className={stepClass(3)}>
            <div>
              <div className="admin-step__title">Done</div>
              {!done && state !== 'expired' && state !== 'error' && <div className="admin-step__text">This page notices by itself when you approve the code.</div>}
              {(done || state === 'expired' || state === 'error') && (
                <div className="admin-step__body">
                  {done && <div className="callout callout--success"><CheckCircle2 size={16} /><span>Signed in. Make a test image to check it can draw.</span></div>}
                  {state === 'expired' && <div className="callout callout--warning"><AlertTriangle size={16} /><span>The code expired before it was approved. Start again.</span></div>}
                  {state === 'error' && <div className="callout callout--danger"><AlertTriangle size={16} /><span>Sign-in didn't go through. Start again to get a new code.</span></div>}
                </div>
              )}
            </div>
          </li>
        </ol>
      </Section>

      <Section title="Test the engine" description="Makes one small image with the engine (uses one image from its limit) to prove it works.">
        <button className="btn btn-secondary" onClick={runTest} disabled={testing}>
          {testing ? <><Loader2 size={14} className="spinning" /> Drawing… (up to a minute)</> : <><ImageIcon size={14} /> Make a test image</>}
        </button>
        {test?.image && (
          <div className="admin-test-image">
            <img src={test.image} alt="Test from the image engine" />
            <div className="callout callout--success"><CheckCircle2 size={16} /><span>Made by {test.provider}: the engine works.</span></div>
          </div>
        )}
        {test?.error && <div className="admin-test-image"><div className="callout callout--danger"><AlertTriangle size={16} /><span>The engine failed: {test.error}</span></div></div>}
      </Section>
    </div>
  );
}

export default function Admin() {
  const { user: me } = useAuth();
  const isSuper = me?.role === 'superadmin';
  const [params] = useSearchParams();
  // ?tab=create (the old "Create user" tab) opens the create-user panel instead.
  const [tab, setTab] = useState(() => { const t = params.get('tab'); return t && t !== 'create' ? t : 'overview'; });
  const [createOpen, setCreateOpen] = useState(() => params.get('tab') === 'create');
  useEffect(() => {
    const t = params.get('tab');
    if (t === 'create') setCreateOpen(true);
    else if (t) setTab(t);
  }, [params]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [plans, setPlans] = useState([]);
  const [catalogue, setCatalogue] = useState(null);
  const [requests, setRequests] = useState([]);
  const [activity, setActivity] = useState([]);
  const [busy, setBusy] = useState(null);

  // List filters (kept here so they survive the refresh after an action)
  const [userSearch, setUserSearch] = useState('');
  const [userStatus, setUserStatus] = useState('all');
  const [wsSearch, setWsSearch] = useState('');
  const [wsStatus, setWsStatus] = useState('all');

  const EMPTY_USER = { email: '', password: '', name: '', role: 'user', workspaceId: '', workspaceRole: 'member' };
  const [nu, setNu] = useState(EMPTY_USER);
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState(null);
  const closePanel = useCallback(() => setManaging(null), []);
  const openCreate = useCallback(() => setCreateOpen(true), []);
  const closeCreate = useCallback(() => setCreateOpen(false), []);
  // An admin manages ordinary users; a superadmin manages everyone.
  const canManageUser = (u) => isSuper || u.role === 'user';

  // `quiet` refreshes the lists without the spinner, so an open panel stays put.
  const loadAll = (quiet) => {
    if (quiet !== true) setLoading(true);
    Promise.all([adminGetUsers(), adminGetWorkspaces(), adminGetPlans(), adminGetUpgradeRequests(), adminGetActivity()])
      .then(([u, w, p, r, a]) => {
        setUsers(u.data || []);
        setWorkspaces(w.data || []);
        setPlans(p.data || []);
        setCatalogue(p.catalogue || null);
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
    if (!nu.email || nu.password.length < 8) return toast.error('Enter an email and a password of at least 8 characters');
    setCreating(true);
    try {
      await adminCreateUser({ ...nu, workspaceId: nu.workspaceId || undefined });
      const ws = workspaces.find((w) => w.id === nu.workspaceId);
      toast.success(ws ? `User created and added to ${ws.name} as ${nu.workspaceRole}` : 'User created with a personal workspace');
      setNu(EMPTY_USER);
      setCreateOpen(false);
      loadAll();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    setCreating(false);
    return undefined;
  };

  const pendingUsers = users.filter((u) => u.status === 'pending');

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'plans', label: 'Plans' },
    { id: 'workspaces', label: 'Workspaces', count: workspaces.length },
    { id: 'users', label: 'Users', count: users.length },
    pendingUsers.length > 0 && { id: 'pending', label: 'Pending users', count: pendingUsers.length, alert: true },
    { id: 'upgrades', label: 'Upgrade requests', count: requests.length, alert: true },
    { id: 'activity', label: 'Activity' },
    { id: 'roles', label: 'Roles & permissions' },
    isSuper && { id: 'engine', label: 'Image engine' },
  ].filter(Boolean);

  // Users tab: search + status filter (client-side)
  const uq = userSearch.trim().toLowerCase();
  const countBy = (list, s) => list.filter((x) => x.status === s).length;
  const shownUsers = tab === 'pending' ? pendingUsers : users.filter((u) => (!uq || `${u.email} ${u.name || ''}`.toLowerCase().includes(uq))
    && (userStatus === 'all' || u.status === userStatus));
  const userFiltered = tab === 'users' && !!(uq || userStatus !== 'all');

  // Workspaces tab: search + status filter (client-side)
  const wq = wsSearch.trim().toLowerCase();
  const shownWorkspaces = workspaces.filter((w) => (!wq || `${w.name} ${w.slug || ''} ${w.owner_email || ''}`.toLowerCase().includes(wq))
    && (wsStatus === 'all' || w.status === wsStatus));
  const wsFiltered = !!(wq || wsStatus !== 'all');

  return (
    <div className="page-container fade-in">
      <PageHeader
        title="Admin Console"
        subtitle="Who signed up, which plans they're on and how much they use."
        actions={<button className="btn btn-primary" onClick={openCreate}><UserPlus size={16} /> Create user</button>}
      />

      <div className="tabs" role="tablist" aria-label="Admin sections">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
            {t.count ? <span className={`admin-tab-count${t.alert ? ' is-alert' : ''}`}>{t.count}</span> : null}
          </button>
        ))}
      </div>

      {loading ? <Loading /> : (
        <>
          {tab === 'overview' && <Overview onManage={(u) => setManaging(u)} onOpenTab={setTab} onCreate={openCreate} />}
          {tab === 'plans' && <PlansEditor plans={plans} catalogue={catalogue} isSuper={isSuper} onSaved={() => loadAll(true)} />}
          {tab === 'engine' && isSuper && <ImageEngine />}

          {/* ROLES & PERMISSIONS */}
          {tab === 'roles' && (
            <div className="stack">
              <div className="callout callout--info">
                <ShieldCheck size={16} />
                <span>
                  Two kinds of role. A <strong>platform role</strong> decides who runs this Admin console. A
                  <strong> workspace role</strong> decides what someone can do inside one workspace (a store). One person can be an owner in
                  one workspace and a member in another.
                </span>
              </div>
              <PermissionTable title="Platform roles" description="Who can run this Admin console, and how much of it." columns={['User', 'Admin', 'Superadmin']} rows={PLATFORM_PERMISSIONS} />
              <PermissionTable title="Workspace roles" description="What someone can do inside one workspace." columns={['Member', 'Admin', 'Owner']} rows={WORKSPACE_PERMISSIONS} />
            </div>
          )}

          {/* WORKSPACES */}
          {tab === 'workspaces' && (
            <Section title="Workspaces" description="Each workspace is one customer's store, with its plan, usage and members." flush>
              {workspaces.length > 0 && (
                <div className="admin-toolbar-pad">
                  <div className="toolbar">
                    <div className="admin-search">
                      <Search size={15} aria-hidden="true" />
                      <input className="form-input" type="search" placeholder="Search name or owner" aria-label="Search workspaces" value={wsSearch} onChange={(e) => setWsSearch(e.target.value)} />
                    </div>
                    <Segmented size="sm" ariaLabel="Filter by workspace status" value={wsStatus} onChange={setWsStatus}
                      options={[
                        { value: 'all', label: `All (${workspaces.length})` },
                        { value: 'active', label: `Active (${countBy(workspaces, 'active')})` },
                        { value: 'suspended', label: `Suspended (${countBy(workspaces, 'suspended')})` },
                      ]} />
                  </div>
                </div>
              )}
              {shownWorkspaces.length === 0 ? (
                wsFiltered ? (
                  <EmptyState icon={Search} title="No workspaces match" text="Try another search or status."
                    action={<button className="btn btn-secondary" onClick={() => { setWsSearch(''); setWsStatus('all'); }}>Clear filters</button>} />
                ) : (
                  <EmptyState icon={Building2} title="No workspaces yet" text="Every new account gets a workspace of its own, and it shows up here."
                    action={<button className="btn btn-secondary" onClick={openCreate}><UserPlus size={16} /> Create user</button>} />
                )
              ) : (
                <div className="table-container">
                  <table className="data-table admin-table">
                    <thead>
                      <tr>
                        <th scope="col">Workspace</th>
                        <th scope="col">Owner</th>
                        <th scope="col">Status</th>
                        <th scope="col">Plan</th>
                        <th scope="col" className="num">Articles this month</th>
                        <th scope="col" className="num">Members</th>
                        <th scope="col"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {shownWorkspaces.map((w) => (
                        <tr key={w.id}>
                          <td><div className="admin-cell-title">{w.name}</div><div className="admin-sub">{w.slug}</div></td>
                          <td>{w.owner_email || <span className="admin-sub">No owner</span>}</td>
                          <td><span className={`badge ${STATUS_BADGE[w.status]}`}>{w.status}</span></td>
                          <td>
                            <select className="form-select admin-inline-select" aria-label={`Plan for ${w.name}`}
                              value={w.plan_id} disabled={busy === w.id}
                              onChange={(e) => act(adminSetWorkspacePlan, w.id, e.target.value)}>
                              {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          </td>
                          <td className="num"><Used used={w.used} limit={w.monthly_article_limit} /></td>
                          <td className="num">{w.member_count}</td>
                          <td>
                            <div className="admin-row-actions">
                              {w.status === 'active' ? (
                                <button className="btn btn-ghost btn-sm admin-btn-danger" disabled={busy === w.id} onClick={() => act(adminSuspendWorkspace, w.id)}>
                                  <Ban size={13} /> Suspend
                                </button>
                              ) : (
                                <button className="btn btn-secondary btn-sm" disabled={busy === w.id} onClick={() => act(adminReactivateWorkspace, w.id)}>
                                  <RotateCcw size={13} /> Reactivate
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          )}

          {/* USERS */}
          {(tab === 'users' || tab === 'pending') && (
            <Section
              title={tab === 'pending' ? 'Pending sign-ups' : 'All users'}
              description={tab === 'pending' ? 'Accounts from the old approval flow that are still waiting. Approve them to let them in.' : 'Every account on the platform, including admins.'}
              flush
            >
              {tab === 'users' && users.length > 0 && (
                <div className="admin-toolbar-pad">
                  <div className="toolbar">
                    <div className="admin-search">
                      <Search size={15} aria-hidden="true" />
                      <input className="form-input" type="search" placeholder="Search email or name" aria-label="Search users" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} />
                    </div>
                    <Segmented size="sm" ariaLabel="Filter by account status" value={userStatus} onChange={setUserStatus}
                      options={[
                        { value: 'all', label: `All (${users.length})` },
                        { value: 'active', label: `Active (${countBy(users, 'active')})` },
                        { value: 'pending', label: `Pending (${pendingUsers.length})` },
                        { value: 'suspended', label: `Suspended (${countBy(users, 'suspended')})` },
                      ]} />
                  </div>
                </div>
              )}
              {shownUsers.length === 0 ? (
                tab === 'pending' ? (
                  <EmptyState icon={CheckCircle2} title="No pending sign-ups" text="Sign-up is open, so new accounts are active straight away."
                    action={<button className="btn btn-secondary" onClick={() => setTab('users')}>See all users</button>} />
                ) : userFiltered ? (
                  <EmptyState icon={Search} title="No users match" text="Try another search or status."
                    action={<button className="btn btn-secondary" onClick={() => { setUserSearch(''); setUserStatus('all'); }}>Clear filters</button>} />
                ) : (
                  <EmptyState icon={UsersIcon} title="No users yet" text="Accounts appear here when people sign up or you create one."
                    action={<button className="btn btn-secondary" onClick={openCreate}><UserPlus size={16} /> Create user</button>} />
                )
              ) : (
                <UsersTable list={shownUsers} isSuper={isSuper} me={me} busy={busy} act={act} onManage={(u) => setManaging(u)} />
              )}
            </Section>
          )}

          {/* UPGRADE REQUESTS */}
          {tab === 'upgrades' && (
            <Section title="Upgrade requests" description="Workspaces asking for a bigger plan. Approving moves the workspace to that plan straight away." flush>
              {requests.length === 0 ? (
                <EmptyState icon={Inbox} title="No upgrade requests" text="When a workspace asks for a bigger plan, the request waits here for you to approve or reject."
                  action={<button className="btn btn-secondary" onClick={() => setTab('workspaces')}>See workspaces</button>} />
              ) : (
                <div className="list">
                  {requests.map((r) => (
                    <div key={r.id} className="list-item">
                      <div className="list-item__media"><ArrowUpCircle size={20} aria-hidden="true" /></div>
                      <div className="list-item__main">
                        <div className="list-item__title">
                          {r.workspace_name}
                          <span className="badge badge-info admin-cap">{r.requested_plan}</span>
                        </div>
                        <div className="list-item__meta">
                          <span>Asked by {r.requester_email}</span>
                          <span>{new Date(r.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="list-item__actions">
                        <button className="btn btn-ghost btn-sm" disabled={busy === r.id} onClick={() => act(adminRejectUpgrade, r.id)}>Reject</button>
                        <button className="btn btn-success btn-sm" disabled={busy === r.id} onClick={() => act(adminApproveUpgrade, r.id)}><CheckCircle2 size={13} /> Approve</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          )}

          {/* ACTIVITY */}
          {tab === 'activity' && (
            <Section title="Recent activity" description="Sign-ins and changes across the platform, newest first." flush>
              {activity.length === 0 ? (
                <EmptyState icon={ActivityIcon} title="No activity yet" text="Sign-ins and admin changes appear here as they happen." />
              ) : (
                <div className="table-container">
                  <table className="data-table admin-table">
                    <thead>
                      <tr><th scope="col">When</th><th scope="col">Account</th><th scope="col">Action</th><th scope="col">Detail</th></tr>
                    </thead>
                    <tbody>
                      {activity.map((a) => (
                        <tr key={a.id}>
                          <td className="admin-nowrap">{new Date(a.created_at).toLocaleString()}</td>
                          <td>{a.email || '—'}</td>
                          <td><span className="badge badge-purple">{a.action}</span></td>
                          <td className="admin-wrap">{a.detail || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          )}
        </>
      )}

      {/* CREATE USER */}
      <Sheet open={createOpen} title="Create user" subtitle="There is no email, so give them their password yourself."
        onClose={closeCreate} busy={creating} width={560}
        footer={(
          <>
            <button type="button" className="btn btn-ghost" onClick={closeCreate} disabled={creating}>Cancel</button>
            <button type="submit" form="admin-create-user" className="btn btn-primary" disabled={creating}>
              {creating ? <><Loader2 size={16} className="spinning" /> Creating…</> : <><UserPlus size={16} /> Create user</>}
            </button>
          </>
        )}>
        <form id="admin-create-user" onSubmit={createUser}>
          <div className="form-section">
            <div className="form-section__title">Account</div>
            <div className="form-section__desc">How they sign in.</div>
            <div className="form-grid">
              <div className="form-group span-all">
                <label className="form-label" htmlFor="admin-nu-email">Email</label>
                <input id="admin-nu-email" className="form-input" type="email" autoComplete="off" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="admin-nu-password">Password</label>
                <input id="admin-nu-password" className="form-input" type="text" autoComplete="new-password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} />
                <div className="form-helper">At least 8 characters.</div>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="admin-nu-name">Name (optional)</label>
                <input id="admin-nu-name" className="form-input" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} />
              </div>
            </div>
          </div>
          <div className="form-section">
            <div className="form-section__title">Access</div>
            <div className="form-section__desc">Their platform role and the workspace they join.</div>
            <div className="form-grid">
              <div className="form-group span-all">
                <label className="form-label" htmlFor="admin-nu-role">Platform role</label>
                <select id="admin-nu-role" className="form-select" value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}>
                  <option value="user">user</option>
                  {isSuper && <option value="admin">admin</option>}
                  {isSuper && <option value="superadmin">superadmin</option>}
                </select>
                <div className="form-helper">Almost everyone should be "user"; see Roles &amp; permissions.</div>
              </div>
              <div className="form-group span-all">
                <label className="form-label" htmlFor="admin-nu-ws">Workspace</label>
                <select id="admin-nu-ws" className="form-select" value={nu.workspaceId} onChange={(e) => setNu({ ...nu, workspaceId: e.target.value })}>
                  <option value="">A new workspace of their own</option>
                  {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.owner_email || 'no owner'})</option>)}
                </select>
              </div>
              {nu.workspaceId && (
                <div className="form-group span-all">
                  <label className="form-label" htmlFor="admin-nu-ws-role">Role in that workspace</label>
                  <select id="admin-nu-ws-role" className="form-select" value={nu.workspaceRole} onChange={(e) => setNu({ ...nu, workspaceRole: e.target.value })}>
                    {WORKSPACE_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>
        </form>
      </Sheet>

      {managing && (
        <UserPanel userId={managing.id} workspaces={workspaces} plans={plans} catalogue={catalogue} canManage={canManageUser(managing)} onClose={closePanel} onChanged={() => loadAll(true)} />
      )}
    </div>
  );
}
