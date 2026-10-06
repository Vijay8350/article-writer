import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles, Loader2, ImageIcon, Send, RefreshCw, Trash2, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { getStudioPrompts, getStudioPosts, generateStudioPost, generateStudioImage, publishStudioPost, deleteStudioPost } from '../../lib/api';
import { errMsg, fmt, muted, danger, LoadingCard } from './shared';

const STATUS = {
  draft: ['badge-info', 'Text only'],
  generating: ['badge-warning', 'Making image…'],
  ready: ['badge-success', 'Ready to publish'],
  qa_failed: ['badge-danger', 'Failed quality check'],
  publishing: ['badge-warning', 'Publishing…'],
  published: ['badge-purple', 'Published'],
};
const ORIGIN = { manual: 'Manual', auto: 'Autopilot', campaign: 'Campaign' };

function PostCard({ post: p, busy, canManage, onImage, onPublish, onDelete }) {
  const [cls, label] = STATUS[p.status] || ['badge-info', p.status];
  const working = p.status === 'generating' || p.status === 'publishing' || busy;
  return (
    <div className="ig-post">
      {p.image_url ? (
        <a href={p.image_url} target="_blank" rel="noreferrer"><img className="ig-post-img" src={p.image_url} alt={p.headline || 'Post image'} loading="lazy" /></a>
      ) : (
        <div className="ig-post-placeholder">
          {p.status === 'generating' ? <><Loader2 size={22} className="spinning" /> Making the image and checking it…</> : <><ImageIcon size={22} /> No image yet</>}
        </div>
      )}
      <div className="ig-post-body">
        <div className="flex justify-between gap-8" style={{ alignItems: 'flex-start' }}>
          <strong style={{ fontSize: 15, lineHeight: 1.3 }}>{p.headline}</strong>
          <span className={`badge ${cls}`} style={{ flex: '0 0 auto' }}>{label}</span>
        </div>
        {p.lines?.length > 0 && (
          <ul style={{ paddingLeft: 18, fontSize: 13, color: 'var(--text-secondary)' }}>
            {p.lines.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        )}
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>Caption & hashtags</summary>
          <p style={{ whiteSpace: 'pre-wrap', fontSize: 13, marginTop: 6, overflowWrap: 'anywhere' }}>{p.caption}</p>
          <p style={{ ...muted, marginTop: 6, overflowWrap: 'anywhere' }}>{(p.hashtags || []).join(' ')}</p>
        </details>
        {p.qa_score != null && (
          <div style={{ fontSize: 12, color: p.status === 'qa_failed' ? 'var(--accent-danger)' : 'var(--text-secondary)' }}>
            Quality score {Number(p.qa_score)}/100 · {p.regen_attempts} attempt{p.regen_attempts === 1 ? '' : 's'}
            {p.qa_reasons?.length > 0 && ` — ${p.qa_reasons.join('; ')}`}
          </div>
        )}
        {p.error && <div style={danger}>{p.error}</div>}
        <div style={muted}>
          {ORIGIN[p.origin] || p.origin}{p.campaign_name ? ` · ${p.campaign_name}` : ''} · {fmt(p.published_at || p.created_at)}
        </div>
        <div className="flex gap-8" style={{ flexWrap: 'wrap', marginTop: 'auto' }}>
          {['draft', 'qa_failed', 'ready'].includes(p.status) && (
            <button className="btn btn-secondary btn-sm" disabled={working} onClick={onImage}>
              {busy === 'image' ? <Loader2 size={14} className="spinning" /> : <ImageIcon size={14} />}
              {p.status === 'draft' ? 'Create image' : 'New image'}
            </button>
          )}
          {p.status === 'ready' && canManage && (
            <button className="btn btn-primary btn-sm" disabled={working} onClick={onPublish}>
              {busy === 'publish' ? <Loader2 size={14} className="spinning" /> : <Send size={14} />} Publish
            </button>
          )}
          {p.status === 'published' && p.permalink && (
            <a className="btn btn-secondary btn-sm" href={p.permalink} target="_blank" rel="noreferrer"><ExternalLink size={14} /> View on Instagram</a>
          )}
          {canManage && !['generating', 'publishing'].includes(p.status) && (
            <button className="btn btn-ghost btn-sm" disabled={working} onClick={onDelete} title="Delete" aria-label="Delete post"><Trash2 size={14} /></button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ContentTab({ accountId, canManage, maxAttempts }) {
  const [prompts, setPrompts] = useState([]);
  const [posts, setPosts] = useState(null);
  const [promptId, setPromptId] = useState('');
  const [adhoc, setAdhoc] = useState('');
  const [withImage, setWithImage] = useState(true);
  const [busy, setBusy] = useState(null); // 'generate' | { id, action }

  const load = useCallback(async () => {
    try {
      const [p, ps] = await Promise.all([getStudioPrompts(accountId), getStudioPosts(accountId)]);
      setPrompts((p.data || []).filter((x) => x.type === 'quote_idea' && x.active));
      setPosts(ps.data || []);
    } catch (err) {
      toast.error(errMsg(err, 'Failed to load posts'));
      setPosts([]);
    }
  }, [accountId]);

  useEffect(() => { load(); }, [load]);

  // The autopilot may be working on a post in the background — refresh until it settles.
  useEffect(() => {
    if (!posts?.some((p) => p.status === 'generating' || p.status === 'publishing') || busy) return undefined;
    const t = setInterval(() => getStudioPosts(accountId).then((r) => setPosts(r.data || [])).catch(() => {}), 5000);
    return () => clearInterval(t);
  }, [posts, busy, accountId]);

  // Runs one action with its busy flag; resolves true on success.
  const act = async (key, fn) => {
    setBusy(key);
    let ok = false;
    try {
      const res = await fn();
      if (res?.warning) toast(res.warning, { icon: '⚠️', duration: 8000 });
      else if (res?.message) toast.success(res.message);
      ok = true;
    } catch (err) {
      toast.error(errMsg(err), { duration: 8000 });
    }
    await load();
    setBusy(null);
    return ok;
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!adhoc.trim() && !promptId) return toast.error('Pick a prompt or type a point to generate from.');
    const ok = await act('generate', () => generateStudioPost(accountId, { promptId: promptId || undefined, adhoc: adhoc.trim() || undefined, withImage }));
    if (ok) setAdhoc('');
  };

  if (!posts) return <LoadingCard />;

  return (
    <>
      <div className="card mb-24">
        <div className="card-header"><h2><Sparkles size={16} /> Generate a post</h2></div>
        <div className="card-body">
          <form onSubmit={handleGenerate}>
            <div className="ig-two-col">
              <div className="form-group">
                <label className="form-label">Use a quote-idea prompt</label>
                <select className="form-select" value={promptId} onChange={(e) => setPromptId(e.target.value)}>
                  <option value="">— none —</option>
                  {prompts.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
                {prompts.length === 0 && <div className="form-helper">No active prompts yet — add some in the Prompts tab, or type a point.</div>}
              </div>
              <div className="form-group">
                <label className="form-label">…or type a point (overrides the prompt)</label>
                <textarea className="form-textarea" style={{ minHeight: 0 }} rows={2} value={adhoc} onChange={(e) => setAdhoc(e.target.value)}
                  placeholder="e.g. why one statement piece beats five average ones" />
              </div>
            </div>
            <label className="flex items-center gap-8 mb-16" style={{ fontSize: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={withImage} onChange={(e) => setWithImage(e.target.checked)} style={{ accentColor: 'var(--accent-primary)' }} />
              Also create the image now (Gemini, then a quality check — up to {maxAttempts} attempts)
            </label>
            <button className="btn btn-primary" type="submit" disabled={busy === 'generate'}>
              {busy === 'generate'
                ? <><Loader2 size={16} className="spinning" /> {withImage ? 'Writing, then making the image…' : 'Writing…'}</>
                : <><Sparkles size={16} /> Generate</>}
            </button>
            <div className="form-helper">
              DeepSeek writes a fresh, de-duplicated idea, the on-image text, caption and hashtags in this account's voice.
              Only images that pass the quality check can be published.
            </div>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>📥 Posts ({posts.length})</h2>
          <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={14} /> Refresh</button>
        </div>
        <div className="card-body">
          {posts.length === 0 ? (
            <div className="empty-state"><ImageIcon size={48} /><h3>No posts yet</h3><p>Generate one above, or switch on autopilot in the Schedule tab.</p></div>
          ) : (
            <div className="ig-post-grid">
              {posts.map((p) => (
                <PostCard
                  key={p.id}
                  post={p}
                  canManage={canManage}
                  busy={busy?.id === p.id ? busy.action : null}
                  onImage={() => act({ id: p.id, action: 'image' }, () => generateStudioImage(p.id))}
                  onPublish={() => {
                    if (window.confirm(`Publish "${p.headline}" to Instagram now?`)) act({ id: p.id, action: 'publish' }, () => publishStudioPost(p.id));
                  }}
                  onDelete={() => {
                    if (window.confirm('Delete this post and its image?')) act({ id: p.id, action: 'delete' }, () => deleteStudioPost(p.id));
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
