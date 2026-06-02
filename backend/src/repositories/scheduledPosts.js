import { query } from '../db/index.js';

export async function create(workspaceId, createdBy, { topic, runAt, blogId, wordCount, aiModel, storeId }) {
  const { rows } = await query(
    `INSERT INTO scheduled_posts (workspace_id, created_by, store_id, blog_id, topic, word_count, ai_model, run_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [workspaceId, createdBy || null, storeId || null, blogId || null, topic, wordCount || null, aiModel || null, runAt]
  );
  return rows[0];
}

export async function listForWorkspace(workspaceId) {
  const { rows } = await query(
    'SELECT * FROM scheduled_posts WHERE workspace_id = $1 ORDER BY run_at DESC',
    [workspaceId]
  );
  return rows;
}

// Only pending jobs in this workspace can be cancelled.
export async function cancel(workspaceId, id) {
  const { rowCount } = await query(
    "DELETE FROM scheduled_posts WHERE id = $1 AND workspace_id = $2 AND status = 'pending'",
    [id, workspaceId]
  );
  return rowCount > 0;
}

// Atomically claim ONE due job. Single-process worker + isRunning lock keeps this safe.
export async function claimNextDue() {
  const { rows } = await query(
    `UPDATE scheduled_posts
       SET status = 'processing'
     WHERE id = (
       SELECT id FROM scheduled_posts
        WHERE status = 'pending' AND run_at <= now()
        ORDER BY run_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
     )
     RETURNING *`
  );
  return rows[0] || null;
}

export async function markPublished(id, publishedArticleId) {
  await query(
    "UPDATE scheduled_posts SET status = 'published', published_article_id = $2, error = NULL WHERE id = $1",
    [id, String(publishedArticleId)]
  );
}

export async function markFailed(id, errorMessage) {
  await query(
    "UPDATE scheduled_posts SET status = 'failed', error = $2 WHERE id = $1",
    [id, String(errorMessage).slice(0, 1000)]
  );
}
