import { query } from '../db/index.js';

// One open request per user at a time: reject older pending ones implicitly by
// returning the existing pending request if present.
export async function createOrGetPending(userId, requestedPlan, note) {
  const existing = await query(
    "SELECT * FROM upgrade_requests WHERE user_id = $1 AND status = 'pending'",
    [userId]
  );
  if (existing.rows.length) return { row: existing.rows[0], created: false };

  const { rows } = await query(
    `INSERT INTO upgrade_requests (user_id, requested_plan, note)
     VALUES ($1, $2, $3) RETURNING *`,
    [userId, requestedPlan, note || null]
  );
  return { row: rows[0], created: true };
}

export async function listForUser(userId) {
  const { rows } = await query(
    'SELECT * FROM upgrade_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
    [userId]
  );
  return rows;
}

export async function listPending() {
  const { rows } = await query(
    `SELECT r.*, u.email
       FROM upgrade_requests r JOIN users u ON u.id = r.user_id
      WHERE r.status = 'pending'
      ORDER BY r.created_at ASC`
  );
  return rows;
}

export async function getById(id) {
  const { rows } = await query('SELECT * FROM upgrade_requests WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function resolve(id, status, resolverId) {
  await query(
    'UPDATE upgrade_requests SET status = $2, resolved_by = $3, resolved_at = now() WHERE id = $1',
    [id, status, resolverId]
  );
}
