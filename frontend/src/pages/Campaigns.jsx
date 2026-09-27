import React, { useState, useEffect } from 'react';
import { Rocket, Plus, Play, Pause, Trash2, RefreshCw, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  getCampaigns, createCampaign, setCampaignStatus, deleteCampaign, runCampaignNow,
  getCampaignArticles, getBusinessDna, getSettings,
} from '../lib/api';

const ARTICLE_BADGE = {
  published: 'badge-success',
  draft: 'badge-purple',
  failed: 'badge-danger',
  skipped_duplicate: 'badge-warning',
  limit_reached: 'badge-danger',
};

export default function Campaigns() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [collections, setCollections] = useState([]);
  const [blogs, setBlogs] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [articles, setArticles] = useState({});
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);

  // form
  const [collectionTitle, setCollectionTitle] = useState('');
  const [cadence, setCadence] = useState('manual');
  const [articlesPerRun, setArticlesPerRun] = useState(3);
  const [wordCount, setWordCount] = useState(1500);
  const [aiModel, setAiModel] = useState('gemini');
  const [publishMode, setPublishMode] = useState('draft');
  const [blogId, setBlogId] = useState('');

  const load = () => {
    setLoading(true);
    getCampaigns().then(res => setList(res.data || [])).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    getBusinessDna().then(res => {
      if (res.data?.collections?.length) {
        setCollections(res.data.collections);
        setCollectionTitle(res.data.collections[0].title);
      }
      if (res.data?.blogs?.length) {
        setBlogs(res.data.blogs);
        setBlogId(res.data.blogs[0].id);
      }
    }).catch(() => {});
    getSettings().then(res => {
      const preferred = res.data?.ai?.providers?.article;
      if (preferred) setAiModel(preferred);
    }).catch(() => {});
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!collectionTitle) return toast.error('Pick a category');
    if (!blogId) return toast.error('Pick a blog');
    setCreating(true);
    try {
      const coll = collections.find(c => c.title === collectionTitle);
      await createCampaign({
        name: collectionTitle,
        collectionTitle,
        collectionHandle: coll?.handle,
        cadence,
        articlesPerRun: Number(articlesPerRun),
        wordCount: Number(wordCount),
        aiModel,
        publishMode,
        blogId,
      });
      toast.success('Campaign created');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create campaign');
    }
    setCreating(false);
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Category (collection)</label>
                  <select className="form-select" value={collectionTitle} onChange={e => setCollectionTitle(e.target.value)}>
                    {collections.map(c => <option key={c.id || c.handle} value={c.title}>{c.title}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Cadence</label>
                  <select className="form-select" value={cadence} onChange={e => setCadence(e.target.value)}>
                    <option value="manual">Manual (Run now only)</option>
                    <option value="daily">Daily</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Articles / run</label>
                  <input className="form-input" type="number" min={1} max={20} value={articlesPerRun}
                    onChange={e => setArticlesPerRun(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Word count</label>
                  <input className="form-input" type="number" min={500} max={5000} step={100} value={wordCount}
                    onChange={e => setWordCount(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">AI Model</label>
                  <select className="form-select" value={aiModel} onChange={e => setAiModel(e.target.value)}>
                    <option value="gemini">🧠 Gemini</option>
                    <option value="deepseek">🔮 DeepSeek</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Publish mode</label>
                  <select className="form-select" value={publishMode} onChange={e => setPublishMode(e.target.value)}>
                    <option value="draft">Save as draft</option>
                    <option value="live">Publish live</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Blog</label>
                  {blogs.length ? (
                    <select className="form-select" value={blogId} onChange={e => setBlogId(e.target.value)}>
                      {blogs.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
                    </select>
                  ) : (
                    <input className="form-input" value={blogId} onChange={e => setBlogId(e.target.value)} placeholder="Blog ID" />
                  )}
                </div>
              </div>
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
                      <button className="btn btn-ghost btn-sm" onClick={() => toggleStatus(c)} disabled={busyId === c.id} title={c.status === 'active' ? 'Pause' : 'Resume'}>
                        {c.status === 'active' ? <Pause size={14} /> : <Play size={14} />}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => remove(c)} disabled={busyId === c.id} title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

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
