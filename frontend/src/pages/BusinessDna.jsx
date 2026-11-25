import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Dna, RefreshCw, Loader2, Store, Instagram, Package, FolderOpen, FileText, AlertTriangle, Heart, MessageCircle, Trash2, Globe,
} from 'lucide-react';
import {
  getBusinessDna, fetchBusinessDna, fetchSocialBusinessDna, clearBusinessDna, getInstagramAccounts, syncCollections,
} from '../lib/api';
import toast from 'react-hot-toast';
import { PageHeader, Section, Segmented, EmptyState, SettingRow } from '../components/ui';
import { showInstagram } from '../lib/embedded';
import '../styles/workspace.css';

const SOURCES = {
  shopify: {
    label: 'Shopify store',
    icon: Store,
    hint: 'Reads products, collections, pages and blog articles from your connected Shopify store.',
    loading: 'Reading your Shopify store…',
    loadingSub: 'Fetching products, collections, articles and pages',
  },
  social: {
    label: 'Instagram + website',
    icon: Instagram,
    hint: 'Reads your Instagram profile and posts and your public website (and its products, if it runs on Shopify). AI then writes a brand profile: voice, audience, content pillars and keywords.',
    loading: 'Building your brand DNA…',
    loadingSub: 'Reading Instagram and your website, then analysing with AI',
  },
};

// Inside the Shopify admin, until the server turns Instagram on: the same build from the
// public website alone (it never needed an Instagram account), and no Instagram data shown.
const WEBSITE_ONLY = {
  label: 'Website',
  icon: Globe,
  hint: 'Reads your public website (and its products, if it runs on Shopify). AI then writes a brand profile: voice, audience, content pillars and keywords.',
  loadingSub: 'Reading your website, then analysing with AI',
};
const visibleSources = () => (showInstagram() ? SOURCES : { ...SOURCES, social: { ...SOURCES.social, ...WEBSITE_ONLY } });
const withoutInstagram = (d) => (d && !showInstagram()
  ? { ...d, instagram: null, warnings: d.warnings?.filter((w) => !/instagram/i.test(w)) }
  : d);

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString());

export default function BusinessDna() {
  const [dna, setDna] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [syncingCollections, setSyncingCollections] = useState(false);

  const [source, setSource] = useState('shopify');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [igAccounts, setIgAccounts] = useState([]);
  const [igAccountId, setIgAccountId] = useState('');
  const igOn = showInstagram();

  useEffect(() => {
    Promise.all([
      getBusinessDna().catch(() => ({ data: null })),
      igOn ? getInstagramAccounts().catch(() => ({ data: [] })) : { data: [] },
    ]).then(([dnaRes, igRes]) => {
      const current = withoutInstagram(dnaRes.data);
      const accounts = igRes.data || [];
      setDna(current);
      setIgAccounts(accounts);
      // Pre-fill the builder from the last build so "Refresh" is one click.
      setSource(current?.source || 'shopify');
      setWebsiteUrl(current?.inputs?.websiteUrl || current?.website?.url || '');
      setIgAccountId(igOn ? current?.inputs?.instagramAccountId || accounts[0]?.id || '' : '');
      setLoading(false);
    });
  }, []);

  // Only the collections change: the rest of the Business DNA stays as it was built.
  const handleSyncCollections = async () => {
    setSyncingCollections(true);
    try {
      const res = await syncCollections();
      setDna((d) => ({ ...d, collections: res.data.collections, collectionsSyncedAt: res.data.syncedAt }));
      toast.success(res.message);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Sync failed');
    }
    setSyncingCollections(false);
  };

  const handleFetch = async () => {
    if (source === 'social' && !websiteUrl.trim() && !igAccountId) {
      return toast.error(igOn ? 'Enter your website URL or pick an Instagram account' : 'Enter your website URL');
    }
    setFetching(true);
    try {
      const res = source === 'social'
        ? await fetchSocialBusinessDna({ websiteUrl: websiteUrl.trim() || undefined, instagramAccountId: igAccountId || undefined })
        : await fetchBusinessDna();
      setDna(withoutInstagram(res.data));
      toast.success('Business DNA ready');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to build Business DNA');
    }
    setFetching(false);
  };

  const handleClear = async () => {
    try {
      await clearBusinessDna();
      setDna(null);
      toast.success('Business DNA cleared');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to clear');
    }
  };

  const confirmClear = () => {
    if (window.confirm('Clear Business DNA for this workspace?\n\nThe AI forgets your products, collections and brand profile until you build it again.')) handleClear();
  };

  if (loading) {
    return <div className="page-container fade-in"><div className="empty-state"><div className="spinner spinner-lg" /></div></div>;
  }

  const sources = visibleSources();
  const sourceInfo = sources[source];
  const selectedAccount = igAccounts.find(a => a.id === igAccountId);
  const isRefresh = dna && (dna.source || 'shopify') === source;
  const builtFrom = dna ? sources[dna.source || 'shopify'].label : null;
  const buildLabel = isRefresh ? 'Refresh Business DNA' : 'Build Business DNA';

  const buildButton = (
    <button className="btn btn-primary" onClick={handleFetch} disabled={fetching}>
      {fetching
        ? <><Loader2 size={16} className="spinning" /> Working…</>
        : <><RefreshCw size={16} /> {buildLabel}</>}
    </button>
  );

  return (
    <div className="page-container fade-in wk-page">
      <PageHeader
        title="Business DNA"
        subtitle="Teach the AI your brand so articles sound like you and link to real products."
        actions={buildButton}
      />

      {fetching && (
        <div className="loading-overlay">
          <div className="spinner spinner-lg" />
          <div className="loading-text">{sourceInfo.loading}</div>
          <div className="loading-text bdna-loading-sub">{sourceInfo.loadingSub}</div>
        </div>
      )}

      <div className="stack">
        {/* Builder: pick a source */}
        <Section
          className="bdna-source"
          title="Build from"
          description={dna
            ? `Last built from ${builtFrom}${dna.fetchedAt ? ` on ${new Date(dna.fetchedAt).toLocaleString()}` : ''}.`
            : 'Choose where the AI learns about your brand.'}
        >
          <Segmented
            value={source}
            onChange={setSource}
            ariaLabel="Build from"
            options={Object.entries(sources).map(([value, s]) => ({ value, label: s.label, icon: s.icon }))}
          />
          <p className="form-helper bdna-source__hint">{sourceInfo.hint}</p>

          {source === 'social' && (
            <div className="form-grid bdna-source__fields">
              {igOn && (
                <div className="form-group">
                  {igAccounts.length > 0 ? (
                    <>
                      <label className="form-label" htmlFor="dna-ig-account">Instagram account</label>
                      <select id="dna-ig-account" className="form-select" value={igAccountId} onChange={e => setIgAccountId(e.target.value)}>
                        <option value="">None (website only)</option>
                        {igAccounts.map(a => <option key={a.id} value={a.id}>@{a.username || a.ig_user_id}</option>)}
                      </select>
                    </>
                  ) : (
                    <>
                      <div className="form-label">Instagram account</div>
                      <div className="form-helper">
                        No Instagram account connected yet. <Link to="/instagram">Connect one</Link>, or build from your website only.
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="form-group">
                <label className="form-label" htmlFor="dna-website">Website URL</label>
                <input
                  id="dna-website"
                  className="form-input"
                  value={websiteUrl}
                  onChange={e => setWebsiteUrl(e.target.value)}
                  placeholder="yourbrand.com"
                />
                <div className="form-helper">{igOn ? 'Leave blank to use the website in your Instagram bio.' : 'Your public website or storefront address.'}</div>
              </div>

              {selectedAccount?.token_error && (
                <div className="callout callout--warning span-all">
                  <AlertTriangle size={16} />
                  <span>
                    This account's sign-in has a problem ({selectedAccount.token_error}). If the build fails, reconnect it on the <Link to="/instagram">Instagram page</Link>.
                  </span>
                </div>
              )}
            </div>
          )}

          {dna && !isRefresh && (
            <div className="callout callout--warning">
              <AlertTriangle size={16} />
              <span>Building from {sourceInfo.label} replaces your current Business DNA (built from {builtFrom}).</span>
            </div>
          )}
        </Section>

        {!dna ? (
          <Section>
            <EmptyState
              icon={Dna}
              title="No Business DNA yet"
              text="Pick a source above and build it. Every article, scheduled post and campaign in this workspace uses it for context, product links and images."
              action={(
                <button className="btn btn-primary" onClick={handleFetch} disabled={fetching}>
                  <RefreshCw size={16} /> Build Business DNA
                </button>
              )}
            />
          </Section>
        ) : (
          <>
            <div className={`stat-row bdna-stats${dna.instagram ? ' has-5' : ''}`}>
              <div className="stat-card bdna-stats__store">
                <div className="stat-icon"><Store size={18} /></div>
                <div className="stat-value">{dna.shop?.name || dna.instagram?.name || dna.website?.hostname || '—'}</div>
                <div className="stat-label">{dna.shop?.domain || (dna.instagram ? `@${dna.instagram.username}` : '')}</div>
              </div>
              {dna.instagram && (
                <div className="stat-card">
                  <div className="stat-icon"><Instagram size={18} /></div>
                  <div className="stat-value">{fmt(dna.instagram.followersCount)}</div>
                  <div className="stat-label">Instagram followers</div>
                </div>
              )}
              <div className="stat-card">
                <div className="stat-icon"><Package size={18} /></div>
                <div className="stat-value">{dna.analysis?.totalProducts}</div>
                <div className="stat-label">Products</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon"><FolderOpen size={18} /></div>
                <div className="stat-value">{dna.analysis?.totalCollections}</div>
                <div className="stat-label">Collections</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon"><FileText size={18} /></div>
                <div className="stat-value">{dna.analysis?.totalArticles}</div>
                <div className="stat-label">Articles</div>
              </div>
            </div>

            {dna.warnings?.length > 0 && (
              <div className="callout callout--warning" role="status">
                <AlertTriangle size={18} />
                <div className="wk-callout-body">
                  <div className="wk-callout-title">Some things need attention</div>
                  <ul className="wk-callout-list">
                    {dna.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                  {dna.warnings.some(w => w.includes('read_content')) && (
                    <>
                      <p className="wk-callout-sub">To fix it in Shopify admin:</p>
                      <ol className="steps-list wk-steps">
                        <li><span>Go to <strong>Settings → Apps and sales channels → Develop apps</strong> and select your app.</span></li>
                        <li><span>Open <strong>Configuration → Admin API access scopes</strong> and add <strong>read_content</strong> and <strong>write_content</strong>.</span></li>
                        <li><span>Save, then reinstall the app.</span></li>
                      </ol>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* AI brand profile (Instagram + website DNA) */}
            {dna.brand && (
              <Section
                title="Brand profile"
                actions={<span className="badge badge-purple">Written by {dna.brand.aiProvider === 'deepseek' ? 'DeepSeek' : 'Gemini'}</span>}
              >
                {dna.brand.summary && <p className="bdna-lead">{dna.brand.summary}</p>}
                <div className="dna-grid">
                  <div>
                    {dna.brand.voice && (
                      <div className="dna-section">
                        <div className="dna-section-title">Brand voice</div>
                        <p className="bdna-text">{dna.brand.voice}</p>
                      </div>
                    )}
                    {dna.brand.valuePropositions?.length > 0 && (
                      <div className="dna-section">
                        <div className="dna-section-title">What makes it different</div>
                        <ul className="bdna-bullets">
                          {dna.brand.valuePropositions.map(v => <li key={v}>{v}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                  <div>
                    {dna.brand.contentPillars?.length > 0 && (
                      <div className="dna-section">
                        <div className="dna-section-title">Content pillars</div>
                        <div className="dna-tags">{dna.brand.contentPillars.map(p => <span key={p} className="dna-tag">{p}</span>)}</div>
                      </div>
                    )}
                    {dna.brand.keywords?.length > 0 && (
                      <div className="dna-section">
                        <div className="dna-section-title">Keywords</div>
                        <div className="dna-tags">{dna.brand.keywords.map(k => <span key={k} className="dna-tag">{k}</span>)}</div>
                      </div>
                    )}
                  </div>
                </div>
              </Section>
            )}

            {(dna.instagram || dna.website) && (
              <div className="grid-2">
                {dna.instagram && (
                  <Section
                    title="Instagram"
                    bodyClassName="bdna-scroll"
                    actions={(
                      <a href={`https://www.instagram.com/${dna.instagram.username}/`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                        @{dna.instagram.username}
                      </a>
                    )}
                  >
                    {dna.instagram.name && <p className="bdna-ig-name">{dna.instagram.name}</p>}
                    {dna.instagram.biography && <p className="bdna-ig-bio">{dna.instagram.biography}</p>}
                    <p className="bdna-ig-counts">
                      {fmt(dna.instagram.followersCount)} followers · {fmt(dna.instagram.mediaCount)} posts
                    </p>
                    {dna.instagram.topHashtags?.length > 0 && (
                      <div className="dna-section">
                        <div className="dna-section-title">Top hashtags</div>
                        <div className="dna-tags">{dna.instagram.topHashtags.map(h => <span key={h} className="dna-tag">{h}</span>)}</div>
                      </div>
                    )}
                    {dna.instagram.recentPosts?.length > 0 && (
                      <div className="dna-section">
                        <div className="dna-section-title">Recent posts</div>
                        {dna.instagram.recentPosts.map((p, i) => (
                          <div key={p.permalink || i} className="bdna-post">
                            <div>
                              {p.caption ? (p.caption.length > 140 ? `${p.caption.slice(0, 140)}…` : p.caption) : <em>No caption</em>}
                            </div>
                            <div className="bdna-post__meta">
                              {p.likeCount != null && <span><Heart size={12} aria-label="Likes" /> {fmt(p.likeCount)}</span>}
                              {p.commentsCount != null && <span><MessageCircle size={12} aria-label="Comments" /> {fmt(p.commentsCount)}</span>}
                              {p.timestamp && <span>{new Date(p.timestamp).toLocaleDateString()}</span>}
                              {p.permalink && <a href={p.permalink} target="_blank" rel="noreferrer">View</a>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Section>
                )}

                {dna.website && (
                  <Section
                    title="Website"
                    actions={(
                      <span className={`badge ${dna.website.isShopify ? 'badge-success' : 'badge-info'}`}>
                        {dna.website.isShopify ? 'Shopify storefront' : 'Website'}
                      </span>
                    )}
                  >
                    <a href={dna.website.url} target="_blank" rel="noreferrer" className="bdna-site">{dna.website.hostname}</a>
                    {dna.website.title && <p className="bdna-site-title">{dna.website.title}</p>}
                    {dna.website.description && <p className="bdna-site-desc">{dna.website.description}</p>}
                    {dna.website.headings?.length > 0 && (
                      <div className="dna-section">
                        <div className="dna-section-title">Key headings</div>
                        <div className="dna-tags">{dna.website.headings.map(h => <span key={h} className="dna-tag">{h}</span>)}</div>
                      </div>
                    )}
                    {Object.keys(dna.website.socialLinks || {}).length > 0 && (
                      <div className="dna-section">
                        <div className="dna-section-title">Social profiles</div>
                        {Object.entries(dna.website.socialLinks).map(([net, url]) => (
                          <p key={net} className="bdna-social"><a href={url} target="_blank" rel="noreferrer">{url.replace(/^https:\/\//, '')}</a></p>
                        ))}
                      </div>
                    )}
                    {dna.website.aboutUrl && (
                      <p className="form-helper">Brand story read from <a href={dna.website.aboutUrl} target="_blank" rel="noreferrer">{new URL(dna.website.aboutUrl).pathname}</a></p>
                    )}
                  </Section>
                )}
              </div>
            )}

            <div className="grid-2">
              <Section title="Business analysis">
                <div className="dna-section">
                  <div className="dna-section-title">Niche</div>
                  <p>{dna.analysis?.niche}</p>
                </div>
                <div className="dna-section">
                  <div className="dna-section-title">Target audience</div>
                  <p className="bdna-text">{dna.analysis?.targetAudience}</p>
                </div>
                {dna.analysis?.productTypes?.length > 0 && (
                  <div className="dna-section">
                    <div className="dna-section-title">Product types</div>
                    <div className="dna-tags">
                      {dna.analysis.productTypes.map(t => <span key={t} className="dna-tag">{t}</span>)}
                    </div>
                  </div>
                )}
                {dna.analysis?.topTags?.length > 0 && (
                  <div className="dna-section">
                    <div className="dna-section-title">Top tags</div>
                    <div className="dna-tags">
                      {dna.analysis.topTags.slice(0, 12).map(t => <span key={t} className="dna-tag">{t}</span>)}
                    </div>
                  </div>
                )}
              </Section>

              <Section
                flush
                title="Collections"
                description={`${dna.collections?.length || 0} in your store`}
                actions={(
                  <button className="btn btn-ghost btn-sm" onClick={handleSyncCollections} disabled={syncingCollections} title="Get the latest collections from Shopify">
                    {syncingCollections ? <Loader2 size={14} className="spinning" /> : <RefreshCw size={14} />} Sync
                  </button>
                )}
              >
                {dna.collections?.length > 0 ? (
                  <div className="bdna-rows">
                    {dna.collections.map(c => (
                      <div key={c.id} className="bdna-row">
                        <strong>{c.title}</strong>
                        <span>/collections/{c.handle}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="bdna-none">No collections found</p>
                )}
              </Section>
            </div>

            <Section flush title="Products" description={`${dna.products?.length || 0} in your store`}>
              {dna.products?.length > 0 ? (
                <>
                  <div className="table-container bdna-table">
                    <table className="data-table">
                      <thead><tr><th>Product</th><th>Type</th><th>Handle</th></tr></thead>
                      <tbody>
                        {dna.products.slice(0, 50).map(p => (
                          <tr key={p.id}>
                            <td className="is-title">{p.title}</td>
                            <td><span className="badge badge-purple">{p.productType || '—'}</span></td>
                            <td className="is-sub">/products/{p.handle}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {dna.products.length > 50 && <p className="bdna-table-foot">Showing 50 of {dna.products.length} products</p>}
                </>
              ) : (
                <p className="bdna-none">No products found</p>
              )}
            </Section>

            <Section flush title="Existing articles" description={`${dna.articles?.length || 0} on your blog`}>
              {dna.articles?.length > 0 ? (
                <div className="table-container bdna-table">
                  <table className="data-table">
                    <thead><tr><th>Title</th><th>Blog</th><th>Tags</th></tr></thead>
                    <tbody>
                      {dna.articles.map(a => (
                        <tr key={a.id}>
                          <td className="is-title">{a.title}</td>
                          <td><span className="badge badge-info">{a.blogTitle}</span></td>
                          <td className="is-sub">{a.tags || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="bdna-none">No existing articles found</p>
              )}
            </Section>

            <Section title="Danger zone" className="danger-zone">
              <SettingRow
                title="Clear Business DNA"
                description="Removes what the AI has learned about your store from this workspace. Articles and campaigns need it, so build it again before writing more."
              >
                <button className="btn btn-danger btn-sm" onClick={confirmClear}><Trash2 size={14} /> Clear</button>
              </SettingRow>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
