import React, { useState, useEffect } from 'react';
import { Gauge, Loader2 } from 'lucide-react';
import { getUsage } from '../lib/api';

export default function PlanUsage() {
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUsage()
      .then(res => setUsage(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="page-container"><div className="empty-state"><div className="spinner spinner-lg" /></div></div>;
  }

  const pct = usage && usage.limit > 0 ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;
  const barColor = pct >= 100 ? 'var(--accent-danger, #ef4444)' : pct >= 80 ? 'var(--accent-warning, #f59e0b)' : 'var(--accent-success, #10b981)';

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <h1>📊 Plan & Usage</h1>
        <p>Your current plan and this month's article usage</p>
      </div>

      <div style={{ maxWidth: 600 }}>
        <div className="card mb-24">
          <div className="card-header">
            <h2>Current Plan</h2>
            <span className="badge badge-purple" style={{ textTransform: 'capitalize' }}>{usage?.planName || usage?.planId}</span>
          </div>
          <div className="card-body">
            <div className="flex items-center justify-between mb-16">
              <span style={{ color: 'var(--text-secondary)' }}>This month ({usage?.period})</span>
              <strong>{usage?.used} / {usage?.limit} articles</strong>
            </div>
            <div style={{ height: 12, background: 'rgba(255,255,255,0.08)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: barColor, transition: 'width .3s' }} />
            </div>
            <div className="form-helper mt-16">
              {usage?.remaining > 0
                ? `${usage.remaining} article${usage.remaining === 1 ? '' : 's'} remaining this month.`
                : 'You have reached your monthly limit. Contact us to upgrade your plan.'}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>Need more?</h3></div>
          <div className="card-body">
            <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              Plans are assigned manually right now. To upgrade to Pro (50/mo) or Business (200/mo),
              contact us and we'll bump your account.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
