import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dna, PenLine, FileText, Settings, Zap, BarChart3 } from 'lucide-react';
import { getBusinessDna, getSettings } from '../lib/api';

export default function Dashboard() {
  const navigate = useNavigate();
  const [dna, setDna] = useState(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getSettings().catch(() => ({ data: {} })),
      getBusinessDna().catch(() => ({ data: null })),
    ]).then(([settingsRes, dnaRes]) => {
      setConnected(settingsRes.data?.connected || false);
      setDna(dnaRes.data || null);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="page-container fade-in">
        <div className="empty-state"><div className="spinner spinner-lg" /><p>Loading dashboard...</p></div>
      </div>
    );
  }

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <h1>📊 Dashboard</h1>
        <p>Your Shopify Article Writer command center</p>
      </div>

      {/* Quick Stats */}
      <div className="stats-grid">
        <div className="stat-card" onClick={() => navigate('/settings')} style={{ cursor: 'pointer' }}>
          <div className="stat-icon" style={{ background: connected ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)' }}>
            {connected ? '🟢' : '🔴'}
          </div>
          <div className="stat-value" style={{ fontSize: 18 }}>{connected ? 'Connected' : 'Not Connected'}</div>
          <div className="stat-label">Shopify Store</div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(139,92,246,0.12)' }}>🧬</div>
          <div className="stat-value" style={{ fontSize: 18 }}>{dna ? 'Ready' : 'Not Fetched'}</div>
          <div className="stat-label">Business DNA</div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(6,182,212,0.12)' }}>📦</div>
          <div className="stat-value">{dna?.analysis?.totalProducts || 0}</div>
          <div className="stat-label">Products</div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'rgba(245,158,11,0.12)' }}>📝</div>
          <div className="stat-value">{dna?.analysis?.totalArticles || 0}</div>
          <div className="stat-label">Existing Articles</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card mb-24">
        <div className="card-header">
          <h2>⚡ Quick Actions</h2>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
            {!connected && (
              <ActionCard
                icon={<Settings size={24} />}
                title="Connect Shopify Store"
                desc="Enter your store URL and access token to get started"
                color="var(--accent-warning)"
                onClick={() => navigate('/settings')}
              />
            )}
            {connected && !dna && (
              <ActionCard
                icon={<Dna size={24} />}
                title="Fetch Business DNA"
                desc="Analyze your store's products, collections, and content"
                color="var(--accent-primary)"
                onClick={() => navigate('/business-dna')}
              />
            )}
            {connected && dna && (
              <ActionCard
                icon={<PenLine size={24} />}
                title="Generate New Article"
                desc="Create a SEO-optimized blog post with AI"
                color="var(--accent-success)"
                onClick={() => navigate('/generate')}
              />
            )}
            <ActionCard
              icon={<FileText size={24} />}
              title="Manage Articles"
              desc="View, edit, and enhance existing blog articles"
              color="var(--accent-secondary)"
              onClick={() => navigate('/articles')}
            />
          </div>
        </div>
      </div>

      {/* Business DNA Summary */}
      {dna && (
        <div className="card slide-up">
          <div className="card-header">
            <h2>🧬 Business DNA Summary</h2>
            <span className="badge badge-success">Active</span>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
              <div className="dna-section">
                <div className="dna-section-title">Store</div>
                <p style={{ fontSize: 16, fontWeight: 600 }}>{dna.shop?.name}</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{dna.shop?.domain}</p>
              </div>
              <div className="dna-section">
                <div className="dna-section-title">Niche</div>
                <p style={{ fontSize: 14 }}>{dna.analysis?.niche}</p>
              </div>
              <div className="dna-section">
                <div className="dna-section-title">Top Tags</div>
                <div className="dna-tags">
                  {dna.analysis?.topTags?.slice(0, 6).map(tag => (
                    <span key={tag} className="dna-tag">{tag}</span>
                  ))}
                </div>
              </div>
              <div className="dna-section">
                <div className="dna-section-title">Content</div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {dna.analysis?.totalBlogs} blogs · {dna.analysis?.totalCollections} collections · {dna.analysis?.totalPages} pages
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionCard({ icon, title, desc, color, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', gap: 16, padding: 20, borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-secondary)', cursor: 'pointer',
        transition: 'all 0.2s', background: 'var(--bg-secondary)',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-secondary)'; e.currentTarget.style.transform = 'none'; }}
    >
      <div style={{ color, flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{desc}</div>
      </div>
    </div>
  );
}
