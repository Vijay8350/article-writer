import React, { useState, useEffect } from 'react';
import { FileText, Trash2, Sparkles, Eye, Loader2, RefreshCw } from 'lucide-react';
import {
  getBusinessDna, getExistingArticles, getExistingArticle, deleteArticle, enhanceArticle, updateArticle, getSettings,
} from '../lib/api';
import toast from 'react-hot-toast';
import SeoScoreCard from '../components/SeoScoreCard';

const scoreColor = (score) => (score >= 80 ? 'var(--accent-success)' : score >= 50 ? 'var(--accent-warning)' : 'var(--accent-danger)');

export default function ExistingArticles() {
  const [dna, setDna] = useState(null);
  const [selectedBlog, setSelectedBlog] = useState('');
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [enhancing, setEnhancing] = useState(false);
  const [enhanceInstructions, setEnhanceInstructions] = useState('');
  const [enhancedResult, setEnhancedResult] = useState(null);
  const [aiModel, setAiModel] = useState('gemini');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getBusinessDna().then(res => {
      if (res.data) {
        setDna(res.data);
        if (res.data.blogs?.length > 0) {
          setSelectedBlog(String(res.data.blogs[0].id));
        }
      }
    }).catch(() => {});
    getSettings().then(res => {
      const preferred = res.data?.ai?.providers?.enhance;
      if (preferred) setAiModel(preferred);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedBlog) fetchArticles();
  }, [selectedBlog]);

  const fetchArticles = async () => {
    if (!selectedBlog) return;
    setLoading(true);
    try {
      const res = await getExistingArticles(selectedBlog);
      setArticles(res.data || []);
    } catch (err) {
      toast.error('Failed to fetch articles');
    }
    setLoading(false);
  };

  const handleDelete = async (articleId) => {
    if (!confirm('Delete this article from Shopify?')) return;
    try {
      await deleteArticle(selectedBlog, articleId);
      setArticles(articles.filter(a => a.id !== articleId));
      if (selectedArticle?.id === articleId) setSelectedArticle(null);
      toast.success('Article deleted');
    } catch (err) {
      toast.error('Failed to delete');
    }
  };

  // The list has the text; the scores and meta fields come from the article itself.
  const handleSelect = async (a) => {
    setSelectedArticle(a);
    setEnhancedResult(null);
    try {
      const res = await getExistingArticle(selectedBlog, a.id);
      setSelectedArticle(current => (current?.id === a.id ? { ...current, ...res.data, id: a.id } : current));
    } catch { /* the article still shows without its scores */ }
  };

  const handleEnhance = async () => {
    if (!selectedArticle) return;
    setEnhancing(true);
    try {
      const res = await enhanceArticle({
        article: selectedArticle,
        instructions: enhanceInstructions || undefined,
        aiModel,
      });
      setEnhancedResult(res.data);
      if (res.data.warning) toast(res.data.warning, { icon: '⚠️', duration: 8000 });
      else toast.success('Optimized version ready. Review it, then update the article.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Optimization failed');
    }
    setEnhancing(false);
  };

  // Updates the original in place: same URL, same published or draft status.
  const handleUpdate = async () => {
    if (!window.confirm(`Replace "${selectedArticle.title}" on Shopify with this version? ${selectedArticle.publishedAt ? 'It is live, so the change is public straight away.' : 'It stays a draft.'}`)) return;
    setSaving(true);
    try {
      const { title, bodyHtml, tags, summary, seoTitle, seoDescription } = enhancedResult;
      const res = await updateArticle(selectedBlog, selectedArticle.id, { title, bodyHtml, tags, summary, seoTitle, seoDescription });
      toast.success(res.message || 'Article updated');
      await fetchArticles();
      await handleSelect({ ...selectedArticle, title, bodyHtml, tags });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Update failed');
    }
    setSaving(false);
  };

  return (
    <div className="page-container fade-in">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1>📄 Existing Articles</h1>
          <p>See how each article scores for SEO and AI answers, and optimize it in place. URLs never change.</p>
        </div>
        <div className="flex gap-8">
          {dna?.blogs?.length > 0 && (
            <select className="form-select" style={{ width: 200 }} value={selectedBlog} onChange={e => setSelectedBlog(e.target.value)}>
              {dna.blogs.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
            </select>
          )}
          <button className="btn btn-secondary btn-sm" onClick={fetchArticles}><RefreshCw size={14} /> Refresh</button>
        </div>
      </div>

      {!dna ? (
        <div className="card">
          <div className="card-body">
            <div className="empty-state">
              <FileText size={48} />
              <h3>Connect & Fetch DNA First</h3>
              <p>Connect your Shopify store and fetch Business DNA to view existing articles.</p>
            </div>
          </div>
        </div>
      ) : loading ? (
        <div className="card"><div className="card-body"><div className="empty-state"><div className="spinner spinner-lg" /><p>Loading articles...</p></div></div></div>
      ) : (
        <div className={selectedArticle ? 'two-col' : ''}>
          {/* Articles List */}
          <div className="card">
            <div className="card-header">
              <h2>Articles ({articles.length})</h2>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {articles.length === 0 ? (
                <div className="empty-state"><FileText size={32} /><h3>No articles found</h3></div>
              ) : (
                <div className="table-container">
                  <table className="data-table">
                    <thead><tr><th>Title</th><th title="How easily AI assistants can quote this article">AEO</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
                    <tbody>
                      {articles.map(a => (
                        <tr key={a.id} style={{ cursor: 'pointer', background: selectedArticle?.id === a.id ? 'rgba(139,92,246,0.06)' : undefined }}
                          onClick={() => handleSelect(a)}>
                          <td style={{ fontWeight: 500, color: 'var(--text-primary)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {a.title}
                          </td>
                          <td style={{ fontWeight: 700, color: scoreColor(a.aeo) }}>{a.aeo}</td>
                          <td>
                            <span className={`badge ${a.publishedAt ? 'badge-success' : 'badge-warning'}`}>
                              {a.publishedAt ? 'Published' : 'Draft'}
                            </span>
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {a.publishedAt ? new Date(a.publishedAt).toLocaleDateString() : '—'}
                          </td>
                          <td>
                            <button className="btn btn-danger btn-sm btn-icon" onClick={e => { e.stopPropagation(); handleDelete(a.id); }}>
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Article Detail */}
          {selectedArticle && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div className="card">
                <div className="card-header">
                  <h3>Article Details</h3>
                  <button className="btn btn-ghost btn-sm" onClick={() => setSelectedArticle(null)}>✕</button>
                </div>
                <div className="card-body">
                  <h3 style={{ fontSize: 18, marginBottom: 12 }}>{selectedArticle.title}</h3>
                  <div className="flex gap-8 mb-16" style={{ flexWrap: 'wrap' }}>
                    {selectedArticle.tags?.split(',').filter(t => t.trim()).map(tag => (
                      <span key={tag} className="badge badge-purple">{tag.trim()}</span>
                    ))}
                  </div>
                  <div className="article-preview" style={{ maxHeight: 300 }}
                    dangerouslySetInnerHTML={{ __html: selectedArticle.bodyHtml || selectedArticle.body_html || '' }} />
                </div>
              </div>

              <SeoScoreCard seoScore={selectedArticle.seoScore} />
              <SeoScoreCard seoScore={selectedArticle.aeoScore} title="🤖 AEO Score (AI answers)" />

              {/* Optimize */}
              <div className="card">
                <div className="card-header"><h3>🔮 Optimize for SEO + AEO</h3></div>
                <div className="card-body">
                  <div className="form-group">
                    <label className="form-label">Extra instructions (optional)</label>
                    <textarea className="form-textarea" rows={3} value={enhanceInstructions} onChange={e => setEnhanceInstructions(e.target.value)}
                      placeholder="e.g., Mention free shipping, keep a friendly tone" />
                    <div className="form-helper">Adds question headings, direct answers, key takeaways, an FAQ and internal links. Nothing changes on Shopify until you approve it.</div>
                  </div>
                  <div className="form-group">
                    <select className="form-select" value={aiModel} onChange={e => setAiModel(e.target.value)}>
                      <option value="gemini">Gemini</option>
                      <option value="deepseek">DeepSeek</option>
                    </select>
                  </div>
                  <button className="btn btn-primary w-full" onClick={handleEnhance} disabled={enhancing}>
                    {enhancing ? <><Loader2 size={16} className="spinning" /> Optimizing...</> : <><Sparkles size={16} /> Optimize Article</>}
                  </button>
                </div>
              </div>

              {/* Enhanced Result */}
              {enhancedResult && (
                <div className="card slide-up">
                  <div className="card-header"><h3>✨ Optimized Version</h3></div>
                  <div className="card-body">
                    <h4 style={{ marginBottom: 8 }}>{enhancedResult.title}</h4>
                    <div className="form-helper mb-16">
                      SEO {selectedArticle.seoScore?.score ?? '—'} to {enhancedResult.seoScore?.score} · AEO {selectedArticle.aeoScore?.score ?? '—'} to {enhancedResult.aeoScore?.score}
                      {' '}· {enhancedResult.wordCount} words
                    </div>
                    <div className="article-preview" style={{ maxHeight: 300 }}
                      dangerouslySetInnerHTML={{ __html: enhancedResult.bodyHtml }} />
                    <div className="mt-16 flex gap-8">
                      <button className="btn btn-success btn-sm" onClick={handleUpdate} disabled={saving}>
                        {saving ? <Loader2 size={14} className="spinning" /> : null} Update Article on Shopify
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => {
                        navigator.clipboard.writeText(enhancedResult.bodyHtml);
                        toast.success('HTML copied!');
                      }}>Copy HTML</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {enhancing && (
        <div className="loading-overlay">
          <div className="spinner spinner-lg" />
          <div className="loading-text">Optimizing the article for SEO and AI answers...</div>
        </div>
      )}
      <style>{`.spinning { animation: spin 1s linear infinite; }`}</style>
    </div>
  );
}
