import React, { useState, useEffect } from 'react';
import { PenLine, Sparkles, Send, Copy, Eye, ChevronDown, Loader2, Check, Zap } from 'lucide-react';
import { generateArticle, publishArticle, generateAndPublish, getBusinessDna, getUsage } from '../lib/api';
import toast from 'react-hot-toast';
import SeoScoreCard from '../components/SeoScoreCard';

export default function GenerateArticle() {
  const [dna, setDna] = useState(null);
  const [topic, setTopic] = useState('');
  const [wordCount, setWordCount] = useState(1500);
  const [aiModel, setAiModel] = useState('gemini');
  const [selectedBlog, setSelectedBlog] = useState('');
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [instantPublishing, setInstantPublishing] = useState(false);
  const [article, setArticle] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editedArticle, setEditedArticle] = useState(null);
  const [publishAsDraft, setPublishAsDraft] = useState(false);
  const [usage, setUsage] = useState(null);

  const refreshUsage = () => getUsage().then(res => setUsage(res.data)).catch(() => {});

  useEffect(() => {
    getBusinessDna().then(res => {
      if (res.data) {
        setDna(res.data);
        if (res.data.blogs?.length > 0) setSelectedBlog(res.data.blogs[0].id);
      }
    }).catch(() => {});
    refreshUsage();
  }, []);

  const limitReached = usage && usage.remaining <= 0;

  const handleGenerate = async () => {
    if (!topic.trim()) return toast.error('Please enter a topic');
    if (!dna) return toast.error('Please fetch Business DNA first');

    setGenerating(true);
    setArticle(null);
    try {
      const res = await generateArticle({ topic, wordCount, aiModel, blogId: selectedBlog });
      setArticle(res.data);
      setEditedArticle({ ...res.data });
      toast.success('Article generated successfully!');
      refreshUsage();
    } catch (err) {
      if (err.response?.data?.code === 'LIMIT_REACHED') {
        toast.error(err.response.data.error || 'Monthly limit reached');
        refreshUsage();
      } else {
        toast.error(err.response?.data?.error || 'Generation failed');
      }
    }
    setGenerating(false);
  };

  const handlePublish = async () => {
    if (!selectedBlog) return toast.error('Select a blog first');
    const data = editMode ? editedArticle : article;
    if (!data) return;

    setPublishing(true);
    try {
      await publishArticle(selectedBlog, { ...data, published: !publishAsDraft });
      toast.success(publishAsDraft ? 'Article saved as draft!' : 'Article published to Shopify!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Publish failed');
    }
    setPublishing(false);
  };

  const handleGenerateAndPublish = async () => {
    if (!topic.trim()) return toast.error('Please enter a topic');
    if (!dna) return toast.error('Please fetch Business DNA first');
    if (!selectedBlog) return toast.error('Select a blog first');

    setInstantPublishing(true);
    setArticle(null);
    try {
      const res = await generateAndPublish({ topic, wordCount, aiModel, blogId: selectedBlog });
      setArticle(res.data.article);
      setEditedArticle({ ...res.data.article });
      toast.success('Generated & published to Shopify!');
      refreshUsage();
    } catch (err) {
      if (err.response?.data?.code === 'LIMIT_REACHED') {
        toast.error(err.response.data.error || 'Monthly limit reached');
        refreshUsage();
      } else {
        toast.error(err.response?.data?.error || 'Generate & publish failed');
      }
    }
    setInstantPublishing(false);
  };

  const copyHtml = () => {
    const data = editMode ? editedArticle : article;
    navigator.clipboard.writeText(data?.bodyHtml || '');
    toast.success('HTML copied to clipboard!');
  };

  const currentArticle = editMode ? editedArticle : article;

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <h1>✍️ Generate Article</h1>
        <p>Create SEO-optimized, human-friendly articles for your Shopify blog</p>
      </div>

      {!dna ? (
        <div className="card">
          <div className="card-body">
            <div className="empty-state">
              <Sparkles size={48} />
              <h3>Business DNA Required</h3>
              <p>Please fetch your Business DNA first so the AI can generate contextual, relevant articles with internal links.</p>
              <a href="/business-dna" className="btn btn-primary">Go to Business DNA</a>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Usage / quota banner */}
          {usage && (
            <div className="card mb-24" style={limitReached ? { borderColor: 'rgba(239,68,68,0.4)' } : undefined}>
              <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                  Plan <strong style={{ textTransform: 'capitalize' }}>{usage.planName || usage.planId}</strong> — {usage.used}/{usage.limit} articles used this month
                </span>
                {limitReached
                  ? <span className="badge badge-danger">Limit reached — <a href="/plan" style={{ color: 'inherit', textDecoration: 'underline' }}>upgrade</a></span>
                  : <span className="badge badge-success">{usage.remaining} remaining</span>}
              </div>
            </div>
          )}

          {/* Input Section */}
          <div className="card mb-24">
            <div className="card-header"><h2>📝 Article Configuration</h2></div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">Topic / Article Idea *</label>
                <textarea
                  className="form-textarea"
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  placeholder="e.g., '10 Best Ways to Style Our Winter Collection' or 'How to Choose the Perfect Gift for Your Loved Ones'"
                  rows={3}
                />
                <div className="form-helper">Be specific about what you want the article to cover. The AI will use your store's products and collections for context.</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
                <div className="form-group">
                  <label className="form-label">Word Count: <span className="range-value">{wordCount}</span></label>
                  <input
                    type="range"
                    className="range-slider"
                    min={500}
                    max={5000}
                    step={100}
                    value={wordCount}
                    onChange={e => setWordCount(Number(e.target.value))}
                  />
                  <div className="flex justify-between form-helper">
                    <span>500</span><span>5000</span>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">AI Model</label>
                  <select className="form-select" value={aiModel} onChange={e => setAiModel(e.target.value)}>
                    <option value="gemini">🧠 Google Gemini (Recommended)</option>
                    <option value="deepseek">🔮 DeepSeek</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Publish to Blog</label>
                  {dna.blogs?.length > 0 ? (
                    <select className="form-select" value={selectedBlog} onChange={e => setSelectedBlog(e.target.value)}>
                      {dna.blogs.map(b => (
                        <option key={b.id} value={b.id}>{b.title}</option>
                      ))}
                    </select>
                  ) : (
                    <>
                      <input
                        className="form-input"
                        value={selectedBlog}
                        onChange={e => setSelectedBlog(e.target.value)}
                        placeholder="Enter Blog ID (e.g., 12345678)"
                      />
                      <div className="form-helper" style={{ color: 'var(--accent-warning)' }}>
                        ⚠️ Blog list unavailable — your token needs <strong>read_content</strong> scope. Enter the Blog ID manually from Shopify Admin.
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button className="btn btn-primary btn-lg" style={{ flex: 1, minWidth: 200 }} onClick={handleGenerate} disabled={generating || instantPublishing || limitReached}>
                  {generating ? <><Loader2 size={20} className="spinning" /> Generating...</> : <><Sparkles size={20} /> Generate Article</>}
                </button>
                <button className="btn btn-success btn-lg" style={{ flex: 1, minWidth: 200 }} onClick={handleGenerateAndPublish} disabled={generating || instantPublishing || limitReached}>
                  {instantPublishing ? <><Loader2 size={20} className="spinning" /> Publishing...</> : <><Zap size={20} /> Generate & Publish Now</>}
                </button>
              </div>
            </div>
          </div>

          {/* Generating overlay */}
          {generating && (
            <div className="loading-overlay">
              <div className="spinner spinner-lg" />
              <div className="loading-text" style={{ fontSize: 18 }}>✍️ Writing your article...</div>
              <div className="loading-text">Using {aiModel === 'gemini' ? 'Google Gemini' : 'DeepSeek'} AI with your Business DNA</div>
              <div className="loading-text" style={{ fontSize: 12, marginTop: 8 }}>This may take 30-60 seconds</div>
            </div>
          )}

          {/* Generated Article */}
          {article && (
            <div className="two-col slide-up">
              {/* Article Content */}
              <div>
                <div className="card mb-24">
                  <div className="card-header">
                    <h2>📄 Generated Article</h2>
                    <div className="flex gap-8">
                      <button className="btn btn-secondary btn-sm" onClick={() => setEditMode(!editMode)}>
                        {editMode ? <><Eye size={14} /> Preview</> : <><PenLine size={14} /> Edit</>}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={copyHtml}><Copy size={14} /> Copy HTML</button>
                    </div>
                  </div>
                  <div className="card-body">
                    {editMode ? (
                      <div>
                        <div className="form-group">
                          <label className="form-label">Title</label>
                          <input className="form-input" value={editedArticle?.title || ''} onChange={e => setEditedArticle({ ...editedArticle, title: e.target.value })} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">SEO Title (50-60 chars)</label>
                          <input className="form-input" value={editedArticle?.seoTitle || ''} onChange={e => setEditedArticle({ ...editedArticle, seoTitle: e.target.value })} />
                          <div className="form-helper">{(editedArticle?.seoTitle || '').length} characters</div>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Meta Description (150-160 chars)</label>
                          <textarea className="form-textarea" rows={2} value={editedArticle?.seoDescription || ''} onChange={e => setEditedArticle({ ...editedArticle, seoDescription: e.target.value })} />
                          <div className="form-helper">{(editedArticle?.seoDescription || '').length} characters</div>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Tags (comma-separated)</label>
                          <input className="form-input" value={editedArticle?.tags || ''} onChange={e => setEditedArticle({ ...editedArticle, tags: e.target.value })} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Summary</label>
                          <textarea className="form-textarea" rows={2} value={editedArticle?.summary || ''} onChange={e => setEditedArticle({ ...editedArticle, summary: e.target.value })} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Body HTML</label>
                          <textarea className="form-textarea" rows={15} style={{ fontFamily: 'monospace', fontSize: 12 }} value={editedArticle?.bodyHtml || ''} onChange={e => setEditedArticle({ ...editedArticle, bodyHtml: e.target.value })} />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <h2 style={{ fontSize: 24, marginBottom: 16, background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                          {currentArticle.title}
                        </h2>
                        <div className="flex gap-8 mb-16" style={{ flexWrap: 'wrap' }}>
                          {currentArticle.tags?.split(',').filter(t => t.trim()).map(tag => (
                            <span key={tag} className="badge badge-purple">{tag.trim()}</span>
                          ))}
                        </div>
                        <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 16 }}>
                          {currentArticle.wordCount || '—'} words · {aiModel === 'gemini' ? 'Gemini' : 'DeepSeek'} AI
                        </div>
                        <div className="article-preview" dangerouslySetInnerHTML={{ __html: currentArticle.bodyHtml }} />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Sidebar: SEO + Publish */}
              <div>
                {/* SEO Score */}
                <SeoScoreCard seoScore={currentArticle.seoScore} />

                {/* Meta Info */}
                <div className="card mb-24">
                  <div className="card-header"><h3>🔍 SEO Meta</h3></div>
                  <div className="card-body">
                    <div className="dna-section">
                      <div className="dna-section-title">SEO Title</div>
                      <p style={{ fontSize: 14, color: 'var(--accent-secondary)' }}>{currentArticle.seoTitle || '—'}</p>
                      <div className="form-helper">{(currentArticle.seoTitle || '').length} chars</div>
                    </div>
                    <div className="dna-section mt-16">
                      <div className="dna-section-title">Meta Description</div>
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{currentArticle.seoDescription || '—'}</p>
                      <div className="form-helper">{(currentArticle.seoDescription || '').length} chars</div>
                    </div>
                    {currentArticle.imagePrompts?.length > 0 && (
                      <div className="dna-section mt-16">
                        <div className="dna-section-title">Image Prompts</div>
                        {currentArticle.imagePrompts.map((p, i) => (
                          <p key={i} style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>📸 {p}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Auto-inserted product images */}
                {article?.insertedImages?.length > 0 && (
                  <div className="card mb-24">
                    <div className="card-header"><h3>🖼️ Inserted Product Images</h3></div>
                    <div className="card-body">
                      <div className="form-helper mb-16">
                        The AI was given these real product images to embed in the article body.
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                        {article.insertedImages.map((img, i) => (
                          <div key={i} style={{ textAlign: 'center' }}>
                            <img
                              src={img.imageUrl}
                              alt={img.alt}
                              style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 'var(--radius-md)', border: '1px solid rgba(139,92,246,0.2)' }}
                            />
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={img.title}>
                              {img.title}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Publish */}
                <div className="card">
                  <div className="card-header"><h3>🚀 Publish to Shopify</h3></div>
                  <div className="card-body">
                    <div className="checkbox-group">
                      <input type="checkbox" id="draft" checked={publishAsDraft} onChange={e => setPublishAsDraft(e.target.checked)} />
                      <label htmlFor="draft">Save as Draft (don't publish live)</label>
                    </div>
                    <button className="btn btn-success w-full" onClick={handlePublish} disabled={publishing}>
                      {publishing ? <><Loader2 size={16} className="spinning" /> Publishing...</> : <><Send size={16} /> {publishAsDraft ? 'Save as Draft' : 'Publish Article'}</>}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      <style>{`.spinning { animation: spin 1s linear infinite; }`}</style>
    </div>
  );
}
