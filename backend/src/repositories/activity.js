import { query } from '../db/index.js';

// Best-effort activity logging — never let a logging failure break the request.
export async function log(userId, action, detail) {
  try {
    await query(
      'INSERT INTO activity_log (user_id, action, detail) VALUES ($1, $2, $3)',
      [userId || null, action, detail ? String(detail).slice(0, 500) : null]
    );
  } catch (e) {
    console.warn('activity log failed:', e.message);
  }
}

// Global recent activity (admin console), joined with the actor's email.
export async function recent(limit = 100) {
  const { rows } = await query(
    `SELECT a.id, a.action, a.detail, a.created_at, u.email
       FROM activity_log a
       LEFT JOIN users u ON u.id = a.user_id
      ORDER BY a.created_at DESC
      LIMIT $1`,
    [limit]
  );
  return rows;
}

export async function recentForUser(userId, limit = 50) {
  const { rows } = await query(
    'SELECT id, action, detail, created_at FROM activity_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
    [userId, limit]
  );
  return rows;
}
