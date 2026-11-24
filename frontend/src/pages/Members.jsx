import React, { useState, useEffect, useCallback } from 'react';
import { UserPlus, Trash2, Loader2, Copy, RefreshCw, Mail, KeyRound, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { getMembers, getInvitations, createInvitation, revokeInvitation, setMemberRole, removeMember, resetMemberPassword } from '../lib/api';
import { PageHeader, Section, Sheet } from '../components/ui';
import '../styles/workspace.css';

const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', member: 'Member' };
const RoleBadge = ({ role }) => <span className="badge badge-purple">{ROLE_LABEL[role] || role}</span>;

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
  const [inviteOpen, setInviteOpen] = useState(false);
  const [lastInvite, setLastInvite] = useState(null);
  const [resetResult, setResetResult] = useState(null); // { email, tempPassword }

  const closeInvite = useCallback(() => setInviteOpen(false), []);

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
      setInviteOpen(false);
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
    if (!window.confirm(`Reset password for ${member.email}?\n\nThis changes their account login. You'll see the new password only once, so share it with them securely.`)) return;
    setBusy(member.user_id);
    try {
      const res = await resetMemberPassword(member.user_id);
      setResetResult(res.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
    setBusy(null);
  };

  const copyInviteLink = () => { navigator.clipboard.writeText(lastInvite.url); toast.success('Copied'); };

  if (loading && members.length === 0) {
    return <div className="page-container page-container--narrow fade-in"><div className="empty-state"><div className="spinner spinner-lg" /></div></div>;
  }

  const pending = invitations.filter(i => !i.accepted_at);
  // Only the newest invite's link is known (links are stored hashed), so only its row can copy it.
  const linkRowId = lastInvite ? pending.find(i => i.email?.toLowerCase() === lastInvite.email.toLowerCase())?.id : null;

  return (
    <div className="page-container page-container--narrow fade-in">
      <PageHeader
        title="Members"
        subtitle={`People who can use ${activeWorkspace?.name || 'this workspace'}.`}
        actions={canManage && (
          <button className="btn btn-primary" onClick={() => setInviteOpen(true)}>
            <UserPlus size={16} /> Invite teammate
          </button>
        )}
      />

      <div className="stack">
        {lastInvite && (
          <div className="callout callout--success" role="status">
            <CheckCircle2 size={18} />
            <div className="wk-callout-body">
              <div className="wk-callout-title">Invite link for {lastInvite.email}</div>
              <p>Send this link to them. Invitations aren't emailed yet.</p>
              <div className="members-link">
                <code title={lastInvite.url}>{lastInvite.url}</code>
                <button className="btn btn-secondary btn-sm" onClick={copyInviteLink}><Copy size={14} /> Copy link</button>
              </div>
            </div>
            <button className="btn btn-ghost btn-sm btn-icon members-dismiss" onClick={() => setLastInvite(null)} aria-label="Dismiss" title="Dismiss">
              <X size={14} />
            </button>
          </div>
        )}

        <Section
          flush
          title="Members"
          description={`${members.length} ${members.length === 1 ? 'person' : 'people'}`}
          actions={(
            <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading} aria-label="Refresh the list" title="Refresh">
              <RefreshCw size={14} className={loading ? 'spinning' : ''} /> Refresh
            </button>
          )}
        >
          <ul className="list">
            {members.map(m => {
              const isMe = m.user_id === me?.id;
              return (
                <li key={m.user_id} className="list-item">
                  <span className="list-item__media wk-avatar wk-avatar--round" aria-hidden="true">{(m.name || m.email || '?').charAt(0)}</span>
                  <div className="list-item__main">
                    <div className="list-item__title">
                      <span className="wk-truncate">{m.name || m.email}</span>
                      {isMe && <span className="badge badge-info">You</span>}
                    </div>
                    <div className="list-item__meta">
                      {m.name && <span>{m.email}</span>}
                      <span>Joined {new Date(m.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="list-item__actions">
                    {isOwner && !isMe ? (
                      <select
                        className="form-select members-role"
                        aria-label={`Role for ${m.email}`}
                        value={m.role}
                        disabled={busy === m.user_id}
                        onChange={e => act(setMemberRole, m.user_id, e.target.value)}
                      >
                        <option value="owner">Owner</option>
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                      </select>
                    ) : <RoleBadge role={m.role} />}
                    {canManage && !isMe && (m.role === 'member' || isOwner) && (
                      <button className="btn btn-ghost btn-sm" disabled={busy === m.user_id} onClick={() => handleReset(m)} title="Reset password" aria-label={`Reset password for ${m.email}`}>
                        <KeyRound size={14} /> Reset password
                      </button>
                    )}
                    {canManage && !isMe && m.role !== 'owner' && (
                      <button className="btn btn-ghost btn-sm" disabled={busy === m.user_id} onClick={() => {
                        if (window.confirm(`Remove ${m.email} from this workspace?`)) act(removeMember, m.user_id);
                      }} title="Remove" aria-label={`Remove ${m.email}`}>
                        <Trash2 size={14} /> Remove
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>

        {canManage && pending.length > 0 && (
          <Section flush title="Pending invitations" description="People with an invite link who haven't joined yet.">
            <ul className="list">
              {pending.map(i => (
                <li key={i.id} className="list-item">
                  <span className="list-item__media" aria-hidden="true"><Mail size={18} /></span>
                  <div className="list-item__main">
                    <div className="list-item__title"><span className="wk-truncate">{i.email}</span></div>
                    <div className="list-item__meta">
                      <RoleBadge role={i.role} />
                      <span>Expires {new Date(i.expires_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="list-item__actions">
                    {i.id === linkRowId && (
                      <button className="btn btn-secondary btn-sm" onClick={copyInviteLink}><Copy size={14} /> Copy link</button>
                    )}
                    <button className="btn btn-ghost btn-sm" disabled={busy === i.id} onClick={() => act(revokeInvitation, i.id)} aria-label={`Revoke the invitation for ${i.email}`}>
                      <Trash2 size={14} /> Revoke
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>

      {/* Invite: email + role */}
      <Sheet
        open={inviteOpen}
        title="Invite a teammate"
        subtitle="You'll get a link to send them. They join this workspace when they open it."
        onClose={closeInvite}
        busy={inviting}
        width={480}
        footer={(
          <>
            <button type="button" className="btn btn-ghost" onClick={closeInvite} disabled={inviting}>Cancel</button>
            <button type="submit" form="invite-form" className="btn btn-primary" disabled={inviting}>
              {inviting ? <Loader2 size={16} className="spinning" /> : <Mail size={16} />} Create invite link
            </button>
          </>
        )}
      >
        <form id="invite-form" onSubmit={handleInvite}>
          <div className="form-group">
            <label className="form-label" htmlFor="invite-email">Email</label>
            <input id="invite-email" className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="teammate@example.com" />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="invite-role">Role</label>
            <select id="invite-role" className="form-select" value={role} onChange={e => setRole(e.target.value)}>
              <option value="member">Member</option>
              {isOwner && <option value="admin">Admin</option>}
            </select>
            <div className="form-helper">Admins can also manage members and settings.</div>
          </div>
        </form>
      </Sheet>

      {/* Temp-password dialog — shown ONCE after a reset */}
      {resetResult && (
        <div className="app-modal" role="dialog" aria-modal="true" aria-label={`New password for ${resetResult.email}`}>
          <div className="app-modal__card members-pwd">
            <button className="app-modal__close" onClick={() => setResetResult(null)} aria-label="Close"><X size={18} /></button>
            <h3>New password for {resetResult.email}</h3>
            {resetResult.notice && <p className="members-pwd__notice">{resetResult.notice}</p>}
            <div className="pwd-box">
              <code>{resetResult.tempPassword}</code>
              <button className="btn btn-secondary btn-sm" onClick={() => {
                navigator.clipboard.writeText(resetResult.tempPassword);
                toast.success('Copied');
              }}><Copy size={14} /> Copy</button>
            </div>
            <div className="callout callout--warning">
              <AlertTriangle size={16} />
              <span>This password is shown only once. Copy it now; you won't see it again after you close this.</span>
            </div>
            <div className="form-actions">
              <button className="btn btn-primary" onClick={() => setResetResult(null)}>I've shared it</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
