import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Rocket, Plus, Play, Trash2, RefreshCw, Loader2, ChevronDown, ChevronRight, Pencil, Save, AlertTriangle, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  getCampaigns, createCampaign, updateCampaign, setCampaignStatus, deleteCampaign, runCampaignNow,
  getCampaignArticles, getBusinessDna, getSettings, syncCollections,
} from '../lib/api';
import { ScheduleWindow, ImagesPerPost } from '../components/ScheduleFields';
import { PageHeader, Sheet, Segmented, EmptyState, Section, Switch } from '../components/ui';
import { toDateTimeInput, toDateInput, fromDateTimeInput, endOfDay, scheduleText, fmtDateTime } from '../lib/dates';
import '../styles/blog.css';

const STATUS = {
  active: { cls: 'status--on', label: 'Active' },
  paused: { cls: 'status--warn', label: 'Paused' },
  done: { cls: 'status--off', label: 'Ended' },
};

const ARTICLE_BADGE = {
  published: 'badge-success',
  draft: 'badge-purple',
  failed: 'badge-danger',
  skipped_duplicate: 'badge-warning',
  limit_reached: 'badge-danger',
};

const ARTICLE_LABEL = {
  published: 'Published',
  draft: 'Draft',
  failed: 'Failed',
  skipped_duplicate: 'Skipped: already covered',
  limit_reached: 'Plan limit reached',
};

const CADENCE_LABEL = { manual: 'Manual', daily: 'Daily', monthly: 'Monthly' };
const AI_LABEL = { gemini: 'Gemini', deepseek: 'DeepSeek' };

const CADENCE_OPTIONS = [
  { value: 'manual', label: 'Manual' },
  { value: 'daily', label: 'Daily' },
  { value: 'monthly', label: 'Monthly' },
];
const CADENCE_HELP = {
  manual: 'Runs only when you click Run now.',
  daily: 'Runs once a day.',
  monthly: 'Runs once a month.',
};
const AI_OPTIONS = [
  { value: 'gemini', label: 'Gemini' },
  { value: 'deepseek', label: 'DeepSeek' },
];
const PUBLISH_OPTIONS = [
  { value: 'draft', label: 'Save as draft' },
  { value: 'live', label: 'Publish live' },
];

const BLANK_FORM = {
  name: '', collectionTitle: '', collectionHandle: '', cadence: 'manual', articlesPerRun: 3, wordCount: 1500,
  aiModel: 'gemini', publishMode: 'draft', blogId: '', instructions: '', imagesPerPost: 3, startsAt: '', endsAt: '',
};

const formFrom = (c) => ({
  name: c.name, collectionTitle: c.collection_title, collectionHandle: c.collection_handle || '', cadence: c.cadence,
  articlesPerRun: c.articles_per_run, wordCount: c.word_count, aiModel: c.ai_model, publishMode: c.publish_mode, blogId: c.blog_id || '',
  instructions: c.instructions || '', imagesPerPost: c.images_per_post, startsAt: toDateTimeInput(c.starts_at), endsAt: toDateInput(c.ends_at),
});

// The shape the API takes, with the handle of the chosen category.
const toPayload = (form, collections) => ({
  ...form,
  collectionHandle: collections.find(c => c.title === form.collectionTitle)?.handle || form.collectionHandle || undefined,
  articlesPerRun: Number(form.articlesPerRun),
  wordCount: Number(form.wordCount),
  imagesPerPost: Number(form.imagesPerPost),
  startsAt: form.cadence === 'manual' ? null : fromDateTimeInput(form.startsAt),
  endsAt: form.cadence === 'manual' ? null : endOfDay(form.endsAt),
});

function CampaignFields({ value, onChange, collections, blogs }) {
  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value });
  const pick = (key) => (v) => onChange({ ...value, [key]: v });
  // A category or blog removed from the store stays selectable on campaigns that use it.
  const categories = [...new Set([value.collectionTitle, ...collections.map(c => c.title)].filter(Boolean))];
  const blogOptions = value.blogId && !blogs.some(b => String(b.id) === String(value.blogId))
    ? [{ id: value.blogId, title: `Blog ${value.blogId}` }, ...blogs]
    : blogs;
  // A name that simply repeats the category keeps following it.
  const setCategory = (e) => onChange({
    ...value,
    collectionTitle: e.target.value,
    name: value.name === value.collectionTitle ? e.target.value : value.name,
  });

  return (
    <>
      <div className="form-section">
        <h3 className="form-section__title">Basics</h3>
        <p className="form-section__desc">The collection the articles are about.</p>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label" htmlFor="cmp-collection">Collection</label>
            <select id="cmp-collection" className="form-select" value={value.collectionTitle} onChange={setCategory}>
              {categories.map(title => <option key={title} value={title}>{title}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="cmp-name">Campaign name</label>
            <input id="cmp-name" className="form-input" value={value.name} onChange={set('name')} maxLength={120} placeholder="Same as the collection" />
          </div>
        </div>
      </div>

      <div className="form-section">
        <h3 className="form-section__title">Schedule</h3>
        <p className="form-section__desc">Run it yourself, or let it run daily or monthly.</p>
        <div className="form-grid">
          <div className="form-group blog-seg-field">
            <span className="form-label">Runs</span>
            <Segmented value={value.cadence} onChange={pick('cadence')} options={CADENCE_OPTIONS} ariaLabel="Runs" />
            <div className="form-helper">{CADENCE_HELP[value.cadence]}</div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="cmp-per-run">Articles each run</label>
            <input id="cmp-per-run" className="form-input" type="number" min={1} max={20} value={value.articlesPerRun} onChange={set('articlesPerRun')} />
            <div className="form-helper">From 1 to 20.</div>
          </div>
          {value.cadence !== 'manual' && (
            <ScheduleWindow startsAt={value.startsAt} endsAt={value.endsAt} onChange={(change) => onChange({ ...value, ...change })}
              startHelp={`Leave blank to start one ${value.cadence === 'daily' ? 'day' : 'month'} from now.`} />
          )}
        </div>
      </div>

      <div className="form-section">
        <h3 className="form-section__title">Articles</h3>
        <p className="form-section__desc">Length, images, AI model and anything the writer should know.</p>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label" htmlFor="cmp-words">Words per article</label>
            <input id="cmp-words" className="form-input" type="number" min={500} max={5000} step={100} value={value.wordCount} onChange={set('wordCount')} />
            <div className="form-helper">From 500 to 5,000.</div>
          </div>
          <ImagesPerPost value={value.imagesPerPost} onChange={(imagesPerPost) => onChange({ ...value, imagesPerPost })}
            label="Images in each article" help="The banner, then images through the article." />
          <div className="form-group blog-seg-field">
            <span className="form-label">AI model</span>
            <Segmented value={value.aiModel} onChange={pick('aiModel')} options={AI_OPTIONS} ariaLabel="AI model" />
          </div>
          <div className="form-group span-all">
            <label className="form-label" htmlFor="cmp-instructions">Instructions <span className="blog-optional">(optional)</span></label>
            <textarea id="cmp-instructions" className="form-textarea" rows={3} value={value.instructions} onChange={set('instructions')} maxLength={2000}
              placeholder="e.g. Friendly tone, mention free shipping above ₹499, festive gold and red banners" />
            <div className="form-helper">Followed when writing the articles and designing their banners.</div>
          </div>
        </div>
      </div>

      <div className="form-section">
        <h3 className="form-section__title">Publishing</h3>
        <p className="form-section__desc">Where the articles go, and whether they go live.</p>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label" htmlFor="cmp-blog">Blog</label>
            {blogOptions.length ? (
              <select id="cmp-blog" className="form-select" value={value.blogId} onChange={set('blogId')}>
                {blogOptions.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
              </select>
            ) : (
              <input id="cmp-blog" className="form-input" value={value.blogId} onChange={set('blogId')} placeholder="Blog ID" />
            )}
          </div>
          <div className="form-group blog-seg-field">
            <span className="form-label">When an article is ready</span>
            <Segmented value={value.publishMode} onChange={pick('publishMode')} options={PUBLISH_OPTIONS} ariaLabel="When an article is ready" />
            <div className="form-helper">{value.publishMode === 'live' ? 'Goes live on your store straight away.' : 'Waits in Shopify as a draft for you to publish.'}</div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function Campaigns() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [collections, setCollections] = useState([]);
  const [blogs, setBlogs] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [articles, setArticles] = useState({});
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [editing, setEditing] = useState(null); // { id, ...form } of the campaign being edited
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [hasDna, setHasDna] = useState(false);
  const [dnaReady, setDnaReady] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  const load = () => {
    setLoading(true);
    getCampaigns().then(res => setList(res.data || [])).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    getBusinessDna().then(res => {
      setHasDna(Boolean(res.data));
      if (res.data?.collections?.length) {
        setCollections(res.data.collections);
        setForm(f => ({ ...f, collectionTitle: res.data.collections[0].title }));
      }
      if (res.data?.blogs?.length) {
        setBlogs(res.data.blogs);
        setForm(f => ({ ...f, blogId: res.data.blogs[0].id }));
      }
    }).catch(() => {}).finally(() => setDnaReady(true));
    getSettings().then(res => {
      const preferred = res.data?.ai?.providers?.article;
      if (preferred) setForm(f => ({ ...f, aiModel: preferred }));
    }).catch(() => {});
  }, []);

  const openNew = () => { setEditing(null); setNewOpen(true); };
  const openEdit = (c) => { setNewOpen(false); setEditing({ id: c.id, ...formFrom(c) }); };
  // Stable, so the sheet doesn't re-focus its first field on every keystroke.
  const closeSheet = useCallback(() => { setNewOpen(false); setEditing(null); }, []);

  // Brings in the store's latest collections. What's already picked stays picked.
  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await syncCollections();
      setCollections(res.data.collections);
      setForm(f => (f.collectionTitle ? f : { ...f, collectionTitle: res.data.collections[0]?.title || '' }));
      toast.success(res.message);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Sync failed');
    }
    setSyncing(false);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.collectionTitle) return toast.error('Pick a category');
    if (!form.blogId) return toast.error('Pick a blog');
    setCreating(true);
    try {
      await createCampaign(toPayload(form, collections));
      toast.success('Campaign created');
      setForm(f => ({ ...f, name: '', instructions: '', startsAt: '', endsAt: '' }));
      setNewOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create campaign');
    }
    setCreating(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!editing.collectionTitle) return toast.error('Pick a category');
    if (!editing.blogId) return toast.error('Pick a blog');
    setSaving(true);
    try {
      const res = await updateCampaign(editing.id, toPayload(editing, collections));
      toast.success(res.message || 'Campaign saved');
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save the campaign');
    }
    setSaving(false);
  };

  const toggleStatus = async (c) => {
    setBusyId(c.id);
    try {
      await setCampaignStatus(c.id, c.status === 'active' ? 'paused' : 'active');
      load();
    } catch { toast.error('Failed'); }
    setBusyId(null);
  };

  const runNow = async (c) => {
    setBusyId(c.id);
    try {
      const res = await runCampaignNow(c.id);
      toast.success(res.message || 'Queued');
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    setBusyId(null);
  };

  const remove = async (c) => {
    if (!window.confirm(`Delete the campaign "${c.name}"? Articles it already wrote stay on your blog.`)) return;
    setBusyId(c.id);
    try { await deleteCampaign(c.id); toast.success('Deleted'); load(); }
    catch { toast.error('Failed'); }
    setBusyId(null);
  };

  const toggleExpand = async (c) => {
    if (expanded === c.id) { setExpanded(null); return; }
    setExpanded(c.id);
    try {
      const res = await getCampaignArticles(c.id);
      setArticles(a => ({ ...a, [c.id]: res.data || [] }));
    } catch { /* ignore */ }
  };

  const isEdit = Boolean(editing);
  const editingOriginal = isEdit ? list.find(x => x.id === editing.id) : null;
  const sheetBusy = creating || saving;
  const showCreateForm = dnaReady && collections.length > 0;
  const showFooter = isEdit || showCreateForm;

  return (
    <div className="page-container fade-in blog-page">
      <PageHeader
        title="Campaigns"
        subtitle="Pick a collection and the app finds low-competition keywords, skips topics you already cover, then writes and publishes the articles."
        actions={(
          <>
            {hasDna && (
              <button className="btn btn-secondary" onClick={handleSync} disabled={syncing} title="Get the latest collections from Shopify">
                {syncing ? <Loader2 size={16} className="spinning" /> : <RefreshCw size={16} />} Sync collections
              </button>
            )}
            <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> New campaign</button>
          </>
        )}
      />

      <Section
        title="Your campaigns"
        flush
        className="blog-list-card"
        actions={<button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}><RefreshCw size={14} className={loading ? 'spinning' : ''} /> Refresh</button>}
      >
        {loading && list.length === 0 ? (
          <div className="empty-state"><div className="spinner spinner-lg" /></div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={Rocket}
            title="No campaigns yet"
            text="A campaign writes articles about one collection, on a schedule or whenever you run it."
            action={<button className="btn btn-primary" onClick={openNew}><Plus size={16} /> New campaign</button>}
          />
        ) : (
          <div className="blog-rows">
            {list.map(c => {
              const st = STATUS[c.status] || { cls: 'status--warn', label: c.status };
              const busy = busyId === c.id;
              const open = expanded === c.id;
              return (
                <div className="blog-row" key={c.id}>
                  <div className="list-item">
                    <div className="list-item__main">
                      <div className="list-item__title">
                        <span className="blog-truncate">{c.name}</span>
                        <span className={`status ${st.cls}`}>{st.label}</span>
                      </div>
                      <div className="list-item__meta">
                        {c.collection_title && <span>{c.collection_title}</span>}
                        <span>
                          {CADENCE_LABEL[c.cadence] || c.cadence}
                          {c.next_run_at ? `, next run ${fmtDateTime(c.next_run_at)}` : ''}
                        </span>
                        <span>{c.articles_per_run} per run</span>
                        <span>{c.published_count} of {c.total_count} written</span>
                      </div>
                      <div className="list-item__meta">
                        <span>{c.images_per_post} images</span>
                        <span>{AI_LABEL[c.ai_model] || c.ai_model}</span>
                        <span>{c.publish_mode === 'live' ? 'Publishes live' : 'Saves drafts'}</span>
                        <span>{scheduleText(c)}</span>
                      </div>
                    </div>
                    <div className="list-item__actions">
                      <span className="blog-switch" title={c.status === 'active' ? 'Pause' : 'Resume'}>
                        <Switch checked={c.status === 'active'} onChange={() => toggleStatus(c)} disabled={busy} label={`${c.name} active`} />
                      </span>
                      <button className="btn btn-secondary btn-sm" onClick={() => runNow(c)} disabled={busy}>
                        <Play size={14} /> Run now
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => toggleExpand(c)} aria-expanded={open}>
                        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Articles
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)} disabled={busy} title="Edit" aria-label={`Edit ${c.name}`}>
                        <Pencil size={14} />
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => remove(c)} disabled={busy} title="Delete" aria-label={`Delete ${c.name}`}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {open && (
                    <div className="blog-activity">
                      <div className="blog-activity__box">
                        {!articles[c.id] ? (
                          <div className="blog-activity__note"><Loader2 size={14} className="spinning" /> Loading articles…</div>
                        ) : articles[c.id].length === 0 ? (
                          <div className="blog-activity__note">No articles yet. Click Run now to write the first ones.</div>
                        ) : (
                          <div className="table-container">
                            <table className="data-table">
                              <thead><tr><th>Article</th><th>Status</th><th>When</th></tr></thead>
                              <tbody>
                                {articles[c.id].map(a => (
                                  <tr key={a.id}>
                                    <td>{a.title || a.keyword || '—'}</td>
                                    <td>
                                      <span className={`badge ${ARTICLE_BADGE[a.status] || 'badge-purple'}`} title={a.error || undefined}>
                                        {ARTICLE_LABEL[a.status] || a.status}
                                      </span>
                                    </td>
                                    <td className="nowrap">{fmtDateTime(a.created_at)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Sheet
        open={newOpen || isEdit}
        title={isEdit ? 'Edit campaign' : 'New campaign'}
        subtitle={isEdit
          ? (editingOriginal?.name || 'Changes apply to the next articles.')
          : 'Articles about one collection, written on a schedule or when you run it.'}
        onClose={closeSheet}
        busy={sheetBusy}
        width={640}
        footer={showFooter && (
          <>
            <button type="button" className="btn btn-ghost" onClick={closeSheet} disabled={sheetBusy}>Cancel</button>
            {isEdit ? (
              <button className="btn btn-primary" type="submit" form="campaign-form" disabled={saving}>
                {saving ? <Loader2 size={16} className="spinning" /> : <Save size={16} />} Save changes
              </button>
            ) : (
              <button className="btn btn-primary" type="submit" form="campaign-form" disabled={creating}>
                {creating ? <><Loader2 size={16} className="spinning" /> Creating…</> : <><Plus size={16} /> Create campaign</>}
              </button>
            )}
          </>
        )}
      >
        {isEdit ? (
          <form id="campaign-form" onSubmit={handleSave}>
            <div className="callout callout--info mb-24">
              <Info size={18} />
              <div>
                Changes apply to the next articles. Articles already written stay as they are.
                {editingOriginal && editing.cadence !== editingOriginal.cadence && editing.cadence !== 'manual' && ` The next run will be one ${editing.cadence === 'daily' ? 'day' : 'month'} from now.`}
                {editingOriginal && editing.cadence === 'manual' && editingOriginal.cadence !== 'manual' && ' Scheduled runs will stop.'}
              </div>
            </div>
            <CampaignFields value={editing} onChange={setEditing} collections={collections} blogs={blogs} />
          </form>
        ) : !dnaReady ? (
          <div className="empty-state"><div className="spinner spinner-lg" /></div>
        ) : collections.length === 0 ? (
          <>
            <div className="callout callout--warning">
              <AlertTriangle size={18} />
              <div>
                {hasDna
                  ? 'No collections found. Add one in Shopify, then sync your collections.'
                  : <>No collections yet. Fetch your <Link to="/business-dna">Business DNA</Link> first so your collections are available.</>}
              </div>
            </div>
            {hasDna && (
              <div className="form-actions mt-16">
                <button type="button" className="btn btn-secondary" onClick={handleSync} disabled={syncing}>
                  {syncing ? <Loader2 size={16} className="spinning" /> : <RefreshCw size={16} />} Sync collections
                </button>
              </div>
            )}
          </>
        ) : (
          <form id="campaign-form" onSubmit={handleCreate}>
            <CampaignFields value={form} onChange={setForm} collections={collections} blogs={blogs} />
          </form>
        )}
      </Sheet>
    </div>
  );
}
