import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Trash2, Sparkles, Loader2, RefreshCw, Search, Copy, Upload, AlertTriangle } from 'lucide-react';
import {
  getBusinessDna, getExistingArticles, getExistingArticle, deleteArticle, enhanceArticle, updateArticle, getSettings,
} from '../lib/api';
import toast from 'react-hot-toast';
import SeoScoreCard from '../components/SeoScoreCard';
import { PageHeader, Sheet, Segmented, EmptyState, Section } from '../components/ui';
import { fmtDate } from '../lib/dates';
import '../styles/blog.css';

const scoreBadge = (score) => (score >= 80 ? 'badge-success' : score >= 50 ? 'badge-warning' : 'badge-danger');
const scoreTone = (score) => (score >= 80 ? 'ea-score--good' : score >= 50 ? 'ea-score--ok' : 'ea-score--low');
const scoreWord = (score) => (score >= 80 ? 'Excellent' : score >= 50 ? 'Good' : 'Needs work');

const AI_OPTIONS = [
  { value: 'gemini', label: 'Gemini' },
  { value: 'deepseek', label: 'DeepSeek' },
];
const VIEW_OPTIONS = [
  { value: 'article', label: 'Article' },
  { value: 'seo', label: 'SEO checks' },
  { value: 'aeo', label: 'AI answer checks' },
];
const warnIcon = <AlertTriangle size={18} style={{ color: 'var(--accent-warning)' }} />;

function ScoreTile({ label, score }) {
  const has = typeof score === 'number';
  return (
    <div className="kpi-tile">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${has ? scoreTone(score) : ''}`}>{has ? score : '—'}</div>
      <div className="kpi-sub">{has ? scoreWord(score) : 'Not scored yet'}</div>
    </div>
  );
}

export default function ExistingArticles() {
  const [dna, setDna] = useState(null);
  const [dnaLoading, setDnaLoading] = useState(true);
  const [selectedBlog, setSelectedBlog] = useState('');
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [enhancing, setEnhancing] = useState(false);
  const [enhanceInstructions, setEnhanceInstructions] = useState('');
  const [enhancedResult, setEnhancedResult] = useState(null);
  const [aiModel, setAiModel] = useState('gemini');
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [view, setView] = useState('article');
  const resultRef = useRef(null);
  // Read by the sheet's close handler, which stays stable so the sheet doesn't re-focus.
  const busyRef = useRef(false);
  busyRef.current = enhancing || saving;

  useEffect(() => {
    getBusinessDna().then(res => {
      if (res.data) {
        setDna(res.data);
        if (res.data.blogs?.length > 0) {
          setSelectedBlog(String(res.data.blogs[0].id));
        }
      }
    }).catch(() => {}).finally(() => setDnaLoading(false));
    getSettings().then(res => {
      const preferred = res.data?.ai?.providers?.enhance;
      if (preferred) setAiModel(preferred);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedBlog) fetchArticles();
  }, [selectedBlog]);

  // A new optimized version: bring it into view.
  useEffect(() => {
    if (enhancedResult) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [enhancedResult]);

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

  const openArticle = (a) => { setView('article'); handleSelect(a); };
  const closeSheet = useCallback(() => { if (!busyRef.current) setSelectedArticle(null); }, []);

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
      if (res.data.warning) toast(res.data.warning, { icon: warnIcon, duration: 8000 });
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

  const copyEnhancedHtml = () => {
    navigator.clipboard.writeText(enhancedResult.bodyHtml);
    toast.success('HTML copied');
  };

  const hasBlogs = dna?.blogs?.length > 0;
  const q = query.trim().toLowerCase();
  const shown = q ? articles.filter(a => (a.title || '').toLowerCase().includes(q)) : articles;
  const draftCount = articles.filter(a => !a.publishedAt).length;
  const sel = selectedArticle;
  const selTags = sel?.tags ? sel.tags.split(',').filter(t => t.trim()) : [];
  const selAeo = sel ? (sel.aeoScore?.score ?? sel.aeo) : undefined;
  const subtitle = sel ? [
    sel.publishedAt ? `Published ${fmtDate(sel.publishedAt)}` : 'Draft',
    sel.wordCount ? `${sel.wordCount.toLocaleString()} words` : null,
  ].filter(Boolean).join(' · ') : '';

  return (
    <div className="page-container fade-in blog-page">
      <PageHeader
        title="Existing Articles"
        subtitle="See how each article scores for SEO and AI answers, and improve it in place. Its web address never changes."
        actions={dna && hasBlogs && (
          <button className="btn btn-secondary" onClick={fetchArticles} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spinning' : ''} /> Refresh
          </button>
        )}
      />

      {dnaLoading ? (
        <div className="empty-state"><div className="spinner spinner-lg" /></div>
      ) : !dna ? (
        <Section>
          <EmptyState
            icon={FileText}
            title="Business DNA needed first"
            text="Connect your Shopify store and fetch Business DNA to see your blog's articles."
            action={<Link to="/business-dna" className="btn btn-primary">Go to Business DNA</Link>}
          />
        </Section>
      ) : !hasBlogs ? (
        <Section>
          <EmptyState
            icon={FileText}
            title="No blogs found"
            text="Your store's blogs couldn't be listed. Check your Shopify connection in Settings, then rebuild your Business DNA."
            action={<Link to="/business-dna" className="btn btn-primary">Go to Business DNA</Link>}
          />
        </Section>
      ) : (
        <>
          <div className="toolbar">
            <div className="blog-toolbar-field">
              <label className="form-label" htmlFor="ea-blog">Blog</label>
              <select id="ea-blog" className="form-select" value={selectedBlog} onChange={e => setSelectedBlog(e.target.value)}>
                {dna.blogs.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
              </select>
            </div>
            {articles.length > 0 && (
              <div className="blog-search">
                <Search aria-hidden="true" />
                <input
                  type="search"
                  className="form-input"
                  placeholder="Search titles"
                  aria-label="Search articles by title"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
              </div>
            )}
          </div>

          <Section
            title="Articles"
            description={!loading && articles.length > 0
              ? `${articles.length} ${articles.length === 1 ? 'article' : 'articles'}${draftCount ? ` · ${draftCount} ${draftCount === 1 ? 'draft' : 'drafts'}` : ''}`
              : undefined}
            flush
            className="blog-list-card"
          >
            {loading ? (
              <div className="empty-state"><div className="spinner spinner-lg" /></div>
            ) : articles.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No articles in this blog yet"
                text="Write one and it shows up here with its scores."
                action={<Link to="/generate" className="btn btn-primary"><Sparkles size={16} /> Generate article</Link>}
              />
            ) : shown.length === 0 ? (
              <EmptyState
                icon={Search}
                title="No matching articles"
                text={`No article title contains "${query.trim()}".`}
                action={<button className="btn btn-secondary" onClick={() => setQuery('')}>Clear search</button>}
              />
            ) : (
              <div className="list">
                {shown.map(a => (
                  <div key={a.id} className="list-item is-clickable" onClick={() => openArticle(a)}>
                    <div className="list-item__media">
                      {a.image?.src ? <img src={a.image.src} alt="" loading="lazy" /> : <FileText aria-hidden="true" />}
                    </div>
                    <div className="list-item__main">
                      <div className="list-item__title">
                        <span className="blog-truncate" title={a.title}>{a.title}</span>
                      </div>
                      <div className="list-item__meta">
                        <span className={`status ${a.publishedAt ? 'status--on' : 'status--warn'}`}>{a.publishedAt ? 'Published' : 'Draft'}</span>
                        {a.publishedAt && <span>{fmtDate(a.publishedAt)}</span>}
                        {a.wordCount ? <span>{a.wordCount.toLocaleString()} words</span> : null}
                      </div>
                    </div>
                    <div className="list-item__actions">
                      <span className={`badge ${scoreBadge(a.aeo)}`} title="How easily AI assistants can quote this article">
                        AI answers {a.aeo}
                      </span>
                      <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); openArticle(a); }}>
                        Review
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={e => { e.stopPropagation(); handleDelete(a.id); }}
                        title="Delete"
                        aria-label={`Delete ${a.title}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </>
      )}

      <Sheet
        open={Boolean(sel)}
        title={sel?.title || 'Article'}
        subtitle={subtitle}
        onClose={closeSheet}
        width={720}
        footer={enhancedResult && (
          <>
            <button type="button" className="btn btn-ghost" onClick={copyEnhancedHtml}><Copy size={16} /> Copy HTML</button>
            <button type="button" className="btn btn-primary" onClick={handleUpdate} disabled={saving}>
              {saving ? <Loader2 size={16} className="spinning" /> : <Upload size={16} />} Update article on Shopify
            </button>
          </>
        )}
      >
        {sel && (
          <div className="stack">
            <div className="ea-scores">
              <ScoreTile label="SEO score" score={sel.seoScore?.score} />
              <ScoreTile label="AI answer score" score={selAeo} />
            </div>

            <div className="blog-seg-field">
              <Segmented value={view} onChange={setView} options={VIEW_OPTIONS} ariaLabel="Show" />
            </div>

            {view === 'article' && (
              <div>
                {selTags.length > 0 && (
                  <div className="ea-tags">
                    {selTags.map(tag => <span key={tag} className="badge badge-purple">{tag.trim()}</span>)}
                  </div>
                )}
                <div className="article-preview is-short"
                  dangerouslySetInnerHTML={{ __html: sel.bodyHtml || sel.body_html || '' }} />
              </div>
            )}
            {view === 'seo' && (sel.seoScore
              ? <SeoScoreCard seoScore={sel.seoScore} title="SEO checks" />
              : <div className="ea-panel-note">The SEO checks are still loading, or couldn't be read for this article.</div>)}
            {view === 'aeo' && (sel.aeoScore
              ? <SeoScoreCard seoScore={sel.aeoScore} title="AI answer checks" />
              : <div className="ea-panel-note">The AI answer checks are still loading, or couldn't be read for this article.</div>)}

            <Section
              title="Improve this article"
              description="Adds question headings, direct answers, key takeaways, an FAQ and internal links. Nothing changes on Shopify until you approve it."
            >
              <div className="form-grid">
                <div className="form-group span-all">
                  <label className="form-label" htmlFor="ea-instructions">Extra instructions <span className="blog-optional">(optional)</span></label>
                  <textarea id="ea-instructions" className="form-textarea" rows={3} value={enhanceInstructions} onChange={e => setEnhanceInstructions(e.target.value)}
                    placeholder="e.g. Mention free shipping, keep a friendly tone" />
                </div>
                <div className="form-group blog-seg-field">
                  <span className="form-label">AI model</span>
                  <Segmented value={aiModel} onChange={setAiModel} options={AI_OPTIONS} ariaLabel="AI model" />
                </div>
              </div>
              <div className="form-actions mt-16">
                <button className={`btn ${enhancedResult ? 'btn-secondary' : 'btn-primary'}`} onClick={handleEnhance} disabled={enhancing}>
                  {enhancing
                    ? <><Loader2 size={16} className="spinning" /> Optimizing…</>
                    : <><Sparkles size={16} /> {enhancedResult ? 'Optimize again' : 'Optimize article'}</>}
                </button>
              </div>
            </Section>

            {enhancedResult && (
              <div ref={resultRef} className="ea-result slide-up">
                <Section
                  title="Optimized version"
                  description={`SEO ${sel.seoScore?.score ?? '—'} to ${enhancedResult.seoScore?.score} · AI answers ${sel.aeoScore?.score ?? '—'} to ${enhancedResult.aeoScore?.score} · ${enhancedResult.wordCount} words`}
                >
                  <div className="callout callout--info callout--compact mb-16">
                    <Sparkles size={15} />
                    <span>Review it, then use Update article on Shopify below. {sel.publishedAt ? 'The article is live, so the change is public straight away.' : 'It stays a draft.'}</span>
                  </div>
                  <h3 className="ea-result__title">{enhancedResult.title}</h3>
                  <div className="article-preview is-short"
                    dangerouslySetInnerHTML={{ __html: enhancedResult.bodyHtml }} />
                </Section>
              </div>
            )}
          </div>
        )}
      </Sheet>

      {enhancing && (
        <div className="loading-overlay">
          <div className="spinner spinner-lg" />
          <div className="loading-text">Optimizing the article for SEO and AI answers…</div>
        </div>
      )}
    </div>
  );
}
