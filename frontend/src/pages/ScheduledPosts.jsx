import React, { useState, useEffect } from 'react';
import { CalendarClock, Plus, Trash2, Loader2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { getScheduledPosts, createScheduledPost, cancelScheduledPost, getBusinessDna } from '../lib/api';

const STATUS_BADGE = {
  pending: 'badge-purple',
  processing: 'badge-warning',
  published: 'badge-success',
  failed: 'badge-danger',
};

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
  }, []);

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
      toast.success('Scheduled!');
      setTopic('');
      setRunAt('');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to schedule');
    }
    setCreating(false);
  };

  const handleCancel = async (id) => {
    try {
      await cancelScheduledPost(id);
      toast.success('Cancelled');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not cancel');
    }
  };

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <h1>🗓️ Scheduled Posts</h1>
        <p>Queue article topics — they generate and publish automatically at the set time</p>
      </div>

      <div className="card mb-24" style={{ maxWidth: 800 }}>
        <div className="card-header"><h2>➕ Schedule a Post</h2></div>
        <div className="card-body">
          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label className="form-label">Topic *</label>
              <textarea className="form-textarea" rows={2} value={topic}
                onChange={e => setTopic(e.target.value)} placeholder="e.g., Holiday gift guide for our bestsellers" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Run at *</label>
                <input className="form-input" type="datetime-local" value={runAt}
                  onChange={e => setRunAt(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Word Count: <span className="range-value">{wordCount}</span></label>
                <input type="range" className="range-slider" min={500} max={5000} step={100}
                  value={wordCount} onChange={e => setWordCount(Number(e.target.value))} />
              </div>
              <div className="form-group">
                <label className="form-label">AI Model</label>
                <select className="form-select" value={aiModel} onChange={e => setAiModel(e.target.value)}>
                  <option value="gemini">🧠 Gemini</option>
                  <option value="deepseek">🔮 DeepSeek</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Blog</label>
                {blogs.length ? (
                  <select className="form-select" value={blogId} onChange={e => setBlogId(e.target.value)}>
                    {blogs.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
                  </select>
                ) : (
                  <input className="form-input" value={blogId} onChange={e => setBlogId(e.target.value)}
                    placeholder="Blog ID" />
                )}
              </div>
            </div>
            <button className="btn btn-primary w-full" type="submit" disabled={creating}>
              {creating ? <><Loader2 size={16} className="spinning" /> Scheduling...</> : <><Plus size={16} /> Schedule Post</>}
            </button>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>📋 Queue</h2>
          <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={14} /> Refresh</button>
        </div>
        <div className="card-body">
          {loading ? (
            <div className="empty-state"><div className="spinner spinner-lg" /></div>
          ) : jobs.length === 0 ? (
            <div className="empty-state">
              <CalendarClock size={48} />
              <h3>No scheduled posts</h3>
              <p>Queue a topic above and it'll be generated and published automatically.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '8px 12px' }}>Topic</th>
                    <th style={{ padding: '8px 12px' }}>Run At</th>
                    <th style={{ padding: '8px 12px' }}>Status</th>
                    <th style={{ padding: '8px 12px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map(job => (
                    <tr key={job.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <td style={{ padding: '10px 12px', maxWidth: 320 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={job.topic}>
                          {job.topic}
                        </div>
                        {job.status === 'failed' && job.error && (
                          <div style={{ fontSize: 11, color: 'var(--accent-danger, #ef4444)' }} title={job.error}>
                            {job.error.slice(0, 80)}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        {new Date(job.run_at).toLocaleString()}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span className={`badge ${STATUS_BADGE[job.status] || 'badge-purple'}`}>{job.status}</span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {job.status === 'pending' && (
                          <button className="btn btn-ghost btn-sm" onClick={() => handleCancel(job.id)} title="Cancel">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <style>{`.spinning { animation: spin 1s linear infinite; }`}</style>
    </div>
  );
}
