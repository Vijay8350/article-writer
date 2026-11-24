import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  MessageCircle, Loader2, Send, Save, RefreshCw, EyeOff, Eye, Trash2, SkipForward, ExternalLink, Plus, X, Settings2, Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  getInstagramAccounts, getIgComments, getIgCommentOverview, saveIgCommentSettings, checkIgCommentsNow, replyIgComment, igCommentAction,
} from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, Section, Sheet, Segmented, EmptyState, SettingRow, Switch } from '../components/ui';
import { errMsg, fmt, browserTimezone } from '../components/studio/shared';
import { ColumnChart, BarList, Kpi, compact } from '../components/insights/Charts';
import '../styles/ig-studio.css';

const MODES = [
  ['off', 'Off', "Don't reply. Spam is still hidden when that's turned on above."],
  ['review', 'Review', 'The AI writes a draft reply; you approve each one in the Comments list.'],
  ['auto', 'Auto-reply', 'Replies are posted automatically, up to your daily limit.'],
];
const MODE_STATUS = { off: ['status--off', 'Replies off'], review: ['status--on', 'Drafts replies for review'], auto: ['status--on', 'Auto-reply on'] };
const REPLY_TO = [['question', 'Questions'], ['positive', 'Positive comments'], ['neutral', 'Neutral comments']];
const FILTERS = [['needs_reply', 'Needs reply'], ['flagged', 'Flagged'], ['replied', 'Replied'], ['all', 'All']];
const EMPTY_TITLE = { needs_reply: 'No comments need a reply', flagged: 'Nothing flagged', replied: 'No replies yet', all: 'No comments yet' };
const PERIODS = [7, 30, 90];
const VERDICT_BADGE = { positive: 'badge-success', question: 'badge-info', neutral: 'badge-purple', bad: 'badge-danger' };
const VERDICT_LABEL = { positive: 'Positive', question: 'Question', neutral: 'Neutral', bad: 'Spam or abuse' };
const SOURCE_LABEL = { ai: 'auto-reply', rule: 'keyword reply', manual: 'you' };
const MAX_RULES = 20;

const duration = (s) => (s == null ? '—' : s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)} min`
  : s < 86400 ? `${(s / 3600).toFixed(1)} h` : `${(s / 86400).toFixed(1)} days`);
const percent = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : '—');
const localKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ─── Overview ────────────────────────────────────────────────────────────────

function Overview({ accountId, days, version, onSetUp }) {
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
    <Section title="Overview" description={`Comments collected in the last ${days} days.`}>
      {!ov ? <div className="empty-state"><div className="spinner spinner-lg" /></div> : t.total === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title="No comments in this period"
          text="Turn on monitoring for an account under Auto-reply below. New comments (from the last 3 days) are picked up every 15 minutes."
          action={onSetUp && <button className="btn btn-primary" onClick={onSetUp}><Settings2 size={16} /> Set up auto-reply</button>}
        />
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
          <div className="grid-2 mb-24">
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
          <div className="grid-2">
            <div>
              <div className="kpi-section-title">Top commenters</div>
              <BarList label="Top commenters" rows={ov.topCommenters.map((c) => ({ key: c.author, label: `@${c.author}`, value: c.n }))} />
            </div>
            <div>
              <div className="kpi-section-title">Most-commented posts</div>
              <div className="ig-top-posts">
                {ov.topPosts.map((p) => (
                  <div key={p.ig_media_id} className="ig-top-post">
                    <a href={p.permalink || '#'} target="_blank" rel="noreferrer">
                      {p.caption ? p.caption.slice(0, 60) : 'Post'} <ExternalLink size={11} aria-hidden="true" />
                    </a>
                    <span>{p.n}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </Section>
  );
}

// ─── Auto-reply (per account) ───────────────────────────────────────────────

function AutoReplyRow({ account, settings, canManage, onEdit, onChanged }) {
  const [busy, setBusy] = useState(null);
  const check = async () => {
    setBusy('check');
    try { toast.success((await checkIgCommentsNow(account.id)).message, { duration: 6000 }); } catch (err) { toast.error(errMsg(err), { duration: 8000 }); }
    await onChanged();
    setBusy(null);
  };
  const [statusClass, statusText] = settings ? (MODE_STATUS[settings.reply_mode] || ['status--on', 'Monitored']) : ['status--warn', 'Not monitored'];

  return (
    <div className="list-item list-item--top">
      <div className="list-item__main">
        <div className="list-item__title">
          @{account.username}
          {account.is_default && <span className="badge badge-purple">Default</span>}
        </div>
        <div className="list-item__meta">
          <span className={`status ${statusClass}`}>{statusText}</span>
          {settings?.auto_hide && <span>Hides spam</span>}
          {settings?.keyword_rules?.length > 0 && <span>{settings.keyword_rules.length} keyword replies</span>}
          <span>{settings?.last_checked_at ? `Last checked ${fmt(settings.last_checked_at)}` : 'Checked every 15 minutes once turned on'}</span>
        </div>
        {settings?.last_error && <div className="callout callout--danger callout--compact mt-16">{settings.last_error}</div>}
      </div>
      <div className="list-item__actions">
        {settings && canManage && (
          <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={check}>
            {busy === 'check' ? <Loader2 size={14} className="spinning" /> : <RefreshCw size={14} />} Check now
          </button>
        )}
        <button className="btn btn-secondary btn-sm" onClick={onEdit}>
          <Settings2 size={14} /> {!canManage ? 'View settings' : settings ? 'Edit settings' : 'Set up auto-reply'}
        </button>
      </div>
    </div>
  );
}

function AutoReplySheet({ account, settings, canManage, onClose, onSaved, onChanged }) {
  const [f, setF] = useState(() => ({
    replyMode: settings?.reply_mode || 'review',
    autoHide: settings?.auto_hide ?? true,
    dailyReplyLimit: settings?.daily_reply_limit ?? 30,
    replyTo: settings?.reply_to || REPLY_TO.map(([v]) => v),
    replyInstructions: settings?.reply_instructions || '',
    keywordRules: (settings?.keyword_rules || []).map((r) => ({ keywords: r.keywords.join(', '), reply: r.reply })),
  }));
  const [busy, setBusy] = useState(false);
  const setRule = (i, patch) => setF((s) => ({ ...s, keywordRules: s.keywordRules.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const toggleReplyTo = (v) => setF((s) => ({ ...s, replyTo: s.replyTo.includes(v) ? s.replyTo.filter((x) => x !== v) : [...s.replyTo, v] }));
  const save = async () => {
    setBusy(true);
    try {
      const res = await saveIgCommentSettings(account.id, {
        ...f, keywordRules: f.keywordRules.filter((r) => r.keywords.trim() || r.reply.trim()),
      });
      toast.success(res.message, { duration: 6000 });
      onSaved(); // closes the sheet and reloads
      return;
    } catch (err) { toast.error(errMsg(err), { duration: 8000 }); }
    await onChanged();
    setBusy(false);
  };
  const locked = !canManage || busy;
  const mode = MODES.find(([value]) => value === f.replyMode);

  return (
    <Sheet
      open
      title={`Auto-reply for @${account.username}`}
      subtitle={settings ? 'How comments on this account are read, hidden and answered.' : 'Turn on monitoring to start reading comments on this account.'}
      onClose={onClose}
      busy={busy}
      width={640}
      footer={canManage ? (
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? <Loader2 size={16} className="spinning" /> : <Save size={16} />} {settings ? 'Save settings' : 'Turn on monitoring'}
          </button>
        </>
      ) : <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>}
    >
      {!canManage && (
        <div className="callout callout--info mb-24"><Info size={16} aria-hidden="true" /> Only workspace owners and admins can change these settings.</div>
      )}
      <fieldset disabled={locked} className="ig-fieldset">
        <div className="form-section">
          <h3 className="form-section__title">Monitoring</h3>
          <p className="form-section__desc">New comments are checked every 15 minutes. Only the last 3 days are picked up, so an old backlog never gets replies.</p>
          <div>
            <SettingRow title="Hide spam and abuse" htmlFor={`hide-${account.id}`}
              description="Comments the AI is confident are spam, scams or abuse are hidden and listed under Flagged for review.">
              <Switch id={`hide-${account.id}`} checked={f.autoHide} disabled={locked} onChange={(autoHide) => setF({ ...f, autoHide })} />
            </SettingRow>
          </div>
        </div>

        <div className="form-section">
          <h3 className="form-section__title">Replies</h3>
          <p className="form-section__desc">How replies are written and sent.</p>
          <div className="form-group">
            <span className="form-label">Reply mode</span>
            <div className="ig-seg-full">
              <Segmented value={f.replyMode} onChange={(replyMode) => setF({ ...f, replyMode })} ariaLabel="Reply mode" disabled={locked}
                options={MODES.map(([value, label]) => ({ value, label }))} />
            </div>
            {mode && <div className="form-helper">{mode[2]}</div>}
          </div>
          {f.replyMode === 'auto' && (
            <div className="callout callout--info mb-16">
              <Info size={16} aria-hidden="true" />
              <span>
                Auto-reply only answers comments from the last 3 days, and only when the AI is confident (keyword replies always go out). It needs the
                manage-comments permission; check it under <Link to="/instagram">Accounts → Details</Link>.
              </span>
            </div>
          )}
          <div className="form-group">
            <span className="form-label">Reply to</span>
            <div className="ig-checks">
              {REPLY_TO.map(([v, label]) => (
                <label key={v} className="ig-check-label">
                  <input type="checkbox" checked={f.replyTo.includes(v)} onChange={() => toggleReplyTo(v)} /> {label}
                </label>
              ))}
            </div>
            <div className="form-helper">Spam and abusive comments never get a reply. Keyword replies apply to any comment that isn't spam.</div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor={`limit-${account.id}`}>Max replies per day</label>
            <input id={`limit-${account.id}`} className="form-input ig-number" type="number" min={0} max={200} value={f.dailyReplyLimit}
              onChange={(e) => setF({ ...f, dailyReplyLimit: e.target.value })} />
          </div>
        </div>

        <div className="form-section">
          <h3 className="form-section__title">Instructions for the AI</h3>
          <p className="form-section__desc">Followed for tone and content. The AI still never adds links, phone numbers or made-up prices.</p>
          <div className="form-group">
            <label className="form-label" htmlFor={`instr-${account.id}`}>Reply instructions</label>
            <textarea id={`instr-${account.id}`} className="form-textarea" rows={3} maxLength={1000} value={f.replyInstructions}
              onChange={(e) => setF({ ...f, replyInstructions: e.target.value })}
              placeholder="e.g. Keep it short and friendly with one emoji. For price or size questions, ask them to DM us. Mention free shipping over ₹499 when it fits." />
          </div>
        </div>

        <div className="form-section">
          <h3 className="form-section__title">Keyword replies</h3>
          <p className="form-section__desc">
            When a comment contains one of the keywords (whole word, any case), this exact reply is used instead of the AI's, so links are fine here.
            Separate keywords with commas.
          </p>
          {f.keywordRules.length > 0 && (
            <div className="ig-rules">
              {f.keywordRules.map((r, i) => (
                <div key={i} className="ig-rule">
                  <input className="form-input" value={r.keywords} maxLength={300}
                    onChange={(e) => setRule(i, { keywords: e.target.value })} placeholder="price, cost, kitna" aria-label={`Keywords ${i + 1}`} />
                  <input className="form-input" value={r.reply} maxLength={500}
                    onChange={(e) => setRule(i, { reply: e.target.value })} placeholder="Hi, we've sent you the price in a DM." aria-label={`Reply ${i + 1}`} />
                  <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label={`Remove keyword reply ${i + 1}`} title="Remove"
                    onClick={() => setF((s) => ({ ...s, keywordRules: s.keywordRules.filter((_, j) => j !== i) }))}><X size={14} /></button>
                </div>
              ))}
            </div>
          )}
          {f.keywordRules.length < MAX_RULES && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setF((s) => ({ ...s, keywordRules: [...s.keywordRules, { keywords: '', reply: '' }] }))}>
              <Plus size={14} /> Add keyword reply
            </button>
          )}
        </div>
      </fieldset>
    </Sheet>
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
    <div className="list-item list-item--top">
      <div className="list-item__main">
        <div className="list-item__title">
          @{c.author || 'someone'}
          {c.verdict && <span className={`badge ${VERDICT_BADGE[c.verdict] || 'badge-info'}`}>{VERDICT_LABEL[c.verdict] || c.verdict}{c.category ? ` · ${c.category.replace('_', ' ')}` : ''}</span>}
          {c.hidden && <span className="badge badge-warning">Hidden</span>}
        </div>
        <div className="list-item__meta">
          <span>On @{c.username}</span>
          <span>{fmt(c.commented_at)}</span>
          {c.media_permalink && <a href={c.media_permalink} target="_blank" rel="noreferrer">View post <ExternalLink size={11} aria-hidden="true" /></a>}
        </div>
        <p className="ig-comment__text">{c.text}</p>
        {c.reason && <div className="ig-meta">AI: {c.reason}{c.confidence != null ? ` (${Math.round(Number(c.confidence) * 100)}% sure)` : ''}</div>}
        {c.status === 'replied' && (
          <div className="ig-comment__reply">
            Replied{c.reply_source ? ` (${SOURCE_LABEL[c.reply_source] || c.reply_source})` : ''}: {c.reply_text}
          </div>
        )}
        {c.error && <div className="ig-error">{c.error}</div>}
        {needsReply && canManage && (
          <div className="ig-reply-box">
            <input className="form-input" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" maxLength={500} aria-label={`Reply to @${c.author || 'someone'}`} />
            <button className="btn btn-primary btn-sm" disabled={!!busy || !reply.trim()} onClick={() => act('reply', () => replyIgComment(c.id, reply))}>
              {busy === 'reply' ? <Loader2 size={14} className="spinning" /> : <Send size={14} />} Send
            </button>
            <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => act('skip', () => igCommentAction(c.id, 'skip'))}><SkipForward size={14} /> Skip</button>
          </div>
        )}
      </div>
      {c.status === 'flagged' && canManage && (
        <div className="list-item__actions">
          <button className="btn btn-secondary btn-sm" disabled={!!busy} title="It's fine — make it visible again" onClick={() => act('approve', () => igCommentAction(c.id, 'approve'))}><Eye size={14} /> It's fine</button>
          <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => act('hide', () => igCommentAction(c.id, 'hide'))}><EyeOff size={14} /> Keep hidden</button>
          <button className="btn btn-danger btn-sm" disabled={!!busy}
            onClick={() => window.confirm('Delete this comment from Instagram permanently?') && act('delete', () => igCommentAction(c.id, 'delete'))}><Trash2 size={14} /> Delete</button>
        </div>
      )}
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
  const [days, setDays] = useState(30);
  const [editing, setEditing] = useState(null); // the account whose auto-reply settings are open
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    try {
      const [a, c] = await Promise.all([getInstagramAccounts(), getIgComments({ filter, accountId: accountId || undefined })]);
      setAccounts(a.data || []);
      setData(c.data);
      setVersion((v) => v + 1);
    } catch (err) { toast.error(errMsg(err)); setAccounts((x) => x || []); }
  }, [filter, accountId]);
  useEffect(() => { load(); }, [load]);

  const onAction = async (fn) => {
    try { toast.success((await fn()).message || 'Done'); } catch (err) { toast.error(errMsg(err), { duration: 8000 }); }
    await load();
  };
  const closeEditor = useCallback(() => setEditing(null), []);

  const settingsFor = (id) => data?.settings?.find((s) => s.account_id === id) || null;
  const editingAccount = editing && accounts?.find((a) => a.id === editing);
  // The account the overview's "Set up auto-reply" opens: the filtered one, or the first that isn't monitored.
  const setupTarget = accountId
    ? (settingsFor(accountId) ? null : accounts?.find((a) => a.id === accountId))
    : accounts?.find((a) => !settingsFor(a.id));

  return (
    <div className="page-container fade-in ig-page">
      <PageHeader
        title="Instagram Comments"
        subtitle="DeepSeek reads new comments in each account's voice, hides spam and abuse, and drafts replies or sends them for you."
      />

      {!accounts || !data ? <div className="empty-state"><div className="spinner spinner-lg" /></div> : accounts.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={MessageCircle}
            title="Connect an Instagram account first"
            text="Comments are read from a connected Instagram account."
            action={<Link to="/instagram" className="btn btn-primary">Go to Instagram accounts</Link>}
          />
        </div>
      ) : (
        <>
          <div className="toolbar">
            {accounts.length > 1 && (
              <select className="form-select" value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Account"
                title="Filters the overview and the comment list">
                <option value="">All accounts</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>@{a.username}</option>)}
              </select>
            )}
            <Segmented value={days} onChange={setDays} ariaLabel="Overview period"
              options={PERIODS.map((d) => ({ value: d, label: `Last ${d} days` }))} />
          </div>

          <div className="stack">
            <Overview accountId={accountId} days={days} version={version}
              onSetUp={canManage && setupTarget ? () => setEditing(setupTarget.id) : null} />

            <Section flush title="Auto-reply" description="Only comments from the last 3 days are picked up, so turning this on never replies to an old backlog.">
              <div className="list">
                {accounts.map((a) => (
                  <AutoReplyRow key={a.id} account={a} settings={settingsFor(a.id)} canManage={canManage}
                    onEdit={() => setEditing(a.id)} onChanged={load} />
                ))}
              </div>
            </Section>

            <Section
              flush
              className="ig-wrap-head"
              title="Comments"
              actions={(
                <Segmented size="sm" value={filter} onChange={setFilter} ariaLabel="Show comments"
                  options={FILTERS.map(([key, label]) => ({ value: key, label: `${label}${data.counts?.[key] != null ? ` (${data.counts[key]})` : ''}` }))} />
              )}
            >
              {data.comments.length === 0 ? (
                <EmptyState
                  icon={MessageCircle}
                  title={EMPTY_TITLE[filter] || 'Nothing here'}
                  text="New comments appear here after the next check."
                  action={filter !== 'all' && <button className="btn btn-secondary" onClick={() => setFilter('all')}>Show all comments</button>}
                />
              ) : (
                <div className="list">
                  {data.comments.map((c) => <CommentRow key={`${c.id}-${c.status}`} c={c} canManage={canManage} onAction={onAction} />)}
                </div>
              )}
            </Section>
          </div>

          {editingAccount && (
            <AutoReplySheet
              key={`${editingAccount.id}-${settingsFor(editingAccount.id)?.updated_at || 'none'}`}
              account={editingAccount}
              settings={settingsFor(editingAccount.id)}
              canManage={canManage}
              onClose={closeEditor}
              onSaved={() => { setEditing(null); load(); }}
              onChanged={load}
            />
          )}
        </>
      )}
    </div>
  );
}
