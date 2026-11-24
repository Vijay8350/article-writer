import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ImagePlus, Loader2, Send, RefreshCw, Trash2, ExternalLink, Search, Plus, AlarmClock, Zap, Instagram, AlertTriangle, Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  getProductImageStatus, getStoreProducts, getProductImages, createProductImage, regenerateProductImage,
  updateProductImage, publishProductImage, deleteProductImage, getInstagramAccounts, getInstagramAutomations,
  createInstagramAutomation, updateInstagramAutomation, deleteInstagramAutomation, postInstagramNow,
} from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { JobFields, emptyJob, jobPayload, fmtNext } from './InstagramScheduler';
import { ImagesPerPost } from '../components/ScheduleFields';
import { ExtraImages } from '../components/studio/shared';
import { PageHeader, Sheet, EmptyState, Section, Switch } from '../components/ui';
import { scheduleText } from '../lib/dates';
import '../styles/ig-automation.css';

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
const siteLabel = (j) => j.name || j.site_name || j.site_url.replace(/^https?:\/\//, '');

const notify = (res) => {
  if (res?.warning) toast(res.warning, { icon: <AlertTriangle size={18} style={{ color: 'var(--accent-warning)', flexShrink: 0 }} />, duration: 8000 });
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
  const canPost = item.status === 'ready' && canManage;
  const reasons = item.status === 'qa_failed' && item.qa_reasons?.length > 0 ? item.qa_reasons.join('; ') : null;

  return (
    <article className="ig-post">
      {item.image_url ? (
        <a href={item.image_url} target="_blank" rel="noreferrer">
          {/* The box follows the image itself (4:5 posts; older ones are square). */}
          <img className={`ig-post-img${item.variant?.canvas === 'portrait' && item.status !== 'generating' ? ' portrait' : ''}`} src={item.image_url} alt={item.product_title || 'Generated product'} loading="lazy"
            onLoad={(e) => e.currentTarget.classList.toggle('portrait', e.currentTarget.naturalHeight > e.currentTarget.naturalWidth)} />
        </a>
      ) : (
        <div className="ig-post-placeholder">
          {item.status === 'generating' ? <><Loader2 size={22} className="spinning" /> Making the image and checking it…</> : <><ImagePlus size={22} /> No image</>}
        </div>
      )}
      {item.extra_urls?.length > 0 && <ExtraImages urls={item.extra_urls} />}
      <div className="ig-post-body">
        <div className="iga-card-head">
          <span className="iga-card-title">
            {item.product_url ? <a href={item.product_url} target="_blank" rel="noreferrer">{item.product_title}</a> : item.product_title}
          </span>
          <span className={`badge ${cls}`}>{label}</span>
        </div>
        <div className="iga-muted">
          {[styleLabel || 'Mixed style', item.image_url && item.status !== 'generating' ? item.design_label : null].filter(Boolean).join(' · ')}{item.automation_id ? ' · daily job' : ''}{item.username ? ` · @${item.username}` : ''}
        </div>
        {item.qa_score != null && (
          <div className="iga-muted">Quality score {item.qa_score}/100 · {item.attempts} attempt{item.attempts === 1 ? '' : 's'}</div>
        )}
        {(reasons || item.error) && (
          <div className="callout callout--danger iga-card-callout">
            <div>
              {reasons && <div>{reasons}</div>}
              {item.error && <div style={{ overflowWrap: 'anywhere' }}>{item.error}</div>}
            </div>
          </div>
        )}

        {posted ? (
          <details className="iga-card-caption">
            <summary>Caption</summary>
            <p>{item.caption}</p>
          </details>
        ) : item.image_url && (
          <>
            <div className="iga-card-field">
              <label className="form-label" htmlFor={`caption-${item.id}`}>Caption</label>
              <textarea id={`caption-${item.id}`} className="form-textarea" rows={4} value={caption} disabled={working}
                onChange={(e) => setCaption(e.target.value)} onBlur={() => caption !== (item.caption || '') && onSaveCaption(caption)} />
              <div className="form-helper">Saves when you click outside the box.</div>
            </div>
            {accounts.length > 0 && item.status === 'ready' && (
              <div className="iga-card-field">
                <label className="form-label" htmlFor={`account-${item.id}`}>Post to</label>
                <select id={`account-${item.id}`} className="form-select" value={accountId} disabled={working} onChange={(e) => setAccountId(e.target.value)}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>@{a.username}</option>)}
                </select>
              </div>
            )}
          </>
        )}

        <div className="iga-card-actions">
          {canPost && (
            <button className="btn btn-primary btn-sm" disabled={working || !accountId} title={accountId ? undefined : 'Connect an Instagram account first'}
              onClick={() => onPublish({ accountId, caption })}>
              {busy === 'publish' ? <Loader2 size={14} className="spinning" /> : <Send size={14} />} Post now
            </button>
          )}
          {['ready', 'qa_failed', 'failed'].includes(item.status) && (
            <button className={`btn ${canPost ? 'btn-ghost' : 'btn-secondary'} btn-sm`} disabled={working} onClick={onRegenerate}>
              {busy === 'regenerate' ? <Loader2 size={14} className="spinning" /> : <RefreshCw size={14} />} New image
            </button>
          )}
          {posted && item.permalink && (
            <a className="btn btn-secondary btn-sm" href={item.permalink} target="_blank" rel="noreferrer"><ExternalLink size={14} /> View on Instagram</a>
          )}
          {canManage && !WORKING.includes(item.status) && (
            <button className="btn btn-ghost btn-sm iga-icon-btn iga-push" disabled={working} onClick={onDelete} title="Delete" aria-label="Delete image">
              {busy === 'delete' ? <Loader2 size={14} className="spinning" /> : <Trash2 size={14} />}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function CreateTab({ status, engine, accounts, canManage }) {
  const [site, setSite] = useState(status.defaultSite || '');
  const [store, setStore] = useState(null);
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [style, setStyle] = useState('banner');
  const [notes, setNotes] = useState('');
  const [imagesPerPost, setImagesPerPost] = useState(1);
  const [images, setImages] = useState(null);
  const [busy, setBusy] = useState(null); // 'products' | 'generate' | { id, action }
  const siteInput = useRef(null);

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
      siteUrl: store.url, productId: selected.id, style, notes: notes.trim() || undefined, accountId: accounts[0]?.id, imagesPerPost: Number(imagesPerPost) || 1,
    }));
  };

  const itemBusy = (id) => (busy?.id === id ? busy.action : null);
  const styleOptions = [...status.styles, { key: 'auto', label: 'Surprise me' }];
  const styleName = styleOptions.find((s) => s.key === style)?.label;
  const count = Number(imagesPerPost) || 1;
  const createHint = !status.images.ok
    ? `${engine} images aren't ready, so posts can't be made right now.`
    : !selected
      ? 'Choose a product in step 1 first.'
      : 'Usually takes one to three minutes. Your real product photo is used, so its design never changes, and the result is checked before it can be posted.';

  return (
    <div className="stack">
      <Section title="Create a post" description="Three steps: choose a product, set the options, and create. You can edit the caption before posting.">
        <ol className="steps-list iga-steps">
          <li className={selected ? 'is-done' : ''}>
            <div className="iga-step">
              <h3 className="iga-step__title">Choose a product</h3>
              <form className="iga-load" onSubmit={(e) => { e.preventDefault(); loadProducts(site); }}>
                <label className="sr-only" htmlFor="pp-site">Website address</label>
                <input id="pp-site" ref={siteInput} className="form-input" value={site} onChange={(e) => setSite(e.target.value)} placeholder="yourstore.com" />
                <button className="btn btn-secondary" type="submit" disabled={busy === 'products'}>
                  {busy === 'products' ? <Loader2 size={16} className="spinning" /> : <RefreshCw size={16} />} Load products
                </button>
              </form>

              {products.length === 0 ? (
                busy === 'products'
                  ? <div className="iga-muted iga-inline"><Loader2 size={14} className="spinning" /> Loading products…</div>
                  : <div className="form-helper">Enter your store's address to see its in-stock products with photos.</div>
              ) : (
                <>
                  <div className="iga-picker-head">
                    <span className="iga-muted">{products.length} in stock on {store?.name || store?.url}</span>
                    <div className="iga-search">
                      <Search aria-hidden="true" />
                      <input className="form-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products" aria-label="Search products" />
                    </div>
                  </div>
                  <div className="product-picker">
                    {matches.map((p) => (
                      <button key={p.id} type="button" className={`product-tile ${selected?.id === p.id ? 'active' : ''}`} onClick={() => setSelected(p)} aria-pressed={selected?.id === p.id}>
                        <img src={p.image} alt="" loading="lazy" />
                        <span className="product-tile-title">{p.title}</span>
                        {p.price && <span className="product-tile-price">{p.price}</span>}
                      </button>
                    ))}
                    {matches.length === 0 && <div className="iga-muted">No products match.</div>}
                  </div>
                </>
              )}
            </div>
          </li>

          <li>
            <div className="iga-step">
              <h3 className="iga-step__title">Options</h3>
              <p className="iga-step__desc">Each post gets a fresh look and scene in Instagram's tall 4:5 size. Your product always stays exactly as in your photo.</p>
              <div className="form-group">
                <div className="form-label" id="pp-style-label">Style</div>
                <div className="chips" role="radiogroup" aria-labelledby="pp-style-label">
                  {styleOptions.map((s) => (
                    <button key={s.key} type="button" role="radio" aria-checked={style === s.key}
                      className={`chip ${style === s.key ? 'active' : ''}`} onClick={() => setStyle(s.key)}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="iga-opt-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="pp-notes">Instructions for the image (optional)</label>
                  <input id="pp-notes" className="form-input" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500}
                    placeholder="e.g. Diwali theme, warm marigold tones, mention free shipping" />
                </div>
                <ImagesPerPost value={imagesPerPost} onChange={setImagesPerPost} label="Images in this post"
                  help="Two or more make a carousel from your other photos." />
              </div>
            </div>
          </li>

          <li>
            <div className="iga-step">
              <h3 className="iga-step__title">Create</h3>
              {selected && (
                <div className="iga-summary">
                  <img src={selected.image} alt="" />
                  <div style={{ minWidth: 0 }}>
                    <strong>{selected.title}</strong>
                    <span className="iga-muted">{styleName} · {count} image{count === 1 ? '' : 's'}</span>
                  </div>
                </div>
              )}
              <div className="iga-create">
                <button className="btn btn-primary" type="button" onClick={handleGenerate} disabled={!selected || !status.images.ok || busy === 'generate'}>
                  {busy === 'generate'
                    ? <><Loader2 size={16} className="spinning" /> Making the post and checking it…</>
                    : <><ImagePlus size={16} /> Create post</>}
                </button>
                <span className="form-helper">{createHint}</span>
              </div>
            </div>
          </li>
        </ol>
      </Section>

      <Section
        title="Your posts"
        description="Posts made here and by daily jobs. Edit a ready post's caption, then post it."
        actions={<button className="btn btn-ghost btn-sm" onClick={refresh}><RefreshCw size={14} /> Refresh</button>}
      >
        {!images ? (
          <div className="empty-state"><div className="spinner spinner-lg" /></div>
        ) : images.length === 0 ? (
          <EmptyState
            icon={ImagePlus}
            title="No posts yet"
            text="Posts you create, and posts made by daily jobs, show up here."
            action={<button className="btn btn-secondary" onClick={() => siteInput.current?.focus()}>Choose a product</button>}
          />
        ) : (
          <div className="iga-post-grid">
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
      </Section>
    </div>
  );
}

function AutoPostTab({ status, accounts, canManage }) {
  const [jobs, setJobs] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await getInstagramAutomations();
      setJobs(res.data || []);
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

  const newForm = () => setForm({ ...emptyJob(accounts), siteUrl: status.defaultSite || '' });
  // Stable, so the sheet doesn't re-run its open effect (and move focus) on every keystroke.
  const closeForm = useCallback(() => setForm(null), []);

  const handleCreate = (e) => {
    e.preventDefault();
    if (!form.siteUrl.trim()) return toast.error('Enter the website address');
    return run('create', async () => {
      const res = await createInstagramAutomation({ ...jobPayload(form), siteUrl: form.siteUrl.trim() });
      setForm(null);
      return res;
    });
  };

  if (accounts.length === 0) {
    return (
      <Section>
        <EmptyState
          icon={Instagram}
          title="Connect an Instagram account first"
          text="Daily posts go to a connected Instagram account. Connect one, then set up daily posts here."
          action={<Link to="/instagram" className="btn btn-primary">Go to Instagram accounts</Link>}
        />
      </Section>
    );
  }

  const creating = busy === 'create';
  const newButton = (
    <button className="btn btn-primary btn-sm" onClick={newForm} disabled={!canManage}><Plus size={14} /> New daily job</button>
  );

  return (
    <>
      <Section
        flush={!!jobs?.length}
        title="Daily jobs"
        description={<>Each job posts a new AI product post every day. Edit a job or see its history in <Link to="/instagram-scheduler">Product Scheduler</Link>.</>}
        actions={<><button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={14} /> Refresh</button>{newButton}</>}
      >
        {!jobs ? (
          <div className="empty-state"><div className="spinner spinner-lg" /></div>
        ) : jobs.length === 0 ? (
          <EmptyState
            icon={AlarmClock}
            title="No daily jobs yet"
            text="Add one to post a new AI product image every day."
            action={canManage && <button className="btn btn-primary" onClick={newForm}><Plus size={16} /> New daily job</button>}
          />
        ) : (
          <div className="list">
            {jobs.map((j) => {
              const active = j.status === 'active';
              return (
                <div key={j.id} className={`iga-job${active ? '' : ' is-paused'}`}>
                  <div className="list-item">
                    <div className="iga-time" aria-hidden="true"><strong>{j.post_time}</strong><span>daily</span></div>
                    <div className="list-item__main">
                      <div className="list-item__title">
                        {siteLabel(j)}
                        <span className={`status ${active ? 'status--on' : 'status--off'}`}>{active ? 'Active' : 'Paused'}</span>
                      </div>
                      <div className="list-item__meta">
                        <span>@{j.username}</span>
                        <span>{status.styles.find((s) => s.key === j.image_style)?.label || 'Mixed styles'}</span>
                        <span>{j.images_per_post} image{j.images_per_post === 1 ? '' : 's'} per post</span>
                        <span>{j.published_count} posted</span>
                        {active && j.next_run_at && <span>Next {fmtNext(j.next_run_at)}</span>}
                      </div>
                      <div className="list-item__meta">{scheduleText(j)}</div>
                      {j.last_status === 'failed' && j.last_error && <div className="iga-error">{j.last_error}</div>}
                    </div>
                    {canManage && (
                      <div className="list-item__actions">
                        <button className="btn btn-secondary btn-sm" disabled={!!busy} title="Post the next product now"
                          onClick={() => {
                            if (!window.confirm(`Generate the images and post the next product to @${j.username} now?`)) return;
                            run(`post:${j.id}`, () => postInstagramNow(j.id));
                          }}>
                          {busy === `post:${j.id}` ? <Loader2 size={14} className="spinning" /> : <Send size={14} />} Post now
                        </button>
                        <button className="btn btn-ghost btn-sm iga-icon-btn" disabled={!!busy} title="Delete" aria-label={`Delete the ${j.post_time} job`}
                          onClick={() => {
                            if (!window.confirm(`Delete the ${j.post_time} job and its post history?`)) return;
                            run(`delete:${j.id}`, () => deleteInstagramAutomation(j.id));
                          }}>
                          {busy === `delete:${j.id}` ? <Loader2 size={14} className="spinning" /> : <Trash2 size={14} />}
                        </button>
                        <span title={active ? 'Pause' : 'Resume'}>
                          <Switch checked={active} disabled={!!busy} label={`Post daily at ${j.post_time} for ${siteLabel(j)}`}
                            onChange={() => run(`toggle:${j.id}`, () => updateInstagramAutomation(j.id, { status: active ? 'paused' : 'active' }))} />
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Sheet
        open={!!form}
        title="New daily job"
        subtitle="Posts a new AI product post from your store every day."
        onClose={closeForm}
        busy={creating}
        width={640}
        footer={(
          <>
            <button type="button" className="btn btn-ghost" onClick={closeForm} disabled={creating}>Cancel</button>
            <button type="submit" form="daily-job-form" className="btn btn-primary" disabled={creating}>
              {creating ? <><Loader2 size={16} className="spinning" /> Checking website…</> : <><Plus size={16} /> Start daily posts</>}
            </button>
          </>
        )}
      >
        {form && (
          <form id="daily-job-form" onSubmit={handleCreate}>
            <div className="callout callout--info iga-sheet-callout">
              <Info size={16} aria-hidden="true" />
              <div>Nothing goes out unchecked. If an image fails the quality check, nothing posts, and the job tries again in an hour with the next product.</div>
            </div>
            <JobFields
              value={form}
              onChange={setForm}
              accounts={accounts}
              styles={status.styles}
              siteField={(
                <div className="form-group span-all">
                  <label className="form-label" htmlFor="daily-job-site">Shopify website address</label>
                  <input id="daily-job-site" className="form-input" value={form.siteUrl} onChange={(e) => setForm({ ...form, siteUrl: e.target.value })} placeholder="yourstore.com" />
                  <div className="form-helper">Each day the job takes the next in-stock product in rotation, so nothing repeats until the whole catalogue has been posted.</div>
                </div>
              )}
            />
          </form>
        )}
      </Sheet>
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
    <div className="page-container iga-page fade-in">
      <PageHeader
        title="AI Product Posts"
        subtitle="Turn the products on your website into Instagram posts, and post them yourself or automatically every day."
      >
        {status && (
          <div className="iga-statusbar">
            <span className={`status ${status.images.ok ? 'status--on' : 'status--error'}`} title={status.images.detail}>
              {engine} images {status.images.ok ? 'ready' : 'not ready'}
            </span>
            {accounts.length > 0 ? (
              <span className="status status--on">{accounts.length} Instagram account{accounts.length === 1 ? '' : 's'} connected</span>
            ) : (
              <span className="status status--off">Instagram not connected · <Link to="/instagram">Connect Instagram</Link> to post</span>
            )}
            {status.publishing && !status.publishing.ok && (
              <span className="status status--warn" title={status.publishing.detail}>Posting to Instagram unavailable</span>
            )}
          </div>
        )}
      </PageHeader>

      {!status ? (
        <div className="empty-state"><div className="spinner spinner-lg" /></div>
      ) : (
        <>
          {!status.images.ok && (
            <div className="callout callout--warning mb-24">
              <AlertTriangle size={16} aria-hidden="true" />
              <div><strong>{engine} images aren't ready.</strong> {status.images.detail}</div>
            </div>
          )}

          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'create'} className={`tab ${tab === 'create' ? 'active' : ''}`} onClick={() => setTab('create')}><ImagePlus size={15} /> Create</button>
            <button role="tab" aria-selected={tab === 'auto'} className={`tab ${tab === 'auto' ? 'active' : ''}`} onClick={() => setTab('auto')}><Zap size={15} /> Daily auto-post</button>
          </div>

          {tab === 'create'
            ? <CreateTab status={status} engine={engine} accounts={accounts} canManage={canManage} />
            : <AutoPostTab status={status} accounts={accounts} canManage={canManage} />}
        </>
      )}
    </div>
  );
}
