import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Trash2, Loader2, Copy, RefreshCw, Mail, KeyRound, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { getMembers, getInvitations, createInvitation, revokeInvitation, setMemberRole, removeMember, resetMemberPassword } from '../lib/api';

const ROLE_BADGE = { owner: 'badge-danger', admin: 'badge-warning', member: 'badge-purple' };

export default function Members() {
  const { user: me, activeWorkspace, activeRole } = useAuth();
  const canManage = activeRole === 'owner' || activeRole === 'admin';
  const isOwner = activeRole === 'owner';
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [inviting, setInviting] = useState(false);
  const [lastInvite, setLastInvite] = useState(null);
  const [resetResult, setResetResult] = useState(null); // { email, tempPassword }

  const load = () => {
    setLoading(true);
    Promise.all([getMembers(), getInvitations().catch(() => ({ data: [] }))])
      .then(([m, i]) => { setMembers(m.data || []); setInvitations(i.data || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, [activeWorkspace?.id]);

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!email.trim()) return toast.error('Enter an email');
    setInviting(true);
    try {
      const res = await createInvitation(email.trim(), role);
      const url = `${window.location.origin}${res.data.acceptUrl}`;
      setLastInvite({ email: email.trim(), url });
      toast.success('Invitation created');
      setEmail('');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
    setInviting(false);
  };

  const act = async (fn, ...args) => {
    setBusy(args[0]);
    try { await fn(...args); toast.success('Done'); load(); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    setBusy(null);
  };

  const handleReset = async (member) => {
    if (!window.confirm(`Reset password for ${member.email}?\n\nThis changes their account login. You'll see the new password ONCE — share it with them securely.`)) return;
    setBusy(member.user_id);
    try {
      const res = await resetMemberPassword(member.user_id);
      setResetResult(res.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
    setBusy(null);
  };

  if (loading) return <div className="page-container"><div className="empty-state"><div className="spinner spinner-lg" /></div></div>;

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <h1>👥 Members</h1>
        <p>People in <strong>{activeWorkspace?.name}</strong></p>
      </div>

      {canManage && (
        <div className="card mb-24" style={{ maxWidth: 700 }}>
          <div className="card-header"><h2><UserPlus size={16} /> Invite a teammate</h2></div>
          <div className="card-body">
            <form onSubmit={handleInvite}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 12, alignItems: 'end' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="teammate@example.com" />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Role</label>
                  <select className="form-select" value={role} onChange={e => setRole(e.target.value)}>
                    <option value="member">Member</option>
                    {isOwner && <option value="admin">Admin</option>}
                  </select>
                </div>
                <button className="btn btn-primary" type="submit" disabled={inviting}>
                  {inviting ? <Loader2 size={16} className="spinning" /> : <Mail size={16} />} Invite
                </button>
              </div>
            </form>

            {lastInvite && (
              <div style={{ marginTop: 16, padding: 12, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: 13, marginBottom: 6 }}>
                  Share this link with <strong>{lastInvite.email}</strong> (email delivery comes later):
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <code style={{ flex: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lastInvite.url}</code>
                  <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard.writeText(lastInvite.url); toast.success('Copied'); }}>
                    <Copy size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="card mb-24">
        <div className="card-header">
          <h2>Members ({members.length})</h2>
          <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={14} /></button>
        </div>
        <div className="card-body" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '8px' }}>Email</th>
                <th style={{ padding: '8px' }}>Role</th>
                <th style={{ padding: '8px' }}>Joined</th>
                <th style={{ padding: '8px' }}></th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.user_id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <td style={{ padding: '8px' }}>{m.email}{m.name ? <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{m.name}</div> : null}</td>
                  <td style={{ padding: '8px' }}>
                    {isOwner && m.user_id !== me.id ? (
                      <select className="form-select" style={{ padding: '4px 8px', fontSize: 12 }}
                        value={m.role} disabled={busy === m.user_id}
                        onChange={e => act(setMemberRole, m.user_id, e.target.value)}>
                        <option value="owner">owner</option>
                        <option value="admin">admin</option>
                        <option value="member">member</option>
                      </select>
                    ) : <span className={`badge ${ROLE_BADGE[m.role]}`}>{m.role}</span>}
                  </td>
                  <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{new Date(m.created_at).toLocaleDateString()}</td>
                  <td style={{ padding: '8px' }}>
                    <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
                      {canManage && m.user_id !== me.id && (m.role === 'member' || isOwner) && (
                        <button className="btn btn-ghost btn-sm" disabled={busy === m.user_id} onClick={() => handleReset(m)} title="Reset password">
                          <KeyRound size={14} />
                        </button>
                      )}
                      {canManage && m.user_id !== me.id && m.role !== 'owner' && (
                        <button className="btn btn-ghost btn-sm" disabled={busy === m.user_id} onClick={() => {
                          if (window.confirm(`Remove ${m.email} from this workspace?`)) act(removeMember, m.user_id);
                        }} title="Remove">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {canManage && invitations.length > 0 && (
        <div className="card">
          <div className="card-header"><h2>Pending invitations</h2></div>
          <div className="card-body" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                {invitations.filter(i => !i.accepted_at).map(i => (
                  <tr key={i.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <td style={{ padding: '8px' }}>{i.email}</td>
                    <td style={{ padding: '8px' }}><span className={`badge ${ROLE_BADGE[i.role]}`}>{i.role}</span></td>
                    <td style={{ padding: '8px', color: 'var(--text-muted)' }}>expires {new Date(i.expires_at).toLocaleDateString()}</td>
                    <td style={{ padding: '8px' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => act(revokeInvitation, i.id)}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* Temp-password modal — shown ONCE after a reset */}
      {resetResult && (
        <div className="pwd-modal" role="dialog" aria-modal="true">
          <div className="pwd-modal__card">
            <button className="pwd-modal__close" onClick={() => setResetResult(null)} aria-label="Close"><X size={18} /></button>
            <h3 style={{ marginBottom: 8 }}>🔐 New password for {resetResult.email}</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
              {resetResult.notice}
            </p>
            <div className="pwd-modal__box">
              <code>{resetResult.tempPassword}</code>
              <button className="btn btn-secondary btn-sm" onClick={() => {
                navigator.clipboard.writeText(resetResult.tempPassword);
                toast.success('Copied');
              }}><Copy size={14} /> Copy</button>
            </div>
            <p style={{ color: 'var(--accent-warning)', fontSize: 12, marginTop: 16 }}>
              ⚠ This password is shown ONCE. After you close this dialog you won't see it again — copy it now.
            </p>
            <button className="btn btn-primary w-full" style={{ marginTop: 14 }} onClick={() => setResetResult(null)}>I've shared it</button>
          </div>
        </div>
      )}
      <style>{`
        .spinning { animation: spin 1s linear infinite; }
        .pwd-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 16px; }
        .pwd-modal__card { background: var(--bg-tertiary); border: 1px solid var(--border-primary); border-radius: var(--radius-lg); padding: 24px; max-width: 460px; width: 100%; position: relative; box-shadow: var(--shadow-lg); }
        .pwd-modal__close { position: absolute; top: 12px; right: 12px; background: transparent; border: 0; color: var(--text-muted); cursor: pointer; padding: 6px; border-radius: 6px; }
        .pwd-modal__close:hover { color: var(--text-primary); }
        .pwd-modal__box { display: flex; align-items: center; gap: 10px; padding: 12px 14px; background: var(--bg-input); border: 1px solid var(--border-primary); border-radius: var(--radius-md); }
        .pwd-modal__box code { flex: 1; font-family: 'JetBrains Mono', monospace; font-size: 15px; letter-spacing: 0.5px; color: var(--text-accent); user-select: all; }
      `}</style>
    </div>
  );
}
