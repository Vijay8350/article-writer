import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { PenLine, Sparkles, Send, Copy, Eye, ChevronDown, Loader2, Zap, AlertTriangle, AlertCircle, Info, Lightbulb } from 'lucide-react';
import { generateArticle, publishArticle, generateAndPublish, getBusinessDna, getUsage, getSettings } from '../lib/api';
import toast from 'react-hot-toast';
import SeoScoreCard from '../components/SeoScoreCard';
import { PageHeader, Segmented, EmptyState, Section, Switch, SettingRow } from '../components/ui';
import '../styles/blog.css';

const AI_LABEL = { gemini: 'Gemini', deepseek: 'DeepSeek' };
const AI_OPTIONS = [
  { value: 'gemini', label: 'Gemini' },
  { value: 'deepseek', label: 'DeepSeek' },
];
const IMAGE_LABEL = { mixed: 'ChatGPT + store photos', ai: 'ChatGPT images', products: 'Store photos' };
const VIEW_OPTIONS = [
  { value: 'preview', label: 'Preview', icon: Eye },
  { value: 'edit', label: 'Edit', icon: PenLine },
];
const warnIcon = <AlertTriangle size={18} style={{ color: 'var(--accent-warning)' }} />;

export default function GenerateArticle() {
  const [dna, setDna] = useState(null);
  const [dnaLoading, setDnaLoading] = useState(true);
  const [topic, setTopic] = useState('');
  const [primaryKeyword, setPrimaryKeyword] = useState('');
  const [secondaryKeywords, setSecondaryKeywords] = useState('');
  const [wordCount, setWordCount] = useState(1500);
  const [aiModel, setAiModel] = useState('gemini');
  const [imageMode, setImageMode] = useState('mixed');
  const [selectedBlog, setSelectedBlog] = useState('');
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [instantPublishing, setInstantPublishing] = useState(false);
  const [article, setArticle] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editedArticle, setEditedArticle] = useState(null);
  const [publishAsDraft, setPublishAsDraft] = useState(false);
  const [usage, setUsage] = useState(null);
  const resultRef = useRef(null);

  const refreshUsage = () => getUsage().then(res => setUsage(res.data)).catch(() => {});

  useEffect(() => {
    getBusinessDna().then(res => {
      if (res.data) {
        setDna(res.data);
        if (res.data.blogs?.length > 0) setSelectedBlog(res.data.blogs[0].id);
      }
    }).catch(() => {}).finally(() => setDnaLoading(false));
    getSettings().then(res => {
      const preferred = res.data?.ai?.providers?.article;
      if (preferred) setAiModel(preferred);
      if (res.data?.ai?.articleImages) setImageMode(res.data.ai.articleImages);
    }).catch(() => {});
    refreshUsage();
  }, []);

  // A new article: bring it into view.
  useEffect(() => {
    if (article) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [article]);

  const limitReached = usage && usage.remaining <= 0;

  const handleGenerate = async () => {
    if (!topic.trim()) return toast.error('Please enter a topic');
    if (!dna) return toast.error('Please fetch Business DNA first');

    setGenerating(true);
    setArticle(null);
    try {
      const res = await generateArticle({
        topic, wordCount, aiModel, imageMode, blogId: selectedBlog,
        primaryKeyword: primaryKeyword.trim() || undefined,
        secondaryKeywords: secondaryKeywords ? secondaryKeywords.split(',').map(s => s.trim()).filter(Boolean) : undefined,
      });
      setArticle(res.data);
      setEditedArticle({ ...res.data });
      if (res.data?.publishWarning) toast(res.data.publishWarning, { icon: warnIcon });
      else toast.success('Article ready. Review it, then publish.');
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
      toast.success(publishAsDraft ? 'Saved to Shopify as a draft' : 'Published to Shopify');
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
      const res = await generateAndPublish({
        topic, wordCount, aiModel, imageMode, blogId: selectedBlog,
        primaryKeyword: primaryKeyword.trim() || undefined,
        secondaryKeywords: secondaryKeywords ? secondaryKeywords.split(',').map(s => s.trim()).filter(Boolean) : undefined,
      });
      setArticle(res.data.article);
      setEditedArticle({ ...res.data.article });
      toast.success('Written and published to Shopify');
      if (res.data.article?.publishWarning) toast(res.data.article.publishWarning, { icon: warnIcon, duration: 8000 });
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
    toast.success('HTML copied');
  };

  const currentArticle = editMode ? editedArticle : article;
  const blogName = dna?.blogs?.find(b => String(b.id) === String(selectedBlog))?.title;
  const usedPct = usage ? (usage.limit > 0 ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 100) : 0;
  const busy = generating || instantPublishing;
  const setEdited = (key) => (e) => setEditedArticle({ ...editedArticle, [key]: e.target.value });

  return (
    <div className="page-container fade-in blog-page">
      <PageHeader
        title="Generate Article"
        subtitle="Write an SEO-ready article for your Shopify blog that links to your own products."
      />

      {dnaLoading ? (
        <div className="empty-state"><div className="spinner spinner-lg" /></div>
      ) : !dna ? (
        <Section>
          <EmptyState
            icon={Sparkles}
            title="Business DNA needed first"
            text="Fetch your Business DNA so articles can link to your products and use their photos."
            action={<Link to="/business-dna" className="btn btn-primary">Go to Business DNA</Link>}
          />
        </Section>
      ) : (
        <div className="gen-layout">
          <div className="gen-main">
            {/* The form */}
            <Section className="gen-form">
              <div className="form-section">
                <label className="form-section__title" htmlFor="ga-topic">Topic</label>
                <p className="form-section__desc">What the article should cover. The more specific, the better.</p>
                <textarea
                  id="ga-topic"
                  className="form-textarea"
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  placeholder="e.g. 10 ways to style our winter collection, or How to choose the perfect gift"
                  rows={3}
                />
              </div>

              <div className="form-section">
                <h3 className="form-section__title">Keywords <span className="blog-optional">(optional)</span></h3>
                <p className="form-section__desc">The searches you want this article to rank for.</p>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label" htmlFor="ga-primary">Main keyword</label>
                    <input
                      id="ga-primary"
                      className="form-input"
                      value={primaryKeyword}
                      onChange={e => setPrimaryKeyword(e.target.value)}
                      placeholder="e.g. winter coat styling"
                    />
                    <div className="form-helper">Defaults to the topic. Used in the title, intro, a heading and the description.</div>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="ga-secondary">Other keywords</label>
                    <input
                      id="ga-secondary"
                      className="form-input"
                      value={secondaryKeywords}
                      onChange={e => setSecondaryKeywords(e.target.value)}
                      placeholder="e.g. layering tips, capsule wardrobe"
                    />
                    <div className="form-helper">Separate them with commas.</div>
                  </div>
                </div>
              </div>

              <div className="form-section">
                <h3 className="form-section__title">Options</h3>
                <p className="form-section__desc">How long it is and which blog it goes to.</p>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label" htmlFor="ga-words">Length <span className="range-value">{wordCount} words</span></label>
                    <input
                      id="ga-words"
                      type="range"
                      className="range-slider"
                      min={500}
                      max={5000}
                      step={100}
                      value={wordCount}
                      onChange={e => setWordCount(Number(e.target.value))}
                    />
                    <div className="form-helper blog-range-ends"><span>500</span><span>5,000</span></div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="ga-blog">Blog</label>
                    {dna.blogs?.length > 0 ? (
                      <select id="ga-blog" className="form-select" value={selectedBlog} onChange={e => setSelectedBlog(e.target.value)}>
                        {dna.blogs.map(b => (
                          <option key={b.id} value={b.id}>{b.title}</option>
                        ))}
                      </select>
                    ) : (
                      <>
                        <input
                          id="ga-blog"
                          className="form-input"
                          value={selectedBlog}
                          onChange={e => setSelectedBlog(e.target.value)}
                          placeholder="Blog ID, e.g. 12345678"
                        />
                        <div className="callout callout--warning callout--compact mt-16">
                          <AlertTriangle size={15} />
                          <span>
                            {dna.source === 'social'
                              ? <>Your blogs couldn't be listed. Connect your Shopify store in Settings and rebuild Business DNA, or enter the blog ID.</>
                              : <>Your blogs couldn't be listed: the Shopify token needs the <strong>read_content</strong> permission. Enter the blog ID from Shopify admin.</>}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <details className="gen-more">
                  <summary>
                    More options
                    <span className="gen-more__hint">{AI_LABEL[aiModel] || aiModel} · {IMAGE_LABEL[imageMode] || imageMode}</span>
                    <ChevronDown aria-hidden="true" />
                  </summary>
                  <div className="gen-more__body form-grid">
                    <div className="form-group blog-seg-field">
                      <span className="form-label">AI model</span>
                      <Segmented value={aiModel} onChange={setAiModel} options={AI_OPTIONS} ariaLabel="AI model" />
                      <div className="form-helper">Gemini is recommended.</div>
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="ga-images">Article images</label>
                      <select id="ga-images" className="form-select" value={imageMode} onChange={e => setImageMode(e.target.value)}>
                        <option value="mixed">ChatGPT + store</option>
                        <option value="ai">ChatGPT only</option>
                        <option value="products">Store photos</option>
                      </select>
                      {imageMode !== 'products' && <div className="form-helper">Adds about a minute while the images are made and checked.</div>}
                    </div>
                  </div>
                </details>
              </div>

              <div className="gen-actions">
                {limitReached && (
                  <div className="callout callout--danger mb-16">
                    <AlertCircle size={18} />
                    <span>You've used all {usage.limit} articles on your plan this month. <Link to="/plan">Upgrade your plan</Link> to write more.</span>
                  </div>
                )}
                {instantPublishing && (
                  <div className="callout callout--info mb-16">
                    <Info size={18} />
                    <span>Writing and publishing your article. This takes a few minutes, so keep this page open.</span>
                  </div>
                )}
                <div className="form-actions">
                  <button className="btn btn-secondary" onClick={handleGenerateAndPublish} disabled={busy || limitReached}>
                    {instantPublishing ? <><Loader2 size={16} className="spinning" /> Publishing…</> : <><Zap size={16} /> Generate and publish</>}
                  </button>
                  <button className="btn btn-primary" onClick={handleGenerate} disabled={busy || limitReached}>
                    {generating ? <><Loader2 size={16} className="spinning" /> Generating…</> : <><Sparkles size={16} /> Generate article</>}
                  </button>
                </div>
              </div>
            </Section>

            {/* The article */}
            {article && (
              <div ref={resultRef} className="gen-result slide-up">
                <Section
                  title="Your article"
                  actions={(
                    <>
                      <Segmented size="sm" value={editMode ? 'edit' : 'preview'} onChange={(v) => setEditMode(v === 'edit')} options={VIEW_OPTIONS} ariaLabel="Preview or edit" />
                      <button className="btn btn-ghost btn-sm" onClick={copyHtml}><Copy size={14} /> Copy HTML</button>
                    </>
                  )}
                >
                  {editMode ? (
                    <div className="form-grid">
                      <div className="form-group span-all">
                        <label className="form-label" htmlFor="ga-ed-title">Title</label>
                        <input id="ga-ed-title" className="form-input" value={editedArticle?.title || ''} onChange={setEdited('title')} />
                      </div>
                      <div className="form-group span-all">
                        <label className="form-label" htmlFor="ga-ed-seo-title">SEO title <span className="blog-optional">(50–60 characters)</span></label>
                        <input id="ga-ed-seo-title" className="form-input" value={editedArticle?.seoTitle || ''} onChange={setEdited('seoTitle')} />
                        <div className="form-helper">{(editedArticle?.seoTitle || '').length} characters</div>
                      </div>
                      <div className="form-group span-all">
                        <label className="form-label" htmlFor="ga-ed-meta">Meta description <span className="blog-optional">(150–160 characters)</span></label>
                        <textarea id="ga-ed-meta" className="form-textarea" rows={2} value={editedArticle?.seoDescription || ''} onChange={setEdited('seoDescription')} />
                        <div className="form-helper">{(editedArticle?.seoDescription || '').length} characters</div>
                      </div>
                      <div className="form-group span-all">
                        <label className="form-label" htmlFor="ga-ed-tags">Tags <span className="blog-optional">(comma-separated)</span></label>
                        <input id="ga-ed-tags" className="form-input" value={editedArticle?.tags || ''} onChange={setEdited('tags')} />
                      </div>
                      <div className="form-group span-all">
                        <label className="form-label" htmlFor="ga-ed-summary">Summary</label>
                        <textarea id="ga-ed-summary" className="form-textarea" rows={2} value={editedArticle?.summary || ''} onChange={setEdited('summary')} />
                      </div>
                      <div className="form-group span-all">
                        <label className="form-label" htmlFor="ga-ed-body">Body HTML</label>
                        <textarea id="ga-ed-body" className="form-textarea gen-code" rows={15} value={editedArticle?.bodyHtml || ''} onChange={setEdited('bodyHtml')} />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <h2 className="gen-preview__title">{currentArticle.title}</h2>
                      {currentArticle.tags?.split(',').filter(t => t.trim()).length > 0 && (
                        <div className="gen-preview__tags">
                          {currentArticle.tags.split(',').filter(t => t.trim()).map(tag => (
                            <span key={tag} className="badge badge-purple">{tag.trim()}</span>
                          ))}
                        </div>
                      )}
                      <div className="gen-preview__meta">
                        {currentArticle.wordCount || '—'} words · {AI_LABEL[aiModel] || aiModel}
                      </div>
                      <div className="article-preview" dangerouslySetInnerHTML={{ __html: currentArticle.bodyHtml }} />
                    </div>
                  )}
                </Section>
              </div>
            )}

            {/* Scores, search listing and images */}
            {article && (
              <div className="gen-details">
                <div className="grid-2">
                  <SeoScoreCard seoScore={currentArticle.seoScore} />
                  <SeoScoreCard seoScore={currentArticle.aeoScore} title="AI answer score" />
                </div>

                <Section title="Search listing" description="The title and description search engines show.">
                  <div className="gen-meta">
                    <div className="gen-meta__label">SEO title</div>
                    <p className="gen-meta__title">{currentArticle.seoTitle || '—'}</p>
                    <div className="form-helper">{(currentArticle.seoTitle || '').length} characters</div>
                  </div>
                  <div className="gen-meta">
                    <div className="gen-meta__label">Meta description</div>
                    <p className="gen-meta__text">{currentArticle.seoDescription || '—'}</p>
                    <div className="form-helper">{(currentArticle.seoDescription || '').length} characters</div>
                  </div>
                  {currentArticle.imagePrompts?.length > 0 && (
                    <div className="gen-meta">
                      <div className="gen-meta__label">Image prompts</div>
                      {currentArticle.imagePrompts.map((p, i) => (
                        <p key={i} className="gen-meta__prompt">{p}</p>
                      ))}
                    </div>
                  )}
                </Section>

                {/* Images ChatGPT made for this article */}
                {article?.aiImages?.length > 0 && (
                  <Section title="ChatGPT images" description="Made for this article.">
                    <div className="gen-images">
                      {article.aiImages.map((img) => (
                        <a key={img.src} href={img.src} target="_blank" rel="noreferrer">
                          <img src={img.src} alt={img.alt} loading="lazy" />
                        </a>
                      ))}
                    </div>
                  </Section>
                )}

                {/* Auto-inserted product images */}
                {article?.insertedImages?.length > 0 && (
                  <Section title="Product photos in the article" description="Real product photos the AI was given to place in the article.">
                    <div className="gen-images">
                      {article.insertedImages.map((img, i) => (
                        <figure key={i}>
                          <img src={img.imageUrl} alt={img.alt} loading="lazy" />
                          <figcaption title={img.title}>{img.title}</figcaption>
                        </figure>
                      ))}
                    </div>
                  </Section>
                )}
              </div>
            )}
          </div>

          {/* Side panel: publish (after) or usage and how it works (before) */}
          <div className="gen-aside">
            {article && (
              <Section className="gen-publish" title="Publish to Shopify">
                {article.featuredImage ? (
                  <figure className="gen-hero">
                    <img src={article.featuredImage.src} alt={article.featuredImage.alt} loading="lazy" />
                    <figcaption className="gen-hero__cap">
                      {article.featuredImage.source === 'ai'
                        ? 'Made with ChatGPT for this article'
                        : <>From <strong>{article.featuredImage.productTitle}</strong></>}
                    </figcaption>
                    <div className="gen-hero__sub">Becomes the article's main image on Shopify.</div>
                  </figure>
                ) : (
                  <div className="callout callout--warning callout--compact mb-16">
                    <AlertTriangle size={15} />
                    <div>
                      <p><strong>No featured image</strong></p>
                      <p>No product in your store matched this topic, so the article publishes without a main image. Try a topic closer to your catalog, or pick an image in Shopify.</p>
                    </div>
                  </div>
                )}

                <dl className="kv">
                  <dt>Blog</dt><dd>{blogName || selectedBlog || '—'}</dd>
                  <dt>Length</dt><dd>{currentArticle.wordCount || '—'} words</dd>
                  {currentArticle.seoScore?.score != null && <><dt>SEO score</dt><dd>{currentArticle.seoScore.score}</dd></>}
                  {currentArticle.aeoScore?.score != null && <><dt>AI answer score</dt><dd>{currentArticle.aeoScore.score}</dd></>}
                </dl>

                <SettingRow title="Save as draft" description="Keep it hidden on your store for now." htmlFor="draft">
                  <Switch id="draft" checked={publishAsDraft} onChange={setPublishAsDraft} />
                </SettingRow>

                <button className="btn btn-primary w-full" onClick={handlePublish} disabled={publishing}>
                  {publishing ? <><Loader2 size={16} className="spinning" /> Publishing…</> : <><Send size={16} /> {publishAsDraft ? 'Save as draft' : 'Publish article'}</>}
                </button>
                {editMode && <div className="gen-publish__hint">Your edits are included.</div>}
              </Section>
            )}

            {usage && (
              <Section
                className="gen-usage"
                title="This month"
                description={<><span className="gen-usage__plan">{usage.planName || usage.planId}</span> plan</>}
              >
                <div className="gen-usage__line">
                  <span>Articles used</span>
                  <strong>{usage.used} of {usage.limit}</strong>
                </div>
                <div
                  className={`meter${limitReached ? ' is-full' : ''}`}
                  role="progressbar"
                  aria-label="Articles used this month"
                  aria-valuemin={0}
                  aria-valuemax={usage.limit}
                  aria-valuenow={usage.used}
                >
                  <div style={{ width: `${usedPct}%` }} />
                </div>
                <div className="gen-usage__note">
                  {limitReached
                    ? <>Limit reached. <Link to="/plan">Upgrade your plan</Link> to write more.</>
                    : <>{usage.remaining} left this month.</>}
                </div>
              </Section>
            )}

            {!article && (
              <Section className="gen-tips" title="How it works">
                <ol className="steps-list">
                  <li><span>Describe the topic. Add a keyword if you want to rank for a particular search.</span></li>
                  <li><span>Generate. Writing takes 1–2 minutes, or 2–4 with ChatGPT images.</span></li>
                  <li><span>Review the article and its scores, edit if you like, then publish or save a draft. Generate and publish does it all in one go.</span></li>
                </ol>
                <div className="gen-tips__tip">
                  <Lightbulb aria-hidden="true" />
                  <span>Articles link to your products and use their photos, taken from your Business DNA.</span>
                </div>
              </Section>
            )}
          </div>
        </div>
      )}

      {/* Generating overlay */}
      {generating && (
        <div className="loading-overlay">
          <div className="spinner spinner-lg" />
          <div className="loading-text gen-overlay__title">Writing your article…</div>
          <div className="loading-text">Using {aiModel === 'gemini' ? 'Google Gemini' : 'DeepSeek'} with your Business DNA</div>
          <div className="loading-text gen-overlay__note">
            {imageMode === 'products' ? 'Writing and editing. This may take 1–2 minutes.' : 'Writing, editing, then making and checking the images. This may take 2–4 minutes.'}
          </div>
        </div>
      )}
    </div>
  );
}
