import { query } from '../db/index.js';
import crypto from 'crypto';

function randomSlugSuffix() {
  return crypto.randomBytes(3).toString('hex');
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'workspace';
}

// Workspaces this user belongs to, with their role.
export async function listForUser(userId) {
  const { rows } = await query(
    `SELECT w.id, w.name, w.slug, w.status, w.created_at, m.role
       FROM workspaces w
       JOIN memberships m ON m.workspace_id = w.id
      WHERE m.user_id = $1
      ORDER BY w.created_at ASC`,
    [userId]
  );
  return rows;
}

export async function getById(id) {
  const { rows } = await query(
    'SELECT id, name, slug, owner_user_id, status, created_at FROM workspaces WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

// Creates a workspace + owner membership atomically. Slug is unique; we retry once on collision.
export async function createForOwner(ownerUserId, name) {
  const baseSlug = slugify(name);
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? `${baseSlug}-${randomSlugSuffix()}` : `${baseSlug}-${randomSlugSuffix()}`;
    try {
      const { rows } = await query(
        `INSERT INTO workspaces (name, slug, owner_user_id) VALUES ($1, $2, $3) RETURNING *`,
        [name, slug, ownerUserId]
      );
      const ws = rows[0];
      await query(
        `INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`,
        [ws.id, ownerUserId]
      );
      return ws;
    } catch (e) {
      if (e.code === '23505') continue; // unique violation on slug → retry
      throw e;
    }
  }
  throw new Error('Could not generate a unique workspace slug');
}

export async function rename(id, name) {
  await query('UPDATE workspaces SET name = $2 WHERE id = $1', [id, name]);
}

export async function setStatus(id, status) {
  await query('UPDATE workspaces SET status = $2 WHERE id = $1', [id, status]);
}

// Vendor admin console: all workspaces with usage + plan + owner.
export async function listAllForAdmin() {
  const periodNow = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();
  const { rows } = await query(
    `SELECT w.id, w.name, w.slug, w.status, w.created_at,
            u.email AS owner_email,
            COALESCE(s.plan_id, 'free') AS plan_id,
            COALESCE(p.monthly_article_limit, 5) AS monthly_article_limit,
            COALESCE(uc.articles_generated, 0) AS used,
            (SELECT COUNT(*)::int FROM memberships m WHERE m.workspace_id = w.id) AS member_count
       FROM workspaces w
       LEFT JOIN users u ON u.id = w.owner_user_id
       LEFT JOIN subscriptions s ON s.workspace_id = w.id
       LEFT JOIN plans p ON p.id = COALESCE(s.plan_id, 'free')
       LEFT JOIN usage_counters uc ON uc.workspace_id = w.id AND uc.period = $1
      ORDER BY w.created_at DESC`,
    [periodNow]
  );
  return rows;
}
