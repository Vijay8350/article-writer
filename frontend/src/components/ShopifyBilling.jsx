import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Info, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { getShopifyBilling, shopifySubscribe, shopifySyncBilling } from '../lib/api';
import { openTop } from '../lib/embedded';
import { Section } from './ui';

const money = (price) => {
  if (!price) return null;
  if (!price.amount) return 'Free';
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: price.currencyCode, maximumFractionDigits: 2 }).format(price.amount); }
  catch { return `${price.amount} ${price.currencyCode}`; }
};

// Plans for a store using the app from Shopify: charged on the merchant's Shopify bill.
// A paid plan opens Shopify's approval page; Shopify sends the merchant back with ?billing=return.
export default function ShopifyBilling({ locked, onChanged }) {
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(null);
  const [params, setParams] = useSearchParams();

  const load = () => getShopifyBilling()
    .then((r) => setInfo(r.data))
    .catch((err) => setInfo({ error: err.response?.data?.error || err.message }));

  useEffect(() => {
    if (params.get('billing') === 'return') {
      const next = new URLSearchParams(params);
      next.delete('billing'); next.delete('charge_id');
      setParams(next, { replace: true });
      shopifySyncBilling()
        .then((r) => {
          if (r.data?.planId && r.data.planId !== 'free') toast.success('Your plan is active.');
          else toast('No new plan was approved.');
          onChanged?.();
        })
        .catch((err) => toast.error(err.response?.data?.error || err.message))
        .finally(load);
    } else {
      load();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = async (plan) => {
    if (plan.id === 'free' && !window.confirm('Switch to the Free plan? The Article Writer charge on your Shopify bill stops.')) return;
    setBusy(plan.id);
    try {
      const r = await shopifySubscribe(plan.id);
      if (r.data?.confirmationUrl) { openTop(r.data.confirmationUrl); return; }
      toast.success(r.message || 'Plan updated');
      onChanged?.();
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message, { duration: 8000 });
    }
    setBusy(null);
  };

  return (
    <Section title="Plans" description="Billed on your Shopify invoice every 30 days. Change or cancel any time.">
      {!info ? (
        <div className="empty-state"><div className="spinner spinner-lg" /></div>
      ) : info.error ? (
        <div className="callout callout--warning"><AlertTriangle size={16} /><span>{info.error}</span></div>
      ) : (
        <>
          {info.test && (
            <div className="callout callout--info mb-16"><Info size={16} /><span>Test mode: approving a plan here doesn't charge real money.</span></div>
          )}
          <div className="plan-offers">
            {info.plans.map((p) => {
              const current = p.id === info.currentPlan;
              const price = money(p.price);
              const match = Boolean(locked && !current && p.id !== 'free');
              return (
                <div key={p.id} className={`plan-offer${match ? ' is-match' : ''}`}>
                  <div className="plan-offer__name">{p.name}</div>
                  <div className="plan-offer__price">
                    {price || '—'}{p.price?.amount ? <small>/30 days</small> : null}
                  </div>
                  {p.description && <div className="plan-offer__desc">{p.description}</div>}
                  <button
                    className={`btn ${current ? 'btn-secondary' : match ? 'btn-primary' : 'btn-outline'} btn-sm w-full plan-offer__btn`}
                    disabled={current || !price || busy === p.id}
                    onClick={() => choose(p)}
                  >
                    {busy === p.id ? <Loader2 size={14} className="spinning" /> : current ? 'Current plan' : !price ? 'Not available yet' : `Choose ${p.name}`}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Section>
  );
}
