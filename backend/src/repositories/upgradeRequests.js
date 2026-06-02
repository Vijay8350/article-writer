import { query } from '../db/index.js';

// One open request per workspace at a time.
export async function createOrGetPending(workspaceId, requestedBy, requestedPlan, note) {
  const existing = await query(
    "SELECT * FROM upgrade_requests WHERE workspace_id = $1 AND status = 'pending'",
    [workspaceId]
  );
  if (existing.rows.length) return { row: existing.rows[0], created: false };

  const { rows } = await query(
    `INSERT INTO upgrade_requests (workspace_id, requested_by, requested_plan, note)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [workspaceId, requestedBy || null, requestedPlan, note || null]
  );
  return { row: rows[0], created: true };
}

export async function listForWorkspace(workspaceId) {
  const { rows } = await query(
    'SELECT * FROM upgrade_requests WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 20',
    [workspaceId]
  );
  return rows;
}

export async function listPending() {
  const { rows } = await query(
    `SELECT r.*, w.name AS workspace_name, u.email AS requester_email
       FROM upgrade_requests r
       JOIN workspaces w ON w.id = r.workspace_id
       LEFT JOIN users u ON u.id = r.requested_by
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
