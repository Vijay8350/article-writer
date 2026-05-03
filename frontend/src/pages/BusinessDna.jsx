import React, { useState, useEffect } from 'react';
import { Dna, RefreshCw, Package, FolderOpen, FileText, Tag, Loader2 } from 'lucide-react';
import { getBusinessDna, fetchBusinessDna, clearBusinessDna } from '../lib/api';
import toast from 'react-hot-toast';

export default function BusinessDna() {
  const [dna, setDna] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    getBusinessDna()
      .then(res => { setDna(res.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleFetch = async () => {
    setFetching(true);
    try {
      const res = await fetchBusinessDna();
      setDna(res.data);
      toast.success('Business DNA fetched successfully!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to fetch Business DNA');
    }
    setFetching(false);
  };

  const handleClear = async () => {
    await clearBusinessDna();
    setDna(null);
    toast.success('Business DNA cleared');
  };

  if (loading) {
    return <div className="page-container"><div className="empty-state"><div className="spinner spinner-lg" /></div></div>;
  }

  return (
    <div className="page-container fade-in">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1>🧬 Business DNA</h1>
          <p>Analyze your store to generate contextual, relevant articles</p>
        </div>
        <div className="flex gap-8">
          {dna && <button className="btn btn-danger btn-sm" onClick={handleClear}>Clear</button>}
          <button className="btn btn-primary" onClick={handleFetch} disabled={fetching}>
            {fetching ? <><Loader2 size={16} className="spinning" /> Analyzing Store...</> : <><RefreshCw size={16} /> {dna ? 'Refresh DNA' : 'Fetch Business DNA'}</>}
          </button>
        </div>
      </div>

      {/* Fetching overlay */}
      {fetching && (
        <div className="loading-overlay">
          <div className="spinner spinner-lg" />
          <div className="loading-text">Analyzing your Shopify store...</div>
          <div className="loading-text" style={{ fontSize: 12 }}>Fetching products, collections, articles, and pages</div>
        </div>
      )}

      {!dna ? (
        <div className="card">
          <div className="card-body">
            <div className="empty-state">
              <Dna size={48} />
              <h3>No Business DNA Yet</h3>
              <p>Click "Fetch Business DNA" to analyze your Shopify store. This will scan your products, collections, existing articles, and pages to understand your business.</p>
              <button className="btn btn-primary btn-lg" onClick={handleFetch} disabled={fetching}>
                <Dna size={20} /> Fetch Business DNA
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Store Overview */}
          <div className="stats-grid slide-up">
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'rgba(139,92,246,0.12)' }}>🏪</div>
              <div className="stat-value" style={{ fontSize: 18 }}>{dna.shop?.name}</div>
              <div className="stat-label">{dna.shop?.domain}</div>
            </div>
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

          {/* Warnings about missing scopes */}
          {dna.warnings?.length > 0 && (
            <div className="card mb-24 slide-up" style={{ borderColor: 'rgba(245,158,11,0.3)' }}>
              <div className="card-header" style={{ background: 'rgba(245,158,11,0.06)' }}>
                <h3>⚠️ Permission Warnings</h3>
              </div>
              <div className="card-body">
                {dna.warnings.map((w, i) => (
                  <p key={i} style={{ fontSize: 13, color: 'var(--accent-warning)', marginBottom: 8 }}>• {w}</p>
                ))}
                <p className="form-helper mt-16">
                  To fix: Go to <strong>Shopify Admin → Settings → Apps and sales channels → Develop apps</strong> → Select your app → 
                  <strong> Configuration → Admin API access scopes</strong> → Add <strong>read_content</strong> and <strong>write_content</strong> scopes → Save → Reinstall app.
                </p>
              </div>
            </div>
          )}

          {/* Analysis */}
          <div className="dna-grid">
            {/* Niche & Audience */}
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
                <div className="dna-section">
                  <div className="dna-section-title">Product Types</div>
                  <div className="dna-tags">
                    {dna.analysis?.productTypes?.map(t => <span key={t} className="dna-tag">{t}</span>)}
                  </div>
                </div>
                <div className="dna-section">
                  <div className="dna-section-title">Top Tags</div>
                  <div className="dna-tags">
                    {dna.analysis?.topTags?.slice(0, 12).map(t => <span key={t} className="dna-tag">{t}</span>)}
                  </div>
                </div>
              </div>
            </div>

            {/* Collections */}
            <div className="card slide-up">
              <div className="card-header"><h3>📂 Collections ({dna.collections?.length})</h3></div>
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

          {/* Products */}
          <div className="card mt-24 slide-up">
            <div className="card-header"><h3>📦 Products ({dna.products?.length})</h3></div>
            <div className="card-body">
              <div className="table-container" style={{ maxHeight: 400, overflowY: 'auto' }}>
                <table className="data-table">
                  <thead><tr><th>Product</th><th>Type</th><th>Handle</th></tr></thead>
                  <tbody>
                    {dna.products?.slice(0, 50).map(p => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{p.title}</td>
                        <td><span className="badge badge-purple">{p.productType || '—'}</span></td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>/products/{p.handle}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {dna.products?.length > 50 && <p className="form-helper mt-16">Showing 50 of {dna.products.length} products</p>}
              </div>
            </div>
          </div>

          {/* Existing Articles */}
          <div className="card mt-24 slide-up">
            <div className="card-header"><h3>📝 Existing Articles ({dna.articles?.length})</h3></div>
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
            Last fetched: {new Date(dna.fetchedAt).toLocaleString()}
          </p>
        </>
      )}
      <style>{`.spinning { animation: spin 1s linear infinite; }`}</style>
    </div>
  );
}
