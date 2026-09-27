import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Dna, RefreshCw, Loader2, Store, Instagram } from 'lucide-react';
import {
  getBusinessDna, fetchBusinessDna, fetchSocialBusinessDna, clearBusinessDna, getInstagramAccounts,
} from '../lib/api';
import toast from 'react-hot-toast';

const SOURCES = {
  shopify: {
    label: 'Shopify store',
    icon: Store,
    hint: 'Reads products, collections, pages and blog articles from your connected store via the Admin API.',
    loading: 'Analyzing your Shopify store...',
    loadingSub: 'Fetching products, collections, articles, and pages',
  },
  social: {
    label: 'Instagram + Website',
    icon: Instagram,
    hint: 'Reads your Instagram profile and posts plus your public website (and its product catalog if it runs on Shopify). AI then turns it into a brand profile: voice, audience, content pillars and keywords.',
    loading: 'Building your brand DNA...',
    loadingSub: 'Reading Instagram and your website, then analyzing with AI',
  },
};

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString());

export default function BusinessDna() {
  const [dna, setDna] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);

  const [source, setSource] = useState('shopify');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [igAccounts, setIgAccounts] = useState([]);
  const [igAccountId, setIgAccountId] = useState('');

  useEffect(() => {
    Promise.all([
      getBusinessDna().catch(() => ({ data: null })),
      getInstagramAccounts().catch(() => ({ data: [] })),
    ]).then(([dnaRes, igRes]) => {
      const current = dnaRes.data;
      const accounts = igRes.data || [];
      setDna(current);
      setIgAccounts(accounts);
      // Pre-fill the builder from the last build so "Refresh" is one click.
      setSource(current?.source || 'shopify');
      setWebsiteUrl(current?.inputs?.websiteUrl || current?.website?.url || '');
      setIgAccountId(current?.inputs?.instagramAccountId || accounts[0]?.id || '');
      setLoading(false);
    });
  }, []);

  const handleFetch = async () => {
    if (source === 'social' && !websiteUrl.trim() && !igAccountId) {
      return toast.error('Enter your website URL or pick an Instagram account');
    }
    setFetching(true);
    try {
      const res = source === 'social'
        ? await fetchSocialBusinessDna({ websiteUrl: websiteUrl.trim() || undefined, instagramAccountId: igAccountId || undefined })
        : await fetchBusinessDna();
      setDna(res.data);
      toast.success('Business DNA ready!');
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

  if (loading) {
    return <div className="page-container"><div className="empty-state"><div className="spinner spinner-lg" /></div></div>;
  }

  const sourceInfo = SOURCES[source];
  const selectedAccount = igAccounts.find(a => a.id === igAccountId);
  const isRefresh = dna && (dna.source || 'shopify') === source;

  return (
    <div className="page-container fade-in">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1>🧬 Business DNA</h1>
          <p>Teach the AI your brand so articles are contextual, on-voice and link to real products</p>
        </div>
        {dna && <button className="btn btn-danger btn-sm" onClick={handleClear}>Clear</button>}
      </div>

      {fetching && (
        <div className="loading-overlay">
          <div className="spinner spinner-lg" />
          <div className="loading-text">{sourceInfo.loading}</div>
          <div className="loading-text" style={{ fontSize: 12 }}>{sourceInfo.loadingSub}</div>
        </div>
      )}

      {/* Builder: pick a source */}
      <div className="card mb-24">
        <div className="card-header"><h2>Build from</h2></div>
        <div className="card-body">
          <div className="flex gap-8 mb-16">
            {Object.entries(SOURCES).map(([id, s]) => (
              <button
                key={id}
                className={`btn ${source === id ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1 }}
                onClick={() => setSource(id)}
              >
                <s.icon size={16} /> {s.label}
              </button>
            ))}
          </div>
          <div className="form-helper mb-16">{sourceInfo.hint}</div>

          {source === 'social' && (
            <>
              <div className="form-group">
                <label className="form-label">Instagram account</label>
                {igAccounts.length > 0 ? (
                  <select className="form-select" value={igAccountId} onChange={e => setIgAccountId(e.target.value)}>
                    <option value="">None (website only)</option>
                    {igAccounts.map(a => <option key={a.id} value={a.id}>@{a.username || a.ig_user_id}</option>)}
                  </select>
                ) : (
                  <div className="form-helper">
                    No Instagram account connected yet. <Link to="/instagram">Connect one on the Instagram page</Link>, or build from your website only.
                  </div>
                )}
                {selectedAccount?.token_error && (
                  <div className="form-helper" style={{ color: 'var(--accent-warning)' }}>
                    ⚠️ This account's token has a problem ({selectedAccount.token_error}). Reconnect it on the <Link to="/instagram">Instagram page</Link> if the build fails.
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Website URL</label>
                <input
                  className="form-input"
                  value={websiteUrl}
                  onChange={e => setWebsiteUrl(e.target.value)}
                  placeholder="yourbrand.com"
                />
                <div className="form-helper">Leave blank to use the website in your Instagram bio.</div>
              </div>
            </>
          )}

          <button className="btn btn-primary w-full" onClick={handleFetch} disabled={fetching}>
            {fetching
              ? <><Loader2 size={16} className="spinning" /> Working...</>
              : <><RefreshCw size={16} /> {isRefresh ? 'Refresh Business DNA' : 'Build Business DNA'}</>}
          </button>
          {dna && !isRefresh && (
            <div className="form-helper mt-16">This replaces your current Business DNA (built from {SOURCES[dna.source || 'shopify'].label}).</div>
          )}
        </div>
      </div>

      {!dna ? (
        <div className="card">
          <div className="card-body">
            <div className="empty-state">
              <Dna size={48} />
              <h3>No Business DNA Yet</h3>
              <p>Pick a source above and build it. Every article, scheduled post and campaign in this workspace uses it for context, product links and images.</p>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="stats-grid slide-up">
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'rgba(139,92,246,0.12)' }}>🏪</div>
              <div className="stat-value" style={{ fontSize: 18 }}>{dna.shop?.name}</div>
              <div className="stat-label">{dna.shop?.domain || (dna.instagram ? `@${dna.instagram.username}` : '')}</div>
            </div>
            {dna.instagram && (
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'rgba(236,72,153,0.12)' }}>📸</div>
                <div className="stat-value">{fmt(dna.instagram.followersCount)}</div>
                <div className="stat-label">Instagram followers</div>
              </div>
            )}
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'rgba(6,182,212,0.12)' }}>📦</div>
              <div className="stat-value">{dna.analysis?.totalProducts}</div>
              <div className="stat-label">Products</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'rgba(16,185,129,0.12)' }}>📂</div>
              <div className="stat-value">{dna.analysis?.totalCollections}</div>
              <div className="stat-label">Collections</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'rgba(245,158,11,0.12)' }}>📝</div>
              <div className="stat-value">{dna.analysis?.totalArticles}</div>
              <div className="stat-label">Articles</div>
            </div>
          </div>

          {dna.warnings?.length > 0 && (
            <div className="card mb-24 slide-up" style={{ borderColor: 'rgba(245,158,11,0.3)' }}>
              <div className="card-header" style={{ background: 'rgba(245,158,11,0.06)' }}>
                <h3>⚠️ Heads up</h3>
              </div>
              <div className="card-body">
                {dna.warnings.map((w, i) => (
                  <p key={i} style={{ fontSize: 13, color: 'var(--accent-warning)', marginBottom: 8 }}>• {w}</p>
                ))}
                {dna.warnings.some(w => w.includes('read_content')) && (
                  <p className="form-helper mt-16">
                    To fix: Go to <strong>Shopify Admin → Settings → Apps and sales channels → Develop apps</strong> → Select your app →
                    <strong> Configuration → Admin API access scopes</strong> → Add <strong>read_content</strong> and <strong>write_content</strong> scopes → Save → Reinstall app.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* AI brand profile (Instagram + Website DNA) */}
          {dna.brand && (
            <div className="card mb-24 slide-up">
              <div className="card-header">
                <h3>🧬 Brand Profile</h3>
                <span className="badge badge-purple">by {dna.brand.aiProvider === 'deepseek' ? 'DeepSeek' : 'Gemini'}</span>
              </div>
              <div className="card-body">
                {dna.brand.summary && <p style={{ fontSize: 15, marginBottom: 20 }}>{dna.brand.summary}</p>}
                <div className="dna-grid">
                  <div>
                    {dna.brand.voice && (
                      <div className="dna-section">
                        <div className="dna-section-title">Brand Voice</div>
                        <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{dna.brand.voice}</p>
                      </div>
                    )}
                    {dna.brand.valuePropositions?.length > 0 && (
                      <div className="dna-section">
                        <div className="dna-section-title">What Makes It Different</div>
                        <ul style={{ fontSize: 14, color: 'var(--text-secondary)', paddingLeft: 18 }}>
                          {dna.brand.valuePropositions.map(v => <li key={v}>{v}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                  <div>
                    {dna.brand.contentPillars?.length > 0 && (
                      <div className="dna-section">
                        <div className="dna-section-title">Content Pillars</div>
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
              </div>
            </div>
          )}

          {(dna.instagram || dna.website) && (
            <div className="dna-grid mb-24">
              {dna.instagram && (
                <div className="card slide-up">
                  <div className="card-header">
                    <h3>📸 Instagram</h3>
                    <a href={`https://www.instagram.com/${dna.instagram.username}/`} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
                      @{dna.instagram.username}
                    </a>
                  </div>
                  <div className="card-body" style={{ maxHeight: 420, overflowY: 'auto' }}>
                    {dna.instagram.name && <p style={{ fontWeight: 600 }}>{dna.instagram.name}</p>}
                    {dna.instagram.biography && (
                      <p style={{ fontSize: 14, color: 'var(--text-secondary)', whiteSpace: 'pre-line', margin: '6px 0' }}>{dna.instagram.biography}</p>
                    )}
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                      {fmt(dna.instagram.followersCount)} followers · {fmt(dna.instagram.mediaCount)} posts
                    </p>
                    {dna.instagram.topHashtags?.length > 0 && (
                      <div className="dna-section">
                        <div className="dna-section-title">Top Hashtags</div>
                        <div className="dna-tags">{dna.instagram.topHashtags.map(h => <span key={h} className="dna-tag">{h}</span>)}</div>
                      </div>
                    )}
                    {dna.instagram.recentPosts?.length > 0 && (
                      <div className="dna-section">
                        <div className="dna-section-title">Recent Posts</div>
                        {dna.instagram.recentPosts.map((p, i) => (
                          <div key={p.permalink || i} style={{ padding: '8px 0', borderBottom: '1px solid var(--border-secondary)', fontSize: 13 }}>
                            <div style={{ color: 'var(--text-secondary)' }}>
                              {p.caption ? (p.caption.length > 140 ? `${p.caption.slice(0, 140)}…` : p.caption) : <em>No caption</em>}
                            </div>
                            <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
                              {p.likeCount != null && <>❤ {fmt(p.likeCount)} · </>}
                              {p.commentsCount != null && <>💬 {fmt(p.commentsCount)} · </>}
                              {p.timestamp && new Date(p.timestamp).toLocaleDateString()}
                              {p.permalink && <> · <a href={p.permalink} target="_blank" rel="noreferrer">View</a></>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {dna.website && (
                <div className="card slide-up">
                  <div className="card-header">
                    <h3>🌐 Website</h3>
                    <span className={`badge ${dna.website.isShopify ? 'badge-success' : 'badge-info'}`}>
                      {dna.website.isShopify ? 'Shopify storefront' : 'Website'}
                    </span>
                  </div>
                  <div className="card-body">
                    <a href={dna.website.url} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>{dna.website.hostname}</a>
                    {dna.website.title && <p style={{ fontSize: 14, marginTop: 6 }}>{dna.website.title}</p>}
                    {dna.website.description && (
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '6px 0 16px' }}>{dna.website.description}</p>
                    )}
                    {dna.website.headings?.length > 0 && (
                      <div className="dna-section">
                        <div className="dna-section-title">Key Headings</div>
                        <div className="dna-tags">{dna.website.headings.map(h => <span key={h} className="dna-tag">{h}</span>)}</div>
                      </div>
                    )}
                    {Object.keys(dna.website.socialLinks || {}).length > 0 && (
                      <div className="dna-section">
                        <div className="dna-section-title">Social Profiles</div>
                        {Object.entries(dna.website.socialLinks).map(([net, url]) => (
                          <p key={net} style={{ fontSize: 13 }}><a href={url} target="_blank" rel="noreferrer">{url.replace(/^https:\/\//, '')}</a></p>
                        ))}
                      </div>
                    )}
                    {dna.website.aboutUrl && (
                      <p className="form-helper">Brand story read from <a href={dna.website.aboutUrl} target="_blank" rel="noreferrer">{new URL(dna.website.aboutUrl).pathname}</a></p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="dna-grid">
            <div className="card slide-up">
              <div className="card-header"><h3>🎯 Business Analysis</h3></div>
              <div className="card-body">
                <div className="dna-section">
                  <div className="dna-section-title">Niche</div>
                  <p style={{ fontSize: 15 }}>{dna.analysis?.niche}</p>
                </div>
                <div className="dna-section">
                  <div className="dna-section-title">Target Audience</div>
                  <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{dna.analysis?.targetAudience}</p>
                </div>
                {dna.analysis?.productTypes?.length > 0 && (
                  <div className="dna-section">
                    <div className="dna-section-title">Product Types</div>
                    <div className="dna-tags">
                      {dna.analysis.productTypes.map(t => <span key={t} className="dna-tag">{t}</span>)}
                    </div>
                  </div>
                )}
                {dna.analysis?.topTags?.length > 0 && (
                  <div className="dna-section">
                    <div className="dna-section-title">Top Tags</div>
                    <div className="dna-tags">
                      {dna.analysis.topTags.slice(0, 12).map(t => <span key={t} className="dna-tag">{t}</span>)}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="card slide-up">
              <div className="card-header"><h3>📂 Collections ({dna.collections?.length || 0})</h3></div>
              <div className="card-body" style={{ maxHeight: 300, overflowY: 'auto' }}>
                {dna.collections?.map(c => (
                  <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border-secondary)', fontSize: 14 }}>
                    <span style={{ fontWeight: 500 }}>{c.title}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 12, marginLeft: 8 }}>/collections/{c.handle}</span>
                  </div>
                ))}
                {(!dna.collections || dna.collections.length === 0) && <p style={{ color: 'var(--text-muted)' }}>No collections found</p>}
              </div>
            </div>
          </div>

          <div className="card mt-24 slide-up">
            <div className="card-header"><h3>📦 Products ({dna.products?.length || 0})</h3></div>
            <div className="card-body">
              {dna.products?.length > 0 ? (
                <div className="table-container" style={{ maxHeight: 400, overflowY: 'auto' }}>
                  <table className="data-table">
                    <thead><tr><th>Product</th><th>Type</th><th>Handle</th></tr></thead>
                    <tbody>
                      {dna.products.slice(0, 50).map(p => (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{p.title}</td>
                          <td><span className="badge badge-purple">{p.productType || '—'}</span></td>
                          <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>/products/{p.handle}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {dna.products.length > 50 && <p className="form-helper mt-16">Showing 50 of {dna.products.length} products</p>}
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)' }}>No products found</p>
              )}
            </div>
          </div>

          <div className="card mt-24 slide-up">
            <div className="card-header"><h3>📝 Existing Articles ({dna.articles?.length || 0})</h3></div>
            <div className="card-body">
              {dna.articles?.length > 0 ? (
                <div className="table-container" style={{ maxHeight: 300, overflowY: 'auto' }}>
                  <table className="data-table">
                    <thead><tr><th>Title</th><th>Blog</th><th>Tags</th></tr></thead>
                    <tbody>
                      {dna.articles.map(a => (
                        <tr key={a.id}>
                          <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{a.title}</td>
                          <td><span className="badge badge-info">{a.blogTitle}</span></td>
                          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{a.tags || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)' }}>No existing articles found</p>
              )}
            </div>
          </div>

          <p className="form-helper mt-16">
            Built from {SOURCES[dna.source || 'shopify'].label} · Last updated: {new Date(dna.fetchedAt).toLocaleString()}
          </p>
        </>
      )}
      <style>{`.spinning { animation: spin 1s linear infinite; }`}</style>
    </div>
  );
}
