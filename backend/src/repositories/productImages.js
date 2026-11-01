import { query } from '../db/index.js';

// AI product images (table ig_product_images). Status changes go through claim()
// (compare-and-set) so a double click can't generate or post the same image twice.

const EDITABLE = new Set([
  'account_id', 'style', 'notes', 'image_file', 'caption', 'status', 'qa_score', 'qa_reasons',
  'attempts', 'ig_media_id', 'permalink', 'error', 'published_at',
]);

export async function create(workspaceId, createdBy, r) {
  const { rows } = await query(
    `INSERT INTO ig_product_images
       (workspace_id, account_id, automation_id, site_url, site_name, currency, product_id, product_title,
        product_url, source_image, style, notes, caption, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [workspaceId, r.accountId || null, r.automationId || null, r.siteUrl, r.siteName || null, r.currency || null,
     r.productId, r.productTitle || null, r.productUrl || null, r.sourceImage || null, r.style || null,
     r.notes || null, r.caption || null, createdBy || null]
  );
  return rows[0];
}

export async function list(workspaceId, limit = 60) {
  const { rows } = await query(
    `SELECT i.*, a.username
       FROM ig_product_images i
       LEFT JOIN instagram_accounts a ON a.id = i.account_id
      WHERE i.workspace_id = $1
      ORDER BY i.created_at DESC LIMIT $2`,
    [workspaceId, limit]
  );
  return rows;
}

export async function get(workspaceId, id) {
  const { rows } = await query('SELECT * FROM ig_product_images WHERE id = $1 AND workspace_id = $2', [id, workspaceId]);
  return rows[0] || null;
}

// Moves a row into a working status only if it's in one of `from`; null otherwise.
export async function claim(workspaceId, id, from, to) {
  const { rows } = await query(
    `UPDATE ig_product_images SET prev_status = status, status = $4, error = NULL, updated_at = now()
      WHERE id = $1 AND workspace_id = $2 AND status = ANY($3)
      RETURNING *`,
    [id, workspaceId, from, to]
  );
  return rows[0] || null;
}

export async function update(id, patch) {
  const sets = [];
  const params = [id];
  for (const [col, value] of Object.entries(patch)) {
    if (!EDITABLE.has(col) || value === undefined) continue;
    params.push(col === 'qa_reasons' ? JSON.stringify(value || []) : value);
    sets.push(`${col} = $${params.length}${col === 'qa_reasons' ? '::jsonb' : ''}`);
  }
  const { rows } = await query(
    `UPDATE ig_product_images SET ${[...sets, 'updated_at = now()'].join(', ')} WHERE id = $1 RETURNING *`,
    params
  );
  return rows[0] || null;
}

export async function remove(workspaceId, id) {
  const { rows } = await query(
    `DELETE FROM ig_product_images
      WHERE id = $1 AND workspace_id = $2 AND status NOT IN ('generating', 'publishing')
      RETURNING image_file`,
    [id, workspaceId]
  );
  return rows[0] || null;
}

// A restart mid-run leaves a row stuck; put it back so it can be retried. An
// interrupted post may have gone through, so the message says to check first.
export async function releaseStale() {
  await query(
    `UPDATE ig_product_images
        SET status = CASE WHEN status = 'publishing' THEN 'ready'
                          WHEN image_file IS NOT NULL AND prev_status IS NOT NULL THEN prev_status
                          ELSE 'failed' END,
            error = CASE WHEN status = 'publishing' THEN 'Interrupted — check Instagram before posting again.'
                         ELSE 'Interrupted — try again.' END,
            updated_at = now()
      WHERE status IN ('generating', 'publishing') AND updated_at < now() - interval '15 minutes'`
  );
}
