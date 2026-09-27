import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Trash2, Loader2, ChevronDown, ChevronRight, Link2, AlarmClock, Star, RefreshCw, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  getInstagramAccounts, connectInstagramAccount, disconnectInstagramAccount,
  setDefaultInstagramAccount, getInstagramAccountStatus,
} from '../lib/api';
import { useAuth } from '../context/AuthContext';

const errMsg = (err, fallback) => err.response?.data?.error || fallback;
const fmt = (d) => (d ? new Date(d).toLocaleString() : '—');
const num = (n) => (n == null ? '—' : Number(n).toLocaleString());
const muted = { fontSize: 12, color: 'var(--text-muted)' };
const danger = { fontSize: 12, color: 'var(--accent-danger)' };
const rowBorder = '1px solid rgba(255,255,255,0.06)';

// Connection health from what's stored (no API call): last check result + token expiry.
function tokenStatus(acc) {
  if (acc.token_error) return { badge: 'badge-danger', text: 'Needs attention' };
  if (acc.token_expires_at) {
    const days = Math.floor((new Date(acc.token_expires_at) - Date.now()) / 86400000);
    if (days < 0) return { badge: 'badge-danger', text: 'Token expired' };
    if (days <= 7) return { badge: 'badge-warning', text: `Token expires in ${days}d` };
  }
  return { badge: 'badge-success', text: 'Connected' };
}

function SetupHelp() {
  return (
    <div className="form-helper mb-16" style={{ lineHeight: 1.7 }}>
      <ol style={{ paddingLeft: 18, margin: '4px 0' }}>
        <li>Your Instagram must be a <strong>Professional account</strong> (Business or Creator): Instagram → Settings → Account type and tools.</li>
        <li>At <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">developers.facebook.com/apps</a>, create an app and add the <strong>Instagram</strong> product.</li>
        <li>Open <strong>Instagram → API setup with Instagram login</strong>. Under "Generate access tokens", add your Instagram account (accept the tester invite in Instagram if asked).</li>
        <li>Click <strong>Generate token</strong>, copy it (starts with <code>IGAA</code>) and paste it below. It needs <code>instagram_business_basic</code> and <code>instagram_business_content_publish</code>. Add <code>instagram_business_manage_comments</code> too if you'll use comment auto-reply.</li>
      </ol>
      Tokens last 60 days — this app renews them automatically every week. Using a Facebook Page or System User token
      (starts with <code>EAA</code>)? Also enter the Instagram account ID.
    </div>
  );
}

function InfoRow({ label, children }) {
  return (
    <div className="flex justify-between" style={{ gap: 12, padding: '7px 0', borderTop: rowBorder, fontSize: 13 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>{children}</span>
    </div>
  );
}

const CHECK_ICON = { true: ['✓', 'var(--accent-success)'], false: ['✗', 'var(--accent-danger)'], null: ['–', 'var(--text-muted)'] };

function AccountDetails({ account, status, checking, onRecheck }) {
  const profile = status?.profile;
  const expires = account.token_expires_at ? new Date(account.token_expires_at) : null;
  const daysLeft = expires ? Math.floor((expires - Date.now()) / 86400000) : null;
  const health = tokenStatus(account);

  return (
    <div className="card mb-24" style={{ maxWidth: 900 }}>
      <div className="card-header">
        <h2>📋 @{account.username}</h2>
        <div className="flex items-center gap-8">
          {account.is_default && <span className="badge badge-purple">★ Default</span>}
          <button className="btn btn-secondary btn-sm" onClick={onRecheck} disabled={checking}>
            {checking ? <Loader2 size={14} className="spinning" /> : <RefreshCw size={14} />} Re-check
          </button>
        </div>
      </div>
      <div className="card-body">
        {/* Profile */}
        {checking && !status ? (
          <div className="flex items-center gap-8" style={muted}><Loader2 size={14} className="spinning" /> Checking with Instagram...</div>
        ) : profile ? (
          <div className="flex gap-16 mb-24" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {profile.profilePictureUrl && (
              <img src={profile.profilePictureUrl} alt="" width="72" height="72"
                style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                onError={e => { e.currentTarget.style.display = 'none'; }} />
            )}
            <div style={{ flex: 1, minWidth: 220 }}>
              <div className="flex items-center gap-8" style={{ flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 17 }}>{profile.name || `@${profile.username}`}</strong>
                <a href={`https://www.instagram.com/${profile.username}/`} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>@{profile.username}</a>
                {profile.accountType && <span className="badge badge-info">{profile.accountType.replace(/_/g, ' ').toLowerCase()}</span>}
              </div>
              <div className="flex gap-24" style={{ margin: '10px 0', fontSize: 14 }}>
                <span><strong>{num(profile.followersCount)}</strong> <span style={muted}>followers</span></span>
                <span><strong>{num(profile.followsCount)}</strong> <span style={muted}>following</span></span>
                <span><strong>{num(profile.mediaCount)}</strong> <span style={muted}>posts</span></span>
              </div>
              {profile.biography && <p style={{ fontSize: 14, color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}>{profile.biography}</p>}
              {profile.website && <a href={profile.website} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>{profile.website}</a>}
            </div>
          </div>
        ) : null}

        <div className="dna-grid mb-24">
          {/* What we have stored */}
          <div>
            <div className="dna-section-title">Account connection</div>
            <InfoRow label="Status"><span className={`badge ${health.badge}`}>{health.text}</span></InfoRow>
            <InfoRow label="Login type">{account.token_type === 'instagram' ? 'Instagram login (IGAA…)' : 'Facebook login (EAA…)'}</InfoRow>
            <InfoRow label="Instagram user ID">{account.ig_user_id}</InfoRow>
            <InfoRow label="Token valid until">
              {expires ? <>{expires.toLocaleDateString()} {daysLeft >= 0 ? `(${daysLeft} days left)` : '(expired)'}</> : 'No expiry date'}
            </InfoRow>
            <InfoRow label="Auto-renew">{account.token_type === 'instagram' ? 'Yes, weekly' : 'Not needed'}</InfoRow>
            <InfoRow label="Connected on">{fmt(account.created_at)}</InfoRow>
            <InfoRow label="Last checked">{fmt(account.last_checked_at)}</InfoRow>
          </div>

          {/* Live API checks */}
          <div>
            <div className="dna-section-title">API connection</div>
            {status?.checks ? status.checks.map(c => {
              const [icon, color] = CHECK_ICON[String(c.ok)];
              return (
                <div key={c.key} className="flex gap-8" style={{ padding: '7px 0', borderTop: rowBorder, fontSize: 13 }}>
                  <span style={{ color, fontWeight: 700, width: 14, flexShrink: 0 }}>{icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div>{c.label}</div>
                    <div style={{ ...muted, overflowWrap: 'anywhere' }}>{c.detail}</div>
                  </div>
                </div>
              );
            }) : (
              <p style={muted}>{checking ? 'Checking...' : 'Not checked yet.'}</p>
            )}
          </div>
        </div>

        {/* Recent posts */}
        {status?.posts?.length > 0 && (
          <>
            <div className="dna-section-title">Recent posts</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
              {status.posts.map(p => (
                <a key={p.id} href={p.permalink || '#'} target="_blank" rel="noreferrer" title={p.caption}
                  style={{ display: 'block', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border-primary)', background: 'var(--bg-tertiary)' }}>
                  {p.imageUrl
                    ? <img src={p.imageUrl} alt="" loading="lazy" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
                    : <div style={{ aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', ...muted }}>{p.mediaType}</div>}
                  <div style={{ ...muted, padding: '4px 6px' }}>
                    {p.likeCount != null && `❤ ${num(p.likeCount)} `}{p.commentsCount != null && `💬 ${num(p.commentsCount)}`}
                    {p.likeCount == null && p.commentsCount == null && new Date(p.timestamp).toLocaleDateString()}
                  </div>
                </a>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function InstagramAccounts() {
  const { activeRole } = useAuth();
  const canManage = activeRole === 'owner' || activeRole === 'admin';

  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [token, setToken] = useState('');
  const [igUserId, setIgUserId] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  const [selectedId, setSelectedId] = useState(null);
  const [status, setStatus] = useState(null);
  const [checking, setChecking] = useState(false);
  const [recheck, setRecheck] = useState(0);

  // Keeps the current selection when it still exists, else selects the default (listed first).
  const load = async (preferId) => {
    try {
      const res = await getInstagramAccounts();
      const list = res.data || [];
      setAccounts(list);
      setSelectedId(cur => (list.some(a => a.id === (preferId || cur)) ? (preferId || cur) : list[0]?.id || null));
      if (!list.length) setShowHelp(true);
    } catch (err) {
      toast.error(errMsg(err, 'Failed to load Instagram accounts'));
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Live status check for the selected account (on select and on "Re-check").
  useEffect(() => {
    if (!selectedId) { setStatus(null); return undefined; }
    let cancelled = false;
    setChecking(true);
    setStatus(null);
    getInstagramAccountStatus(selectedId)
      .then(res => {
        if (cancelled) return;
        setStatus(res.data);
        const fresh = res.data?.account;
        if (fresh) setAccounts(list => list.map(a => (a.id === fresh.id ? fresh : a)));
      })
      .catch(err => { if (!cancelled) toast.error(errMsg(err, 'Status check failed')); })
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [selectedId, recheck]);

  const handleConnect = async (e) => {
    e.preventDefault();
    if (!token.trim()) return toast.error('Paste an access token');
    setBusy('connect');
    try {
      const res = await connectInstagramAccount(token.trim(), igUserId.trim() || undefined);
      toast.success(res.message);
      setToken('');
      setIgUserId('');
      await load(res.data?.id);
      setRecheck(n => n + 1); // a reconnected account keeps its id, so re-check explicitly
    } catch (err) {
      toast.error(errMsg(err, 'Failed to connect'));
    }
    setBusy(null);
  };

  const handleSetDefault = async (acc) => {
    setBusy(acc.id);
    try {
      const res = await setDefaultInstagramAccount(acc.id);
      toast.success(res.message);
      setAccounts(list => list.map(a => ({ ...a, is_default: a.id === acc.id }))
        .sort((a, b) => Number(b.is_default) - Number(a.is_default) || new Date(a.created_at) - new Date(b.created_at)));
    } catch (err) {
      toast.error(errMsg(err, 'Failed to set default'));
    }
    setBusy(null);
  };

  const handleDisconnect = async (acc) => {
    if (!window.confirm(`Disconnect @${acc.username}? Its scheduler jobs and post history will be deleted too.`)) return;
    setBusy(acc.id);
    try {
      await disconnectInstagramAccount(acc.id);
      toast.success('Disconnected');
      await load();
    } catch (err) {
      toast.error(errMsg(err, 'Failed to disconnect'));
    }
    setBusy(null);
  };

  const selected = accounts.find(a => a.id === selectedId);

  const connectCard = (
    <div className="card mb-24" style={{ maxWidth: 900 }}>
      <div className="card-header">
        <h2>🔗 {accounts.length ? 'Connect another account' : 'Connect an account'}</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowHelp(s => !s)}>
          {showHelp ? <ChevronDown size={14} /> : <ChevronRight size={14} />} How to get a token
        </button>
      </div>
      <div className="card-body">
        {showHelp && <SetupHelp />}
        <form onSubmit={handleConnect}>
          <div className="form-group">
            <label className="form-label">Access token</label>
            <input className="form-input" type="password" value={token} onChange={e => setToken(e.target.value)}
              placeholder="IGAA…" autoComplete="off" />
          </div>
          <div className="form-group">
            <label className="form-label">Instagram account ID (only for EAA… tokens)</label>
            <input className="form-input" value={igUserId} onChange={e => setIgUserId(e.target.value)} placeholder="1784…" />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy === 'connect' || !canManage}>
            {busy === 'connect' ? <><Loader2 size={16} className="spinning" /> Verifying...</> : <><Link2 size={16} /> Connect account</>}
          </button>
          {!canManage && <span className="form-helper" style={{ marginLeft: 12 }}>Only workspace owners and admins can connect accounts.</span>}
        </form>
      </div>
    </div>
  );

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <h1>📸 Instagram Accounts</h1>
        <p>Connect your Instagram accounts, pick a default, and check that each connection works.</p>
      </div>

      {loading ? (
        <div className="empty-state"><div className="spinner spinner-lg" /></div>
      ) : accounts.length === 0 ? (
        <>
          {connectCard}
          <div className="card" style={{ maxWidth: 900 }}>
            <div className="card-body">
              <div className="empty-state">
                <Instagram size={48} />
                <h3>No accounts yet</h3>
                <p>Connect one above. The first account you connect becomes the default.</p>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="card mb-24" style={{ maxWidth: 900 }}>
            <div className="card-header">
              <h2>✅ Connected accounts</h2>
              <Link to="/instagram-scheduler" className="btn btn-secondary btn-sm"><AlarmClock size={14} /> Open Scheduler</Link>
            </div>
            <div className="card-body">
              <div className="form-helper mb-16">
                The <strong>default</strong> account is preselected in the Instagram Scheduler and Business DNA, and is the one comment auto-reply will watch.
              </div>
              {accounts.map((acc, i) => {
                const health = tokenStatus(acc);
                const isSelected = acc.id === selectedId;
                return (
                  <div key={acc.id} className="flex items-center justify-between"
                    style={{ padding: '10px 8px', borderTop: i ? rowBorder : 'none', gap: 12, flexWrap: 'wrap',
                      borderRadius: 'var(--radius-md)', background: isSelected ? 'rgba(139,92,246,0.06)' : 'transparent' }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="flex items-center gap-8" style={{ flexWrap: 'wrap' }}>
                        <strong>@{acc.username}</strong>
                        {acc.is_default && <span className="badge badge-purple">★ Default</span>}
                        <span className={`badge ${health.badge}`}>{health.text}</span>
                        <span className="badge badge-info">{acc.token_type === 'instagram' ? 'Instagram login' : 'Facebook login'}</span>
                      </div>
                      <div style={muted}>
                        {acc.token_type === 'instagram'
                          ? `Token auto-renews · valid until ${fmt(acc.token_expires_at)}`
                          : 'Page / System User token'}
                        {acc.last_checked_at && ` · checked ${fmt(acc.last_checked_at)}`}
                      </div>
                      {acc.token_error && <div style={danger}>{acc.token_error}</div>}
                    </div>
                    <div className="flex gap-8">
                      <button className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSelectedId(acc.id)}>
                        <Eye size={14} /> Details
                      </button>
                      {!acc.is_default && canManage && (
                        <button className="btn btn-secondary btn-sm" onClick={() => handleSetDefault(acc)} disabled={busy === acc.id}>
                          <Star size={14} /> Set as default
                        </button>
                      )}
                      {canManage && (
                        <button className="btn btn-ghost btn-sm" onClick={() => handleDisconnect(acc)} disabled={busy === acc.id}>
                          <Trash2 size={14} /> Disconnect
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {selected && (
            <AccountDetails account={selected} status={status} checking={checking} onRecheck={() => setRecheck(n => n + 1)} />
          )}

          {connectCard}
        </>
      )}
      <style>{`.spinning { animation: spin 1s linear infinite; }`}</style>
    </div>
  );
}
