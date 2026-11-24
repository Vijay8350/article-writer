import { query } from '../db/index.js';
import { effectivePlan, featureLabel, limitLabel } from '../lib/planFeatures.js';

// Counting rule: a NEW article generation counts as 1. Enhancement/regeneration does NOT count.

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Returns the workspace's plan as it applies to this workspace (the plan's features and
// limits with the workspace's own changes), defaulting to 'free' lazily.
const PLAN_SQL = `SELECT s.plan_id, s.overrides, p.name, p.monthly_article_limit, p.monthly_ig_post_limit, p.features
                    FROM subscriptions s JOIN plans p ON p.id = s.plan_id
                   WHERE s.workspace_id = $1`;
async function getPlan(workspaceId) {
  let { rows } = await query(PLAN_SQL, [workspaceId]);
  if (rows.length === 0) {
    await query(
      `INSERT INTO subscriptions (workspace_id, plan_id, current_period_start)
       VALUES ($1, 'free', now())
       ON CONFLICT (workspace_id) DO NOTHING`,
      [workspaceId]
    );
    ({ rows } = await query(PLAN_SQL, [workspaceId]));
  }
  const row = rows[0];
  const { features, limits } = effectivePlan(row, row.overrides);
  return { ...row, monthly_article_limit: limits.monthly_article_limit, monthly_ig_post_limit: limits.monthly_ig_post_limit, features, limits };
}

// The workspace's plan: { planId, planName, features: { key: bool }, limits: { key: n|null } }.
export async function planFor(workspaceId) {
  const plan = await getPlan(workspaceId);
  return { planId: plan.plan_id, planName: plan.name, features: plan.features, limits: plan.limits };
}

export async function allows(workspaceId, featureKey) {
  return (await getPlan(workspaceId)).features[featureKey] !== false;
}

// Throws 403 FEATURE_LOCKED when the workspace's plan doesn't include the feature.
export async function assertFeature(workspaceId, featureKey) {
  if (await allows(workspaceId, featureKey)) return;
  throw Object.assign(new Error(`Your plan doesn't include ${featureLabel(featureKey)}. Upgrade your plan to use it.`), { status: 403, code: 'FEATURE_LOCKED', feature: featureKey });
}

// Throws 402 LIMIT_REACHED when the workspace already has `count` of something its plan
// caps (Instagram accounts, team members, daily posting jobs). No cap = unlimited.
export async function assertBelowLimit(workspaceId, limitKey, count) {
  const limit = (await getPlan(workspaceId)).limits[limitKey];
  if (limit === null || limit === undefined || count < limit) return;
  throw Object.assign(new Error(`Your plan allows ${limit} ${limitLabel(limitKey).toLowerCase()}. Upgrade your plan to add more.`), { status: 402, code: 'LIMIT_REACHED' });
}

export async function getCurrentUsage(workspaceId) {
  const plan = await getPlan(workspaceId);
  const period = currentPeriod();
  const { rows } = await query(
    'SELECT articles_generated, ig_posts_generated FROM usage_counters WHERE workspace_id = $1 AND period = $2',
    [workspaceId, period]
  );
  const used = rows[0]?.articles_generated || 0;
  const igUsed = rows[0]?.ig_posts_generated || 0;
  return {
    used,
    limit: plan.monthly_article_limit,
    remaining: Math.max(0, plan.monthly_article_limit - used),
    // Instagram Studio posts have their own allowance on the same plan.
    igUsed,
    igLimit: plan.monthly_ig_post_limit,
    igRemaining: Math.max(0, plan.monthly_ig_post_limit - igUsed),
    period,
    planId: plan.plan_id,
    planName: plan.name,
    // what the plan includes, for the app to show or lock
    features: plan.features,
    limits: plan.limits,
  };
}

// Same counting rule as articles: a NEW Instagram post counts once; regenerating its image doesn't.
export async function assertCanGenerateIgPost(workspaceId) {
  const { igUsed, igLimit } = await getCurrentUsage(workspaceId);
  if (igUsed >= igLimit) {
    const err = new Error(`Monthly Instagram post limit reached (${igUsed}/${igLimit}). Upgrade your plan to generate more.`);
    err.code = 'LIMIT_REACHED';
    err.status = 402;
    throw err;
  }
}

export async function incrementIgUsage(workspaceId) {
  await query(
    `INSERT INTO usage_counters (workspace_id, period, ig_posts_generated)
     VALUES ($1, $2, 1)
     ON CONFLICT (workspace_id, period) DO UPDATE SET
       ig_posts_generated = usage_counters.ig_posts_generated + 1`,
    [workspaceId, currentPeriod()]
  );
}

export async function assertCanGenerate(workspaceId) {
  const { used, limit } = await getCurrentUsage(workspaceId);
  if (used >= limit) {
    const err = new Error(`Monthly article limit reached (${used}/${limit}). Upgrade your plan to generate more.`);
    err.code = 'LIMIT_REACHED';
    err.status = 402;
    throw err;
  }
}

export async function incrementUsage(workspaceId) {
  const period = currentPeriod();
  await query(
    `INSERT INTO usage_counters (workspace_id, period, articles_generated)
     VALUES ($1, $2, 1)
     ON CONFLICT (workspace_id, period) DO UPDATE SET
       articles_generated = usage_counters.articles_generated + 1`,
    [workspaceId, period]
  );
}

export default { getCurrentUsage, assertCanGenerate, incrementUsage, assertCanGenerateIgPost, incrementIgUsage, planFor, allows, assertFeature, assertBelowLimit };

// ─── What a workspace already has, for the plan's count limits ─────────────

// Instagram accounts, not counting one being reconnected (that replaces itself).
export async function igAccountCount(workspaceId, exceptIgUserId = null) {
  const { rows } = await query('SELECT COUNT(*)::int AS n FROM instagram_accounts WHERE workspace_id = $1 AND ($2::text IS NULL OR ig_user_id <> $2)', [workspaceId, exceptIgUserId]);
  return rows[0].n;
}

// Members plus invitations still waiting (each will become a member).
export async function seatCount(workspaceId) {
  const { rows } = await query(
    `SELECT (SELECT COUNT(*) FROM memberships WHERE workspace_id = $1)
          + (SELECT COUNT(*) FROM invitations WHERE workspace_id = $1 AND accepted_at IS NULL AND expires_at > now()) AS n`,
    [workspaceId]
  );
  return Number(rows[0].n);
}

export async function automationCount(workspaceId) {
  const { rows } = await query('SELECT COUNT(*)::int AS n FROM instagram_automations WHERE workspace_id = $1', [workspaceId]);
  return rows[0].n;
}
