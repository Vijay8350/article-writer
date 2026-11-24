import React, { useState, useEffect, useCallback } from 'react';
import { CalendarClock, Plus, Trash2, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { getScheduledPosts, createScheduledPost, cancelScheduledPost, getBusinessDna, getSettings } from '../lib/api';
import { PageHeader, Sheet, Segmented, EmptyState, Section } from '../components/ui';
import { fmtDateTime } from '../lib/dates';
import '../styles/blog.css';

const STATUS = {
  pending: { cls: '', label: 'Scheduled' },
  processing: { cls: 'status--warn', label: 'Writing now' },
  published: { cls: 'status--on', label: 'Published' },
  failed: { cls: 'status--error', label: 'Failed' },
};

const AI_LABEL = { gemini: 'Gemini', deepseek: 'DeepSeek' };
const AI_OPTIONS = [
  { value: 'gemini', label: 'Gemini' },
  { value: 'deepseek', label: 'DeepSeek' },
];

// Filters what's already loaded; nothing is fetched again.
const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
];
const isUpcoming = (job) => job.status === 'pending' || job.status === 'processing';

export default function ScheduledPosts() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [blogs, setBlogs] = useState([]);
  const [topic, setTopic] = useState('');
  const [runAt, setRunAt] = useState('');
  const [wordCount, setWordCount] = useState(1500);
  const [aiModel, setAiModel] = useState('gemini');
  const [blogId, setBlogId] = useState('');
  const [creating, setCreating] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [filter, setFilter] = useState('all');

  const load = () => {
    setLoading(true);
    getScheduledPosts()
      .then(res => setJobs(res.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    getBusinessDna().then(res => {
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

  // Stable, so the sheet doesn't re-focus its first field on every keystroke.
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!topic.trim()) return toast.error('Enter a topic');
    if (!runAt) return toast.error('Pick a date & time');
    if (new Date(runAt) <= new Date()) return toast.error('Schedule time must be in the future');

    setCreating(true);
    try {
      await createScheduledPost({
        topic: topic.trim(),
        runAt: new Date(runAt).toISOString(),
        blogId,
        wordCount,
        aiModel,
      });
      toast.success('Scheduled');
      setTopic('');
      setRunAt('');
      setSheetOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to schedule');
    }
    setCreating(false);
  };

  const handleCancel = async (job) => {
    if (!window.confirm(`Cancel "${job.topic.slice(0, 80)}"? It's taken off the queue and won't be written.`)) return;
    try {
      await cancelScheduledPost(job.id);
      toast.success('Cancelled');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not cancel');
    }
  };

  const blogTitle = (id) => blogs.find(b => String(b.id) === String(id))?.title;
  const upcomingCount = jobs.filter(isUpcoming).length;
  const shown = filter === 'all' ? jobs : jobs.filter(j => (filter === 'upcoming' ? isUpcoming(j) : !isUpcoming(j)));
  const filterOptions = FILTERS.map(f => ({
    ...f,
    label: f.value === 'upcoming' && upcomingCount ? `Upcoming (${upcomingCount})` : f.label,
  }));

  return (
    <div className="page-container fade-in blog-page">
      <PageHeader
        title="Scheduled Posts"
        subtitle="Queue article topics. Each one is written and published at the time you set."
        actions={<button className="btn btn-primary" onClick={() => setSheetOpen(true)}><Plus size={16} /> Schedule a post</button>}
      />

      {jobs.length > 0 && (
        <div className="toolbar">
          <Segmented value={filter} onChange={setFilter} options={filterOptions} ariaLabel="Show" />
        </div>
      )}

      <Section
        title="Queue"
        flush
        className="blog-list-card"
        actions={<button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}><RefreshCw size={14} className={loading ? 'spinning' : ''} /> Refresh</button>}
      >
        {loading && jobs.length === 0 ? (
          <div className="empty-state"><div className="spinner spinner-lg" /></div>
        ) : jobs.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No scheduled posts"
            text="Schedule a topic and it's written and published at the time you pick."
            action={<button className="btn btn-primary" onClick={() => setSheetOpen(true)}><Plus size={16} /> Schedule a post</button>}
          />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title={filter === 'upcoming' ? 'Nothing upcoming' : 'Nothing here yet'}
            text={filter === 'upcoming' ? 'Every post in the queue has already run.' : 'Posts appear here once they have run.'}
            action={<button className="btn btn-secondary" onClick={() => setFilter('all')}>Show all</button>}
          />
        ) : (
          <div className="list">
            {shown.map(job => {
              const st = STATUS[job.status] || { cls: '', label: job.status };
              const blog = blogTitle(job.blog_id);
              return (
                <div className="list-item" key={job.id}>
                  <div className="list-item__main">
                    <div className="list-item__title">
                      <span className="blog-clamp" title={job.topic}>{job.topic}</span>
                    </div>
                    <div className="list-item__meta">
                      <span className={`status ${st.cls}`}>{st.label}</span>
                      <span>{fmtDateTime(job.run_at)}</span>
                      {job.word_count ? <span>{job.word_count} words</span> : null}
                      {job.ai_model ? <span>{AI_LABEL[job.ai_model] || job.ai_model}</span> : null}
                      {blog && <span>{blog}</span>}
                    </div>
                    {job.status === 'failed' && job.error && (
                      <div className="callout callout--danger callout--compact blog-row-error" title={job.error}>
                        <AlertCircle size={15} />
                        <span>{job.error.length > 160 ? `${job.error.slice(0, 160)}…` : job.error}</span>
                      </div>
                    )}
                  </div>
                  {job.status === 'pending' && (
                    <div className="list-item__actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => handleCancel(job)} aria-label={`Cancel ${job.topic}`}>
                        <Trash2 size={14} /> Cancel
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Sheet
        open={sheetOpen}
        title="Schedule a post"
        subtitle="The article is written and published to your blog at the time you pick."
        onClose={closeSheet}
        busy={creating}
        footer={(
          <>
            <button type="button" className="btn btn-ghost" onClick={closeSheet} disabled={creating}>Cancel</button>
            <button className="btn btn-primary" type="submit" form="schedule-form" disabled={creating}>
              {creating ? <><Loader2 size={16} className="spinning" /> Scheduling…</> : <><Plus size={16} /> Schedule post</>}
            </button>
          </>
        )}
      >
        <form id="schedule-form" onSubmit={handleCreate}>
          <div className="form-section">
            <h3 className="form-section__title">What to write</h3>
            <p className="form-section__desc">The topic, how long it should be, and which AI writes it.</p>
            <div className="form-grid">
              <div className="form-group span-all">
                <label className="form-label" htmlFor="sp-topic">Topic</label>
                <textarea id="sp-topic" className="form-textarea" rows={3} value={topic}
                  onChange={e => setTopic(e.target.value)} placeholder="e.g. Holiday gift guide for our bestsellers" />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="sp-words">Words <span className="range-value">{wordCount}</span></label>
                <input id="sp-words" type="range" className="range-slider" min={500} max={5000} step={100}
                  value={wordCount} onChange={e => setWordCount(Number(e.target.value))} />
                <div className="form-helper blog-range-ends"><span>500</span><span>5,000</span></div>
              </div>
              <div className="form-group blog-seg-field">
                <span className="form-label">AI model</span>
                <Segmented value={aiModel} onChange={setAiModel} options={AI_OPTIONS} ariaLabel="AI model" />
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section__title">When and where</h3>
            <p className="form-section__desc">The time it runs, in your local time, and the blog it goes to.</p>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label" htmlFor="sp-run-at">Run at</label>
                <input id="sp-run-at" className="form-input" type="datetime-local" value={runAt}
                  onChange={e => setRunAt(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="sp-blog">Blog</label>
                {blogs.length ? (
                  <select id="sp-blog" className="form-select" value={blogId} onChange={e => setBlogId(e.target.value)}>
                    {blogs.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
                  </select>
                ) : (
                  <input id="sp-blog" className="form-input" value={blogId} onChange={e => setBlogId(e.target.value)}
                    placeholder="Blog ID" />
                )}
              </div>
            </div>
          </div>
        </form>
      </Sheet>
    </div>
  );
}
