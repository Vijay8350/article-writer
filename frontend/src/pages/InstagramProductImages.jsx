import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ImagePlus, Loader2, Send, RefreshCw, Trash2, ExternalLink, Search, CheckCircle2, XCircle, Plus, Play, Pause, AlarmClock, Zap, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  getProductImageStatus, getStoreProducts, getProductImages, createProductImage, regenerateProductImage,
  updateProductImage, publishProductImage, deleteProductImage, getInstagramAccounts, getInstagramAutomations,
  createInstagramAutomation, updateInstagramAutomation, deleteInstagramAutomation, postInstagramNow,
} from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { JobFields, emptyJob, fmtNext } from './InstagramScheduler';

const STATUS = {
  generating: ['badge-warning', 'Making image…'],
  ready: ['badge-success', 'Ready to post'],
  qa_failed: ['badge-danger', 'Failed quality check'],
  failed: ['badge-danger', 'Failed'],
  publishing: ['badge-warning', 'Posting…'],
  published: ['badge-purple', 'Posted'],
};
const WORKING = ['generating', 'publishing'];
const PICKER_LIMIT = 60;

const errMsg = (err, fallback = 'Something went wrong') => err.response?.data?.error || fallback;
const muted = { fontSize: 12, color: 'var(--text-muted)' };
const danger = { fontSize: 12, color: 'var(--accent-danger)', overflowWrap: 'anywhere' };

const notify = (res) => {
  if (res?.warning) toast(res.warning, { icon: '⚠️', duration: 8000 });
  else if (res?.message) toast.success(res.message);
};

function ImageCard({ item, accounts, styles, busy, canManage, onRegenerate, onPublish, onSaveCaption, onDelete }) {
  const [caption, setCaption] = useState(item.caption || '');
  const [accountId, setAccountId] = useState(item.account_id || accounts[0]?.id || '');
  useEffect(() => { setCaption(item.caption || ''); }, [item.caption]);
  useEffect(() => { setAccountId(item.account_id || accounts[0]?.id || ''); }, [item.account_id, accounts]);

  const [cls, label] = STATUS[item.status] || ['badge-info', item.status];
  const working = WORKING.includes(item.status) || !!busy;
  const styleLabel = styles.find((s) => s.key === item.style)?.label;
  const posted = item.status === 'published';

  return (
    <div className="ig-post">
      {item.image_url ? (
        <a href={item.image_url} target="_blank" rel="noreferrer"><img className="ig-post-img" src={item.image_url} alt={item.product_title || 'Generated product'} loading="lazy" /></a>
      ) : (
        <div className="ig-post-placeholder">
          {item.status === 'generating' ? <><Loader2 size={22} className="spinning" /> Making the image and checking it…</> : <><ImagePlus size={22} /> No image</>}
        </div>
      )}
      <div className="ig-post-body">
        <div className="flex justify-between gap-8" style={{ alignItems: 'flex-start' }}>
          <strong style={{ fontSize: 14, lineHeight: 1.3, overflowWrap: 'anywhere' }}>
            {item.product_url ? <a href={item.product_url} target="_blank" rel="noreferrer">{item.product_title}</a> : item.product_title}
          </strong>
          <span className={`badge ${cls}`} style={{ flex: '0 0 auto' }}>{label}</span>
        </div>
        <div style={muted}>
          {styleLabel || 'Mixed style'}{item.automation_id ? ' · daily job' : ''}{item.username ? ` · @${item.username}` : ''}
        </div>
        {item.qa_score != null && (
          <div style={{ fontSize: 12, color: item.status === 'qa_failed' ? 'var(--accent-danger)' : 'var(--text-secondary)' }}>
            Quality score {item.qa_score}/100 · {item.attempts} attempt{item.attempts === 1 ? '' : 's'}
            {item.status === 'qa_failed' && item.qa_reasons?.length > 0 && ` — ${item.qa_reasons.join('; ')}`}
          </div>
        )}
        {item.error && <div style={danger}>{item.error}</div>}

        {posted ? (
          <details>
            <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>Caption</summary>
            <p style={{ whiteSpace: 'pre-wrap', fontSize: 13, marginTop: 6, overflowWrap: 'anywhere' }}>{item.caption}</p>
          </details>
        ) : item.image_url && (
          <>
            <textarea className="form-textarea" rows={4} value={caption} aria-label="Caption" disabled={working}
              onChange={(e) => setCaption(e.target.value)} onBlur={() => caption !== (item.caption || '') && onSaveCaption(caption)}
              style={{ fontSize: 13, minHeight: 0 }} />
            {accounts.length > 0 && item.status === 'ready' && (
              <select className="form-select" value={accountId} aria-label="Instagram account" disabled={working} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>@{a.username}</option>)}
              </select>
            )}
          </>
        )}

        <div className="flex gap-8" style={{ flexWrap: 'wrap', marginTop: 'auto' }}>
          {item.status === 'ready' && canManage && (
            <button className="btn btn-primary btn-sm" disabled={working || !accountId} title={accountId ? undefined : 'Connect an Instagram account first'}
              onClick={() => onPublish({ accountId, caption })}>
              {busy === 'publish' ? <Loader2 size={14} className="spinning" /> : <Send size={14} />} Post now
            </button>
          )}
          {['ready', 'qa_failed', 'failed'].includes(item.status) && (
            <button className="btn btn-secondary btn-sm" disabled={working} onClick={onRegenerate}>
              {busy === 'regenerate' ? <Loader2 size={14} className="spinning" /> : <RefreshCw size={14} />} New image
            </button>
          )}
          {posted && item.permalink && (
            <a className="btn btn-secondary btn-sm" href={item.permalink} target="_blank" rel="noreferrer"><ExternalLink size={14} /> View on Instagram</a>
          )}
          {canManage && !WORKING.includes(item.status) && (
            <button className="btn btn-ghost btn-sm" disabled={working} onClick={onDelete} title="Delete" aria-label="Delete image"><Trash2 size={14} /></button>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateTab({ status, accounts, canManage }) {
  const [site, setSite] = useState(status.defaultSite || '');
  const [store, setStore] = useState(null);
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [style, setStyle] = useState('');
  const [notes, setNotes] = useState('');
  const [images, setImages] = useState(null);
  const [busy, setBusy] = useState(null); // 'products' | 'generate' | { id, action }

  const refresh = useCallback(async () => {
    try {
      const res = await getProductImages();
      setImages(res.data || []);
    } catch (err) {
      toast.error(errMsg(err, 'Failed to load images'));
      setImages([]);
    }
  }, []);

  const loadProducts = useCallback(async (address) => {
    if (!address.trim()) return toast.error('Enter the website address');
    setBusy('products');
    try {
      const res = await getStoreProducts(address.trim());
      setStore(res.data.store);
      setProducts(res.data.products);
      setSelected(null);
      if (!res.data.products.length) toast.error('No in-stock products with photos on that website');
    } catch (err) {
      toast.error(errMsg(err, 'Could not read that website'));
    }
    setBusy(null);
    return undefined;
  }, []);

  useEffect(() => {
    refresh();
    if (status.defaultSite) loadProducts(status.defaultSite);
  }, [refresh, loadProducts, status.defaultSite]);

  // A daily job may be working in the background — refresh until it settles.
  useEffect(() => {
    if (!images?.some((i) => WORKING.includes(i.status))) return undefined;
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [images, refresh]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (q ? products.filter((p) => p.title.toLowerCase().includes(q)) : products).slice(0, PICKER_LIMIT);
  }, [products, search]);

  const act = async (key, fn) => {
    setBusy(key);
    try { notify(await fn()); } catch (err) { toast.error(errMsg(err), { duration: 8000 }); }
    await refresh();
    setBusy(null);
  };

  const handleGenerate = () => {
    setTimeout(refresh, 2500); // shows the new card while the request runs
    return act('generate', () => createProductImage({
      siteUrl: store.url, productId: selected.id, style: style || undefined, notes: notes.trim() || undefined, accountId: accounts[0]?.id,
    }));
  };

  const itemBusy = (id) => (busy?.id === id ? busy.action : null);

  return (
    <>
      <div className="card mb-24">
        <div className="card-header"><h2><ImagePlus size={16} /> Create an image</h2></div>
        <div className="card-body">
          <form className="form-group flex gap-8" onSubmit={(e) => { e.preventDefault(); loadProducts(site); }}>
            <input className="form-input" style={{ flex: 1 }} value={site} onChange={(e) => setSite(e.target.value)} placeholder="yourstore.com" aria-label="Website address" />
            <button className="btn btn-secondary" type="submit" disabled={busy === 'products'}>
              {busy === 'products' ? <Loader2 size={16} className="spinning" /> : <RefreshCw size={16} />} Load products
            </button>
          </form>

          {products.length > 0 && (
            <>
              <div className="form-group" style={{ position: 'relative' }}>
                <label className="form-label">1. Pick a product <span style={muted}>({products.length} in stock on {store?.name || store?.url})</span></label>
                <div style={{ position: 'relative' }}>
                  <Search size={15} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--text-muted)' }} />
                  <input className="form-input" style={{ paddingLeft: 34 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products" aria-label="Search products" />
                </div>
              </div>
              <div className="product-picker mb-16">
                {matches.map((p) => (
                  <button key={p.id} type="button" className={`product-tile ${selected?.id === p.id ? 'active' : ''}`} onClick={() => setSelected(p)} aria-pressed={selected?.id === p.id}>
                    <img src={p.image} alt="" loading="lazy" />
                    <span className="product-tile-title">{p.title}</span>
                    {p.price && <span className="product-tile-price">{p.price}</span>}
                  </button>
                ))}
                {matches.length === 0 && <div style={muted}>No products match.</div>}
              </div>

              <div className="form-group">
                <label className="form-label">2. Pick a style</label>
                <div className="chips">
                  <button type="button" className={`chip ${style === '' ? 'active' : ''}`} onClick={() => setStyle('')}>Surprise me</button>
                  {status.styles.map((s) => (
                    <button key={s.key} type="button" className={`chip ${style === s.key ? 'active' : ''}`} onClick={() => setStyle(s.key)}>{s.label}</button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">3. Direction for the image (optional)</label>
                <input className="form-input" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500}
                  placeholder="e.g. Diwali table setting, warm marigold tones" />
              </div>

              <button className="btn btn-primary" type="button" onClick={handleGenerate} disabled={!selected || !status.images.ok || busy === 'generate'}>
                {busy === 'generate'
                  ? <><Loader2 size={16} className="spinning" /> Making the image and checking it…</>
                  : <><ImagePlus size={16} /> {selected ? `Generate image of ${selected.title.slice(0, 40)}` : 'Pick a product first'}</>}
              </button>
              <div className="form-helper">
                The real product photo guides the image, and the result is compared against it before it can be posted.
                This usually takes one to two minutes, and each image counts toward your plan's Instagram posts.
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Your images</h2>
          <button className="btn btn-ghost btn-sm" onClick={refresh}><RefreshCw size={14} /> Refresh</button>
        </div>
        <div className="card-body">
          {!images ? (
            <div className="empty-state"><div className="spinner spinner-lg" /></div>
          ) : images.length === 0 ? (
            <div className="empty-state"><ImagePlus size={48} /><h3>No images yet</h3><p>Generate your first one above.</p></div>
          ) : (
            <div className="ig-post-grid">
              {images.map((item) => (
                <ImageCard key={item.id} item={item} accounts={accounts} styles={status.styles} canManage={canManage} busy={itemBusy(item.id)}
                  onRegenerate={() => act({ id: item.id, action: 'regenerate' }, () => regenerateProductImage(item.id, {}))}
                  onSaveCaption={(caption) => updateProductImage(item.id, { caption }).then(refresh).catch((err) => toast.error(errMsg(err)))}
                  onPublish={(data) => {
                    if (!window.confirm(`Post this image to Instagram now? It goes live immediately.`)) return;
                    act({ id: item.id, action: 'publish' }, () => publishProductImage(item.id, data));
                  }}
                  onDelete={() => {
                    if (!window.confirm('Delete this image?')) return;
                    act({ id: item.id, action: 'delete' }, () => deleteProductImage(item.id));
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function AutoPostTab({ status, accounts, canManage }) {
  const [jobs, setJobs] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await getInstagramAutomations();
      setJobs((res.data || []).filter((j) => j.image_mode === 'ai'));
    } catch (err) {
      toast.error(errMsg(err, 'Failed to load jobs'));
      setJobs([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const run = async (key, fn) => {
    setBusy(key);
    try { notify(await fn()); } catch (err) { toast.error(errMsg(err), { duration: 8000 }); }
    await load();
    setBusy(null);
  };

  const newForm = () => setForm({ ...emptyJob(accounts), siteUrl: status.defaultSite || '', imageMode: 'ai' });

  const handleCreate = (e) => {
    e.preventDefault();
    if (!form.siteUrl.trim()) return toast.error('Enter the website address');
    return run('create', async () => {
      const res = await createInstagramAutomation({ ...form, siteUrl: form.siteUrl.trim(), imageMode: 'ai', imageStyle: form.imageStyle || undefined });
      setForm(null);
      return res;
    });
  };

  if (accounts.length === 0) {
    return (
      <div className="card"><div className="card-body"><div className="empty-state">
        <AlarmClock size={48} />
        <h3>Connect an Instagram account first</h3>
        <p><Link to="/instagram">Go to Instagram Accounts</Link> to connect one, then set up daily posts here.</p>
      </div></div></div>
    );
  }

  return (
    <>
      {form ? (
        <div className="card mb-24">
          <div className="card-header">
            <h2>New daily job</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => setForm(null)} title="Close" aria-label="Close"><X size={14} /></button>
          </div>
          <div className="card-body">
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">Shopify website address</label>
                <input className="form-input" value={form.siteUrl} onChange={(e) => setForm({ ...form, siteUrl: e.target.value })} placeholder="yourstore.com" />
                <div className="form-helper">Each day the job takes the next in-stock product in rotation, so nothing repeats until the whole catalogue has been posted.</div>
              </div>
              <JobFields value={form} onChange={setForm} accounts={accounts} styles={status.styles} aiOnly />
              <div className="form-helper mb-16">
                If an image can't be made or fails the quality check, the job posts the store's real photos that day, and the post history says why.
              </div>
              <button className="btn btn-primary w-full" type="submit" disabled={busy === 'create'}>
                {busy === 'create' ? <><Loader2 size={16} className="spinning" /> Checking website...</> : <><Plus size={16} /> Start daily posts</>}
              </button>
            </form>
          </div>
        </div>
      ) : (
        <button className="btn btn-primary mb-24" onClick={newForm} disabled={!canManage}><Plus size={16} /> New daily job</button>
      )}

      <div className="card">
        <div className="card-header">
          <h2>Daily jobs</h2>
          <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={14} /> Refresh</button>
        </div>
        <div className="card-body">
          {!jobs ? (
            <div className="empty-state"><div className="spinner spinner-lg" /></div>
          ) : jobs.length === 0 ? (
            <div className="empty-state"><AlarmClock size={48} /><h3>No daily jobs yet</h3><p>Add one to post a new AI product image every day.</p></div>
          ) : (
            <div className="flex-col gap-12">
              {jobs.map((j) => (
                <div key={j.id} className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 12, border: '1px solid var(--border-secondary)', borderRadius: 'var(--radius-md)', padding: 14, opacity: j.status === 'paused' ? 0.7 : 1 }}>
                  <div style={{ minWidth: 0, flex: '1 1 280px' }}>
                    <div className="flex items-center gap-8" style={{ flexWrap: 'wrap' }}>
                      <strong>{j.post_time}</strong>
                      <span>{j.site_name || j.site_url.replace(/^https?:\/\//, '')}</span>
                      <span style={{ color: 'var(--text-muted)' }}>→ @{j.username}</span>
                      <span className={`badge ${j.status === 'active' ? 'badge-success' : 'badge-warning'}`}>{j.status}</span>
                    </div>
                    <div style={muted}>
                      {status.styles.find((s) => s.key === j.image_style)?.label || 'Mixed styles'} · {j.published_count} posted
                      {j.status === 'active' && j.next_run_at ? ` · next: ${fmtNext(j.next_run_at)}` : ''}
                    </div>
                    {j.last_status === 'failed' && j.last_error && <div style={danger}>{j.last_error}</div>}
                  </div>
                  {canManage && (
                    <div className="flex gap-8">
                      <button className="btn btn-primary btn-sm" disabled={!!busy} title="Post the next product now"
                        onClick={() => {
                          if (!window.confirm(`Generate an image and post the next product to @${j.username} now?`)) return;
                          run(`post:${j.id}`, () => postInstagramNow(j.id));
                        }}>
                        {busy === `post:${j.id}` ? <Loader2 size={14} className="spinning" /> : <Send size={14} />} Post now
                      </button>
                      <button className="btn btn-ghost btn-sm" disabled={!!busy} title={j.status === 'active' ? 'Pause' : 'Resume'} aria-label={j.status === 'active' ? 'Pause' : 'Resume'}
                        onClick={() => run(`toggle:${j.id}`, () => updateInstagramAutomation(j.id, { status: j.status === 'active' ? 'paused' : 'active' }))}>
                        {j.status === 'active' ? <Pause size={14} /> : <Play size={14} />}
                      </button>
                      <button className="btn btn-ghost btn-sm" disabled={!!busy} title="Delete" aria-label="Delete"
                        onClick={() => {
                          if (!window.confirm(`Delete the ${j.post_time} job and its post history?`)) return;
                          run(`delete:${j.id}`, () => deleteInstagramAutomation(j.id));
                        }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
              <div className="form-helper">Edit a job's caption rules or see its full history in <Link to="/instagram-scheduler">Product Scheduler</Link>.</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function InstagramProductImages() {
  const { activeRole } = useAuth();
  const canManage = activeRole === 'owner' || activeRole === 'admin';
  const [tab, setTab] = useState('create');
  const [status, setStatus] = useState(null);
  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    Promise.all([getProductImageStatus(), getInstagramAccounts()])
      .then(([s, a]) => { setStatus(s.data); setAccounts(a.data || []); })
      .catch((err) => toast.error(errMsg(err, 'Failed to load this page')));
  }, []);

  const engine = { codex: 'ChatGPT', openai: 'OpenAI', gemini: 'Gemini' }[status?.images?.provider] || 'Image engine';

  return (
    <div className="page-container fade-in" style={{ maxWidth: 1040 }}>
      <div className="page-header">
        <h1>🛍️ AI Product Posts</h1>
        <p>Turn the products on your website into scroll-stopping Instagram images, and post them by hand or automatically every day.</p>
      </div>

      {!status ? (
        <div className="empty-state"><div className="spinner spinner-lg" /></div>
      ) : (
        <>
          <div className="flex items-center gap-8 mb-16" style={{ fontSize: 13, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
            {status.images.ok
              ? <CheckCircle2 size={15} style={{ color: 'var(--accent-success)' }} aria-label="ready" />
              : <XCircle size={15} style={{ color: 'var(--accent-danger)' }} aria-label="not ready" />}
            <span title={status.images.detail}>{engine} images {status.images.ok ? 'ready' : `not ready — ${status.images.detail}`}</span>
            {accounts.length === 0 && <span style={muted}>· <Link to="/instagram">Connect Instagram</Link> to post</span>}
          </div>

          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'create'} className={`tab ${tab === 'create' ? 'active' : ''}`} onClick={() => setTab('create')}><ImagePlus size={15} /> Create</button>
            <button role="tab" aria-selected={tab === 'auto'} className={`tab ${tab === 'auto' ? 'active' : ''}`} onClick={() => setTab('auto')}><Zap size={15} /> Daily auto-post</button>
          </div>

          {tab === 'create'
            ? <CreateTab status={status} accounts={accounts} canManage={canManage} />
            : <AutoPostTab status={status} accounts={accounts} canManage={canManage} />}
        </>
      )}
      <style>{'.spinning { animation: spin 1s linear infinite; }'}</style>
    </div>
  );
}
