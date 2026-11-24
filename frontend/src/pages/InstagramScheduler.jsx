import React, { useState, useEffect, useId, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  AlarmClock, Plus, Trash2, RefreshCw, Loader2, ChevronDown, ChevronRight, Eye, Send, Copy, Pencil, Instagram,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { ScheduleWindow, ImagesPerPost } from '../components/ScheduleFields';
import { PageHeader, Sheet, EmptyState, Section, Switch } from '../components/ui';
import { toDateTimeInput, toDateInput, fromDateTimeInput, endOfDay, scheduleText } from '../lib/dates';
import {
  getInstagramAccounts, getInstagramAutomations, createInstagramAutomation, updateInstagramAutomation,
  deleteInstagramAutomation, previewInstagramPost, postInstagramNow, getInstagramPosts, getProductImageStatus,
} from '../lib/api';
import '../styles/ig-automation.css';

const POST_BADGE = { published: 'badge-success', failed: 'badge-danger' };
// The last post's result as a status dot.
const LAST_STATUS = { published: ['status--on', 'posted'], failed: ['status--error', 'failed'] };
const errMsg = (err, fallback) => err.response?.data?.error || fallback;
const fmt = (d) => (d ? new Date(d).toLocaleString() : '—');
const siteLabel = (j) => j.name || j.site_name || j.site_url.replace(/^https?:\/\//, '');

// "today 2:00 PM" / "tomorrow 10:00 AM" / "10/3/2026 9:00 AM"
export function fmtNext(d) {
  const date = new Date(d);
  const days = Math.round((new Date(date.toDateString()) - new Date(new Date().toDateString())) / 864e5);
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${days === 0 ? 'today' : days === 1 ? 'tomorrow' : date.toLocaleDateString()} ${time}`;
}

function browserTimezone() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  return tz === 'Asia/Calcutta' ? 'Asia/Kolkata' : tz;
}

// Browsers list canonical names (e.g. Asia/Calcutta), so always include the current value.
export function timezoneOptions(current) {
  const all = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return [...new Set([current, 'Asia/Kolkata', 'UTC', ...all])];
}

export const emptyJob = (accounts) => ({
  siteUrl: '', accountId: accounts[0]?.id || '', postTime: '10:00', timezone: browserTimezone(),
  captionInstructions: '', hashtags: '', imageStyle: 'banner', imageNotes: '', name: '', imagesPerPost: 1, startsAt: '', endsAt: '',
});

export const jobForm = (j) => ({
  accountId: j.account_id, postTime: j.post_time, timezone: j.timezone, name: j.name || '',
  captionInstructions: j.caption_instructions || '', hashtags: j.hashtags || '',
  imageStyle: j.image_style || 'banner', imageNotes: j.image_notes || '', imagesPerPost: j.images_per_post || 1,
  startsAt: toDateTimeInput(j.starts_at), endsAt: toDateInput(j.ends_at),
});

// The shape the API takes.
export const jobPayload = (form) => ({
  ...form,
  imagesPerPost: Number(form.imagesPerPost) || 1,
  startsAt: fromDateTimeInput(form.startsAt),
  endsAt: endOfDay(form.endsAt),
});

// The job form, in four sections. `siteField` (optional) is shown first under Products:
// the website input when creating, or the website as text when editing.
export function JobFields({ value, onChange, accounts, styles = [], siteField = null }) {
  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value });
  const id = useId();
  return (
    <>
      <div className="form-section">
        <h3 className="form-section__title">Products</h3>
        <p className="form-section__desc">The store this job posts from, and a name to find the job by.</p>
        <div className="form-grid">
          {siteField}
          <div className="form-group span-all">
            <label className="form-label" htmlFor={`${id}-name`}>Campaign name (optional)</label>
            <input id={`${id}-name`} className="form-input" value={value.name} onChange={set('name')} maxLength={120} placeholder="e.g. Daily price banners" />
          </div>
        </div>
      </div>

      <div className="form-section">
        <h3 className="form-section__title">Posting</h3>
        <p className="form-section__desc">Where it posts, and when. It posts once a day at this time.</p>
        <div className="form-grid">
          <div className="form-group span-all">
            <label className="form-label" htmlFor={`${id}-account`}>Instagram account</label>
            <select id={`${id}-account`} className="form-select" value={value.accountId} onChange={set('accountId')}>
              {accounts.map(a => <option key={a.id} value={a.id}>@{a.username}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor={`${id}-time`}>Post every day at</label>
            <input id={`${id}-time`} className="form-input" type="time" value={value.postTime} onChange={set('postTime')} required />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor={`${id}-tz`}>Time zone</label>
            <select id={`${id}-tz`} className="form-select" value={value.timezone} onChange={set('timezone')}>
              {timezoneOptions(value.timezone).map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>
          <ScheduleWindow startsAt={value.startsAt} endsAt={value.endsAt} onChange={(change) => onChange({ ...value, ...change })} />
        </div>
      </div>

      <div className="form-section">
        <h3 className="form-section__title">Look</h3>
        <p className="form-section__desc">Every day gets a new look and scene. The product always stays exactly as in your photo.</p>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label" htmlFor={`${id}-style`}>Image style</label>
            <select id={`${id}-style`} className="form-select" value={value.imageStyle || 'banner'} onChange={set('imageStyle')}>
              {styles.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              <option value="auto">Mix promo and styled posts</option>
            </select>
          </div>
          <ImagesPerPost value={value.imagesPerPost} onChange={(imagesPerPost) => onChange({ ...value, imagesPerPost })} />
          <div className="form-group span-all">
            <label className="form-label" htmlFor={`${id}-notes`}>Instructions for the image (optional)</label>
            <input id={`${id}-notes`} className="form-input" value={value.imageNotes || ''} onChange={set('imageNotes')} maxLength={500}
              placeholder="e.g. With price banner, festive red and gold, mention free shipping" />
          </div>
        </div>
      </div>

      <div className="form-section">
        <h3 className="form-section__title">Caption</h3>
        <p className="form-section__desc">DeepSeek writes a new caption for every post.</p>
        <div className="form-grid">
          <div className="form-group span-all">
            <label className="form-label" htmlFor={`${id}-caption`}>Caption instructions (optional)</label>
            <textarea id={`${id}-caption`} className="form-textarea" rows={2} value={value.captionInstructions} onChange={set('captionInstructions')}
              placeholder="e.g. Write in Hinglish, friendly tone, mention free shipping on orders above ₹499" />
            <div className="form-helper">Links in captions aren't clickable on Instagram, so keep your store link in your bio too.</div>
          </div>
          <div className="form-group span-all">
            <label className="form-label" htmlFor={`${id}-tags`}>Hashtags to always include (optional)</label>
            <input id={`${id}-tags`} className="form-input" value={value.hashtags} onChange={set('hashtags')} placeholder="#yourbrand #jewellery" />
            <div className="form-helper">DeepSeek adds more relevant hashtags on top (Instagram allows 30 in total).</div>
          </div>
        </div>
      </div>
    </>
  );
}

function PreviewCard({ preview }) {
  return (
    <div className="iga-preview">
      <div className="iga-subtitle">Next post · the store photos it is made from</div>
      <div className="iga-preview__photos">
        {preview.imageUrls.map(u => <img key={u} src={u} alt="" width={88} height={88} />)}
      </div>
      <div className="iga-preview__caption">{preview.caption}</div>
      <div className="form-helper">
        Preview only, nothing was posted. The real post gets a freshly written caption, with these photos placed on new designed backgrounds.
      </div>
    </div>
  );
}

function PostHistory({ posts }) {
  if (!posts) return <div className="iga-muted iga-inline"><Loader2 size={14} className="spinning" /> Loading…</div>;
  if (posts.length === 0) return <div className="iga-muted">Nothing posted by this job yet. Use Preview to check the next post, or Post now.</div>;
  return (
    <div className="table-container iga-history">
      <table className="data-table">
        <thead>
          <tr><th>Product</th><th>Result</th><th>Post</th><th>When</th></tr>
        </thead>
        <tbody>
          {posts.map(p => (
            <tr key={p.id}>
              <td>
                {p.product_url
                  ? <a href={p.product_url} target="_blank" rel="noreferrer">{p.product_title}</a>
                  : (p.product_title || '—')}
                {p.error && <div className="iga-error">{p.error}</div>}
              </td>
              <td className="nowrap">
                <span className={`badge ${POST_BADGE[p.status] || ''}`}>{p.status}</span>
                {p.trigger === 'manual' && <span className="iga-muted"> · manual</span>}
                {p.image_source === 'photo' && <span className="iga-muted"> · store photo</span>}
              </td>
              <td className="nowrap">
                {p.permalink && <a href={p.permalink} target="_blank" rel="noreferrer">View post</a>}
              </td>
              <td className="nowrap iga-muted">{fmt(p.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function InstagramScheduler() {
  const [accounts, setAccounts] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [styles, setStyles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null); // "<action>:<id>" of the running action

  const [showForm, setShowForm] = useState(false);
  const [newJob, setNewJob] = useState(emptyJob([]));

  const [expanded, setExpanded] = useState(null);
  const [posts, setPosts] = useState({});
  const [previews, setPreviews] = useState({});
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState(null);

  const load = async () => {
    try {
      const [acc, auto] = await Promise.all([getInstagramAccounts(), getInstagramAutomations()]);
      const accList = acc.data || [];
      setAccounts(accList);
      setJobs(auto.data || []);
      setNewJob(j => (accList.some(a => a.id === j.accountId) ? j : { ...j, accountId: accList[0]?.id || '' }));
    } catch (err) {
      toast.error(errMsg(err, 'Failed to load the scheduler'));
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    getProductImageStatus().then(res => setStyles(res.data?.styles || [])).catch(() => {});
  }, []);

  // Runs one action with its busy flag and a toast on failure.
  const run = async (key, fn) => {
    setBusy(key);
    try { await fn(); } catch (err) { toast.error(errMsg(err, 'Something went wrong')); }
    setBusy(null);
  };

  const loadPosts = async (id) => {
    const res = await getInstagramPosts(id);
    setPosts(p => ({ ...p, [id]: res.data || [] }));
  };

  // Opens a job's history (and its preview, if one was made).
  const open = (j) => {
    setExpanded(j.id);
    loadPosts(j.id).catch(() => {});
  };

  const openEdit = (j) => {
    setEditId(j.id);
    setEditForm(jobForm(j));
  };
  // Stable, so the sheets don't re-run their open effect (and move focus) on every keystroke.
  const closeEdit = useCallback(() => { setEditId(null); setEditForm(null); }, []);
  const closeNew = useCallback(() => setShowForm(false), []);

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newJob.siteUrl.trim()) return toast.error('Enter the website URL');
    run('create', async () => {
      const res = await createInstagramAutomation({ ...jobPayload(newJob), siteUrl: newJob.siteUrl.trim() });
      toast.success(res.message);
      setNewJob(j => ({ ...emptyJob(accounts), accountId: j.accountId, timezone: j.timezone }));
      setShowForm(false);
      await load();
    });
  };

  // Pre-fills the New job form from an existing job — quickest way to add another time slot.
  const handleDuplicate = (j) => {
    setNewJob({ ...jobForm(j), siteUrl: j.site_url });
    setShowForm(true);
    toast('Copied. Pick a new time and save.');
  };

  const handlePreview = (j) => run(`preview:${j.id}`, async () => {
    const res = await previewInstagramPost(j.id);
    setPreviews(p => ({ ...p, [j.id]: res.data }));
    if (expanded !== j.id) open(j);
  });

  const handlePostNow = (j) => {
    if (!window.confirm(`Post the next product from ${siteLabel(j)} to @${j.username} now?`)) return;
    run(`post:${j.id}`, async () => {
      try {
        const res = await postInstagramNow(j.id);
        toast.success(res.message);
      } finally {
        await load();
        if (expanded === j.id) await loadPosts(j.id);
      }
    });
  };

  const handleToggle = (j) => run(`toggle:${j.id}`, async () => {
    await updateInstagramAutomation(j.id, { status: j.status === 'active' ? 'paused' : 'active' });
    await load();
  });

  const handleSave = (j) => run(`save:${j.id}`, async () => {
    await updateInstagramAutomation(j.id, jobPayload(editForm));
    toast.success('Saved');
    closeEdit();
    await load();
  });

  const handleDelete = (j) => {
    if (!window.confirm(`Delete the ${j.post_time} job for ${siteLabel(j)} and its post history?`)) return;
    run(`delete:${j.id}`, async () => {
      await deleteInstagramAutomation(j.id);
      toast.success('Job deleted');
      await load();
    });
  };

  const activeJobs = jobs.filter(j => j.status === 'active' && j.next_run_at);
  const nextJob = [...activeJobs].sort((a, b) => new Date(a.next_run_at) - new Date(b.next_run_at))[0];
  const editJob = jobs.find(j => j.id === editId);
  const creating = busy === 'create';
  const saving = editJob && busy === `save:${editJob.id}`;

  const newJobButton = (
    <button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={16} /> New job</button>
  );

  return (
    <div className="page-container fade-in">
      <PageHeader
        title="Product Scheduler"
        subtitle="Post the next product from your store to Instagram every day, in a fresh AI scene with a caption by DeepSeek."
        actions={accounts.length > 0 && newJobButton}
      />

      {loading ? (
        <div className="empty-state"><div className="spinner spinner-lg" /></div>
      ) : accounts.length === 0 ? (
        <Section>
          <EmptyState
            icon={Instagram}
            title="Connect an Instagram account first"
            text="Jobs post to a connected Instagram account. Connect one, then come back to add jobs."
            action={<Link to="/instagram" className="btn btn-primary">Go to Instagram accounts</Link>}
          />
        </Section>
      ) : jobs.length === 0 ? (
        <Section>
          <EmptyState
            icon={AlarmClock}
            title="No jobs yet"
            text="A job takes the next product from your store and posts it at the same time every day, for example at 10:00."
            action={newJobButton}
          />
        </Section>
      ) : (
        <Section
          flush
          title="Jobs"
          description={(
            <>
              {activeJobs.length} active
              {nextJob && <> · Next post <strong>{fmtNext(nextJob.next_run_at)}</strong>, {siteLabel(nextJob)} to @{nextJob.username}</>}
            </>
          )}
          actions={<button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={14} /> Refresh</button>}
        >
          <div className="list">
            {jobs.map(j => {
              const isOpen = expanded === j.id;
              const active = j.status === 'active';
              const [lastCls, lastText] = LAST_STATUS[j.last_status] || ['status--off', j.last_status];
              return (
                <div key={j.id} className={`iga-job${active ? '' : ' is-paused'}`}>
                  <div className="list-item">
                    <div className="iga-time" aria-hidden="true"><strong>{j.post_time}</strong><span>daily</span></div>
                    <div className="list-item__main">
                      <div className="list-item__title">
                        {siteLabel(j)}
                        <span className={`status ${active ? 'status--on' : 'status--off'}`}>{active ? 'Active' : 'Paused'}</span>
                        {j.images_per_post > 1 && <span className="badge badge-purple">{j.images_per_post} images</span>}
                      </div>
                      <div className="list-item__meta">
                        <span>@{j.username}</span>
                        <span>Every day at {j.post_time} · {j.timezone}</span>
                        {active && j.next_run_at && <span>Next {fmtNext(j.next_run_at)}</span>}
                        <span>{j.published_count} posted</span>
                        {j.last_status && <span>Last post <span className={`status ${lastCls}`}>{lastText}</span></span>}
                      </div>
                      <div className="list-item__meta">{scheduleText(j)}</div>
                      {j.last_status === 'failed' && j.last_error && <div className="iga-error">{j.last_error}</div>}
                      <button type="button" className="iga-link" aria-expanded={isOpen}
                        onClick={() => (isOpen ? setExpanded(null) : open(j))}>
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Post history
                      </button>
                    </div>
                    <div className="list-item__actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => handlePostNow(j)} disabled={!!busy} title="Post the next product now">
                        {busy === `post:${j.id}` ? <Loader2 size={14} className="spinning" /> : <Send size={14} />} Post now
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => handlePreview(j)} disabled={!!busy} title="Preview the next post">
                        {busy === `preview:${j.id}` ? <Loader2 size={14} className="spinning" /> : <Eye size={14} />} Preview
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(j)}><Pencil size={14} /> Edit</button>
                      <button className="btn btn-ghost btn-sm iga-icon-btn" onClick={() => handleDuplicate(j)} disabled={!!busy}
                        title="Duplicate (add another time)" aria-label={`Duplicate the ${j.post_time} job`}>
                        <Copy size={14} />
                      </button>
                      <button className="btn btn-ghost btn-sm iga-icon-btn" onClick={() => handleDelete(j)} disabled={!!busy}
                        title="Delete" aria-label={`Delete the ${j.post_time} job`}>
                        {busy === `delete:${j.id}` ? <Loader2 size={14} className="spinning" /> : <Trash2 size={14} />}
                      </button>
                      <span title={active ? 'Pause' : 'Resume'}>
                        <Switch checked={active} onChange={() => handleToggle(j)} disabled={!!busy}
                          label={`Post daily at ${j.post_time} for ${siteLabel(j)}`} />
                      </span>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="iga-job__panel">
                      {previews[j.id] && <PreviewCard preview={previews[j.id]} />}
                      <div>
                        <div className="iga-subtitle">Post history</div>
                        <PostHistory posts={posts[j.id]} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* New job */}
      <Sheet
        open={showForm}
        title="New job"
        subtitle="Posts one product from your store every day."
        onClose={closeNew}
        busy={creating}
        width={640}
        footer={(
          <>
            <button type="button" className="btn btn-ghost" onClick={closeNew} disabled={creating}>Cancel</button>
            <button type="submit" form="new-job-form" className="btn btn-primary" disabled={creating}>
              {creating
                ? <><Loader2 size={16} className="spinning" /> Checking website…</>
                : <><Plus size={16} /> Add job</>}
            </button>
          </>
        )}
      >
        <form id="new-job-form" onSubmit={handleCreate}>
          <JobFields
            value={newJob}
            onChange={setNewJob}
            accounts={accounts}
            styles={styles}
            siteField={(
              <div className="form-group span-all">
                <label className="form-label" htmlFor="new-job-site">Shopify website URL</label>
                <input id="new-job-site" className="form-input" value={newJob.siteUrl}
                  onChange={e => setNewJob({ ...newJob, siteUrl: e.target.value })} placeholder="yourstore.com" />
                <div className="form-helper">
                  Read from the store's public catalogue, so no Shopify token is needed. Out-of-stock products are skipped, and jobs
                  for the same website and account share one rotation, so a product never posts twice in a row.
                </div>
              </div>
            )}
          />
        </form>
      </Sheet>

      {/* Edit job */}
      <Sheet
        open={!!editJob && !!editForm}
        title="Edit job"
        subtitle={editJob ? `${siteLabel(editJob)} · @${editJob.username}` : undefined}
        onClose={closeEdit}
        busy={!!saving}
        width={640}
        footer={editJob && (
          <>
            <button type="button" className="btn btn-ghost" onClick={closeEdit} disabled={!!saving}>Cancel</button>
            <button type="submit" form="edit-job-form" className="btn btn-primary" disabled={!!busy}>
              {saving ? <><Loader2 size={16} className="spinning" /> Saving…</> : 'Save changes'}
            </button>
          </>
        )}
      >
        {editJob && editForm && (
          <form id="edit-job-form" onSubmit={(e) => { e.preventDefault(); handleSave(editJob); }}>
            <JobFields
              value={editForm}
              onChange={setEditForm}
              accounts={accounts}
              styles={styles}
              siteField={(
                <div className="form-group span-all">
                  <div className="form-label">Website</div>
                  <div className="iga-readonly">{editJob.site_url}</div>
                  <div className="form-helper">To post from another website, add a new job.</div>
                </div>
              )}
            />
          </form>
        )}
      </Sheet>
    </div>
  );
}
