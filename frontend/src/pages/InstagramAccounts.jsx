import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Instagram, Trash2, Loader2, ChevronDown, ChevronRight, Link2, AlarmClock, Star, RefreshCw, Eye, Facebook, Sparkles,
  KeyRound, Info, CheckCircle2, XCircle, MinusCircle, Heart, MessageCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  getInstagramAccounts, connectInstagramAccount, disconnectInstagramAccount,
  setDefaultInstagramAccount, getInstagramAccountStatus, startFacebookLogin,
} from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, Sheet, EmptyState, Section } from '../components/ui';
import '../styles/ig-automation.css';

const errMsg = (err, fallback) => err.response?.data?.error || fallback;
const fmt = (d) => (d ? new Date(d).toLocaleString() : '—');
const num = (n) => (n == null ? '—' : Number(n).toLocaleString());

// Connection health from what's stored (no API call): last check result + token expiry.
function tokenStatus(acc) {
  if (acc.token_error) return { status: 'status--error', text: 'Needs attention' };
  if (acc.token_expires_at) {
    const days = Math.floor((new Date(acc.token_expires_at) - Date.now()) / 86400000);
    if (days < 0) return { status: 'status--error', text: 'Token expired' };
    if (days <= 7) return { status: 'status--warn', text: `Token expires in ${days}d` };
  }
  return { status: 'status--on', text: 'Connected' };
}

function SetupHelp() {
  return (
    <div className="iga-help">
      <ol className="steps-list">
        <li><span>Your Instagram must be a <strong>Professional account</strong> (Business or Creator): Instagram → Settings → Account type and tools.</span></li>
        <li><span>At <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">developers.facebook.com/apps</a>, create an app and add the <strong>Instagram</strong> product.</span></li>
        <li><span>Open <strong>Instagram → API setup with Instagram login</strong>. Under "Generate access tokens", add your Instagram account (accept the tester invite in Instagram if asked).</span></li>
        <li><span>Click <strong>Generate token</strong>, copy it (starts with <code>IGAA</code>) and paste it above. It needs <code>instagram_business_basic</code> and <code>instagram_business_content_publish</code>. Add <code>instagram_business_manage_comments</code> too if you'll use comment auto-reply.</span></li>
      </ol>
      <p className="iga-help__foot">
        Tokens last 60 days, and this app renews them automatically every week. Using a Facebook Page or System User token
        (starts with <code>EAA</code>)? Also enter the Instagram account ID.
      </p>
    </div>
  );
}

const CHECK_ICON = {
  true: [CheckCircle2, 'iga-check--ok', 'Passed'],
  false: [XCircle, 'iga-check--bad', 'Failed'],
  null: [MinusCircle, 'iga-check--none', 'Not checked'],
};

function AccountDetails({ account, status, checking, onRecheck }) {
  const profile = status?.profile;
  const expires = account.token_expires_at ? new Date(account.token_expires_at) : null;
  const daysLeft = expires ? Math.floor((expires - Date.now()) / 86400000) : null;
  const health = tokenStatus(account);

  return (
    <Section
      title={`@${account.username}`}
      description="Profile, connection and recent posts, checked live with Instagram."
      actions={(
        <>
          {account.is_default && <span className="badge badge-purple"><Star aria-hidden="true" /> Default</span>}
          <button className="btn btn-secondary btn-sm" onClick={onRecheck} disabled={checking}>
            {checking ? <Loader2 size={14} className="spinning" /> : <RefreshCw size={14} />} Re-check
          </button>
        </>
      )}
    >
      {/* Profile */}
      {checking && !status ? (
        <div className="iga-muted iga-inline mb-24"><Loader2 size={14} className="spinning" /> Checking with Instagram…</div>
      ) : profile ? (
        <div className="iga-profile">
          {profile.profilePictureUrl && (
            <img src={profile.profilePictureUrl} alt="" width="72" height="72"
              onError={e => { e.currentTarget.style.display = 'none'; }} />
          )}
          <div className="iga-profile__main">
            <div className="iga-profile__name">
              <strong>{profile.name || `@${profile.username}`}</strong>
              <a href={`https://www.instagram.com/${profile.username}/`} target="_blank" rel="noreferrer">@{profile.username}</a>
              {profile.accountType && <span className="badge badge-info">{profile.accountType.replace(/_/g, ' ').toLowerCase()}</span>}
            </div>
            <div className="iga-profile__stats">
              <span><strong>{num(profile.followersCount)}</strong> <span className="iga-muted">followers</span></span>
              <span><strong>{num(profile.followsCount)}</strong> <span className="iga-muted">following</span></span>
              <span><strong>{num(profile.mediaCount)}</strong> <span className="iga-muted">posts</span></span>
            </div>
            {profile.biography && <p className="iga-profile__bio">{profile.biography}</p>}
            {profile.website && <a className="iga-profile__site" href={profile.website} target="_blank" rel="noreferrer">{profile.website}</a>}
          </div>
        </div>
      ) : null}

      <div className="grid-2 iga-details-grid">
        {/* What we have stored */}
        <div>
          <div className="iga-subtitle">Account connection</div>
          <dl className="kv">
            <dt>Status</dt>
            <dd><span className={`status ${health.status}`}>{health.text}</span></dd>
            <dt>Login type</dt>
            <dd>{account.token_type === 'instagram' ? 'Instagram login (IGAA…)' : 'Facebook login (EAA…)'}</dd>
            <dt>Instagram user ID</dt>
            <dd>{account.ig_user_id}</dd>
            <dt>Token valid until</dt>
            <dd>{expires ? <>{expires.toLocaleDateString()} {daysLeft >= 0 ? `(${daysLeft} days left)` : '(expired)'}</> : 'No expiry date'}</dd>
            <dt>Auto-renew</dt>
            <dd>{account.token_type === 'instagram' ? 'Yes, weekly' : 'Not needed'}</dd>
            <dt>Connected on</dt>
            <dd>{fmt(account.created_at)}</dd>
            <dt>Last checked</dt>
            <dd>{fmt(account.last_checked_at)}</dd>
          </dl>
        </div>

        {/* Live API checks */}
        <div>
          <div className="iga-subtitle">API connection</div>
          {status?.checks ? (
            <ul className="iga-checks">
              {status.checks.map(c => {
                const [Icon, cls, word] = CHECK_ICON[String(c.ok)] || CHECK_ICON.null;
                return (
                  <li key={c.key}>
                    <Icon className={cls} role="img" aria-label={word} />
                    <div>
                      <div>{c.label}</div>
                      <div className="iga-muted" style={{ overflowWrap: 'anywhere' }}>{c.detail}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="iga-muted">{checking ? 'Checking…' : 'Not checked yet.'}</p>
          )}
        </div>
      </div>

      {/* Recent posts */}
      {status?.posts?.length > 0 && (
        <>
          <div className="iga-subtitle">Recent posts</div>
          <div className="iga-recent">
            {status.posts.map(p => (
              <a key={p.id} href={p.permalink || '#'} target="_blank" rel="noreferrer" title={p.caption}>
                {p.imageUrl
                  ? <img src={p.imageUrl} alt="" loading="lazy" />
                  : <div className="iga-recent__blank">{p.mediaType}</div>}
                <div className="iga-recent__meta">
                  {p.likeCount != null && <span><Heart aria-hidden="true" />{num(p.likeCount)}<span className="sr-only"> likes</span></span>}
                  {p.commentsCount != null && <span><MessageCircle aria-hidden="true" />{num(p.commentsCount)}<span className="sr-only"> comments</span></span>}
                  {p.likeCount == null && p.commentsCount == null && new Date(p.timestamp).toLocaleDateString()}
                </div>
              </a>
            ))}
          </div>
        </>
      )}
    </Section>
  );
}

export default function InstagramAccounts() {
  const { activeRole } = useAuth();
  const canManage = activeRole === 'owner' || activeRole === 'admin';
  const [searchParams, setSearchParams] = useSearchParams();

  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [token, setToken] = useState('');
  const [igUserId, setIgUserId] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [tokenOpen, setTokenOpen] = useState(false);

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
      setTokenOpen(false);
      await load(res.data?.id);
      setRecheck(n => n + 1); // a reconnected account keeps its id, so re-check explicitly
    } catch (err) {
      toast.error(errMsg(err, 'Failed to connect'));
    }
    setBusy(null);
  };

  // Facebook Login: the API returns the Facebook dialog URL; Facebook redirects back to
  // /instagram?ig_connected=… or ?ig_error=… (handled below).
  const handleFacebookLogin = async () => {
    setBusy('facebook');
    try {
      const res = await startFacebookLogin();
      window.location.href = res.data.url;
    } catch (err) {
      toast.error(errMsg(err, 'Facebook Login is not available'), { duration: 8000 });
      setBusy(null);
    }
  };

  useEffect(() => {
    const connected = searchParams.get('ig_connected');
    const error = searchParams.get('ig_error');
    if (!connected && !error) return;
    if (connected) toast.success(`Connected ${connected}`, { duration: 6000 });
    if (error) toast.error(error, { duration: 10000 });
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

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
    if (!window.confirm(`Disconnect @${acc.username}? Its scheduler jobs, Studio posts and images, DNA, campaigns and comment history will be deleted too.`)) return;
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

  // Stable, so the sheet doesn't re-run its open effect (and move focus) on every keystroke.
  const closeToken = useCallback(() => setTokenOpen(false), []);

  const selected = accounts.find(a => a.id === selectedId);
  const connecting = busy === 'connect';

  const facebookButton = (
    <button className="btn btn-primary" onClick={handleFacebookLogin} disabled={busy === 'facebook' || !canManage}>
      {busy === 'facebook' ? <Loader2 size={16} className="spinning" /> : <Facebook size={16} />} Connect with Facebook
    </button>
  );
  const tokenButton = (
    <button className="btn btn-secondary" onClick={() => setTokenOpen(true)}><KeyRound size={16} /> Use a token</button>
  );

  return (
    <div className="page-container page-container--narrow fade-in">
      <PageHeader
        title="Instagram Accounts"
        subtitle="Connect your Instagram accounts, pick a default, and check that each connection works."
        actions={<>{tokenButton}{facebookButton}</>}
      >
        {!canManage && <div className="form-helper">Only workspace owners and admins can connect accounts.</div>}
      </PageHeader>

      {loading ? (
        <div className="empty-state"><div className="spinner spinner-lg" /></div>
      ) : (
        <div className="stack">
          {accounts.length === 0 ? (
            <Section>
              <EmptyState
                icon={Instagram}
                title="No accounts yet"
                text="Connect an Instagram Business or Creator account to post from this app. The first account you connect becomes the default."
                action={<div className="iga-empty-actions">{facebookButton}{tokenButton}</div>}
              />
            </Section>
          ) : (
            <>
              <Section
                flush
                className="iga-accounts-card"
                title="Connected accounts"
                description="The default account is preselected in the Studio, the Product Scheduler and Business DNA."
                actions={(
                  <>
                    <Link to="/instagram-studio" className="btn btn-ghost btn-sm"><Sparkles size={14} /> Open Studio</Link>
                    <Link to="/instagram-scheduler" className="btn btn-ghost btn-sm"><AlarmClock size={14} /> Product Scheduler</Link>
                  </>
                )}
              >
                <div className="list">
                  {accounts.map(acc => {
                    const health = tokenStatus(acc);
                    const isSelected = acc.id === selectedId;
                    return (
                      <div key={acc.id} className={`list-item${isSelected ? ' is-selected' : ''}`}>
                        <div className="list-item__media" aria-hidden="true"><Instagram size={20} /></div>
                        <div className="list-item__main">
                          <div className="list-item__title">
                            @{acc.username}
                            {acc.is_default && <span className="badge badge-purple"><Star aria-hidden="true" /> Default</span>}
                            <span className={`status ${health.status}`}>{health.text}</span>
                          </div>
                          <div className="list-item__meta">
                            <span>{acc.token_type === 'instagram' ? 'Instagram login' : 'Facebook login'}</span>
                            <span>
                              {acc.token_type === 'instagram'
                                ? `Token renews automatically · valid until ${fmt(acc.token_expires_at)}`
                                : acc.connected_via === 'facebook_login' ? 'Connected with Facebook Login · Page token, no expiry' : 'Page or System User token'}
                            </span>
                            {acc.last_checked_at && <span>Checked {fmt(acc.last_checked_at)}</span>}
                          </div>
                          {acc.token_error && <div className="iga-error">{acc.token_error}</div>}
                        </div>
                        <div className="list-item__actions">
                          <button className="btn btn-secondary btn-sm" onClick={() => setSelectedId(acc.id)} aria-pressed={isSelected}>
                            <Eye size={14} /> Details
                          </button>
                          {!acc.is_default && canManage && (
                            <button className="btn btn-ghost btn-sm" onClick={() => handleSetDefault(acc)} disabled={busy === acc.id}>
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
              </Section>

              {selected && (
                <AccountDetails account={selected} status={status} checking={checking} onRecheck={() => setRecheck(n => n + 1)} />
              )}
            </>
          )}

          <div className="callout">
            <Info size={16} aria-hidden="true" />
            <div>
              Connect with Facebook adds every Instagram Business or Creator account linked to the Facebook Pages you choose, with no
              token to copy. If Facebook says "Feature unavailable", the app is still waiting for Meta's approval; until then only
              Facebook accounts added to the app (under App roles in Meta for Developers) can connect.
            </div>
          </div>
        </div>
      )}

      {/* Connect with a token */}
      <Sheet
        open={tokenOpen}
        title="Connect with a token"
        subtitle="Paste an access token from Meta for Developers."
        onClose={closeToken}
        busy={connecting}
        width={560}
        footer={(
          <>
            <button type="button" className="btn btn-ghost" onClick={closeToken} disabled={connecting}>Cancel</button>
            <button type="submit" form="ig-token-form" className="btn btn-primary" disabled={connecting || !canManage}>
              {connecting ? <><Loader2 size={16} className="spinning" /> Verifying…</> : <><Link2 size={16} /> Connect account</>}
            </button>
          </>
        )}
      >
        <form id="ig-token-form" onSubmit={handleConnect}>
          {!canManage && (
            <div className="callout iga-sheet-callout">
              <Info size={16} aria-hidden="true" />
              <div>Only workspace owners and admins can connect accounts.</div>
            </div>
          )}
          <div className="form-group">
            <label className="form-label" htmlFor="ig-token">Access token</label>
            <input id="ig-token" className="form-input" type="password" value={token} onChange={e => setToken(e.target.value)}
              placeholder="IGAA…" autoComplete="off" />
            <div className="form-helper">Starts with IGAA for Instagram login, or EAA for a Facebook Page or System User token.</div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="ig-user-id">Instagram account ID (only for EAA… tokens)</label>
            <input id="ig-user-id" className="form-input" value={igUserId} onChange={e => setIgUserId(e.target.value)} placeholder="1784…" />
          </div>
        </form>
        <button type="button" className="iga-link iga-help-toggle" aria-expanded={showHelp} onClick={() => setShowHelp(s => !s)}>
          {showHelp ? <ChevronDown size={14} /> : <ChevronRight size={14} />} How to get a token
        </button>
        {showHelp && <div style={{ marginTop: 16 }}><SetupHelp /></div>}
      </Sheet>
    </div>
  );
}
