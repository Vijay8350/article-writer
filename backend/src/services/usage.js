import { query } from '../db/index.js';

// Counting rule: a NEW article generation (/generate and /generate-and-publish,
// including the scheduled worker) counts as 1. Enhancement/regeneration of an
// existing article does NOT count.

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
}

// Returns the user's plan, defaulting to 'free' and creating the subscription
// row lazily if missing (so existing users don't need a backfill).
async function getPlan(userId) {
  let { rows } = await query(
    `SELECT s.plan_id, p.name, p.monthly_article_limit
       FROM subscriptions s JOIN plans p ON p.id = s.plan_id
      WHERE s.user_id = $1`,
    [userId]
  );
  if (rows.length === 0) {
    await query(
      `INSERT INTO subscriptions (user_id, plan_id, current_period_start)
       VALUES ($1, 'free', now())
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );
    ({ rows } = await query(
      `SELECT s.plan_id, p.name, p.monthly_article_limit
         FROM subscriptions s JOIN plans p ON p.id = s.plan_id
        WHERE s.user_id = $1`,
      [userId]
    ));
  }
  return rows[0];
}

export async function getCurrentUsage(userId) {
  const plan = await getPlan(userId);
  const period = currentPeriod();
  const { rows } = await query(
    'SELECT articles_generated FROM usage_counters WHERE user_id = $1 AND period = $2',
    [userId, period]
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

// Throws a 402-style error when the monthly cap is hit.
export async function assertCanGenerate(userId) {
  const { used, limit } = await getCurrentUsage(userId);
  if (used >= limit) {
    const err = new Error(`Monthly article limit reached (${used}/${limit}). Upgrade your plan to generate more.`);
    err.code = 'LIMIT_REACHED';
    err.status = 402;
    throw err;
  }
}

export async function incrementUsage(userId) {
  const period = currentPeriod();
  await query(
    `INSERT INTO usage_counters (user_id, period, articles_generated)
     VALUES ($1, $2, 1)
     ON CONFLICT (user_id, period) DO UPDATE SET
       articles_generated = usage_counters.articles_generated + 1`,
    [userId, period]
  );
}

export default { getCurrentUsage, assertCanGenerate, incrementUsage };
