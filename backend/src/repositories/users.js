import { query } from '../db/index.js';

export async function emailExists(email) {
  const { rowCount } = await query('SELECT 1 FROM users WHERE email = $1', [email]);
  return rowCount > 0;
}

export async function createUser({ email, passwordHash, name, role, status }) {
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, name, role, status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, name, role, status, created_at`,
    [email, passwordHash, name || null, role || 'user', status || 'active']
  );
  return rows[0];
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

// Global user list for the admin console, with the user's workspace count.
export async function listAll() {
  const { rows } = await query(
    `SELECT u.id, u.email, u.name, u.role, u.status, u.created_at,
            (SELECT COUNT(*)::int FROM memberships m WHERE m.user_id = u.id) AS workspace_count
       FROM users u
       ORDER BY u.created_at DESC`
  );
  return rows;
}

// User detail + their workspaces (with role and the workspace's plan/usage).
export async function getDetail(id) {
  const periodNow = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();
  const userRow = await query('SELECT id, email, name, role, status, created_at FROM users WHERE id = $1', [id]);
  if (userRow.rowCount === 0) return null;
  const { rows: wsRows } = await query(
    `SELECT w.id, w.name, w.slug, w.status, m.role,
            COALESCE(s.plan_id, 'free') AS plan_id,
            COALESCE(p.monthly_article_limit, 5) AS monthly_article_limit,
            COALESCE(uc.articles_generated, 0) AS used
       FROM memberships m
       JOIN workspaces w ON w.id = m.workspace_id
       LEFT JOIN subscriptions s ON s.workspace_id = w.id
       LEFT JOIN plans p ON p.id = COALESCE(s.plan_id, 'free')
       LEFT JOIN usage_counters uc ON uc.workspace_id = w.id AND uc.period = $2
      WHERE m.user_id = $1
      ORDER BY w.created_at ASC`,
    [id, periodNow]
  );
  return { ...userRow.rows[0], workspaces: wsRows };
}
