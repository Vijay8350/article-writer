import { query } from '../db/index.js';

export async function create(userId, c) {
  const { rows } = await query(
    `INSERT INTO campaigns
       (user_id, name, collection_handle, collection_title, cadence, articles_per_run,
        word_count, ai_model, blog_id, publish_mode, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active')
     RETURNING *`,
    [userId, c.name, c.collectionHandle || null, c.collectionTitle, c.cadence,
     c.articlesPerRun, c.wordCount, c.aiModel, c.blogId || null, c.publishMode]
  );
  return rows[0];
}

export async function listForUser(userId) {
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
      WHERE c.user_id = $1
      ORDER BY c.created_at DESC`,
    [userId]
  );
  return rows;
}

export async function getOwned(userId, id) {
  const { rows } = await query('SELECT * FROM campaigns WHERE id = $1 AND user_id = $2', [id, userId]);
  return rows[0] || null;
}

export async function setStatus(userId, id, status) {
  const { rowCount } = await query(
    'UPDATE campaigns SET status = $3 WHERE id = $1 AND user_id = $2',
    [id, userId, status]
  );
  return rowCount > 0;
}

export async function remove(userId, id) {
  const { rowCount } = await query('DELETE FROM campaigns WHERE id = $1 AND user_id = $2', [id, userId]);
  return rowCount > 0;
}

// "Run now": start a run immediately by setting it due with a full quota.
export async function triggerNow(userId, id) {
  const { rows } = await query(
    `UPDATE campaigns
        SET next_run_at = now(), run_remaining = articles_per_run, status = 'active'
      WHERE id = $1 AND user_id = $2
      RETURNING *`,
    [id, userId]
  );
  return rows[0] || null;
}

// Worker: the next active campaign that is due. Single-process worker + the
// scheduler's isRunning lock guarantee no concurrent processing, so no row lock.
export async function findDue() {
  const { rows } = await query(
    `SELECT * FROM campaigns
      WHERE status = 'active' AND next_run_at IS NOT NULL AND next_run_at <= now()
      ORDER BY next_run_at ASC
      LIMIT 1`
  );
  return rows[0] || null;
}

export async function updateRunState(id, { runRemaining, nextRunAt }) {
  await query(
    'UPDATE campaigns SET run_remaining = $2, next_run_at = $3, last_run_at = now() WHERE id = $1',
    [id, runRemaining, nextRunAt]
  );
}

export async function logArticle(campaignId, userId, entry) {
  await query(
    `INSERT INTO campaign_articles (campaign_id, user_id, keyword, title, status, published_article_id, error)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [campaignId, userId, entry.keyword || null, entry.title || null, entry.status,
     entry.publishedArticleId || null, entry.error || null]
  );
}

export async function listArticles(userId, campaignId) {
  const { rows } = await query(
    `SELECT * FROM campaign_articles
      WHERE campaign_id = $1 AND user_id = $2
      ORDER BY created_at DESC LIMIT 100`,
    [campaignId, userId]
  );
  return rows;
}

// Titles this tool already produced for a user (dedup ledger).
export async function coveredTitles(userId) {
  const { rows } = await query(
    "SELECT title FROM campaign_articles WHERE user_id = $1 AND title IS NOT NULL",
    [userId]
  );
  return rows.map((r) => r.title);
}
