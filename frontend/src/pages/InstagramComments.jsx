import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  MessageCircle, Loader2, Send, Save, RefreshCw, EyeOff, Eye, Trash2, SkipForward, ExternalLink, Plus, X, ChevronDown, ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  getInstagramAccounts, getIgComments, getIgCommentOverview, saveIgCommentSettings, checkIgCommentsNow, replyIgComment, igCommentAction,
} from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { errMsg, fmt, muted, danger, browserTimezone } from '../components/studio/shared';
import { ColumnChart, BarList, Kpi, compact } from '../components/insights/Charts';

const MODES = [
  ['off', 'Off', "Don't reply. Spam is still hidden if auto-hide is on."],
  ['review', 'Review', 'The AI writes a draft reply; you approve each one below.'],
  ['auto', 'Auto-reply', 'Replies are posted automatically, up to your daily limit.'],
];
const MODE_BADGE = { off: ['badge-info', 'Replies off'], review: ['badge-purple', 'Review drafts'], auto: ['badge-success', 'Auto-reply on'] };
const REPLY_TO = [['question', 'Questions'], ['positive', 'Positive comments'], ['neutral', 'Neutral comments']];
const FILTERS = [['needs_reply', 'Needs reply'], ['flagged', 'Flagged'], ['replied', 'Replied'], ['all', 'All']];
const VERDICT_BADGE = { positive: 'badge-success', question: 'badge-info', neutral: 'badge-purple', bad: 'badge-danger' };
const SOURCE_LABEL = { ai: 'auto-reply', rule: 'keyword reply', manual: 'you' };
const MAX_RULES = 20;

const duration = (s) => (s == null ? '—' : s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)} min`
  : s < 86400 ? `${(s / 3600).toFixed(1)} h` : `${(s / 86400).toFixed(1)} days`);
const percent = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : '—');
const localKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ─── Overview ────────────────────────────────────────────────────────────────

function Overview({ accountId, version }) {
  const [days, setDays] = useState(30);
  const [ov, setOv] = useState(null);

  useEffect(() => {
    getIgCommentOverview({ accountId: accountId || undefined, days, tz: browserTimezone() })
      .then((r) => setOv(r.data))
      .catch((err) => toast.error(errMsg(err, 'Could not load the comment overview')));
  }, [accountId, days, version]);

  const t = ov?.totals;
  // Every day in the period, so quiet days show as gaps rather than disappearing.
  const byDay = new Map((ov?.daily || []).map((d) => [d.day, d]));
  const daily = Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const key = localKey(d);
    const row = byDay.get(key);
    return {
      key, value: row?.comments || 0, extra: `${row?.replied || 0} replied`,
      label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    };
  });

  return (
    <div className="card mb-24">
      <div className="card-header" style={{ flexWrap: 'wrap', gap: 12 }}>
        <h2>📊 Overview</h2>
        <div className="chips">
          {[7, 30, 90].map((d) => (
            <button key={d} className={`chip ${days === d ? 'active' : ''}`} aria-pressed={days === d} onClick={() => setDays(d)}>Last {d} days</button>
          ))}
        </div>
      </div>
      <div className="card-body">
        {!ov ? <div className="empty-state"><div className="spinner" /></div> : t.total === 0 ? (
          <p className="form-helper">
            No comments collected in this period yet. Switch on monitoring for an account in <strong>Auto-reply</strong> below:
            new comments (from the last 3 days) are picked up every 15 minutes.
          </p>
        ) : (
          <>
            <div className="kpi-grid mb-24">
              <Kpi label="Comments" value={compact(t.total)} sub={t.unreviewed ? `${t.unreviewed} waiting for AI review` : 'all reviewed'} />
              <Kpi label="Replied" value={compact(t.replied)} sub={`auto ${t.replied_ai} · keyword ${t.replied_rule} · you ${t.replied_manual}`} />
              <Kpi label="Response rate" value={percent(t.replied, t.total - t.bad)} sub="of comments that weren't spam" />
              <Kpi label="Avg. reply time" value={duration(t.avg_reply_seconds)} />
              <Kpi label="Needs reply" value={compact(t.needs_reply)} />
              <Kpi label="Flagged" value={compact(t.flagged)} sub={`${t.hidden} hidden · ${t.deleted} deleted`} />
            </div>
            <div className="ig-two-col mb-24">
              <div>
                <div className="kpi-section-title">Comments per day</div>
                <ColumnChart label="Day" valueLabel="Comments" data={daily} height={160} />
              </div>
              <div>
                <div className="kpi-section-title">What people say</div>
                <BarList label="Comment types" total={t.total} rows={[
                  { key: 'question', label: 'Questions', value: t.question },
                  { key: 'positive', label: 'Positive', value: t.positive },
                  { key: 'neutral', label: 'Neutral', value: t.neutral },
                  { key: 'bad', label: 'Spam / abuse', value: t.bad },
                  { key: 'unreviewed', label: 'Not reviewed yet', value: t.unreviewed },
                ]} />
                {ov.badCategories.length > 0 && (
                  <>
                    <div className="kpi-section-title mt-16">Spam &amp; abuse by type</div>
                    <BarList label="Bad comments by type" rows={ov.badCategories.map((c) => ({ key: c.category, label: c.category.replace('_', ' '), value: c.n }))} />
                  </>
                )}
              </div>
            </div>
            <div className="ig-two-col">
              <div>
                <div className="kpi-section-title">Top commenters</div>
                <BarList label="Top commenters" rows={ov.topCommenters.map((c) => ({ key: c.author, label: `@${c.author}`, value: c.n }))} />
              </div>
              <div>
                <div className="kpi-section-title">Most-commented posts</div>
                {ov.topPosts.map((p) => (
                  <div key={p.ig_media_id} className="flex justify-between gap-12" style={{ fontSize: 13, padding: '4px 0' }}>
                    <a href={p.permalink || '#'} target="_blank" rel="noreferrer" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.caption ? p.caption.slice(0, 60) : 'Post'} <ExternalLink size={11} />
                    </a>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{p.n}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Auto-reply settings (per account) ───────────────────────────────────────

function AutoReplySettings({ account, settings, canManage, open, onToggle, onChanged }) {
  const [f, setF] = useState(() => ({
    replyMode: settings?.reply_mode || 'review',
    autoHide: settings?.auto_hide ?? true,
    dailyReplyLimit: settings?.daily_reply_limit ?? 30,
    replyTo: settings?.reply_to || REPLY_TO.map(([v]) => v),
    replyInstructions: settings?.reply_instructions || '',
    keywordRules: (settings?.keyword_rules || []).map((r) => ({ keywords: r.keywords.join(', '), reply: r.reply })),
  }));
  const [busy, setBusy] = useState(null);
  const run = async (key, fn) => {
    setBusy(key);
    try { toast.success((await fn()).message, { duration: 6000 }); } catch (err) { toast.error(errMsg(err), { duration: 8000 }); }
    await onChanged();
    setBusy(null);
  };
  const setRule = (i, patch) => setF((s) => ({ ...s, keywordRules: s.keywordRules.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const toggleReplyTo = (v) => setF((s) => ({ ...s, replyTo: s.replyTo.includes(v) ? s.replyTo.filter((x) => x !== v) : [...s.replyTo, v] }));
  const save = () => run('save', () => saveIgCommentSettings(account.id, {
    ...f, keywordRules: f.keywordRules.filter((r) => r.keywords.trim() || r.reply.trim()),
  }));
  const [badgeClass, badgeText] = MODE_BADGE[settings?.reply_mode] || [];

  return (
    <div className="ig-list-row">
      <div className="flex justify-between gap-12" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div className="flex items-center gap-8" style={{ flexWrap: 'wrap' }}>
            <strong>@{account.username}</strong>
            {account.is_default && <span className="badge badge-purple">★ Default</span>}
            {settings ? <span className={`badge ${badgeClass}`}>{badgeText}</span> : <span className="badge badge-warning">not monitored</span>}
            {settings?.auto_hide && <span className="badge badge-info">auto-hide spam</span>}
            {settings?.keyword_rules?.length > 0 && <span className="badge badge-info">{settings.keyword_rules.length} keyword replies</span>}
          </div>
          <div style={muted}>{settings?.last_checked_at ? `Last checked ${fmt(settings.last_checked_at)}` : 'Checked every 15 minutes once switched on'}</div>
          {settings?.last_error && <div style={danger}>{settings.last_error}</div>}
        </div>
        <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
          {settings && canManage && (
            <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => run('check', () => checkIgCommentsNow(account.id))}>
              {busy === 'check' ? <Loader2 size={14} className="spinning" /> : <RefreshCw size={14} />} Check now
            </button>
          )}
          <button className={`btn btn-sm ${open ? 'btn-primary' : 'btn-secondary'}`} onClick={onToggle} aria-expanded={open}>
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {settings ? 'Auto-reply settings' : 'Set up auto-reply'}
          </button>
        </div>
      </div>

      {open && (
        <fieldset disabled={!canManage || !!busy} style={{ border: 'none', padding: 0, margin: '16px 0 4px' }}>
          <div className="form-group">
            <label className="form-label">Reply mode</label>
            <div className="ig-two-col" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 10 }}>
              {MODES.map(([value, label, help]) => (
                <label key={value} className="kpi-tile" style={{ cursor: 'pointer', borderColor: f.replyMode === value ? 'var(--accent-primary)' : undefined }}>
                  <span className="flex items-center gap-8" style={{ fontWeight: 600, fontSize: 14 }}>
                    <input type="radio" name={`mode-${account.id}`} value={value} checked={f.replyMode === value}
                      onChange={() => setF({ ...f, replyMode: value })} style={{ accentColor: 'var(--accent-primary)' }} />
                    {label}
                  </span>
                  <span className="kpi-sub" style={{ display: 'block' }}>{help}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Reply to</label>
            <div className="flex gap-16" style={{ flexWrap: 'wrap' }}>
              {REPLY_TO.map(([v, label]) => (
                <label key={v} className="flex items-center gap-8" style={{ fontSize: 14, cursor: 'pointer' }}>
                  <input type="checkbox" checked={f.replyTo.includes(v)} onChange={() => toggleReplyTo(v)} style={{ accentColor: 'var(--accent-primary)' }} /> {label}
                </label>
              ))}
            </div>
            <div className="form-helper">Spam and abusive comments never get a reply. Keyword replies below apply to any comment that isn't spam.</div>
          </div>

          <div className="flex gap-24 form-group" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
            <label className="flex items-center gap-8" style={{ fontSize: 14 }}>
              Max replies per day
              <input className="form-input" type="number" min={0} max={200} style={{ width: 90 }} value={f.dailyReplyLimit}
                onChange={(e) => setF({ ...f, dailyReplyLimit: e.target.value })} />
            </label>
            <label className="flex items-center gap-8" style={{ fontSize: 14, cursor: 'pointer' }} title="Hide comments the AI is confident are spam, scams or abuse">
              <input type="checkbox" checked={f.autoHide} onChange={(e) => setF({ ...f, autoHide: e.target.checked })} style={{ accentColor: 'var(--accent-primary)' }} />
              Auto-hide spam &amp; abuse (shown under Flagged for review)
            </label>
          </div>

          <div className="form-group">
            <label className="form-label">Reply instructions for the AI</label>
            <textarea className="form-textarea" rows={3} maxLength={1000} value={f.replyInstructions}
              onChange={(e) => setF({ ...f, replyInstructions: e.target.value })}
              placeholder="e.g. Keep it short and friendly with one emoji. For price or size questions, ask them to DM us. Mention free shipping over ₹499 when it fits." />
            <div className="form-helper">The AI follows these for tone and content. It still never adds links, phone numbers or made-up prices.</div>
          </div>

          <div className="form-group">
            <label className="form-label">Keyword replies</label>
            {f.keywordRules.map((r, i) => (
              <div key={i} className="flex gap-8 mb-16" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <input className="form-input" style={{ flex: '1 1 180px' }} value={r.keywords} maxLength={300}
                  onChange={(e) => setRule(i, { keywords: e.target.value })} placeholder="price, cost, kitna" aria-label={`Keywords ${i + 1}`} />
                <input className="form-input" style={{ flex: '2 1 280px' }} value={r.reply} maxLength={500}
                  onChange={(e) => setRule(i, { reply: e.target.value })} placeholder="Hi! We've sent you the price in DM 💌" aria-label={`Reply ${i + 1}`} />
                <button type="button" className="btn btn-ghost btn-sm" aria-label="Remove keyword reply"
                  onClick={() => setF((s) => ({ ...s, keywordRules: s.keywordRules.filter((_, j) => j !== i) }))}><X size={14} /></button>
              </div>
            ))}
            {f.keywordRules.length < MAX_RULES && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setF((s) => ({ ...s, keywordRules: [...s.keywordRules, { keywords: '', reply: '' }] }))}>
                <Plus size={14} /> Add keyword reply
              </button>
            )}
            <div className="form-helper">
              When a comment contains one of the keywords (whole word, any case), this exact reply is used instead of the AI's, so links are fine here.
              Separate keywords with commas.
            </div>
          </div>

          {canManage ? (
            <button className="btn btn-primary" onClick={save}>
              {busy === 'save' ? <Loader2 size={16} className="spinning" /> : <Save size={16} />} {settings ? 'Save auto-reply settings' : 'Switch on monitoring'}
            </button>
          ) : <p className="form-helper">Only workspace owners and admins can change these settings.</p>}
          {f.replyMode === 'auto' && (
            <p className="form-helper mt-16">
              Auto-reply only answers comments from the last 3 days, and only when the AI is confident (keyword replies always go out). Needs the
              manage-comments permission. Check it under <Link to="/instagram">Accounts → Details</Link>.
            </p>
          )}
        </fieldset>
      )}
    </div>
  );
}

// ─── Comment list ────────────────────────────────────────────────────────────

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
          {c.status === 'replied' && (
            <div style={{ fontSize: 13, marginTop: 6, color: 'var(--text-secondary)' }}>
              ↳ Replied{c.reply_source ? ` (${SOURCE_LABEL[c.reply_source] || c.reply_source})` : ''}: {c.reply_text}
            </div>
          )}
          {c.error && <div style={danger}>{c.error}</div>}
          {needsReply && canManage && (
            <div className="flex gap-8 mt-16" style={{ flexWrap: 'wrap' }}>
              <input className="form-input" style={{ flex: '1 1 260px' }} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" maxLength={500} aria-label="Reply" />
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
  const [openIds, setOpenIds] = useState(null); // which accounts' auto-reply panels are expanded
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    try {
      const [a, c] = await Promise.all([getInstagramAccounts(), getIgComments({ filter, accountId: accountId || undefined })]);
      setAccounts(a.data || []);
      setData(c.data);
      setVersion((v) => v + 1);
      // First visit: open the default account's panel if it isn't monitored yet.
      setOpenIds((ids) => ids || new Set((a.data || []).slice(0, 1)
        .filter((acc) => !(c.data?.settings || []).some((s) => s.account_id === acc.id)).map((acc) => acc.id)));
    } catch (err) { toast.error(errMsg(err)); setAccounts((x) => x || []); }
  }, [filter, accountId]);
  useEffect(() => { load(); }, [load]);

  const onAction = async (fn) => {
    try { toast.success((await fn()).message || 'Done'); } catch (err) { toast.error(errMsg(err), { duration: 8000 }); }
    await load();
  };
  const toggle = (id) => setOpenIds((ids) => {
    const next = new Set(ids);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const settingsFor = (id) => data?.settings?.find((s) => s.account_id === id) || null;

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <h1>💬 Instagram Comments</h1>
        <p>DeepSeek reads new comments in each account's voice: it hides spam and abuse, and drafts replies or sends them automatically.</p>
      </div>

      {!accounts || !data ? <div className="empty-state"><div className="spinner spinner-lg" /></div> : accounts.length === 0 ? (
        <div className="card"><div className="card-body"><div className="empty-state">
          <MessageCircle size={48} /><h3>Connect an Instagram account first</h3><p><Link to="/instagram">Go to Instagram Accounts</Link></p>
        </div></div></div>
      ) : (
        <>
          {accounts.length > 1 && (
            <div className="flex items-center gap-12 mb-24">
              <select className="form-select" style={{ width: 'auto' }} value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Account filter">
                <option value="">All accounts</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>@{a.username}</option>)}
              </select>
              <span style={muted}>Filters the overview and the comment list.</span>
            </div>
          )}

          <Overview accountId={accountId} version={version} />

          <div className="card mb-24">
            <div className="card-header"><h2>🤖 Auto-reply</h2></div>
            <div className="card-body">
              {accounts.map((a) => (
                <AutoReplySettings key={`${a.id}-${settingsFor(a.id)?.updated_at || 'none'}`} account={a} settings={settingsFor(a.id)}
                  canManage={canManage} open={openIds?.has(a.id) || false} onToggle={() => toggle(a.id)} onChanged={load} />
              ))}
              <p className="form-helper">Only comments from the last 3 days are picked up, so switching this on never replies to an old backlog.</p>
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
