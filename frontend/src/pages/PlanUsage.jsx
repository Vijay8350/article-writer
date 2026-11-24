import React, { useState, useEffect } from 'react';
import { Gauge, Loader2, ArrowUpCircle, Check, Lock } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getUsage, getUpgradePlans, getMyUpgradeRequests, requestUpgrade } from '../lib/api';

export default function PlanUsage() {
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState([]);
  const [myRequests, setMyRequests] = useState([]);
  const [requesting, setRequesting] = useState(null);
  const [catalogue, setCatalogue] = useState({ features: [], limits: [] });
  const [params] = useSearchParams();
  const locked = params.get('locked'); // the feature a locked menu item pointed here for

  const loadRequests = () => getMyUpgradeRequests().then(r => setMyRequests(r.data || [])).catch(() => {});

  useEffect(() => {
    Promise.all([getUsage(), getUpgradePlans()])
      .then(([u, p]) => { setUsage(u.data); setPlans(p.data || []); if (p.catalogue) setCatalogue(p.catalogue); })
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

  const features = usage?.features || {};
  const limits = usage?.limits || {};
  const extraLimits = catalogue.limits.filter((l) => !l.metered);
  const lockedLabel = catalogue.features.find((f) => f.key === locked)?.label;
  const current = plans.find((p) => p.id === usage?.planId);
  // a plan is an upgrade if it unlocks something this workspace lacks, allows more, or costs more
  const unlocks = (p) => catalogue.features.filter((f) => features[f.key] === false && p.features?.[f.key]);
  const better = plans.filter((p) => p.id !== usage?.planId && (
    unlocks(p).length > 0 || p.monthly_article_limit > (usage?.limit || 0) || p.monthly_ig_post_limit > (usage?.igLimit || 0) ||
    Number(p.price_inr || 0) > Number(current?.price_inr || 0)))
    .sort((a, b) => (locked ? Number(Boolean(b.features?.[locked])) - Number(Boolean(a.features?.[locked])) : 0) || Number(a.price_inr || 0) - Number(b.price_inr || 0));

  const pct = usage && usage.limit > 0 ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;
  const barColor = pct >= 100 ? 'var(--accent-danger)' : pct >= 80 ? 'var(--accent-warning)' : 'var(--accent-success)';
  const igPct = usage?.igLimit > 0 ? Math.min(100, Math.round((usage.igUsed / usage.igLimit) * 100)) : 0;
  const igBarColor = igPct >= 100 ? 'var(--accent-danger)' : igPct >= 80 ? 'var(--accent-warning)' : 'var(--accent-success)';

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <h1>Plan & Usage</h1>
        <p>Your current plan, what it includes, and this month's usage</p>
      </div>

      {lockedLabel && (
        <div className="plan-locked-note" role="status">
          <Lock size={16} /> <span><strong>{lockedLabel}</strong> isn't included in your plan. Choose a plan below that includes it, and an admin will switch you over.</span>
        </div>
      )}

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
            <div style={{ height: 12, background: 'var(--track)', borderRadius: 999, overflow: 'hidden' }}>
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
                <div style={{ height: 12, background: 'var(--track)', borderRadius: 999, overflow: 'hidden' }}
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

        {catalogue.features.length > 0 && (
          <div className="card mb-24">
            <div className="card-header"><h3>What your plan includes</h3></div>
            <div className="card-body">
              <ul className="plan-includes">
                {catalogue.features.map((f) => {
                  const on = features[f.key] !== false;
                  return (
                    <li key={f.key} className={`${on ? 'is-on' : 'is-off'}${f.key === locked ? ' is-asked' : ''}`}>
                      {on ? <Check size={15} aria-label="included" /> : <Lock size={14} aria-label="not included" />}
                      <span><strong>{f.label}</strong><small>{f.help}</small></span>
                    </li>
                  );
                })}
              </ul>
              {extraLimits.length > 0 && (
                <div className="plan-extra-limits">
                  {extraLimits.map((l) => (
                    <div key={l.key}><span>{l.label}</span><strong>{limits[l.key] == null ? 'Unlimited' : limits[l.key]}</strong></div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-header"><h3><ArrowUpCircle size={16} /> Upgrade your plan</h3></div>
          <div className="card-body">
            {pendingRequest ? (
              <div style={{ background: 'var(--warning-tint)', border: '1px solid rgba(178,91,0,0.18)', borderRadius: 'var(--radius-md)', padding: 16 }}>
                <strong>Request pending</strong>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>
                  You've requested an upgrade to <strong style={{ textTransform: 'capitalize' }}>{pendingRequest.requested_plan}</strong>.
                  An admin will review it shortly.
                </p>
              </div>
            ) : (
              <>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
                  Request a plan — an admin approves it and it applies straight away.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                  {better.map(p => (
                    <div key={p.id} className={`plan-offer${locked && p.features?.[locked] ? ' is-match' : ''}`}>
                      <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{p.name}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 8px' }}>
                        {p.price_inr ? `₹${p.price_inr}/mo` : 'Free'} · {p.monthly_article_limit} articles · {p.monthly_ig_post_limit} images
                      </div>
                      {p.description && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>{p.description}</div>}
                      {unlocks(p).length > 0 && (
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                          Adds {unlocks(p).map((f) => f.label).join(', ')}
                        </div>
                      )}
                      <button className="btn btn-primary btn-sm w-full" disabled={requesting === p.id}
                        onClick={() => handleRequest(p.id)}>
                        {requesting === p.id ? <Loader2 size={14} className="spinning" /> : `Request ${p.name}`}
                      </button>
                    </div>
                  ))}
                </div>
                {better.length === 0 && (
                  <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>You're on the highest plan.</p>
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
