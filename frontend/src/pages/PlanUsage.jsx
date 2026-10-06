import React, { useState, useEffect } from 'react';
import { Gauge, Loader2, ArrowUpCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { getUsage, getUpgradePlans, getMyUpgradeRequests, requestUpgrade } from '../lib/api';

export default function PlanUsage() {
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState([]);
  const [myRequests, setMyRequests] = useState([]);
  const [requesting, setRequesting] = useState(null);

  const loadRequests = () => getMyUpgradeRequests().then(r => setMyRequests(r.data || [])).catch(() => {});

  useEffect(() => {
    Promise.all([getUsage(), getUpgradePlans()])
      .then(([u, p]) => { setUsage(u.data); setPlans(p.data || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
    loadRequests();
  }, []);

  const pendingRequest = myRequests.find(r => r.status === 'pending');

  const handleRequest = async (planId) => {
    setRequesting(planId);
    try {
      const res = await requestUpgrade(planId);
      toast.success(res.message || 'Requested');
      loadRequests();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to request upgrade');
    }
    setRequesting(null);
  };

  if (loading) {
    return <div className="page-container"><div className="empty-state"><div className="spinner spinner-lg" /></div></div>;
  }

  const pct = usage && usage.limit > 0 ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;
  const barColor = pct >= 100 ? 'var(--accent-danger, #ef4444)' : pct >= 80 ? 'var(--accent-warning, #f59e0b)' : 'var(--accent-success, #10b981)';
  const igPct = usage?.igLimit > 0 ? Math.min(100, Math.round((usage.igUsed / usage.igLimit) * 100)) : 0;
  const igBarColor = igPct >= 100 ? 'var(--accent-danger, #ef4444)' : igPct >= 80 ? 'var(--accent-warning, #f59e0b)' : 'var(--accent-success, #10b981)';

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <h1>📊 Plan & Usage</h1>
        <p>Your current plan and this month's article and Instagram post usage</p>
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

            {usage?.igLimit != null && (
              <div className="mt-24">
                <div className="flex items-center justify-between mb-16">
                  <span style={{ color: 'var(--text-secondary)' }}>Instagram Studio posts</span>
                  <strong>{usage.igUsed} / {usage.igLimit} posts</strong>
                </div>
                <div style={{ height: 12, background: 'rgba(255,255,255,0.08)', borderRadius: 999, overflow: 'hidden' }}
                  role="meter" aria-valuemin={0} aria-valuemax={usage.igLimit} aria-valuenow={usage.igUsed} aria-label="Instagram posts used">
                  <div style={{ width: `${igPct}%`, height: '100%', background: igBarColor, transition: 'width .3s' }} />
                </div>
                <div className="form-helper mt-16">
                  {usage.igRemaining > 0
                    ? `${usage.igRemaining} AI Instagram post${usage.igRemaining === 1 ? '' : 's'} remaining this month (regenerating an image doesn't count).`
                    : 'You have reached your monthly Instagram post limit. Contact us to upgrade your plan.'}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3><ArrowUpCircle size={16} /> Upgrade your plan</h3></div>
          <div className="card-body">
            {pendingRequest ? (
              <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 'var(--radius-md)', padding: 16 }}>
                <strong>Request pending</strong>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>
                  You've requested an upgrade to <strong style={{ textTransform: 'capitalize' }}>{pendingRequest.requested_plan}</strong>.
                  An admin will review it shortly.
                </p>
              </div>
            ) : (
              <>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
                  Request a higher plan — an admin approves it and your limit increases immediately.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                  {plans.filter(p => p.id !== usage?.planId && p.monthly_article_limit > (usage?.limit || 0)).map(p => (
                    <div key={p.id} style={{ border: '1px solid rgba(139,92,246,0.2)', borderRadius: 'var(--radius-md)', padding: 16, textAlign: 'center' }}>
                      <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{p.name}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 12px' }}>
                        {p.monthly_article_limit} articles/mo{p.price_inr ? ` · ₹${p.price_inr}` : ''}
                      </div>
                      <button className="btn btn-primary btn-sm w-full" disabled={requesting === p.id}
                        onClick={() => handleRequest(p.id)}>
                        {requesting === p.id ? <Loader2 size={14} className="spinning" /> : `Request ${p.name}`}
                      </button>
                    </div>
                  ))}
                </div>
                {plans.filter(p => p.monthly_article_limit > (usage?.limit || 0)).length === 0 && (
                  <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>You're on the highest plan. 🎉</p>
                )}
              </>
            )}
          </div>
        </div>
        <style>{`.spinning { animation: spin 1s linear infinite; }`}</style>
      </div>
    </div>
  );
}
