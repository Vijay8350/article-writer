import React, { useState, useEffect } from 'react';
import { Loader2, Check, Lock, Clock } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getUsage, getUpgradePlans, getMyUpgradeRequests, requestUpgrade } from '../lib/api';
import { PageHeader, Section } from '../components/ui';
import '../styles/workspace.css';

// Used vs limit, green until it gets close to the limit.
function UsageMeter({ label, used, limit, unit, note, full, ariaLabel }) {
  const p = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const tone = p >= 100 ? 'is-full' : p >= 80 ? 'is-warn' : 'is-ok';
  return (
    <div className="wk-meter">
      <div className="wk-meter__head">
        <span>{label}</span>
        <strong>{used} / {limit} {unit}</strong>
      </div>
      <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used} aria-label={ariaLabel || label}>
        <div className={tone} style={{ width: `${p}%` }} />
      </div>
      <div className={`wk-meter__note${full ? ' is-full' : ''}`}>{note}</div>
    </div>
  );
}

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
    return <div className="page-container page-container--narrow fade-in"><div className="empty-state"><div className="spinner spinner-lg" /></div></div>;
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

  return (
    <div className="page-container page-container--narrow fade-in">
      <PageHeader title="Plan & Usage" subtitle="Your plan, what it includes and how much you've used this month." />

      <div className="stack">
        {lockedLabel && (
          <div className="callout callout--warning" role="status">
            <Lock size={16} />
            <span><strong>{lockedLabel}</strong> isn't included in your plan. Choose a plan below that includes it, and an admin will switch you over.</span>
          </div>
        )}

        <Section title="Current plan" description={`This month (${usage?.period})`}>
          <div className="plan-now">
            <span className="plan-now__name">{usage?.planName || usage?.planId}</span>
            <span className="plan-now__period">plan</span>
          </div>
          <UsageMeter
            label="Articles"
            used={usage?.used}
            limit={usage?.limit}
            unit="articles"
            ariaLabel="Articles used"
            full={!(usage?.remaining > 0)}
            note={usage?.remaining > 0
              ? `${usage.remaining} article${usage.remaining === 1 ? '' : 's'} remaining this month.`
              : 'You have reached your monthly limit. Request a bigger plan below to write more.'}
          />
          {usage?.igLimit != null && (
            <UsageMeter
              label="Instagram Studio posts"
              used={usage.igUsed}
              limit={usage.igLimit}
              unit="posts"
              ariaLabel="Instagram posts used"
              full={!(usage.igRemaining > 0)}
              note={usage.igRemaining > 0
                ? `${usage.igRemaining} AI Instagram post${usage.igRemaining === 1 ? '' : 's'} remaining this month (making a new image for a post doesn't count).`
                : 'You have reached your monthly Instagram post limit. Request a bigger plan below.'}
            />
          )}
        </Section>

        {catalogue.features.length > 0 && (
          <Section title="What your plan includes">
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
          </Section>
        )}

        <Section
          title="Upgrade your plan"
          description={pendingRequest ? null : 'Request a plan. An admin approves it and it applies straight away.'}
        >
          {pendingRequest ? (
            <div className="callout callout--warning" role="status">
              <Clock size={16} />
              <div className="wk-callout-body">
                <div className="wk-callout-title">Request pending</div>
                <p>
                  You've asked to move to the <strong className="wk-cap">{pendingRequest.requested_plan}</strong> plan.
                  An admin will review it shortly.
                </p>
              </div>
            </div>
          ) : better.length === 0 ? (
            <div className="callout">
              <Check size={16} />
              <span>You're on the highest plan.</span>
            </div>
          ) : (
            <div className="plan-offers">
              {better.map(p => {
                const match = Boolean(locked && p.features?.[locked]);
                const adds = unlocks(p);
                return (
                  <div key={p.id} className={`plan-offer${match ? ' is-match' : ''}`}>
                    <div className="plan-offer__name">{p.name}</div>
                    <div className="plan-offer__price">
                      {p.price_inr ? <>₹{p.price_inr}<small>/month</small></> : 'Free'}
                    </div>
                    <div className="plan-offer__meta">{p.monthly_article_limit} articles · {p.monthly_ig_post_limit} Instagram posts a month</div>
                    {p.description && <div className="plan-offer__desc">{p.description}</div>}
                    {adds.length > 0 && (
                      <div className="plan-offer__adds">Adds <strong>{adds.map((f) => f.label).join(', ')}</strong></div>
                    )}
                    <button
                      className={`btn ${match ? 'btn-primary' : 'btn-secondary'} btn-sm w-full plan-offer__btn`}
                      disabled={requesting === p.id}
                      onClick={() => handleRequest(p.id)}
                    >
                      {requesting === p.id ? <Loader2 size={14} className="spinning" /> : `Request ${p.name}`}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
