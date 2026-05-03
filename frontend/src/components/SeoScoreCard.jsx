import React from 'react';

export default function SeoScoreCard({ seoScore }) {
  if (!seoScore) return null;

  const { score, maxScore, checks } = seoScore;
  const color = score >= 80 ? 'var(--accent-success)' : score >= 50 ? 'var(--accent-warning)' : 'var(--accent-danger)';
  const label = score >= 80 ? 'Excellent' : score >= 50 ? 'Good' : 'Needs Work';

  return (
    <div className="card mb-24">
      <div className="card-header"><h3>📊 SEO Score</h3></div>
      <div className="card-body">
        <div className="seo-gauge" style={{ border: `3px solid ${color}`, boxShadow: `0 0 20px ${color}33` }}>
          <div className="seo-gauge-value" style={{ color }}>{score}</div>
          <div className="seo-gauge-label">{label}</div>
        </div>

        <div style={{ marginTop: 16 }}>
          {checks?.map((check, i) => (
            <div key={i} className="seo-check">
              <div className={`seo-check-icon ${check.status}`}>
                {check.status === 'pass' ? '✓' : check.status === 'warn' ? '!' : '✗'}
              </div>
              <div className="seo-check-name">{check.name}</div>
              <div className="seo-check-tip">{check.tip}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
