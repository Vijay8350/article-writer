import { query } from '../db/index.js';

// Reads X-Workspace-Id from the request, verifies the caller has a membership
// in that workspace, and sets req.workspace + req.membership for downstream code.
// Mount AFTER requireAuth on every tenant-scoped router.
export async function requireWorkspace(req, res, next) {
  const headerId = req.headers['x-workspace-id'];
  if (!headerId) {
    return res.status(400).json({ success: false, error: 'X-Workspace-Id header is required' });
  }

  try {
    const { rows } = await query(
      `SELECT w.id, w.name, w.slug, w.status, m.role
         FROM workspaces w
         JOIN memberships m ON m.workspace_id = w.id AND m.user_id = $2
        WHERE w.id = $1`,
      [headerId, req.user.id]
    );
    const w = rows[0];
    if (!w) {
      return res.status(403).json({ success: false, error: 'You are not a member of this workspace' });
    }
    if (w.status === 'suspended') {
      return res.status(403).json({ success: false, error: 'This workspace is suspended', code: 'WORKSPACE_SUSPENDED' });
    }
    req.workspace = { id: w.id, name: w.name, slug: w.slug, status: w.status };
    req.membership = { role: w.role };
    next();
  } catch (err) {
    next(err);
  }
}

const RANK = { member: 0, admin: 1, owner: 2 };

// Use after requireWorkspace. Allowed roles list, e.g. requireWorkspaceRole('owner','admin').
// Defaults to 'admin' minimum if no roles given.
export function requireWorkspaceRole(...allowed) {
  const min = allowed.length ? Math.min(...allowed.map((r) => RANK[r] ?? 0)) : RANK.admin;
  return (req, res, next) => {
    const have = RANK[req.membership?.role] ?? -1;
    if (have < min) {
      return res.status(403).json({ success: false, error: `Requires workspace role: ${allowed.join('/')}` });
    }
    next();
  };
}
