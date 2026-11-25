import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  SearchCheck, Loader2, Play, Sparkles, Undo2, EyeOff, ExternalLink, Wrench, Link2, Unlink, Save, RefreshCw, RotateCcw, Star, CheckCheck,
  CalendarClock, AlertTriangle, ListChecks, History, Info, Lock,
} from 'lucide-react';
import { PageHeader, Sheet, Segmented, EmptyState, Section, Switch, SettingRow } from '../components/ui';
import toast from 'react-hot-toast';
import {
  getSeoOverview, saveSeoSettings, runSeoAudit, getSeoIssues, suggestSeoFix, fixSeoIssue, fixAllSeoIssues, ignoreSeoIssue, restoreSeoIssue,
  getSeoChanges, undoSeoChange, startGoogleConnect, getGoogleSites, setGoogleSite, disconnectGoogle, getRatingStatus, addReviewStars,
} from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { ColumnChart, BarList, Kpi, compact } from '../components/insights/Charts';
import { fmtNext, timezoneOptions } from './InstagramScheduler';

const TABS = [['overview', 'Overview'], ['issues', 'Problems'], ['changes', 'Changes made'], ['google', 'Search Console'], ['settings', 'Settings']];
const SEVERITY = { critical: ['badge-danger', 'Critical'], high: ['badge-warning', 'High'], medium: ['badge-info', 'Medium'], low: ['badge-purple', 'Low'] };
const ISSUE_VIEWS = [['open', 'Open'], ['fixed', 'Fixed'], ['resolved', 'Gone'], ['ignored', 'Ignored']];
const POLL_MS = 5000;
// What Google shows in full, and the most the server accepts from a person.
const LIMITS = { seoTitle: [60, 70], seoDescription: [160, 200] };
const FIX_LABELS = { meta: 'Fix', alt: 'Add alt text', links: 'Remove dead links', article: 'Rewrite', claims: 'Fix', hide: 'Hide from store' };
const BULK_KINDS = ['claims', 'alt', 'links']; // rule-based fixes, safe to run on every page at once
const CONFIRM = {
  article: 'Rewrite this whole article with AI? It keeps the images and links, and you can undo it under Changes made. This takes a minute or two.',
  hide: 'Hide this collection from your online store? Shoppers and Google stop seeing it. You can undo it under Changes made.',
};

const errMsg = (err, fallback = 'Something went wrong') => err.response?.data?.error || fallback;
const muted = { fontSize: 12, color: 'var(--text-muted)' };
const fmtDate = (d) => new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short' });
const percent = (n) => `${(n * 100).toFixed(1)}%`;

function change(now, before, { invert = false, format = compact } = {}) {
  if (!before) return 'No earlier data';
  const delta = now - before;
  const better = invert ? delta < 0 : delta > 0;
  return delta ? `${better ? 'Better' : 'Worse'} than ${format(before)} before` : 'Same as before';
}

function SearchSummary({ search }) {
  if (!search) return null;
  if (search.error) return <div className="callout callout--warning"><AlertTriangle size={16} /><span>{search.error}</span></div>;
  const { current, previous, topQueries } = search;
  return (
    <Section title="Google search" description="The last 28 days, from Search Console">
      <div className="kpi-grid mb-24">
        <Kpi label="Clicks" value={compact(current.clicks)} sub={change(current.clicks, previous.clicks)} />
        <Kpi label="Times shown" value={compact(current.impressions)} sub={change(current.impressions, previous.impressions)} />
        <Kpi label="Click rate" value={percent(current.ctr)} sub={change(current.ctr, previous.ctr, { format: percent })} />
        <Kpi label="Average position" value={current.position || '—'} sub={change(current.position, previous.position, { invert: true })} />
      </div>
      <BarList label="Top searches" rows={topQueries.map((q) => ({ key: q.key, label: q.key, value: q.clicks }))} empty="No searches recorded yet" />
    </Section>
  );
}

const FREE_SHIPPING_TEXT = { none: 'no free shipping', all: 'free shipping on every order' };
function describeFacts(facts) {
  const cod = facts.cod === false ? 'Prepaid only, no Cash on Delivery' : facts.cod ? 'Cash on Delivery offered' : 'Cash on Delivery not set';
  const free = facts.freeShipping === 'over' ? `free shipping over ₹${facts.freeShippingMin}` : FREE_SHIPPING_TEXT[facts.freeShipping] || 'free shipping not set';
  return `${cod}; ${free}.`;
}

// Fixes that apply to the whole store rather than one page.
function StoreFixes({ canManage, settings, onOpenSettings }) {
  const [rating, setRating] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => getRatingStatus()
    .then((res) => setRating(res.data))
    .catch((err) => setRating({ state: 'error', message: errMsg(err, 'Could not check your theme.') })), []);
  useEffect(() => { load(); }, [load]);

  const addStars = async () => {
    if (!window.confirm('Add review stars to your live theme? A backup is kept, a product page is checked straight after, and the theme is put back by itself if anything looks wrong. You can undo it under Changes made.')) return;
    setBusy(true);
    try {
      toast.success((await addReviewStars()).message, { duration: 10000 });
      await load();
    } catch (err) { toast.error(errMsg(err), { duration: 12000 }); }
    setBusy(false);
  };

  const facts = settings.store_facts;
  return (
    <Section title="Store-wide fixes" description="Changes that help every page at once" flush>
      <div className="list">
        <div className="list-item">
          <span className="list-item__media"><Star size={18} /></span>
          <div className="list-item__main">
            <div className="list-item__title">Review stars in Google</div>
            <div className="list-item__meta">
              {!rating ? 'Checking your theme…' : rating.state === 'available'
                ? `${rating.reviewed} products have reviews, but their pages don't give Google the rating, so no stars show in search results.`
                : rating.message}
            </div>
          </div>
          <div className="list-item__actions">
            {rating?.state === 'installed' && <span className="status status--on">On</span>}
            {canManage && rating?.state === 'available' && (
              <button className="btn btn-sm btn-primary" disabled={busy} onClick={addStars}>
                {busy ? <Loader2 size={13} className="spinning" /> : <Star size={13} />} {busy ? 'Adding and checking…' : 'Add review stars'}
              </button>
            )}
          </div>
        </div>
        <div className="list-item">
          <span className="list-item__media"><Info size={18} /></span>
          <div className="list-item__main">
            <div className="list-item__title">Store facts</div>
            <div className="list-item__meta">{facts ? describeFacts(facts) : 'Say whether you offer Cash on Delivery and free shipping, so product text that promises otherwise can be caught.'}</div>
          </div>
          {canManage && (
            <div className="list-item__actions">
              <button className="btn btn-sm btn-secondary" onClick={onOpenSettings}>{facts ? 'Change' : 'Set store facts'}</button>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}

function OverviewTab({ data, canManage, onOpenSettings, onRun, busy, onShowProblems }) {
  const { audits, counts, types } = data;
  const done = audits.filter((a) => a.status === 'done');
  const last = done[0];
  const storeFixes = <StoreFixes canManage={canManage} settings={data.settings} onOpenSettings={onOpenSettings} />;
  if (!last) {
    return (
      <div className="stack">
        <div className="card">
          <EmptyState
            icon={SearchCheck}
            title="No site check yet"
            text="Check your store once to see how every page looks to Google. Nothing is changed by a check."
            action={canManage && (
              <button className="btn btn-primary" disabled={busy} onClick={() => onRun(false)}>
                {busy ? <Loader2 size={15} className="spinning" /> : <Play size={15} />} Check site now
              </button>
            )}
          />
        </div>
        {storeFixes}
      </div>
    );
  }
  const open = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const locked = Boolean(last.password_protected);
  return (
    <div className="stack">
      {locked && (
        <div className="callout callout--warning" role="status">
          <Lock size={16} />
          <span>
            Your online store is password-protected, so Google can't see it yet. Titles and descriptions were checked from your Shopify data.
            Headings, dead links and whether each page loads are checked once you remove the password (Online Store → Preferences).
          </span>
        </div>
      )}
      <div className="kpi-grid">
        <Kpi
          label="SEO health"
          value={last.score}
          sub="out of 100"
          hint={`Each page starts at 100 and loses points for its problems.${locked ? ' Checks that need your live store are left out until the password is removed.' : ''}`}
        />
        <Kpi label="Pages checked" value={compact(last.pages_checked)} sub={`Last check ${fmtDate(last.started_at)}`} />
        <Kpi label="Problems open" value={compact(open)} sub={`${counts.critical || 0} critical, ${counts.high || 0} high`} />
        <Kpi label="Pages improved" value={compact(last.fixes_applied)} sub="in the last check" />
      </div>
      <div className="grid-2">
        <Section title="SEO health by day" description="Out of 100, after each daily check">
          <ColumnChart data={[...done].reverse().map((a) => ({ label: fmtDate(a.started_at), value: a.score }))} highlight={done.length - 1} valueLabel="Score" label="SEO health by day" />
        </Section>
        <Section
          title="What's wrong"
          description="Open problems by type"
          actions={open > 0 && <button className="btn btn-sm btn-ghost" onClick={onShowProblems}>See all <ListChecks size={14} /></button>}
        >
          <BarList label="Problems by type" rows={types.map((t) => ({ key: t.type, label: t.label, value: t.n }))} limit={10} empty="Nothing open" />
        </Section>
      </div>
      <SearchSummary search={last.search} />
      {storeFixes}
    </div>
  );
}

function Counter({ value, field }) {
  const [shown, hardMax] = LIMITS[field];
  const n = value.length;
  const color = n > hardMax ? 'var(--accent-danger)' : n > shown ? 'var(--accent-warning)' : 'var(--text-muted)';
  return <span style={{ fontSize: 12, color }}>{n} / {shown}{n > shown && n <= hardMax ? ' · Google may cut this off' : ''}</span>;
}

// A title or description fix: the AI's suggestion (or the reason there isn't one), which
// the owner can change or replace before anything is saved to the store.
function MetaEditor({ issue, onClose, onSaved }) {
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState({ seoTitle: '', seoDescription: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const suggest = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await suggestSeoFix(issue.id);
      setInfo(data);
      setForm({
        seoTitle: data.suggestion?.seoTitle || data.current.seoTitle || '',
        seoDescription: data.suggestion?.seoDescription || data.current.seoDescription || '',
      });
    } catch (err) {
      toast.error(errMsg(err), { duration: 8000 });
      onClose();
    }
    setLoading(false);
  }, [issue.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { suggest(); }, [suggest]);

  const save = async () => {
    setSaving(true);
    try {
      toast.success((await fixSeoIssue(issue.id, form)).message);
      onSaved();
    } catch (err) {
      toast.error(errMsg(err), { duration: 8000 });
      setSaving(false);
    }
  };

  const tooLong = form.seoTitle.length > LIMITS.seoTitle[1] || form.seoDescription.length > LIMITS.seoDescription[1];
  const canSave = !loading && !saving && form.seoTitle.trim() && form.seoDescription.trim() && !tooLong;
  const field = (key, label, rows) => (
    <div className="form-group">
      <div className="flex justify-between" style={{ alignItems: 'baseline' }}>
        <label className="form-label" htmlFor={key}>{label}</label>
        <Counter value={form[key]} field={key} />
      </div>
      {rows ? (
        <textarea id={key} className="form-textarea" rows={rows} value={form[key]} disabled={loading || saving} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
      ) : (
        <input id={key} className="form-input" value={form[key]} disabled={loading || saving} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
      )}
    </div>
  );

  return (
    <Sheet
      open
      title="Google title and description"
      subtitle={`${issue.label}: ${issue.detail}`}
      onClose={onClose}
      busy={saving}
      footer={(
        <>
          <button className="btn btn-ghost" disabled={saving} onClick={onClose}>Cancel</button>
          <button className="btn btn-secondary" disabled={loading || saving} onClick={suggest}><RefreshCw size={15} /> Suggest again</button>
          <button className="btn btn-primary" disabled={!canSave} onClick={save}>{saving ? <Loader2 size={15} className="spinning" /> : <Save size={15} />} Save to store</button>
        </>
      )}
    >
        <a href={issue.url} target="_blank" rel="noreferrer" style={{ fontSize: 14, overflowWrap: 'anywhere', display: 'inline-block', marginBottom: 16 }}>{issue.title} <ExternalLink size={12} /></a>

        {loading ? (
          <div className="flex gap-8" style={{ alignItems: 'center', padding: '24px 0' }}><Loader2 size={16} className="spinning" /> Writing a suggestion from the page's own details…</div>
        ) : (
          <>
            {info?.note
              ? <div className="seo-modal__note">{info.note}</div>
              : <div style={{ ...muted, marginBottom: 12 }}>Suggested by DeepSeek from this page's details. Change anything you like before saving.</div>}
            {field('seoTitle', 'Title in Google')}
            {info?.storeName && !form.seoTitle.toLowerCase().includes(info.storeName.toLowerCase()) && (
              <p className="form-helper" style={{ marginTop: -8, marginBottom: 12 }}>Most themes add “ – {info.storeName}” to a title that doesn't name the store. End it with “| {info.storeName}” to control that.</p>
            )}
            {field('seoDescription', 'Description in Google', 3)}
            <div className="seo-preview" aria-label="How it may look in Google">
              <div className="seo-preview__url">{issue.url}</div>
              <div className="seo-preview__title">{form.seoTitle || issue.title}</div>
              <div className="seo-preview__desc">{form.seoDescription || 'No description yet.'}</div>
            </div>
            <div style={{ ...muted, marginTop: 8 }}>
              Before: {info?.current.seoTitle || 'no title set (Google uses the page name)'}{info?.current.seoDescription ? ` — ${info.current.seoDescription}` : ''}
            </div>
          </>
        )}
        <p className="form-helper" style={{ marginTop: 16 }}>Saved changes are listed under Changes made, where you can undo them.</p>
    </Sheet>
  );
}

// A false promise: exactly which lines change, before anything is saved.
function ClaimsPreview({ issue, onClose, onSaved }) {
  const [plan, setPlan] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    suggestSeoFix(issue.id)
      .then((res) => setPlan(res.data))
      .catch((err) => { toast.error(errMsg(err), { duration: 8000 }); onClose(); });
  }, [issue.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setSaving(true);
    try {
      toast.success((await fixSeoIssue(issue.id)).message);
      onSaved();
    } catch (err) {
      toast.error(errMsg(err), { duration: 8000 });
      setSaving(false);
    }
  };

  return (
    <Sheet
      open
      title="Remove a promise you don't make"
      subtitle={issue.detail}
      onClose={onClose}
      busy={saving}
      footer={(
        <>
          <button className="btn btn-ghost" disabled={saving} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!plan || !!plan.note || saving} onClick={save}>{saving ? <Loader2 size={15} className="spinning" /> : <Save size={15} />} Save to store</button>
        </>
      )}
    >
        <a href={issue.url} target="_blank" rel="noreferrer" style={{ fontSize: 14, overflowWrap: 'anywhere', display: 'inline-block', marginBottom: 16 }}>{issue.title} <ExternalLink size={12} /></a>
        {!plan ? (
          <div className="flex gap-8" style={{ alignItems: 'center', padding: '24px 0' }}><Loader2 size={16} className="spinning" /> Reading this product from Shopify…</div>
        ) : (
          <>
            {plan.note && <div className="seo-modal__note">{plan.note}</div>}
            {plan.changes.map((c, i) => (
              <div key={i} className="seo-change">
                <div className="seo-change__where">{c.where}</div>
                <div className="seo-change__before">{c.before}</div>
                <div className="seo-change__after">{c.after === null ? 'This line is removed.' : c.after}</div>
              </div>
            ))}
          </>
        )}
        <p className="form-helper" style={{ marginTop: 16 }}>Only the promise is taken out. Every other word stays, and you can undo it under Changes made.</p>
    </Sheet>
  );
}

const inspectUrl = (site, url) => `https://search.google.com/search-console/inspect?resource_id=${encodeURIComponent(site)}&id=${encodeURIComponent(url)}`;

function IssuesTab({ canManage, refreshKey, onChanged, googleSite }) {
  const [view, setView] = useState('open');
  const [type, setType] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(null);
  const [editing, setEditing] = useState(null);
  const [bulk, setBulk] = useState(false);
  const closeEditor = useCallback(() => setEditing(null), []);

  const load = useCallback(async () => {
    try { setResult(await getSeoIssues(view, type)); }
    catch (err) { toast.error(errMsg(err, 'Failed to load problems')); }
  }, [view, type]);
  useEffect(() => { setResult(null); load(); }, [load, refreshKey]);

  const switchView = (key) => { setType(''); setView(key); };
  const act = async (id, fn) => {
    setBusy(id);
    try {
      toast.success((await fn(id)).message);
      await load();
      onChanged();
    } catch (err) { toast.error(errMsg(err), { duration: 10000 }); }
    setBusy(null);
  };
  const fix = (issue) => {
    if (issue.fixKind === 'meta' || issue.fixKind === 'claims') return setEditing(issue);
    if (CONFIRM[issue.fixKind] && !window.confirm(CONFIRM[issue.fixKind])) return undefined;
    return act(issue.id, (id) => fixSeoIssue(id));
  };

  const issues = result?.data;
  const types = result?.types || [];
  const total = types.reduce((sum, t) => sum + t.n, 0);
  const shownTotal = type ? types.find((t) => t.type === type)?.n || 0 : total;
  const typeLabel = types.find((t) => t.type === type)?.label;
  const bulkKind = type && view === 'open' && canManage ? issues?.[0]?.fixKind : null;
  const Editor = editing ? (editing.fixKind === 'claims' ? ClaimsPreview : MetaEditor) : null;

  const fixAll = async () => {
    if (!window.confirm(`Fix all ${shownTotal} "${typeLabel}" problems on your store now? Each change is listed under Changes made, where it can be undone.`)) return;
    setBulk(true);
    try {
      const res = await fixAllSeoIssues(type);
      (res.data.failed.length ? toast : toast.success)(res.message, { duration: 10000 });
      await load();
      onChanged();
    } catch (err) { toast.error(errMsg(err), { duration: 10000 }); }
    setBulk(false);
  };

  const EMPTY_TEXT = {
    open: 'No open problems. The daily check adds anything new it finds.',
    fixed: 'Problems you or the daily check fixed show up here.',
    resolved: 'Problems that went away on their own show up here.',
    ignored: 'Problems you ignore show up here, and the daily check leaves them alone.',
  };

  return (
    <>
      <div className="toolbar">
        <Segmented
          ariaLabel="Which problems"
          value={view}
          onChange={switchView}
          options={ISSUE_VIEWS.map(([key, label]) => ({ value: key, label }))}
        />
        {types.length > 0 && (
          <select className="form-select" style={{ minWidth: 240 }} value={type} onChange={(e) => setType(e.target.value)} aria-label="Problem type">
            <option value="">All problems ({total})</option>
            {types.map((t) => <option key={t.type} value={t.type}>{t.label} ({t.n})</option>)}
          </select>
        )}
        <span className="toolbar__spacer" />
        {BULK_KINDS.includes(bulkKind) && shownTotal > 0 && (
          <button className="btn btn-primary" disabled={bulk || !!busy} onClick={fixAll} title="Fix every problem of this type now">
            {bulk ? <Loader2 size={15} className="spinning" /> : <CheckCheck size={15} />} {bulk ? 'Fixing…' : `Fix all ${shownTotal}`}
          </button>
        )}
      </div>
      {!issues ? <div className="card"><div className="empty-state"><div className="spinner spinner-lg" /></div></div> : issues.length === 0 ? (
        <div className="card"><EmptyState icon={ListChecks} title="Nothing here" text={EMPTY_TEXT[view]} /></div>
      ) : (
        <>
          {issues.length < shownTotal && <div className="callout callout--info mb-16"><Info size={16} /><span>Showing the first {issues.length} of {shownTotal}. Pick a problem type to see the rest.</span></div>}
          <div className="card table-container">
            <table className="data-table">
              <thead><tr><th>Priority</th><th>Problem</th><th>Page</th>{canManage && (view === 'open' || view === 'ignored') && <th />}</tr></thead>
              <tbody>
                {issues.map((issue) => {
                  const [cls, label] = SEVERITY[issue.severity] || ['badge-info', issue.severity];
                  return (
                    <tr key={issue.id}>
                      <td><span className={`badge ${cls}`}>{label}</span></td>
                      <td>
                        <div>{issue.label}</div>
                        <div style={{ ...muted, overflowWrap: 'anywhere' }}>{issue.detail}</div>
                        {issue.advice && view === 'open' && (
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, overflowWrap: 'anywhere' }}><strong>What to do:</strong> {issue.advice}</div>
                        )}
                        {issue.type === 'not_indexed' && googleSite && (
                          <a href={inspectUrl(googleSite, issue.url)} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Check it in Search Console <ExternalLink size={11} /></a>
                        )}
                      </td>
                      <td>
                        <a href={issue.url} target="_blank" rel="noreferrer" style={{ overflowWrap: 'anywhere' }}>{issue.title} <ExternalLink size={11} /></a>
                        <div style={muted}>{issue.resource_type}</div>
                      </td>
                      {canManage && view === 'open' && (
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {issue.fixable && (
                            <button className="btn btn-sm btn-secondary" disabled={!!busy} onClick={() => fix(issue)} title={issue.fixKind === 'meta' ? 'See a suggestion, edit it, then save' : 'Fix this one now'}>
                              {busy === issue.id ? <Loader2 size={13} className="spinning" /> : <Wrench size={13} />} {FIX_LABELS[issue.fixKind] || 'Fix'}
                            </button>
                          )}{' '}
                          <button className="btn btn-sm btn-ghost" disabled={!!busy} onClick={() => act(issue.id, ignoreSeoIssue)} title="Ignore: the daily run leaves it alone" aria-label="Ignore"><EyeOff size={13} /></button>
                        </td>
                      )}
                      {canManage && view === 'ignored' && (
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button className="btn btn-sm btn-secondary" disabled={!!busy} onClick={() => act(issue.id, restoreSeoIssue)}>
                            {busy === issue.id ? <Loader2 size={13} className="spinning" /> : <RotateCcw size={13} />} Restore
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {Editor && <Editor issue={editing} onClose={closeEditor} onSaved={() => { setEditing(null); load(); onChanged(); }} />}
    </>
  );
}

function ChangeDetail({ item }) {
  const before = item.before_value;
  const after = item.after_value;
  if (item.field === 'meta') {
    return (
      <>
        <div style={{ overflowWrap: 'anywhere' }}><strong>Title:</strong> {after?.seoTitle}</div>
        <div style={{ ...muted, overflowWrap: 'anywhere' }}>{after?.seoDescription}</div>
        <div style={{ ...muted, overflowWrap: 'anywhere' }}>Was: {before?.seoTitle || 'not set'}</div>
      </>
    );
  }
  if (item.field === 'image_alt') return <>Alt text added to {after?.length} image(s)</>;
  if (item.field === 'article_links') return <>Removed {after?.links?.length} dead link(s), kept the words</>;
  if (item.field === 'product_body') {
    return (
      <>
        Product text corrected
        {after?.removed?.length > 0 && <div style={{ ...muted, overflowWrap: 'anywhere' }}>Removed: {after.removed.join(' · ')}</div>}
      </>
    );
  }
  if (item.field === 'collection_published') return <>Hidden from your online store</>;
  if (item.field === 'theme_file') {
    const r = after?.rating;
    return <>Review stars added to your theme ({after?.key}){r ? <div style={muted}>Checked on this page: {r.ratingValue} of {r.bestRating} from {r.reviewCount} reviews</div> : null}</>;
  }
  return <>Article rewritten for search and AI answers</>;
}

function ChangesTab({ canManage, refreshKey }) {
  const [changes, setChanges] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try { setChanges((await getSeoChanges()).data); }
    catch (err) { toast.error(errMsg(err, 'Failed to load changes')); }
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  const undo = async (id) => {
    setBusy(id);
    try {
      toast.success((await undoSeoChange(id)).message);
      await load();
    } catch (err) { toast.error(errMsg(err), { duration: 8000 }); }
    setBusy(null);
  };

  if (!changes) return <div className="card"><div className="empty-state"><div className="spinner spinner-lg" /></div></div>;
  if (!changes.length) return <div className="card"><EmptyState icon={History} title="No changes yet" text="Every change made to your store is listed here, and each one can be undone." /></div>;
  return (
    <div className="card table-container">
      <table className="data-table">
        <thead><tr><th>When</th><th>Page</th><th>What changed</th>{canManage && <th />}</tr></thead>
        <tbody>
          {changes.map((item) => (
            <tr key={item.id}>
              <td style={{ whiteSpace: 'nowrap' }}>
                {fmtDate(item.created_at)}
                <div style={muted}>{item.source === 'auto' ? 'Automatic' : 'By hand'}</div>
              </td>
              <td><a href={item.url} target="_blank" rel="noreferrer" style={{ overflowWrap: 'anywhere' }}>{item.title} <ExternalLink size={11} /></a></td>
              <td><ChangeDetail item={item} /></td>
              {canManage && (
                <td style={{ whiteSpace: 'nowrap' }}>
                  {item.status === 'undone' ? <span className="badge badge-info">Undone</span> : (
                    <button className="btn btn-sm btn-secondary" disabled={!!busy} onClick={() => undo(item.id)}>
                      {busy === item.id ? <Loader2 size={13} className="spinning" /> : <Undo2 size={13} />} Undo
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GoogleTab({ data, canManage, onChanged }) {
  const { settings, google } = data;
  const [sites, setSites] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (settings.google_connected) getGoogleSites().then((res) => setSites(res.data)).catch(() => setSites([]));
  }, [settings.google_connected]);

  const connect = async () => {
    setBusy(true);
    try { window.location.href = (await startGoogleConnect()).data.url; }
    catch (err) { toast.error(errMsg(err), { duration: 8000 }); setBusy(false); }
  };
  const pick = async (site) => {
    try { toast.success((await setGoogleSite(site)).message); onChanged(); }
    catch (err) { toast.error(errMsg(err)); }
  };
  const disconnect = async () => {
    if (!window.confirm('Disconnect Google? Your daily checks carry on without search data.')) return;
    try { toast.success((await disconnectGoogle()).message); onChanged(); }
    catch (err) { toast.error(errMsg(err)); }
  };

  if (!google.configured) {
    return (
      <Section title="Set up Google sign-in" description="A one-time setup on the server before Search Console can be connected" className="seo-narrow">
        <ol className="steps-list">
          <li><span>In Google Cloud Console, create a project and enable the <strong>Google Search Console API</strong>.</span></li>
          <li><span>Set up the OAuth consent screen as External and press <strong>Publish app</strong>. In Testing mode, the connection stops after 7 days.</span></li>
          <li><span>Create an OAuth client of type Web application, with this redirect URI:<br /><code style={{ overflowWrap: 'anywhere' }}>{google.redirectUri}</code></span></li>
          <li><span>Add <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> to the server <code>.env</code>, then restart the app.</span></li>
        </ol>
      </Section>
    );
  }
  if (!settings.google_connected) {
    return (
      <div className="card seo-narrow">
        <EmptyState
          icon={Link2}
          title="Connect Google Search Console"
          text="Use real search data in the daily check: which pages people see, what they typed, and which pages Google hasn't indexed."
          action={canManage && <button className="btn btn-primary" disabled={busy} onClick={connect}>{busy ? <Loader2 size={15} className="spinning" /> : <Link2 size={15} />} Connect Google</button>}
        />
      </div>
    );
  }
  return (
    <Section
      title="Search Console"
      description={<>Connected as <strong>{settings.google_email || 'your Google account'}</strong></>}
      actions={canManage && <button className="btn btn-ghost btn-sm" onClick={disconnect}><Unlink size={14} /> Disconnect</button>}
      className="seo-narrow"
    >
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" htmlFor="gsc-site">Site</label>
        <select id="gsc-site" className="form-select" value={settings.google_site || ''} disabled={!canManage} onChange={(e) => pick(e.target.value)}>
          {!settings.google_site && <option value="">Choose a site</option>}
          {[...new Set([settings.google_site, ...sites].filter(Boolean))].map((site) => <option key={site} value={site}>{site}</option>)}
        </select>
        {!sites.length && <p className="form-helper">This Google account has no Search Console sites yet.</p>}
      </div>
    </Section>
  );
}

const SETTING_FIELDS = (s) => ({
  runTime: s.run_time, timezone: s.timezone, maxFixes: s.max_fixes,
  fixMeta: s.fix_meta, fixAlt: s.fix_alt, fixLinks: s.fix_links, fixArticles: s.fix_articles, fixClaims: s.fix_claims,
  cod: s.store_facts?.cod === true ? 'yes' : s.store_facts?.cod === false ? 'no' : '',
  freeShipping: s.store_facts?.freeShipping || '',
  freeShippingMin: s.store_facts?.freeShippingMin || '',
});
// The form's store-facts fields as the API takes them.
const toStoreFacts = (f) => ({
  cod: f.cod === 'yes' ? true : f.cod === 'no' ? false : null,
  freeShipping: f.freeShipping || null,
  freeShippingMin: f.freeShipping === 'over' ? Number(f.freeShippingMin) : undefined,
});
const FIX_OPTIONS = [
  ['fixMeta', 'Meta titles and descriptions', 'Written by DeepSeek from the page\'s own facts. Pages with almost no text, and empty collections, are left for you.'],
  ['fixAlt', 'Product image alt text', 'Taken from the product name. Every product that needs it, each run.'],
  ['fixLinks', 'Dead links in articles', 'Removes the link and keeps the words. Only links your live site says are gone.'],
  ['fixArticles', 'Rewrite weak articles', 'Changes your published text, one article a day. Check these yourself: the AI can get facts wrong.'],
  ['fixClaims', 'Promises your store doesn\'t make', 'Takes "free shipping" and "Cash on Delivery" promises out of product text when your store facts below say otherwise. Every other word stays.'],
];

function SettingsTab({ settings, canManage, onChanged }) {
  const [form, setForm] = useState(SETTING_FIELDS(settings));
  const [saving, setSaving] = useState(false);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setSaving(true);
    const { cod, freeShipping, freeShippingMin, ...rest } = form;
    try { toast.success((await saveSeoSettings({ ...rest, storeFacts: toStoreFacts(form) })).message); onChanged(); }
    catch (err) { toast.error(errMsg(err)); }
    setSaving(false);
  };

  return (
    <div className="stack seo-narrow">
      <Section title="Schedule" description="When the daily check runs, and how much the AI may rewrite in one day">
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label" htmlFor="seo-time">Run every day at</label>
            <input id="seo-time" type="time" className="form-input" value={form.runTime} disabled={!canManage} onChange={(e) => set('runTime', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="seo-tz">Time zone</label>
            <select id="seo-tz" className="form-select" value={form.timezone} disabled={!canManage} onChange={(e) => set('timezone', e.target.value)}>
              {timezoneOptions(form.timezone).map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>
          <div className="form-group span-all">
            <label className="form-label" htmlFor="seo-max">Pages the AI rewrites each day</label>
            <input id="seo-max" type="number" min="1" max="50" className="form-input" style={{ maxWidth: 160 }} value={form.maxFixes} disabled={!canManage} onChange={(e) => set('maxFixes', e.target.value)} />
            <p className="form-helper">The whole site is still checked every day. This only limits AI-written titles, descriptions and articles; alt text and dead links don't count. A changed field then rests for 14 days so Google can react to it.</p>
          </div>
        </div>
      </Section>

      <Section title="What the daily check may change" description="Turn off anything you'd rather do yourself">
        {FIX_OPTIONS.map(([key, label, help]) => (
          <SettingRow key={key} title={label} description={help} htmlFor={key}>
            <Switch id={key} checked={!!form[key]} disabled={!canManage} onChange={(v) => set(key, v)} />
          </SettingRow>
        ))}
      </Section>

      <Section title="Store facts" description="The truth about your store. Product text that promises otherwise is flagged, and fixed if that option is on.">
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label" htmlFor="cod">Cash on Delivery</label>
            <select id="cod" className="form-select" value={form.cod} disabled={!canManage} onChange={(e) => set('cod', e.target.value)}>
              <option value="">Not set</option>
              <option value="yes">We offer Cash on Delivery</option>
              <option value="no">Prepaid only, no COD</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="freeShipping">Free shipping</label>
            <select id="freeShipping" className="form-select" value={form.freeShipping} disabled={!canManage} onChange={(e) => set('freeShipping', e.target.value)}>
              <option value="">Not set</option>
              <option value="none">No free shipping</option>
              <option value="all">Free on every order</option>
              <option value="over">Free over an amount</option>
            </select>
          </div>
          {form.freeShipping === 'over' && (
            <div className="form-group">
              <label className="form-label" htmlFor="freeShippingMin">On orders over (₹)</label>
              <input id="freeShippingMin" type="number" min="1" className="form-input" value={form.freeShippingMin} disabled={!canManage} onChange={(e) => set('freeShippingMin', e.target.value)} />
            </div>
          )}
        </div>
      </Section>

      {canManage && (
        <div className="form-actions">
          <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? <Loader2 size={15} className="spinning" /> : <Save size={15} />} Save settings</button>
        </div>
      )}
    </div>
  );
}

export default function SeoAutomation() {
  const { activeRole } = useAuth();
  const canManage = activeRole === 'owner' || activeRole === 'admin';
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    try { setData((await getSeoOverview()).data); }
    catch (err) { toast.error(errMsg(err, 'Failed to load SEO data')); }
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!data?.running) return undefined;
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [data?.running, load]);

  // Coming back from Google's sign-in page.
  useEffect(() => {
    const error = params.get('google_error');
    const connected = params.get('google_connected');
    if (!error && !connected) return;
    if (error) toast.error(error, { duration: 8000 });
    else toast.success(params.get('google_note') || 'Google Search Console connected');
    setTab('google');
    setParams({}, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (applyFixes) => {
    setStarting(true);
    try {
      toast.success((await runSeoAudit({ applyFixes })).message);
      setData((d) => ({ ...d, running: true })); // the poll takes over from here
    } catch (err) { toast.error(errMsg(err)); }
    setStarting(false);
  };

  const toggle = async () => {
    try {
      toast.success((await saveSeoSettings({ enabled: !data.settings.enabled })).message);
      load();
    } catch (err) { toast.error(errMsg(err)); }
  };

  const header = (actions) => (
    <PageHeader
      title="SEO Automation"
      subtitle="Your whole store, checked every day. Safe fixes are made for you, and every change can be undone."
      actions={actions}
    />
  );
  if (!data) {
    return (
      <div className="page-container fade-in">
        {header(null)}
        <div className="card"><div className="empty-state"><div className="spinner spinner-lg" /></div></div>
      </div>
    );
  }
  const { settings, audits, running } = data;
  const latest = audits[0];
  const busy = running || starting;
  const openCount = Object.values(data.counts || {}).reduce((sum, n) => sum + n, 0);

  return (
    <div className="page-container fade-in">
      {header(canManage && (
        <>
          <button className="btn btn-secondary" disabled={busy} onClick={() => run(false)} title="Finds problems and changes nothing">
            <Play size={15} /> Check site now
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={() => run(true)} title="The same as the daily check: finds problems and fixes what it safely can">
            {busy ? <Loader2 size={15} className="spinning" /> : <Sparkles size={15} />} {running ? 'Checking…' : 'Check and fix now'}
          </button>
        </>
      ))}

      <div className="card mb-24">
        <div className="status-card">
          <span className={`status-card__icon ${settings.enabled ? 'is-on' : ''}`}><CalendarClock size={22} /></span>
          <div className="status-card__main">
            <div className="status-card__title">
              Daily automation
              <span className={`status ${settings.enabled ? 'status--on' : 'status--off'}`}>{settings.enabled ? 'On' : 'Off'}</span>
              {running && <span className="badge badge-info"><Loader2 size={12} className="spinning" /> Checking your site</span>}
            </div>
            <div className="status-card__text">
              {settings.enabled
                ? (settings.next_run_at ? `Next check ${fmtNext(settings.next_run_at)}.` : 'Your store is checked and improved every day.')
                : 'Turn it on to have your store checked and improved every day.'}
            </div>
          </div>
          {canManage && <Switch checked={!!settings.enabled} onChange={toggle} label="Daily automation" />}
        </div>
        {latest?.status === 'failed' && (
          <div style={{ padding: '0 24px 20px' }}>
            <div className="callout callout--danger"><AlertTriangle size={16} /><span>The last check stopped: {latest.error}</span></div>
          </div>
        )}
      </div>

      <div className="tabs" role="tablist">
        {TABS.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={`tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
            {label}
            {key === 'issues' && openCount > 0 && <span className="badge badge-purple" style={{ padding: '1px 8px' }}>{openCount}</span>}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab data={data} canManage={canManage} onOpenSettings={() => setTab('settings')} onRun={run} busy={busy} onShowProblems={() => setTab('issues')} />}
      {tab === 'issues' && <IssuesTab canManage={canManage} refreshKey={latest?.finished_at} onChanged={load} googleSite={settings.google_site} />}
      {tab === 'changes' && <ChangesTab canManage={canManage} refreshKey={latest?.finished_at} />}
      {tab === 'google' && <GoogleTab data={data} canManage={canManage} onChanged={load} />}
      {tab === 'settings' && <SettingsTab settings={settings} canManage={canManage} onChanged={load} />}
    </div>
  );
}
