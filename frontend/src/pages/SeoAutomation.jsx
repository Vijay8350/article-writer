import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  SearchCheck, Loader2, Play, Sparkles, Power, Undo2, EyeOff, ExternalLink, Wrench, Link2, Unlink, Save, X, RefreshCw, RotateCcw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  getSeoOverview, saveSeoSettings, runSeoAudit, getSeoIssues, suggestSeoFix, fixSeoIssue, ignoreSeoIssue, restoreSeoIssue,
  getSeoChanges, undoSeoChange, startGoogleConnect, getGoogleSites, setGoogleSite, disconnectGoogle,
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
const FIX_LABELS = { meta: 'Fix', alt: 'Add alt text', links: 'Remove dead links', article: 'Rewrite' };

const errMsg = (err, fallback = 'Something went wrong') => err.response?.data?.error || fallback;
const muted = { fontSize: 12, color: 'var(--text-muted)' };
const twoColumns = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24 };
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
  if (search.error) return <p className="form-helper mb-16">{search.error}</p>;
  const { current, previous, topQueries } = search;
  return (
    <div className="mb-24">
      <h3 style={{ fontSize: 14, marginBottom: 12 }}>Google search, last 28 days</h3>
      <div className="kpi-grid mb-16">
        <Kpi label="Clicks" value={compact(current.clicks)} sub={change(current.clicks, previous.clicks)} />
        <Kpi label="Times shown" value={compact(current.impressions)} sub={change(current.impressions, previous.impressions)} />
        <Kpi label="Click rate" value={percent(current.ctr)} sub={change(current.ctr, previous.ctr, { format: percent })} />
        <Kpi label="Average position" value={current.position || '—'} sub={change(current.position, previous.position, { invert: true })} />
      </div>
      <BarList label="Top searches" rows={topQueries.map((q) => ({ key: q.key, label: q.key, value: q.clicks }))} empty="No searches recorded yet" />
    </div>
  );
}

function OverviewTab({ data }) {
  const { audits, counts, types } = data;
  const done = audits.filter((a) => a.status === 'done');
  const last = done[0];
  if (!last) {
    return (
      <div className="empty-state">
        <SearchCheck />
        <h3>No site check yet</h3>
        <p>Press Check site now to see how your whole store looks to Google.</p>
      </div>
    );
  }
  const open = Object.values(counts).reduce((sum, n) => sum + n, 0);
  return (
    <>
      <div className="kpi-grid mb-24">
        <Kpi label="SEO health" value={last.score} sub="out of 100" hint="Each page starts at 100 and loses points for its problems." />
        <Kpi label="Pages checked" value={compact(last.pages_checked)} sub={`Last run ${fmtDate(last.started_at)}`} />
        <Kpi label="Problems open" value={compact(open)} sub={`${counts.critical || 0} critical, ${counts.high || 0} high`} />
        <Kpi label="Pages improved" value={compact(last.fixes_applied)} sub="in the last run" />
      </div>
      <SearchSummary search={last.search} />
      <div className="mb-24" style={twoColumns}>
        <div>
          <h3 style={{ fontSize: 14, marginBottom: 12 }}>SEO health by day</h3>
          <ColumnChart data={[...done].reverse().map((a) => ({ label: fmtDate(a.started_at), value: a.score }))} highlight={done.length - 1} valueLabel="Score" label="SEO health by day" />
        </div>
        <div>
          <h3 style={{ fontSize: 14, marginBottom: 12 }}>What's wrong</h3>
          <BarList label="Problems by type" rows={types.map((t) => ({ key: t.type, label: t.label, value: t.n }))} limit={10} empty="Nothing open" />
        </div>
      </div>
    </>
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

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

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
    <div className="seo-modal" role="dialog" aria-modal="true" aria-label="Fix title and description" onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="seo-modal__card">
        <button className="seo-modal__close" onClick={onClose} disabled={saving} aria-label="Close"><X size={18} /></button>
        <h3 style={{ marginBottom: 4 }}>Google title and description</h3>
        <a href={issue.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, overflowWrap: 'anywhere' }}>{issue.title} <ExternalLink size={11} /></a>
        <div style={{ ...muted, margin: '4px 0 16px' }}>{issue.label}: {issue.detail}</div>

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

        <div className="flex gap-8 mt-16" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-primary" disabled={!canSave} onClick={save}>{saving ? <Loader2 size={15} className="spinning" /> : <Save size={15} />} Save to store</button>
          <button className="btn btn-secondary" disabled={loading || saving} onClick={suggest}><RefreshCw size={15} /> Suggest again</button>
          <button className="btn btn-ghost" disabled={saving} onClick={onClose}>Cancel</button>
        </div>
        <p className="form-helper" style={{ marginTop: 8 }}>Saved changes are listed under Changes made, where you can undo them.</p>
      </div>
    </div>
  );
}

function IssuesTab({ canManage, refreshKey, onChanged }) {
  const [view, setView] = useState('open');
  const [type, setType] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(null);
  const [editing, setEditing] = useState(null);

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
    if (issue.fixKind === 'meta') return setEditing(issue);
    if (issue.fixKind === 'article' && !window.confirm('Rewrite this whole article with AI? It keeps the images and links, and you can undo it under Changes made. This takes a minute or two.')) return undefined;
    return act(issue.id, (id) => fixSeoIssue(id));
  };

  const issues = result?.data;
  const types = result?.types || [];
  const total = types.reduce((sum, t) => sum + t.n, 0);
  const shownTotal = type ? types.find((t) => t.type === type)?.n || 0 : total;

  return (
    <>
      <div className="flex gap-8 mb-16" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
        {ISSUE_VIEWS.map(([key, label]) => (
          <button key={key} className={`btn btn-sm ${view === key ? 'btn-primary' : 'btn-secondary'}`} onClick={() => switchView(key)}>{label}</button>
        ))}
        {types.length > 0 && (
          <select className="form-select" style={{ width: 'auto', minWidth: 220, padding: '6px 10px', fontSize: 13 }} value={type} onChange={(e) => setType(e.target.value)} aria-label="Problem type">
            <option value="">All problems ({total})</option>
            {types.map((t) => <option key={t.type} value={t.type}>{t.label} ({t.n})</option>)}
          </select>
        )}
      </div>
      {!issues ? <div className="spinner" /> : issues.length === 0 ? (
        <p className="form-helper">Nothing here.</p>
      ) : (
        <>
          {issues.length < shownTotal && <p className="form-helper mb-16">Showing the first {issues.length} of {shownTotal}. Pick a problem type above to see the rest.</p>}
          <div className="table-container">
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
                        {!issue.fixable && issue.advice && view === 'open' && (
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, overflowWrap: 'anywhere' }}><strong>What to do:</strong> {issue.advice}</div>
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
      {editing && (
        <MetaEditor
          issue={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); onChanged(); }}
        />
      )}
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

  if (!changes) return <div className="spinner" />;
  if (!changes.length) return <p className="form-helper">Nothing has been changed yet. Every change made to your store will be listed here, and each one can be undone.</p>;
  return (
    <div className="table-container">
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
      <div style={{ maxWidth: 640 }}>
        <p className="mb-16">Google sign-in needs a one-time setup on the server before this button can work.</p>
        <ol style={{ paddingLeft: 20, lineHeight: 1.8, fontSize: 14 }}>
          <li>In Google Cloud Console, create a project and enable the <strong>Google Search Console API</strong>.</li>
          <li>Set up the OAuth consent screen as External and press <strong>Publish app</strong>. In Testing mode, the connection stops after 7 days.</li>
          <li>Create an OAuth client of type Web application, with this redirect URI:<br /><code style={{ overflowWrap: 'anywhere' }}>{google.redirectUri}</code></li>
          <li>Add <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> to the server <code>.env</code>, then restart the app.</li>
        </ol>
      </div>
    );
  }
  if (!settings.google_connected) {
    return (
      <div style={{ maxWidth: 640 }}>
        <p className="mb-16">Connect the Google account that can see your site in Search Console. The daily check then uses real search data: which pages people see, what they typed, and which pages Google hasn't indexed.</p>
        {canManage && <button className="btn btn-primary" disabled={busy} onClick={connect}>{busy ? <Loader2 size={15} className="spinning" /> : <Link2 size={15} />} Connect Google</button>}
      </div>
    );
  }
  return (
    <div style={{ maxWidth: 480 }}>
      <p className="mb-16">Connected as <strong>{settings.google_email || 'your Google account'}</strong>.</p>
      <div className="form-group">
        <label className="form-label">Search Console site</label>
        <select className="form-select" value={settings.google_site || ''} disabled={!canManage} onChange={(e) => pick(e.target.value)}>
          {!settings.google_site && <option value="">Choose a site</option>}
          {[...new Set([settings.google_site, ...sites].filter(Boolean))].map((site) => <option key={site} value={site}>{site}</option>)}
        </select>
        {!sites.length && <p className="form-helper">This Google account has no Search Console sites yet.</p>}
      </div>
      {canManage && <button className="btn btn-danger btn-sm" onClick={disconnect}><Unlink size={13} /> Disconnect</button>}
    </div>
  );
}

const SETTING_FIELDS = (s) => ({
  runTime: s.run_time, timezone: s.timezone, maxFixes: s.max_fixes,
  fixMeta: s.fix_meta, fixAlt: s.fix_alt, fixLinks: s.fix_links, fixArticles: s.fix_articles,
});
const FIX_OPTIONS = [
  ['fixMeta', 'Meta titles and descriptions', 'Written by DeepSeek from the page\'s own facts. Pages with almost no text, and empty collections, are left for you.'],
  ['fixAlt', 'Product image alt text', 'Taken from the product name. Every product that needs it, each run.'],
  ['fixLinks', 'Dead links in articles', 'Removes the link and keeps the words. Only links your live site says are gone.'],
  ['fixArticles', 'Rewrite weak articles', 'Changes your published text, one article a day. Check these yourself: the AI can get facts wrong.'],
];

function SettingsTab({ settings, canManage, onChanged }) {
  const [form, setForm] = useState(SETTING_FIELDS(settings));
  const [saving, setSaving] = useState(false);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setSaving(true);
    try { toast.success((await saveSeoSettings(form)).message); onChanged(); }
    catch (err) { toast.error(errMsg(err)); }
    setSaving(false);
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={twoColumns}>
        <div className="form-group">
          <label className="form-label">Run every day at</label>
          <input type="time" className="form-input" value={form.runTime} disabled={!canManage} onChange={(e) => set('runTime', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Time zone</label>
          <select className="form-select" value={form.timezone} disabled={!canManage} onChange={(e) => set('timezone', e.target.value)}>
            {timezoneOptions(form.timezone).map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Pages the AI rewrites each day</label>
        <input type="number" min="1" max="50" className="form-input" value={form.maxFixes} disabled={!canManage} onChange={(e) => set('maxFixes', e.target.value)} />
        <p className="form-helper">The whole site is checked every day. This limits the AI-written titles, descriptions and articles. Alt text and dead links don't count toward it. A changed field then rests for 14 days, so Google can react to it.</p>
      </div>
      <label className="form-label">What the daily run may change</label>
      {FIX_OPTIONS.map(([key, label, help]) => (
        <div className="checkbox-group" key={key} style={{ alignItems: 'flex-start' }}>
          <input id={key} type="checkbox" checked={form[key]} disabled={!canManage} onChange={(e) => set(key, e.target.checked)} />
          <label htmlFor={key}>{label}<div style={muted}>{help}</div></label>
        </div>
      ))}
      {canManage && <button className="btn btn-primary mt-16" disabled={saving} onClick={save}>{saving ? <Loader2 size={15} className="spinning" /> : <Save size={15} />} Save</button>}
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

  if (!data) return <div className="spinner spinner-lg" />;
  const { settings, audits, running } = data;
  const latest = audits[0];
  const busy = running || starting;

  return (
    <div>
      <div className="page-header">
        <h1>SEO Automation</h1>
        <p>Checks your whole site every day, fixes what it safely can, and keeps a list of every change so you can undo it.</p>
      </div>

      <div className="card mb-24">
        <div className="card-body flex justify-between gap-12" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div className="flex gap-8" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <span className={`badge ${settings.enabled ? 'badge-success' : 'badge-warning'}`}>{settings.enabled ? 'Daily automation on' : 'Daily automation off'}</span>
              {running && <span className="badge badge-info"><Loader2 size={12} className="spinning" /> Checking your site</span>}
            </div>
            <div style={{ ...muted, marginTop: 8 }}>
              {settings.enabled && settings.next_run_at ? `Next check ${fmtNext(settings.next_run_at)}` : 'Turn it on and the site is checked and improved every day.'}
            </div>
            {latest?.status === 'failed' && <div style={{ fontSize: 12, color: 'var(--accent-danger)', marginTop: 4 }}>The last check stopped: {latest.error}</div>}
          </div>
          {canManage && (
            <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" disabled={busy} onClick={() => run(false)} title="Finds problems and changes nothing"><Play size={15} /> Check site now</button>
              <button className="btn btn-secondary" disabled={busy} onClick={() => run(true)} title="Same as the daily run"><Sparkles size={15} /> Check and fix now</button>
              <button className={`btn ${settings.enabled ? 'btn-danger' : 'btn-primary'}`} onClick={toggle}><Power size={15} /> {settings.enabled ? 'Turn off' : 'Turn on'}</button>
            </div>
          )}
        </div>
      </div>

      <div className="tabs">
        {TABS.map(([key, label]) => (
          <button key={key} className={`tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab data={data} />}
      {tab === 'issues' && <IssuesTab canManage={canManage} refreshKey={latest?.finished_at} onChanged={load} />}
      {tab === 'changes' && <ChangesTab canManage={canManage} refreshKey={latest?.finished_at} />}
      {tab === 'google' && <GoogleTab data={data} canManage={canManage} onChanged={load} />}
      {tab === 'settings' && <SettingsTab settings={settings} canManage={canManage} onChanged={load} />}
    </div>
  );
}
