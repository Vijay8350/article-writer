import { query } from '../db/index.js';
import crypto from 'crypto';

const TOKEN_BYTES = 32;
const TTL_DAYS = 7;

// Returns { token, row } — show the raw token ONCE to the inviter (paste-link),
// store only its hash.
export async function create({ workspaceId, email, role, invitedBy }) {
  const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const { rows } = await query(
    `INSERT INTO invitations (workspace_id, email, role, token_hash, invited_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, now() + INTERVAL '${TTL_DAYS} days')
     RETURNING id, workspace_id, email, role, expires_at, created_at`,
    [workspaceId, email, role || 'member', tokenHash, invitedBy || null]
  );
  return { token, row: rows[0] };
}

export async function listForWorkspace(workspaceId) {
  const { rows } = await query(
    `SELECT id, email, role, expires_at, accepted_at, created_at
       FROM invitations
      WHERE workspace_id = $1
      ORDER BY created_at DESC`,
    [workspaceId]
  );
  return rows;
}

export async function findByToken(token) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const { rows } = await query(
    `SELECT i.id, i.workspace_id, i.email, i.role, i.expires_at, i.accepted_at,
            w.name AS workspace_name
       FROM invitations i JOIN workspaces w ON w.id = i.workspace_id
      WHERE i.token_hash = $1`,
    [tokenHash]
  );
  return rows[0] || null;
}

export async function markAccepted(id) {
  await query('UPDATE invitations SET accepted_at = now() WHERE id = $1', [id]);
}

export async function revoke(workspaceId, id) {
  const { rowCount } = await query(
    'DELETE FROM invitations WHERE id = $1 AND workspace_id = $2 AND accepted_at IS NULL',
    [id, workspaceId]
  );
  return rowCount > 0;
}
