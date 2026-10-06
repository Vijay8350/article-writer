import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Loader2, Send, Save, RefreshCw, EyeOff, Eye, Trash2, SkipForward, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { getInstagramAccounts, getIgComments, saveIgCommentSettings, checkIgCommentsNow, replyIgComment, igCommentAction } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { errMsg, fmt, muted, danger } from '../components/studio/shared';

const MODES = [
  ['off', 'Off — no replies'],
  ['review', 'Review — AI drafts, you approve'],
  ['auto', 'Auto — send replies automatically'],
];
const FILTERS = [['needs_reply', 'Needs reply'], ['flagged', 'Flagged'], ['replied', 'Replied'], ['all', 'All']];
const VERDICT_BADGE = { positive: 'badge-success', question: 'badge-info', neutral: 'badge-purple', bad: 'badge-danger' };

function AccountSettings({ account, settings, canManage, onChanged }) {
  const [f, setF] = useState({
    replyMode: settings?.reply_mode || 'review',
    autoHide: settings?.auto_hide ?? true,
    dailyReplyLimit: settings?.daily_reply_limit ?? 30,
  });
  const [busy, setBusy] = useState(null);
  const run = async (key, fn) => {
    setBusy(key);
    try { toast.success((await fn()).message, { duration: 6000 }); } catch (err) { toast.error(errMsg(err), { duration: 8000 }); }
    await onChanged();
    setBusy(null);
  };

  return (
    <div className="ig-list-row">
      <div className="flex justify-between gap-12" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <strong>@{account.username}</strong>{' '}
          {settings ? <span className="badge badge-success">monitored</span> : <span className="badge badge-warning">not monitored</span>}
          <div style={muted}>{settings?.last_checked_at ? `Last checked ${fmt(settings.last_checked_at)}` : 'Checked every 15 minutes once switched on'}</div>
          {settings?.last_error && <div style={danger}>{settings.last_error}</div>}
        </div>
        {canManage && (
          <div className="flex gap-8 items-center" style={{ flexWrap: 'wrap' }}>
            <select className="form-select" style={{ width: 'auto' }} value={f.replyMode} onChange={(e) => setF({ ...f, replyMode: e.target.value })} aria-label="Reply mode">
              {MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <label className="flex items-center gap-8" style={{ fontSize: 13, cursor: 'pointer' }} title="Hide comments the AI is confident are spam/abuse">
              <input type="checkbox" checked={f.autoHide} onChange={(e) => setF({ ...f, autoHide: e.target.checked })} style={{ accentColor: 'var(--accent-primary)' }} /> Auto-hide bad
            </label>
            <label className="flex items-center gap-8" style={{ fontSize: 13 }}>
              Max/day
              <input className="form-input" type="number" min={0} max={200} style={{ width: 80 }} value={f.dailyReplyLimit}
                onChange={(e) => setF({ ...f, dailyReplyLimit: e.target.value })} />
            </label>
            <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => run('save', () => saveIgCommentSettings(account.id, f))}>
              {busy === 'save' ? <Loader2 size={14} className="spinning" /> : <Save size={14} />} {settings ? 'Save' : 'Switch on'}
            </button>
            {settings && (
              <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => run('check', () => checkIgCommentsNow(account.id))}>
                {busy === 'check' ? <Loader2 size={14} className="spinning" /> : <RefreshCw size={14} />} Check now
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CommentRow({ c, canManage, onAction }) {
  const [reply, setReply] = useState(c.reply_text || '');
  const [busy, setBusy] = useState(null);
  const act = async (key, fn) => {
    setBusy(key);
    await onAction(fn);
    setBusy(null);
  };
  const needsReply = ['draft', 'error'].includes(c.status);

  return (
    <div className="ig-list-row">
      <div className="flex justify-between gap-12" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0, flex: '1 1 360px' }}>
          <div className="flex items-center gap-8" style={{ flexWrap: 'wrap', fontSize: 13 }}>
            <strong>@{c.author || 'someone'}</strong>
            <span style={muted}>on @{c.username} · {fmt(c.commented_at)}</span>
            {c.verdict && <span className={`badge ${VERDICT_BADGE[c.verdict] || 'badge-info'}`}>{c.verdict}{c.category ? ` · ${c.category.replace('_', ' ')}` : ''}</span>}
            {c.hidden && <span className="badge badge-warning">hidden</span>}
          </div>
          <p style={{ fontSize: 14, margin: '4px 0', overflowWrap: 'anywhere' }}>{c.text}</p>
          {c.reason && <div style={muted}>AI: {c.reason}{c.confidence != null ? ` (${Math.round(Number(c.confidence) * 100)}% sure)` : ''}</div>}
          {c.media_permalink && <a href={c.media_permalink} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>View post <ExternalLink size={11} /></a>}
          {c.status === 'replied' && <div style={{ fontSize: 13, marginTop: 6, color: 'var(--text-secondary)' }}>↳ Replied: {c.reply_text}</div>}
          {c.error && <div style={danger}>{c.error}</div>}
          {needsReply && canManage && (
            <div className="flex gap-8 mt-16" style={{ flexWrap: 'wrap' }}>
              <input className="form-input" style={{ flex: '1 1 260px' }} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" maxLength={300} aria-label="Reply" />
              <button className="btn btn-primary btn-sm" disabled={!!busy || !reply.trim()} onClick={() => act('reply', () => replyIgComment(c.id, reply))}>
                {busy === 'reply' ? <Loader2 size={14} className="spinning" /> : <Send size={14} />} Send
              </button>
              <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => act('skip', () => igCommentAction(c.id, 'skip'))}><SkipForward size={14} /> Skip</button>
            </div>
          )}
        </div>
        {c.status === 'flagged' && canManage && (
          <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" disabled={!!busy} title="It's fine — make it visible again" onClick={() => act('approve', () => igCommentAction(c.id, 'approve'))}><Eye size={14} /> It's fine</button>
            <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => act('hide', () => igCommentAction(c.id, 'hide'))}><EyeOff size={14} /> Keep hidden</button>
            <button className="btn btn-danger btn-sm" disabled={!!busy}
              onClick={() => window.confirm('Delete this comment from Instagram permanently?') && act('delete', () => igCommentAction(c.id, 'delete'))}><Trash2 size={14} /> Delete</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function InstagramComments() {
  const { activeRole } = useAuth();
  const canManage = activeRole === 'owner' || activeRole === 'admin';
  const [accounts, setAccounts] = useState(null);
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('needs_reply');
  const [accountId, setAccountId] = useState('');

  const load = useCallback(async () => {
    try {
      const [a, c] = await Promise.all([getInstagramAccounts(), getIgComments({ filter, accountId: accountId || undefined })]);
      setAccounts(a.data || []);
      setData(c.data);
    } catch (err) { toast.error(errMsg(err)); setAccounts((x) => x || []); }
  }, [filter, accountId]);
  useEffect(() => { load(); }, [load]);

  const onAction = async (fn) => {
    try { toast.success((await fn()).message || 'Done'); } catch (err) { toast.error(errMsg(err), { duration: 8000 }); }
    await load();
  };

  const settingsFor = (id) => data?.settings?.find((s) => s.account_id === id) || null;

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <h1>💬 Instagram Comments</h1>
        <p>DeepSeek reads new comments in each account's voice: it hides spam and abuse, and drafts replies — or sends them automatically within a daily limit.</p>
      </div>

      {!accounts || !data ? <div className="empty-state"><div className="spinner spinner-lg" /></div> : accounts.length === 0 ? (
        <div className="card"><div className="card-body"><div className="empty-state">
          <MessageCircle size={48} /><h3>Connect an Instagram account first</h3><p><Link to="/instagram">Go to Instagram Accounts</Link></p>
        </div></div></div>
      ) : (
        <>
          <div className="card mb-24">
            <div className="card-header"><h2>⚙️ Monitoring</h2></div>
            <div className="card-body">
              {accounts.map((a) => (
                <AccountSettings key={`${a.id}-${settingsFor(a.id)?.updated_at || 'none'}`} account={a} settings={settingsFor(a.id)} canManage={canManage} onChanged={load} />
              ))}
              <p className="form-helper">Only comments from the last 3 days are picked up, so switching this on never replies to an old backlog. Needs the manage-comments permission on the account.</p>
            </div>
          </div>

          <div className="card">
            <div className="card-header" style={{ flexWrap: 'wrap', gap: 12 }}>
              <div className="chips">
                {FILTERS.map(([key, label]) => (
                  <button key={key} className={`chip ${filter === key ? 'active' : ''}`} aria-pressed={filter === key} onClick={() => setFilter(key)}>
                    {label}{data.counts?.[key] != null ? ` (${data.counts[key]})` : ''}
                  </button>
                ))}
              </div>
              {accounts.length > 1 && (
                <select className="form-select" style={{ width: 'auto' }} value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Account filter">
                  <option value="">All accounts</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>@{a.username}</option>)}
                </select>
              )}
            </div>
            <div className="card-body">
              {data.comments.length === 0
                ? <div className="empty-state"><MessageCircle size={48} /><h3>Nothing here</h3><p>New comments appear here after the next check.</p></div>
                : data.comments.map((c) => <CommentRow key={`${c.id}-${c.status}`} c={c} canManage={canManage} onAction={onAction} />)}
            </div>
          </div>
        </>
      )}
      <style>{'.spinning { animation: spin 1s linear infinite; }'}</style>
    </div>
  );
}
