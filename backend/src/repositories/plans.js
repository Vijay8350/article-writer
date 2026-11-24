import { query } from '../db/index.js';

// Plans and each workspace's own changes to its plan (lib/planFeatures.js for the shape).

export async function list() {
  const { rows } = await query('SELECT * FROM plans ORDER BY sort_order, price_inr, id');
  return rows;
}

export async function getById(id) {
  const { rows } = await query('SELECT * FROM plans WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function create({ id, name, priceInr, description, monthlyArticleLimit, monthlyIgPostLimit, features }) {
  const { rows } = await query(
    `INSERT INTO plans (id, name, price_inr, description, monthly_article_limit, monthly_ig_post_limit, features, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, (SELECT COALESCE(MAX(sort_order), 0) + 10 FROM plans))
     RETURNING *`,
    [id, name, priceInr, description || null, monthlyArticleLimit, monthlyIgPostLimit, JSON.stringify(features)]
  );
  return rows[0];
}

// Only the given fields change.
export async function update(id, { name, priceInr, priceUsd, description, isActive, monthlyArticleLimit, monthlyIgPostLimit, features }) {
  const { rows } = await query(
    `UPDATE plans SET
        name = COALESCE($2, name),
        price_inr = COALESCE($3, price_inr),
        description = CASE WHEN $4::boolean THEN $5 ELSE description END,
        is_active = COALESCE($6, is_active),
        monthly_article_limit = COALESCE($7, monthly_article_limit),
        monthly_ig_post_limit = COALESCE($8, monthly_ig_post_limit),
        features = COALESCE($9::jsonb, features),
        price_usd = CASE WHEN $10::boolean THEN $11::numeric ELSE price_usd END
      WHERE id = $1
      RETURNING *`,
    [id, name ?? null, priceInr ?? null, description !== undefined, description ?? null, isActive ?? null,
      monthlyArticleLimit ?? null, monthlyIgPostLimit ?? null, features ? JSON.stringify(features) : null,
      priceUsd !== undefined, priceUsd ?? null]
  );
  return rows[0] || null;
}

export async function workspaceCount(planId) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n FROM workspaces w LEFT JOIN subscriptions s ON s.workspace_id = w.id WHERE COALESCE(s.plan_id, 'free') = $1`,
    [planId]
  );
  return rows[0].n;
}

// A workspace's plan id and its own changes (a subscription row is made if missing).
export async function getSubscription(workspaceId) {
  await query(
    `INSERT INTO subscriptions (workspace_id, plan_id, current_period_start) VALUES ($1, 'free', now())
     ON CONFLICT (workspace_id) DO NOTHING`,
    [workspaceId]
  );
  const { rows } = await query('SELECT plan_id, overrides FROM subscriptions WHERE workspace_id = $1', [workspaceId]);
  return rows[0];
}

export async function setOverrides(workspaceId, overrides) {
  await getSubscription(workspaceId);
  await query('UPDATE subscriptions SET overrides = $2::jsonb, updated_at = now() WHERE workspace_id = $1', [workspaceId, JSON.stringify(overrides)]);
}
