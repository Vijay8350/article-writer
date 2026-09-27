import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  AlarmClock, Plus, Play, Pause, Trash2, RefreshCw, Loader2, ChevronDown, ChevronRight, Eye, Send, Save, Copy, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  getInstagramAccounts, getInstagramAutomations, createInstagramAutomation, updateInstagramAutomation,
  deleteInstagramAutomation, previewInstagramPost, postInstagramNow, getInstagramPosts,
} from '../lib/api';

const POST_BADGE = { published: 'badge-success', failed: 'badge-danger' };
const errMsg = (err, fallback) => err.response?.data?.error || fallback;
const fmt = (d) => (d ? new Date(d).toLocaleString() : '—');
const muted = { fontSize: 12, color: 'var(--text-muted)' };
const danger = { fontSize: 12, color: 'var(--accent-danger)' };
const siteLabel = (j) => j.site_name || j.site_url.replace(/^https?:\/\//, '');

// "today 2:00 PM" / "tomorrow 10:00 AM" / "10/3/2026 9:00 AM"
function fmtNext(d) {
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
function timezoneOptions(current) {
  const all = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return [...new Set([current, 'Asia/Kolkata', 'UTC', ...all])];
}

const emptyJob = (accounts) => ({
  siteUrl: '', accountId: accounts[0]?.id || '', postTime: '10:00', timezone: browserTimezone(),
  captionInstructions: '', hashtags: '',
});

function JobFields({ value, onChange, accounts }) {
  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value });
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
        <div className="form-group">
          <label className="form-label">Instagram account</label>
          <select className="form-select" value={value.accountId} onChange={set('accountId')}>
            {accounts.map(a => <option key={a.id} value={a.id}>@{a.username}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Post every day at</label>
          <input className="form-input" type="time" value={value.postTime} onChange={set('postTime')} required />
        </div>
        <div className="form-group">
          <label className="form-label">Time zone</label>
          <select className="form-select" value={value.timezone} onChange={set('timezone')}>
            {timezoneOptions(value.timezone).map(tz => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Caption instructions for DeepSeek (optional)</label>
        <textarea className="form-textarea" rows={2} value={value.captionInstructions} onChange={set('captionInstructions')}
          placeholder="e.g. Write in Hinglish, friendly tone, mention free shipping on orders above ₹499" />
      </div>
      <div className="form-group">
        <label className="form-label">Hashtags to always include (optional)</label>
        <input className="form-input" value={value.hashtags} onChange={set('hashtags')} placeholder="#yourbrand #jewellery" />
        <div className="form-helper">DeepSeek adds more relevant hashtags on top (Instagram allows 30 in total).</div>
      </div>
    </>
  );
}

function PreviewCard({ preview }) {
  return (
    <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', padding: 12 }}>
      <div className="form-label">
        Next post preview · {preview.format === 'carousel' ? `carousel of ${preview.imageUrls.length} images` : 'single image'}
      </div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 12 }}>
        {preview.imageUrls.map(u => (
          <img key={u} src={u} alt="" width={96} height={96} style={{ borderRadius: 6, flex: '0 0 auto' }} />
        ))}
      </div>
      <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.5, overflowWrap: 'anywhere' }}>{preview.caption}</div>
      <div className="form-helper" style={{ marginTop: 8 }}>
        Preview only — nothing was posted. The real post gets a freshly written caption.
      </div>
    </div>
  );
}

export default function InstagramScheduler() {
  const [accounts, setAccounts] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null); // "<action>:<id>" of the running action

  const [showForm, setShowForm] = useState(false);
  const [newJob, setNewJob] = useState(emptyJob([]));

  const [expanded, setExpanded] = useState(null);
  const [posts, setPosts] = useState({});
  const [previews, setPreviews] = useState({});
  const [edits, setEdits] = useState({});

  const load = async () => {
    try {
      const [acc, auto] = await Promise.all([getInstagramAccounts(), getInstagramAutomations()]);
      const accList = acc.data || [];
      setAccounts(accList);
      setJobs(auto.data || []);
      setNewJob(j => (accList.some(a => a.id === j.accountId) ? j : { ...j, accountId: accList[0]?.id || '' }));
      if (!auto.data?.length) setShowForm(true);
    } catch (err) {
      toast.error(errMsg(err, 'Failed to load the scheduler'));
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

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

  const open = (j) => {
    setExpanded(j.id);
    setEdits(e => ({
      ...e,
      [j.id]: {
        accountId: j.account_id, postTime: j.post_time, timezone: j.timezone,
        captionInstructions: j.caption_instructions || '', hashtags: j.hashtags || '',
      },
    }));
    loadPosts(j.id).catch(() => {});
  };

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newJob.siteUrl.trim()) return toast.error('Enter the website URL');
    run('create', async () => {
      const res = await createInstagramAutomation({ ...newJob, siteUrl: newJob.siteUrl.trim() });
      toast.success(res.message);
      setNewJob(j => ({ ...emptyJob(accounts), accountId: j.accountId, timezone: j.timezone }));
      setShowForm(false);
      await load();
    });
  };

  // Pre-fills the New job form from an existing job — quickest way to add another time slot.
  const handleDuplicate = (j) => {
    setNewJob({
      siteUrl: j.site_url, accountId: j.account_id, postTime: j.post_time, timezone: j.timezone,
      captionInstructions: j.caption_instructions || '', hashtags: j.hashtags || '',
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast('Copied — pick a new time and save', { icon: '📋' });
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
    await updateInstagramAutomation(j.id, edits[j.id]);
    toast.success('Saved');
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

  return (
    <div className="page-container fade-in">
      <div className="page-header flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 12, maxWidth: 900 }}>
        <div>
          <h1>🗓️ Instagram Scheduler</h1>
          <p>
            Add as many posting jobs as you like. Each job posts the next product from a website to an Instagram
            account every day at its time, with a caption written by DeepSeek.
          </p>
        </div>
        {accounts.length > 0 && !showForm && (
          <button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={16} /> New job</button>
        )}
      </div>

      {!loading && accounts.length === 0 ? (
        <div className="card" style={{ maxWidth: 900 }}>
          <div className="card-body">
            <div className="empty-state">
              <AlarmClock size={48} />
              <h3>Connect an Instagram account first</h3>
              <p><Link to="/instagram">Go to Instagram Accounts</Link> to connect one, then come back to add jobs.</p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* New job */}
          {showForm && (
            <div className="card mb-24" style={{ maxWidth: 900 }}>
              <div className="card-header">
                <h2>➕ New job</h2>
                {jobs.length > 0 && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)} title="Close"><X size={14} /></button>
                )}
              </div>
              <div className="card-body">
                <form onSubmit={handleCreate}>
                  <div className="form-group">
                    <label className="form-label">Shopify website URL</label>
                    <input className="form-input" value={newJob.siteUrl} onChange={e => setNewJob({ ...newJob, siteUrl: e.target.value })}
                      placeholder="yourstore.com" />
                    <div className="form-helper">
                      Read from the store's public catalogue — no Shopify token needed. Out-of-stock products are skipped.
                      Jobs for the same website and account share one rotation, so they never post the same product twice in a row.
                    </div>
                  </div>
                  <JobFields value={newJob} onChange={setNewJob} accounts={accounts} />
                  <div className="form-helper mb-16">
                    Instagram doesn't make links in captions clickable — the product link appears as text, so keep your store link in your bio too.
                  </div>
                  <button className="btn btn-primary w-full" type="submit" disabled={busy === 'create'}>
                    {busy === 'create'
                      ? <><Loader2 size={16} className="spinning" /> Checking website...</>
                      : <><Plus size={16} /> Add job</>}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Jobs */}
          <div className="card" style={{ maxWidth: 900 }}>
            <div className="card-header">
              <h2>📋 Jobs {jobs.length > 0 && <span style={muted}>({activeJobs.length} active)</span>}</h2>
              <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={14} /> Refresh</button>
            </div>
            <div className="card-body">
              {nextJob && (
                <div className="form-helper mb-16">
                  ⏭️ Next post: <strong>{fmtNext(nextJob.next_run_at)}</strong> — {siteLabel(nextJob)} → @{nextJob.username}
                </div>
              )}
              {loading ? (
                <div className="empty-state"><div className="spinner spinner-lg" /></div>
              ) : jobs.length === 0 ? (
                <div className="empty-state">
                  <AlarmClock size={48} />
                  <h3>No jobs yet</h3>
                  <p>Add one above — e.g. your store at 10:00 every day.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {jobs.map(j => (
                    <div key={j.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 'var(--radius-md)', padding: 16, opacity: j.status === 'paused' ? 0.7 : 1 }}>
                      <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 12 }}>
                        <div className="flex items-center gap-12" style={{ cursor: 'pointer', minWidth: 0, flex: '1 1 320px' }}
                          onClick={() => (expanded === j.id ? setExpanded(null) : open(j))}>
                          {expanded === j.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          <div style={{ textAlign: 'center', minWidth: 64 }}>
                            <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.1 }}>{j.post_time}</div>
                            <div style={{ ...muted, fontSize: 10 }}>daily</div>
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div className="flex items-center gap-8" style={{ flexWrap: 'wrap' }}>
                              <strong>{siteLabel(j)}</strong>
                              <span style={{ color: 'var(--text-muted)' }}>→ @{j.username}</span>
                              <span className={`badge ${j.status === 'active' ? 'badge-success' : 'badge-warning'}`}>{j.status}</span>
                            </div>
                            <div style={muted}>
                              {j.timezone} · {j.published_count} posted
                              {j.status === 'active' && j.next_run_at ? ` · next: ${fmtNext(j.next_run_at)}` : ''}
                              {j.last_status && <> · last: <span className={`badge ${POST_BADGE[j.last_status]}`}>{j.last_status}</span></>}
                            </div>
                            {j.last_status === 'failed' && j.last_error && <div style={danger}>{j.last_error}</div>}
                          </div>
                        </div>
                        <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => handlePreview(j)} disabled={!!busy} title="Preview the next post">
                            {busy === `preview:${j.id}` ? <Loader2 size={14} className="spinning" /> : <Eye size={14} />} Preview
                          </button>
                          <button className="btn btn-primary btn-sm" onClick={() => handlePostNow(j)} disabled={!!busy} title="Post the next product now">
                            {busy === `post:${j.id}` ? <Loader2 size={14} className="spinning" /> : <Send size={14} />} Post now
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleDuplicate(j)} disabled={!!busy} title="Duplicate (add another time)">
                            <Copy size={14} />
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleToggle(j)} disabled={!!busy} title={j.status === 'active' ? 'Pause' : 'Resume'}>
                            {j.status === 'active' ? <Pause size={14} /> : <Play size={14} />}
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(j)} disabled={!!busy} title="Delete">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {expanded === j.id && (
                        <div style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>
                          {previews[j.id] && <PreviewCard preview={previews[j.id]} />}

                          {edits[j.id] && (
                            <div>
                              <JobFields value={edits[j.id]} onChange={v => setEdits(e => ({ ...e, [j.id]: v }))} accounts={accounts} />
                              <button className="btn btn-secondary btn-sm" onClick={() => handleSave(j)} disabled={!!busy}>
                                {busy === `save:${j.id}` ? <Loader2 size={14} className="spinning" /> : <Save size={14} />} Save job
                              </button>
                            </div>
                          )}

                          <div>
                            <div className="form-label">Post history</div>
                            {!posts[j.id] ? (
                              <div className="form-helper">Loading…</div>
                            ) : posts[j.id].length === 0 ? (
                              <div className="form-helper">Nothing posted by this job yet. Use Preview to check the next post, or Post now.</div>
                            ) : (
                              <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                  <tbody>
                                    {posts[j.id].map(p => (
                                      <tr key={p.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'top' }}>
                                        <td style={{ padding: '6px 8px' }}>
                                          {p.product_url
                                            ? <a href={p.product_url} target="_blank" rel="noreferrer">{p.product_title}</a>
                                            : (p.product_title || '—')}
                                          {p.error && <div style={danger}>{p.error}</div>}
                                        </td>
                                        <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                                          <span className={`badge ${POST_BADGE[p.status]}`}>{p.status}</span>
                                          {p.trigger === 'manual' && <span style={{ ...muted, marginLeft: 6 }}>manual</span>}
                                        </td>
                                        <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                                          {p.permalink && <a href={p.permalink} target="_blank" rel="noreferrer">View post</a>}
                                        </td>
                                        <td style={{ padding: '6px 8px', ...muted, whiteSpace: 'nowrap' }}>{fmt(p.created_at)}</td>
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
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
      <style>{`.spinning { animation: spin 1s linear infinite; }`}</style>
    </div>
  );
}
