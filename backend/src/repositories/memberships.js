import { query } from '../db/index.js';

export async function get(workspaceId, userId) {
  const { rows } = await query(
    'SELECT workspace_id, user_id, role FROM memberships WHERE workspace_id = $1 AND user_id = $2',
    [workspaceId, userId]
  );
  return rows[0] || null;
}

export async function list(workspaceId) {
  const { rows } = await query(
    `SELECT m.user_id, m.role, m.created_at, u.email, u.name
       FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.workspace_id = $1
      ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, m.created_at ASC`,
    [workspaceId]
  );
  return rows;
}

export async function add(workspaceId, userId, role) {
  await query(
    `INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [workspaceId, userId, role || 'member']
  );
}

export async function remove(workspaceId, userId) {
  const { rowCount } = await query(
    'DELETE FROM memberships WHERE workspace_id = $1 AND user_id = $2',
    [workspaceId, userId]
  );
  return rowCount > 0;
}

export async function setRole(workspaceId, userId, role) {
  const { rowCount } = await query(
    'UPDATE memberships SET role = $3 WHERE workspace_id = $1 AND user_id = $2',
    [workspaceId, userId, role]
  );
  return rowCount > 0;
}

export async function countByRole(workspaceId, role) {
  const { rows } = await query(
    'SELECT COUNT(*)::int AS n FROM memberships WHERE workspace_id = $1 AND role = $2',
    [workspaceId, role]
  );
  return rows[0].n;
}
