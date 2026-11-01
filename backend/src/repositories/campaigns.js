import { query } from '../db/index.js';
import { firstRun } from '../lib/campaignSchedule.js';

export async function create(workspaceId, createdBy, c) {
  const { rows } = await query(
    `INSERT INTO campaigns
       (workspace_id, created_by, name, collection_handle, collection_title, cadence, articles_per_run,
        word_count, ai_model, blog_id, publish_mode, instructions, images_per_post, starts_at, ends_at,
        next_run_at, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'active')
     RETURNING *`,
    [workspaceId, createdBy || null, c.name, c.collectionHandle || null, c.collectionTitle, c.cadence,
     c.articlesPerRun, c.wordCount, c.aiModel, c.blogId || null, c.publishMode, c.instructions || null,
     c.imagesPerPost, c.startsAt, c.endsAt, firstRun(c)]
  );
  return rows[0];
}

// Saves edited settings. A run in progress finishes as planned; otherwise changing
// the cadence or start re-plans the next run. An end date in the past finishes the
// campaign, and a finished one that gets extended comes back paused.
export async function update(workspaceId, id, c) {
  const { rows } = await query(
    `UPDATE campaigns
        SET name = $3, collection_handle = $4, collection_title = $5, articles_per_run = $7,
            word_count = $8, ai_model = $9, blog_id = $10, publish_mode = $11,
            instructions = $12, images_per_post = $13, starts_at = $14::timestamptz, ends_at = $15::timestamptz,
            next_run_at = CASE
              WHEN run_remaining > 0 THEN next_run_at
              WHEN cadence = $6::text AND next_run_at IS NOT NULL
               AND starts_at IS NOT DISTINCT FROM $14::timestamptz THEN next_run_at
              ELSE $16::timestamptz END,
            status = CASE WHEN $15::timestamptz <= now() THEN 'done'
                          WHEN status = 'done' THEN 'paused'
                          ELSE status END,
            cadence = $6::text
      WHERE id = $1 AND workspace_id = $2
      RETURNING *`,
    [id, workspaceId, c.name, c.collectionHandle || null, c.collectionTitle, c.cadence,
     c.articlesPerRun, c.wordCount, c.aiModel, c.blogId || null, c.publishMode, c.instructions || null,
     c.imagesPerPost, c.startsAt, c.endsAt, firstRun(c)]
  );
  return rows[0] || null;
}

export async function listForWorkspace(workspaceId) {
  const { rows } = await query(
    `SELECT c.*,
            COALESCE(a.published, 0) AS published_count,
            COALESCE(a.total, 0)     AS total_count
       FROM campaigns c
       LEFT JOIN (
         SELECT campaign_id,
                COUNT(*) FILTER (WHERE status IN ('published','draft')) AS published,
                COUNT(*) AS total
           FROM campaign_articles GROUP BY campaign_id
       ) a ON a.campaign_id = c.id
      WHERE c.workspace_id = $1
      ORDER BY c.created_at DESC`,
    [workspaceId]
  );
  return rows;
}

export async function getOwned(workspaceId, id) {
  const { rows } = await query('SELECT * FROM campaigns WHERE id = $1 AND workspace_id = $2', [id, workspaceId]);
  return rows[0] || null;
}

export async function setStatus(workspaceId, id, status) {
  const { rowCount } = await query(
    'UPDATE campaigns SET status = $3 WHERE id = $1 AND workspace_id = $2',
    [id, workspaceId, status]
  );
  return rowCount > 0;
}

export async function remove(workspaceId, id) {
  const { rowCount } = await query('DELETE FROM campaigns WHERE id = $1 AND workspace_id = $2', [id, workspaceId]);
  return rowCount > 0;
}

export async function triggerNow(workspaceId, id) {
  const { rows } = await query(
    `UPDATE campaigns
        SET next_run_at = now(), run_remaining = articles_per_run, status = 'active'
      WHERE id = $1 AND workspace_id = $2
      RETURNING *`,
    [id, workspaceId]
  );
  return rows[0] || null;
}

export async function findDue() {
  const { rows } = await query(
    `SELECT * FROM campaigns
      WHERE status = 'active' AND next_run_at IS NOT NULL AND next_run_at <= now()
        AND (ends_at IS NULL OR ends_at > now())
      ORDER BY next_run_at ASC
      LIMIT 1`
  );
  return rows[0] || null;
}

// Campaigns past their end date stop for good until someone extends them.
export async function finishExpired() {
  await query(
    `UPDATE campaigns SET status = 'done', next_run_at = NULL, run_remaining = 0
      WHERE status = 'active' AND ends_at IS NOT NULL AND ends_at <= now()`
  );
}

export async function updateRunState(id, { runRemaining, nextRunAt }) {
  await query(
    'UPDATE campaigns SET run_remaining = $2, next_run_at = $3, last_run_at = now() WHERE id = $1',
    [id, runRemaining, nextRunAt]
  );
}

export async function logArticle(campaignId, workspaceId, entry) {
  await query(
    `INSERT INTO campaign_articles (campaign_id, workspace_id, keyword, title, status, published_article_id, error)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [campaignId, workspaceId, entry.keyword || null, entry.title || null, entry.status,
     entry.publishedArticleId || null, entry.error || null]
  );
}

export async function listArticles(workspaceId, campaignId) {
  const { rows } = await query(
    `SELECT * FROM campaign_articles
      WHERE campaign_id = $1 AND workspace_id = $2
      ORDER BY created_at DESC LIMIT 100`,
    [campaignId, workspaceId]
  );
  return rows;
}

// Titles this workspace already produced (dedup ledger).
export async function coveredTitles(workspaceId) {
  const { rows } = await query(
    "SELECT title FROM campaign_articles WHERE workspace_id = $1 AND title IS NOT NULL",
    [workspaceId]
  );
  return rows.map((r) => r.title);
}
