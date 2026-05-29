import { query } from '../db/index.js';

function period() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function emailExists(email) {
  const { rowCount } = await query('SELECT 1 FROM users WHERE email = $1', [email]);
  return rowCount > 0;
}

// Admin-created user (auto-active). plan defaults handled by usage service lazily.
export async function createUser({ email, passwordHash, name, role, status, planId }) {
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, name, role, status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, name, role, status, created_at`,
    [email, passwordHash, name || null, role || 'user', status || 'active']
  );
  const user = rows[0];
  if (planId) {
    await query(
      `INSERT INTO subscriptions (user_id, plan_id, current_period_start)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id) DO UPDATE SET plan_id = $2, updated_at = now()`,
      [user.id, planId]
    );
  }
  return user;
}

export async function setStatus(id, status) {
  const { rowCount } = await query('UPDATE users SET status = $2 WHERE id = $1', [id, status]);
  return rowCount > 0;
}

export async function setRole(id, role) {
  const { rowCount } = await query('UPDATE users SET role = $2 WHERE id = $1', [id, role]);
  return rowCount > 0;
}

export async function countByRole(role) {
  const { rows } = await query('SELECT COUNT(*)::int AS n FROM users WHERE role = $1', [role]);
  return rows[0].n;
}

export async function getById(id) {
  const { rows } = await query('SELECT id, email, name, role, status, created_at FROM users WHERE id = $1', [id]);
  return rows[0] || null;
}

// Full list for the admin console with plan, usage, status, and quick flags.
export async function listAll() {
  const { rows } = await query(
    `SELECT u.id, u.email, u.name, u.role, u.status, u.created_at,
            COALESCE(s.plan_id, 'free')          AS plan_id,
            COALESCE(p.monthly_article_limit, 5) AS monthly_article_limit,
            COALESCE(uc.articles_generated, 0)   AS used,
            EXISTS (SELECT 1 FROM shopify_stores st WHERE st.user_id = u.id) AS store_connected,
            EXISTS (SELECT 1 FROM business_dna bd WHERE bd.user_id = u.id)   AS dna_present
       FROM users u
       LEFT JOIN subscriptions s ON s.user_id = u.id
       LEFT JOIN plans p ON p.id = COALESCE(s.plan_id, 'free')
       LEFT JOIN usage_counters uc ON uc.user_id = u.id AND uc.period = $1
      ORDER BY u.created_at DESC`,
    [period()]
  );
  return rows;
}

// Detailed view for one user.
export async function getDetail(id) {
  const base = await query(
    `SELECT u.id, u.email, u.name, u.role, u.status, u.created_at,
            COALESCE(s.plan_id, 'free') AS plan_id,
            COALESCE(p.monthly_article_limit, 5) AS monthly_article_limit,
            COALESCE(uc.articles_generated, 0) AS used,
            st.store_url, st.shop_name,
            EXISTS (SELECT 1 FROM business_dna bd WHERE bd.user_id = u.id) AS dna_present,
            (SELECT COUNT(*)::int FROM campaigns c WHERE c.user_id = u.id) AS campaign_count,
            (SELECT COUNT(*)::int FROM scheduled_posts sp WHERE sp.user_id = u.id) AS scheduled_count
       FROM users u
       LEFT JOIN subscriptions s ON s.user_id = u.id
       LEFT JOIN plans p ON p.id = COALESCE(s.plan_id, 'free')
       LEFT JOIN usage_counters uc ON uc.user_id = u.id AND uc.period = $2
       LEFT JOIN LATERAL (
         SELECT store_url, shop_name FROM shopify_stores WHERE user_id = u.id ORDER BY is_default DESC LIMIT 1
       ) st ON true
      WHERE u.id = $1`,
    [id, period()]
  );
  return base.rows[0] || null;
}
