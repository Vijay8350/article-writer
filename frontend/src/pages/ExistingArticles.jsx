import React, { useState, useEffect } from 'react';
import { FileText, Trash2, Sparkles, Eye, Loader2, RefreshCw } from 'lucide-react';
import { getBusinessDna, getExistingArticles, deleteArticle, enhanceArticle } from '../lib/api';
import toast from 'react-hot-toast';
import SeoScoreCard from '../components/SeoScoreCard';

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

  useEffect(() => {
    getBusinessDna().then(res => {
      if (res.data) {
        setDna(res.data);
        if (res.data.blogs?.length > 0) {
          setSelectedBlog(String(res.data.blogs[0].id));
        }
      }
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

  const handleEnhance = async () => {
    if (!selectedArticle) return;
    setEnhancing(true);
    try {
      const res = await enhanceArticle({
        article: selectedArticle,
        instructions: enhanceInstructions || 'Improve SEO, add internal links, make more engaging and human-like',
        aiModel,
      });
      setEnhancedResult(res.data);
      toast.success('Article enhanced!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Enhancement failed');
    }
    setEnhancing(false);
  };

  return (
    <div className="page-container fade-in">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1>📄 Existing Articles</h1>
          <p>View, enhance, and manage your Shopify blog articles</p>
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
                    <thead><tr><th>Title</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
                    <tbody>
                      {articles.map(a => (
                        <tr key={a.id} style={{ cursor: 'pointer', background: selectedArticle?.id === a.id ? 'rgba(139,92,246,0.06)' : undefined }}
                          onClick={() => { setSelectedArticle(a); setEnhancedResult(null); }}>
                          <td style={{ fontWeight: 500, color: 'var(--text-primary)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {a.title}
                          </td>
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

              {/* Enhance */}
              <div className="card">
                <div className="card-header"><h3>🔮 Enhance with AI</h3></div>
                <div className="card-body">
                  <div className="form-group">
                    <label className="form-label">Enhancement Instructions</label>
                    <textarea className="form-textarea" rows={3} value={enhanceInstructions} onChange={e => setEnhanceInstructions(e.target.value)}
                      placeholder="e.g., 'Add more product links, improve SEO, make the tone more conversational'" />
                  </div>
                  <div className="form-group">
                    <select className="form-select" value={aiModel} onChange={e => setAiModel(e.target.value)}>
                      <option value="gemini">Gemini</option>
                      <option value="deepseek">DeepSeek</option>
                    </select>
                  </div>
                  <button className="btn btn-primary w-full" onClick={handleEnhance} disabled={enhancing}>
                    {enhancing ? <><Loader2 size={16} className="spinning" /> Enhancing...</> : <><Sparkles size={16} /> Enhance Article</>}
                  </button>
                </div>
              </div>

              {/* Enhanced Result */}
              {enhancedResult && (
                <div className="card slide-up">
                  <div className="card-header"><h3>✨ Enhanced Version</h3></div>
                  <div className="card-body">
                    <h4 style={{ marginBottom: 8 }}>{enhancedResult.title}</h4>
                    <div className="article-preview" style={{ maxHeight: 300 }}
                      dangerouslySetInnerHTML={{ __html: enhancedResult.bodyHtml }} />
                    <div className="mt-16 flex gap-8">
                      <button className="btn btn-success btn-sm" onClick={() => {
                        publishArticle(selectedBlog, { ...enhancedResult, published: true })
                          .then(() => { toast.success('Published!'); fetchArticles(); })
                          .catch(e => toast.error(e.response?.data?.error || 'Failed'));
                      }}>Publish Enhanced</button>
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
          <div className="loading-text">Enhancing article with AI...</div>
        </div>
      )}
      <style>{`.spinning { animation: spin 1s linear infinite; }`}</style>
    </div>
  );
}
