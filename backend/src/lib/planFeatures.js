// What a plan can include, feature by feature, and how one workspace's own changes
// (set by a vendor admin) adjust it. Pure. A plan stores its switches and extra limits in
// plans.features = { features: { key: bool }, limits: { key: number | null } }; the two
// metered limits keep their own columns. A workspace's changes live in
// subscriptions.overrides with the same shape; a key there wins over the plan.
// Missing switches are ON and missing extra limits are unlimited, so plans made before
// this existed keep everything.

export const FEATURES = [
  { key: 'articles', label: 'Blog articles', help: 'Write, improve and publish blog articles' },
  { key: 'campaigns', label: 'Article campaigns', help: 'A series of articles written on a schedule' },
  { key: 'scheduled_posts', label: 'Scheduled blog posts', help: 'Articles written and published at a set time' },
  { key: 'seo', label: 'SEO automation', help: 'Daily SEO audit with automatic fixes' },
  { key: 'product_posts', label: 'AI Instagram product posts', help: 'AI product images and daily posting jobs' },
  { key: 'studio', label: 'Instagram Studio', help: 'AI quote posts, autopilot, Instagram campaigns and research' },
  { key: 'comments', label: 'Instagram comment replies', help: 'AI replies to comments and spam hiding' },
  { key: 'insights', label: 'Instagram insights', help: 'Post and account analytics' },
];

// metered: counted per month (plan columns); the rest are counts of things a workspace has.
export const LIMITS = [
  { key: 'monthly_article_limit', label: 'Articles per month', metered: true },
  { key: 'monthly_ig_post_limit', label: 'AI Instagram images per month', metered: true },
  { key: 'max_ig_accounts', label: 'Instagram accounts' },
  { key: 'max_members', label: 'Team members (incl. owner)' },
  { key: 'max_automations', label: 'Daily posting jobs' },
];

const FEATURE_KEYS = new Set(FEATURES.map((f) => f.key));
const LIMIT_KEYS = new Set(LIMITS.map((l) => l.key));
const METERED = new Set(LIMITS.filter((l) => l.metered).map((l) => l.key));
const has = (o, k) => Boolean(o) && Object.prototype.hasOwnProperty.call(o, k);
const MAX = 1_000_000;

// A plan row (+ a workspace's overrides) → { features: { key: bool }, limits: { key: n | null } }.
export function effectivePlan(plan, overrides = {}) {
  const own = plan?.features || {};
  const o = overrides || {};
  const features = {};
  for (const { key } of FEATURES) {
    features[key] = has(o.features, key) ? Boolean(o.features[key]) : has(own.features, key) ? Boolean(own.features[key]) : true;
  }
  const limits = {};
  for (const { key, metered } of LIMITS) {
    const base = metered ? Number(plan?.[key] ?? 0) : (has(own.limits, key) ? own.limits[key] : null);
    limits[key] = has(o.limits, key) ? o.limits[key] : base;
  }
  return { features, limits };
}

// One limit value from a form: a whole number 0..1,000,000; blank (or null) means unlimited,
// which only the non-metered limits may be. → number | null, or throws.
function limitValue(key, v) {
  if (v === null || v === undefined || v === '') {
    if (METERED.has(key)) throw Object.assign(new Error(`${LIMITS.find((l) => l.key === key).label} needs a number`), { status: 400 });
    return null;
  }
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > MAX) throw Object.assign(new Error(`${LIMITS.find((l) => l.key === key).label} must be a whole number from 0 to ${MAX}`), { status: 400 });
  return n;
}

// A plan's switches and extra limits from the editor → the plans.features JSON (unknown keys dropped).
export function planFeaturesFrom(body = {}) {
  const features = {};
  for (const [k, v] of Object.entries(body.features || {})) if (FEATURE_KEYS.has(k)) features[k] = Boolean(v);
  const limits = {};
  for (const [k, v] of Object.entries(body.limits || {})) if (LIMIT_KEYS.has(k) && !METERED.has(k)) limits[k] = limitValue(k, v);
  return { features, limits };
}

// The metered limits from the editor → their column values.
export function meteredFrom(body = {}) {
  const out = {};
  for (const k of METERED) if (has(body.limits, k)) out[k] = limitValue(k, body.limits[k]);
  return out;
}

// One workspace's changes from the admin panel. features: key → true | false (absent =
// the plan's); limits: key → number | null (null = unlimited; absent = the plan's).
export function overridesFrom(body = {}) {
  const features = {};
  for (const [k, v] of Object.entries(body.features || {})) if (FEATURE_KEYS.has(k) && (v === true || v === false)) features[k] = v;
  const limits = {};
  for (const [k, v] of Object.entries(body.limits || {})) {
    if (!LIMIT_KEYS.has(k)) continue;
    if (v === null && METERED.has(k)) continue; // a monthly limit can't be unlimited
    limits[k] = v === null ? null : limitValue(k, v);
  }
  return { features, limits };
}

export const featureLabel = (key) => FEATURES.find((f) => f.key === key)?.label || key;
export const limitLabel = (key) => LIMITS.find((l) => l.key === key)?.label || key;
