import { query } from '../db/index.js';

// Counting rule: a NEW article generation counts as 1. Enhancement/regeneration does NOT count.

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Returns the workspace's plan, defaulting to 'free' lazily.
async function getPlan(workspaceId) {
  let { rows } = await query(
    `SELECT s.plan_id, p.name, p.monthly_article_limit
       FROM subscriptions s JOIN plans p ON p.id = s.plan_id
      WHERE s.workspace_id = $1`,
    [workspaceId]
  );
  if (rows.length === 0) {
    await query(
      `INSERT INTO subscriptions (workspace_id, plan_id, current_period_start)
       VALUES ($1, 'free', now())
       ON CONFLICT (workspace_id) DO NOTHING`,
      [workspaceId]
    );
    ({ rows } = await query(
      `SELECT s.plan_id, p.name, p.monthly_article_limit
         FROM subscriptions s JOIN plans p ON p.id = s.plan_id
        WHERE s.workspace_id = $1`,
      [workspaceId]
    ));
  }
  return rows[0];
}

export async function getCurrentUsage(workspaceId) {
  const plan = await getPlan(workspaceId);
  const period = currentPeriod();
  const { rows } = await query(
    'SELECT articles_generated FROM usage_counters WHERE workspace_id = $1 AND period = $2',
    [workspaceId, period]
  );
  const used = rows[0]?.articles_generated || 0;
  return {
    used,
    limit: plan.monthly_article_limit,
    remaining: Math.max(0, plan.monthly_article_limit - used),
    period,
    planId: plan.plan_id,
    planName: plan.name,
  };
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

export default { getCurrentUsage, assertCanGenerate, incrementUsage };
