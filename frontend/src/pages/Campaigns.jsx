import React, { useState, useEffect } from 'react';
import { Rocket, Plus, Play, Pause, Trash2, RefreshCw, Loader2, ChevronDown, ChevronRight, Pencil, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  getCampaigns, createCampaign, updateCampaign, setCampaignStatus, deleteCampaign, runCampaignNow,
  getCampaignArticles, getBusinessDna, getSettings,
} from '../lib/api';

const ARTICLE_BADGE = {
  published: 'badge-success',
  draft: 'badge-purple',
  failed: 'badge-danger',
  skipped_duplicate: 'badge-warning',
  limit_reached: 'badge-danger',
};

const BLANK_FORM = {
  name: '', collectionTitle: '', collectionHandle: '', cadence: 'manual', articlesPerRun: 3,
  wordCount: 1500, aiModel: 'gemini', publishMode: 'draft', blogId: '',
};

const formFrom = (c) => ({
  name: c.name, collectionTitle: c.collection_title, collectionHandle: c.collection_handle || '', cadence: c.cadence,
  articlesPerRun: c.articles_per_run, wordCount: c.word_count, aiModel: c.ai_model, publishMode: c.publish_mode, blogId: c.blog_id || '',
});

// The shape the API takes, with the handle of the chosen category.
const toPayload = (form, collections) => ({
  ...form,
  collectionHandle: collections.find(c => c.title === form.collectionTitle)?.handle || form.collectionHandle || undefined,
  articlesPerRun: Number(form.articlesPerRun),
  wordCount: Number(form.wordCount),
});

// `withName` adds the campaign name, which a new campaign takes from its category.
function CampaignFields({ value, onChange, collections, blogs, withName = false }) {
  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value });
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
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
      {withName && (
        <div className="form-group">
          <label className="form-label">Campaign name</label>
          <input className="form-input" value={value.name} onChange={set('name')} maxLength={120} />
        </div>
      )}
      <div className="form-group">
        <label className="form-label">Category (collection)</label>
        <select className="form-select" value={value.collectionTitle} onChange={setCategory}>
          {categories.map(title => <option key={title} value={title}>{title}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Cadence</label>
        <select className="form-select" value={value.cadence} onChange={set('cadence')}>
          <option value="manual">Manual (Run now only)</option>
          <option value="daily">Daily</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Articles / run</label>
        <input className="form-input" type="number" min={1} max={20} value={value.articlesPerRun} onChange={set('articlesPerRun')} />
      </div>
      <div className="form-group">
        <label className="form-label">Word count</label>
        <input className="form-input" type="number" min={500} max={5000} step={100} value={value.wordCount} onChange={set('wordCount')} />
      </div>
      <div className="form-group">
        <label className="form-label">AI Model</label>
        <select className="form-select" value={value.aiModel} onChange={set('aiModel')}>
          <option value="gemini">🧠 Gemini</option>
          <option value="deepseek">🔮 DeepSeek</option>
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Publish mode</label>
        <select className="form-select" value={value.publishMode} onChange={set('publishMode')}>
          <option value="draft">Save as draft</option>
          <option value="live">Publish live</option>
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Blog</label>
        {blogOptions.length ? (
          <select className="form-select" value={value.blogId} onChange={set('blogId')}>
            {blogOptions.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
          </select>
        ) : (
          <input className="form-input" value={value.blogId} onChange={set('blogId')} placeholder="Blog ID" />
        )}
      </div>
    </div>
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

  const load = () => {
    setLoading(true);
    getCampaigns().then(res => setList(res.data || [])).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    getBusinessDna().then(res => {
      if (res.data?.collections?.length) {
        setCollections(res.data.collections);
        setForm(f => ({ ...f, collectionTitle: res.data.collections[0].title }));
      }
      if (res.data?.blogs?.length) {
        setBlogs(res.data.blogs);
        setForm(f => ({ ...f, blogId: res.data.blogs[0].id }));
      }
    }).catch(() => {});
    getSettings().then(res => {
      const preferred = res.data?.ai?.providers?.article;
      if (preferred) setForm(f => ({ ...f, aiModel: preferred }));
    }).catch(() => {});
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.collectionTitle) return toast.error('Pick a category');
    if (!form.blogId) return toast.error('Pick a blog');
    setCreating(true);
    try {
      await createCampaign({ ...toPayload(form, collections), name: form.collectionTitle });
      toast.success('Campaign created');
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

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <h1>🚀 Campaigns</h1>
        <p>Pick a category — the tool finds low-competition keywords, skips topics you already cover, and auto-writes & publishes articles.</p>
      </div>

      {/* Create */}
      <div className="card mb-24" style={{ maxWidth: 900 }}>
        <div className="card-header"><h2>➕ New Campaign</h2></div>
        <div className="card-body">
          {collections.length === 0 ? (
            <div className="form-helper">
              No collections found. Fetch your <a href="/business-dna">Business DNA</a> first so categories are available.
            </div>
          ) : (
            <form onSubmit={handleCreate}>
              <CampaignFields value={form} onChange={setForm} collections={collections} blogs={blogs} />
              <button className="btn btn-primary w-full" type="submit" disabled={creating}>
                {creating ? <><Loader2 size={16} className="spinning" /> Creating...</> : <><Plus size={16} /> Create Campaign</>}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* List */}
      <div className="card">
        <div className="card-header">
          <h2>📋 Your Campaigns</h2>
          <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={14} /> Refresh</button>
        </div>
        <div className="card-body">
          {loading ? (
            <div className="empty-state"><div className="spinner spinner-lg" /></div>
          ) : list.length === 0 ? (
            <div className="empty-state">
              <Rocket size={48} />
              <h3>No campaigns yet</h3>
              <p>Create one above to start automating category-based content.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {list.map(c => (
                <div key={c.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 'var(--radius-md)', padding: 16 }}>
                  <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ cursor: 'pointer' }} onClick={() => toggleExpand(c)}>
                      <div className="flex items-center gap-8">
                        {expanded === c.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        <strong>{c.name}</strong>
                        <span className={`badge ${c.status === 'active' ? 'badge-success' : 'badge-warning'}`}>{c.status}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 24 }}>
                        {c.cadence} · {c.articles_per_run}/run · {c.ai_model} · {c.publish_mode} · {c.published_count}/{c.total_count} done
                        {c.next_run_at ? ` · next: ${new Date(c.next_run_at).toLocaleString()}` : ''}
                      </div>
                    </div>
                    <div className="flex gap-8">
                      <button className="btn btn-secondary btn-sm" onClick={() => runNow(c)} disabled={busyId === c.id} title="Run now">
                        <Play size={14} /> Run now
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditing(editing?.id === c.id ? null : { id: c.id, ...formFrom(c) })} disabled={busyId === c.id} title="Edit" aria-label="Edit campaign" aria-expanded={editing?.id === c.id}>
                        <Pencil size={14} />
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => toggleStatus(c)} disabled={busyId === c.id} title={c.status === 'active' ? 'Pause' : 'Resume'}>
                        {c.status === 'active' ? <Pause size={14} /> : <Play size={14} />}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => remove(c)} disabled={busyId === c.id} title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {editing?.id === c.id && (
                    <form onSubmit={handleSave} style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
                      <CampaignFields value={editing} onChange={setEditing} collections={collections} blogs={blogs} withName />
                      <div className="form-helper mb-16">
                        Changes apply to the next articles. Articles already written stay as they are.
                        {editing.cadence !== c.cadence && editing.cadence !== 'manual' && ` The next run will be one ${editing.cadence === 'daily' ? 'day' : 'month'} from now.`}
                        {editing.cadence === 'manual' && c.cadence !== 'manual' && ' Scheduled runs will stop.'}
                      </div>
                      <div className="flex gap-8">
                        <button className="btn btn-primary btn-sm" type="submit" disabled={saving}>
                          {saving ? <Loader2 size={14} className="spinning" /> : <Save size={14} />} Save changes
                        </button>
                        <button className="btn btn-ghost btn-sm" type="button" onClick={() => setEditing(null)}>Cancel</button>
                      </div>
                    </form>
                  )}

                  {expanded === c.id && (
                    <div style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
                      {!articles[c.id] ? (
                        <div className="form-helper">Loading activity…</div>
                      ) : articles[c.id].length === 0 ? (
                        <div className="form-helper">No articles generated yet. Hit "Run now" to start.</div>
                      ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                          <tbody>
                            {articles[c.id].map(a => (
                              <tr key={a.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                <td style={{ padding: '6px 8px' }}>{a.title || a.keyword || '—'}</td>
                                <td style={{ padding: '6px 8px' }}>
                                  <span className={`badge ${ARTICLE_BADGE[a.status] || 'badge-purple'}`}>{a.status}</span>
                                </td>
                                <td style={{ padding: '6px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                  {new Date(a.created_at).toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <style>{`.spinning { animation: spin 1s linear infinite; }`}</style>
    </div>
  );
}
