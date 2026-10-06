import { query } from '../db/index.js';

// SQL for Instagram Studio (migration 012). Every tenant query is scoped by
// workspace_id; the scheduler-side claims (autopilot, comments, research,
// analytics) skip suspended workspaces.

// "col = $n" pairs for an UPDATE from a { column: value } object (undefined = leave as is).
function setClause(fields, startAt) {
  const cols = Object.keys(fields).filter((k) => fields[k] !== undefined);
  return {
    sql: cols.map((c, i) => `${c} = $${startAt + i}`).join(', '),
    values: cols.map((c) => fields[c]),
  };
}

// ─── Account DNA (+ autopilot schedule) ─────────────────────────────────────

export const DNA_FIELDS = ['persona', 'tone', 'audience', 'niche', 'content_pillars', 'visual_identity', 'language',
  'dos', 'donts', 'examples', 'hashtag_strategy', 'posting_slots', 'timezone', 'autopilot'];

export async function getDna(workspaceId, accountId) {
  const { rows } = await query('SELECT * FROM ig_account_dna WHERE account_id = $1 AND workspace_id = $2', [accountId, workspaceId]);
  return rows[0] || null;
}

// Insert or update only the given fields — saving the schedule never clobbers the DNA.
export async function upsertDna(workspaceId, accountId, fields) {
  const cols = DNA_FIELDS.filter((c) => fields[c] !== undefined);
  const values = cols.map((c) => (c === 'visual_identity' ? JSON.stringify(fields[c]) : fields[c]));
  const insertCols = ['account_id', 'workspace_id', ...cols].join(', ');
  const placeholders = ['$1', '$2', ...cols.map((_, i) => `$${i + 3}`)].join(', ');
  const updates = [...cols.map((c) => `${c} = EXCLUDED.${c}`), 'updated_at = now()'].join(', ');
  const { rows } = await query(
    `INSERT INTO ig_account_dna (${insertCols}) VALUES (${placeholders})
     ON CONFLICT (account_id) DO UPDATE SET ${updates}
     RETURNING *`,
    [accountId, workspaceId, ...values]
  );
  return rows[0];
}

// ─── Prompt library ─────────────────────────────────────────────────────────

export async function listPrompts(workspaceId, accountId) {
  const { rows } = await query(
    'SELECT * FROM ig_prompts WHERE workspace_id = $1 AND account_id = $2 ORDER BY type, created_at',
    [workspaceId, accountId]
  );
  return rows;
}

export async function addPrompt(workspaceId, accountId, { type, label, promptText }) {
  const { rows } = await query(
    `INSERT INTO ig_prompts (workspace_id, account_id, type, label, prompt_text)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [workspaceId, accountId, type, label, promptText]
  );
  return rows[0];
}

export async function updatePrompt(workspaceId, id, { active, label, promptText }) {
  const { sql, values } = setClause({ active, label, prompt_text: promptText }, 3);
  if (!sql) return null;
  const { rows } = await query(`UPDATE ig_prompts SET ${sql} WHERE id = $1 AND workspace_id = $2 RETURNING *`, [id, workspaceId, ...values]);
  return rows[0] || null;
}

export async function deletePrompt(workspaceId, id) {
  const { rowCount } = await query('DELETE FROM ig_prompts WHERE id = $1 AND workspace_id = $2', [id, workspaceId]);
  return rowCount > 0;
}

export async function getPrompt(workspaceId, accountId, id) {
  const { rows } = await query('SELECT * FROM ig_prompts WHERE id = $1 AND workspace_id = $2 AND account_id = $3', [id, workspaceId, accountId]);
  return rows[0] || null;
}

// Fair rotation: the least recently used active prompt of a type.
export async function pickPrompt(accountId, type) {
  const { rows } = await query(
    `SELECT * FROM ig_prompts WHERE account_id = $1 AND type = $2 AND active
      ORDER BY last_used_at ASC NULLS FIRST, created_at LIMIT 1`,
    [accountId, type]
  );
  return rows[0] || null;
}

export async function bumpPrompt(id) {
  await query('UPDATE ig_prompts SET use_count = use_count + 1, last_used_at = now() WHERE id = $1', [id]);
}

// ─── Ideas (de-duplication ledger) ──────────────────────────────────────────

export async function recentIdeaSummaries(accountId, limit = 15) {
  const { rows } = await query(
    "SELECT idea->>'summary' AS summary FROM ig_content_ideas WHERE account_id = $1 ORDER BY created_at DESC LIMIT $2",
    [accountId, limit]
  );
  return rows.map((r) => r.summary).filter(Boolean);
}

// null when the hash already exists for the account (a repeat).
export async function insertIdea(workspaceId, accountId, { idea, sourcePromptId, hash }) {
  const { rows } = await query(
    `INSERT INTO ig_content_ideas (workspace_id, account_id, idea, source_prompt_id, normalized_hash)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (account_id, normalized_hash) DO NOTHING
     RETURNING id`,
    [workspaceId, accountId, JSON.stringify(idea), sourcePromptId || null, hash]
  );
  return rows[0]?.id || null;
}

// ─── Generated posts ────────────────────────────────────────────────────────

export async function createPost(workspaceId, accountId, p) {
  const { rows } = await query(
    `INSERT INTO ig_generated_posts
       (workspace_id, account_id, idea_id, campaign_id, headline, lines, caption, hashtags, origin, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [workspaceId, accountId, p.ideaId || null, p.campaignId || null, p.headline, p.lines, p.caption, p.hashtags,
      p.origin || 'manual', p.createdBy || null]
  );
  return rows[0];
}

export async function getPost(workspaceId, id) {
  const { rows } = await query('SELECT * FROM ig_generated_posts WHERE id = $1 AND workspace_id = $2', [id, workspaceId]);
  return rows[0] || null;
}

export async function listPosts(workspaceId, accountId, limit = 40) {
  const { rows } = await query(
    `SELECT p.*, c.name AS campaign_name FROM ig_generated_posts p
       LEFT JOIN ig_campaigns c ON c.id = p.campaign_id
      WHERE p.workspace_id = $1 AND p.account_id = $2
      ORDER BY p.created_at DESC LIMIT $3`,
    [workspaceId, accountId, limit]
  );
  return rows;
}

export async function updatePost(id, fields) {
  const { sql, values } = setClause(fields, 2);
  const { rows } = await query(`UPDATE ig_generated_posts SET ${sql}, updated_at = now() WHERE id = $1 RETURNING *`, [id, ...values]);
  return rows[0] || null;
}

// Compare-and-set a status change, so two clicks (or a click + the scheduler)
// can never both generate or publish the same post. Returns the row plus
// `prev_status` (to restore on failure), or null if it was in another state.
export async function claimPost(workspaceId, id, fromStatuses, toStatus) {
  const { rows } = await query(
    `UPDATE ig_generated_posts p SET status = $4, error = NULL, updated_at = now()
       FROM (SELECT id, status AS prev_status FROM ig_generated_posts
              WHERE id = $1 AND workspace_id = $2 AND status = ANY($3::text[]) FOR UPDATE) old
      WHERE p.id = old.id
      RETURNING p.*, old.prev_status`,
    [id, workspaceId, fromStatuses, toStatus]
  );
  return rows[0] || null;
}

// Posts stuck mid-step (process restarted) go back to a state the user can retry from.
export async function releaseStalePosts() {
  await query(
    `UPDATE ig_generated_posts
        SET status = CASE WHEN status = 'publishing' THEN 'ready'
                          WHEN image_file IS NOT NULL AND qa_score IS NOT NULL THEN 'qa_failed'
                          ELSE 'draft' END,
            error = 'Interrupted — try again.', updated_at = now()
      WHERE status IN ('generating', 'publishing') AND updated_at < now() - interval '15 minutes'`
  );
}

export async function deletePost(workspaceId, id) {
  const { rows } = await query(
    `DELETE FROM ig_generated_posts WHERE id = $1 AND workspace_id = $2 AND status NOT IN ('generating', 'publishing')
     RETURNING image_file`,
    [id, workspaceId]
  );
  return rows[0] || null;
}

export async function imageFilesForAccount(workspaceId, accountId) {
  const { rows } = await query(
    'SELECT image_file FROM ig_generated_posts WHERE workspace_id = $1 AND account_id = $2 AND image_file IS NOT NULL',
    [workspaceId, accountId]
  );
  return rows.map((r) => r.image_file);
}

export async function publishedLast24h(accountId) {
  const { rows } = await query(
    "SELECT count(*)::int AS n FROM ig_generated_posts WHERE account_id = $1 AND status = 'published' AND published_at > now() - interval '24 hours'",
    [accountId]
  );
  return rows[0].n;
}

// ─── Campaigns ──────────────────────────────────────────────────────────────

export async function listCampaigns(workspaceId) {
  const { rows } = await query(
    `SELECT c.*, a.username,
            (SELECT count(*)::int FROM ig_generated_posts p WHERE p.campaign_id = c.id AND p.status = 'published') AS published_count
       FROM ig_campaigns c JOIN instagram_accounts a ON a.id = c.account_id
      WHERE c.workspace_id = $1
      ORDER BY c.status = 'active' DESC, c.created_at DESC`,
    [workspaceId]
  );
  return rows;
}

export async function createCampaign(workspaceId, createdBy, c) {
  const { rows } = await query(
    `INSERT INTO ig_campaigns
       (workspace_id, account_id, name, topic, goal, tone, per_day, days, prompt, reference_images, posts_target, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
    [workspaceId, c.accountId, c.name, c.topic || null, c.goal, c.tone, c.perDay, c.days, c.prompt, c.referenceImages,
      c.perDay * c.days, createdBy || null]
  );
  return rows[0];
}

export async function getCampaign(workspaceId, id) {
  const { rows } = await query('SELECT * FROM ig_campaigns WHERE id = $1 AND workspace_id = $2', [id, workspaceId]);
  return rows[0] || null;
}

export async function setCampaignStatus(workspaceId, id, status) {
  const { rowCount } = await query('UPDATE ig_campaigns SET status = $3 WHERE id = $1 AND workspace_id = $2', [id, workspaceId, status]);
  return rowCount > 0;
}

export async function deleteCampaign(workspaceId, id) {
  const { rowCount } = await query('DELETE FROM ig_campaigns WHERE id = $1 AND workspace_id = $2', [id, workspaceId]);
  return rowCount > 0;
}

// A post was produced for the campaign; it completes once it reaches its target.
export async function bumpCampaign(id) {
  await query(
    `UPDATE ig_campaigns SET posts_done = posts_done + 1,
            status = CASE WHEN posts_done + 1 >= posts_target THEN 'done' ELSE status END
      WHERE id = $1`,
    [id]
  );
}

// The campaign that feeds an account's autopilot slots: its oldest active, unfinished one.
export async function activeCampaignFor(accountId) {
  const { rows } = await query(
    `SELECT * FROM ig_campaigns WHERE account_id = $1 AND status = 'active' AND posts_done < posts_target
      ORDER BY created_at LIMIT 1`,
    [accountId]
  );
  return rows[0] || null;
}

// ─── Autopilot ──────────────────────────────────────────────────────────────

export async function autopilotAccounts() {
  const { rows } = await query(
    `SELECT d.account_id, d.workspace_id, d.posting_slots, d.timezone
       FROM ig_account_dna d
       JOIN instagram_accounts a ON a.id = d.account_id
       JOIN workspaces w ON w.id = d.workspace_id
      WHERE d.autopilot AND cardinality(d.posting_slots) > 0 AND w.status <> 'suspended'`
  );
  return rows;
}

// Claims one slot run; false if that slot already ran for this local day.
export async function claimSlot(accountId, runDate, slot) {
  const { rowCount } = await query(
    'INSERT INTO ig_slot_runs (account_id, run_date, slot) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
    [accountId, runDate, slot]
  );
  return rowCount > 0;
}

// ─── Business DNA + research queue ──────────────────────────────────────────

export const BUSINESS_FIELDS = ['business_name', 'website_url', 'summary', 'industry', 'offerings', 'usps', 'target_customers',
  'brand_voice', 'tone', 'brand_values', 'key_messages', 'content_themes', 'ctas', 'keywords', 'visual_cues', 'language',
  'dos', 'donts', 'use_in_generation'];

export async function getBusinessDna(workspaceId, accountId) {
  const { rows } = await query('SELECT * FROM ig_business_dna WHERE account_id = $1 AND workspace_id = $2', [accountId, workspaceId]);
  return rows[0] || null;
}

// Fed into generation only when it's switched on and has actually been built.
export async function getActiveBusinessDna(accountId) {
  const { rows } = await query(
    'SELECT * FROM ig_business_dna WHERE account_id = $1 AND use_in_generation AND generated_at IS NOT NULL',
    [accountId]
  );
  return rows[0] || null;
}

// Queue a research run; the current DNA stays until the run succeeds.
export async function queueResearch(workspaceId, accountId, request, progress) {
  const { rows } = await query(
    `INSERT INTO ig_business_dna (account_id, workspace_id, research_status, research_request, research_progress)
     VALUES ($1, $2, 'queued', $3, $4)
     ON CONFLICT (account_id) DO UPDATE SET
       research_status = 'queued', research_request = EXCLUDED.research_request,
       research_progress = EXCLUDED.research_progress, research_error = NULL,
       research_started_at = NULL, updated_at = now()
     RETURNING *`,
    [accountId, workspaceId, JSON.stringify(request), JSON.stringify(progress)]
  );
  return rows[0];
}

export async function saveBusinessDna(workspaceId, accountId, fields) {
  const picked = Object.fromEntries(BUSINESS_FIELDS.filter((f) => fields[f] !== undefined).map((f) => [f, fields[f]]));
  const { sql, values } = setClause(picked, 3);
  if (!sql) return getBusinessDna(workspaceId, accountId);
  const { rows } = await query(
    `UPDATE ig_business_dna SET ${sql}, updated_at = now() WHERE account_id = $1 AND workspace_id = $2 RETURNING *`,
    [accountId, workspaceId, ...values]
  );
  return rows[0] || null;
}

// Fails runs that died mid-way (restart), then claims the oldest queued one.
export async function claimNextResearch(startProgress) {
  await query(
    `UPDATE ig_business_dna SET research_status = 'error', research_error = 'The research was interrupted — run it again.'
      WHERE research_status IN ('researching', 'analyzing') AND research_started_at < now() - interval '15 minutes'`
  );
  const { rows } = await query(
    `UPDATE ig_business_dna SET research_status = 'researching', research_started_at = now(),
            research_progress = $1, research_error = NULL
      WHERE account_id = (
        SELECT b.account_id FROM ig_business_dna b JOIN workspaces w ON w.id = b.workspace_id
         WHERE b.research_status = 'queued' AND w.status <> 'suspended'
         ORDER BY b.updated_at LIMIT 1 FOR UPDATE OF b SKIP LOCKED
      )
      RETURNING *`,
    [JSON.stringify(startProgress)]
  );
  return rows[0] || null;
}

export async function setResearchProgress(accountId, status, progress) {
  await query(
    'UPDATE ig_business_dna SET research_status = $2, research_progress = $3 WHERE account_id = $1',
    [accountId, status, JSON.stringify(progress)]
  );
}

export async function finishResearch(accountId, { dna, websiteUrl, sources, dossier, progress }) {
  const picked = Object.fromEntries(BUSINESS_FIELDS.filter((f) => dna[f] !== undefined && f !== 'use_in_generation').map((f) => [f, dna[f]]));
  const { sql, values } = setClause({
    ...picked,
    website_url: websiteUrl,
    sources: JSON.stringify(sources),
    research_notes: JSON.stringify(dossier),
    research_progress: JSON.stringify(progress),
  }, 2);
  await query(
    `UPDATE ig_business_dna SET ${sql}, research_status = 'done', research_error = NULL,
            generated_at = now(), updated_at = now()
      WHERE account_id = $1`,
    [accountId, ...values]
  );
}

export async function failResearch(accountId, message, progress) {
  await query(
    `UPDATE ig_business_dna SET research_status = 'error', research_error = $2, research_progress = $3 WHERE account_id = $1`,
    [accountId, String(message).slice(0, 500), JSON.stringify(progress)]
  );
}

// ─── Comments ───────────────────────────────────────────────────────────────

export async function listCommentSettings(workspaceId) {
  const { rows } = await query('SELECT * FROM ig_comment_settings WHERE workspace_id = $1', [workspaceId]);
  return rows;
}

export async function getCommentSettings(workspaceId, accountId) {
  const { rows } = await query('SELECT * FROM ig_comment_settings WHERE account_id = $1 AND workspace_id = $2', [accountId, workspaceId]);
  return rows[0] || null;
}

export async function upsertCommentSettings(workspaceId, accountId, { replyMode, autoHide, dailyReplyLimit }) {
  const { rows } = await query(
    `INSERT INTO ig_comment_settings (account_id, workspace_id, reply_mode, auto_hide, daily_reply_limit)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (account_id) DO UPDATE SET reply_mode = EXCLUDED.reply_mode, auto_hide = EXCLUDED.auto_hide,
       daily_reply_limit = EXCLUDED.daily_reply_limit, updated_at = now()
     RETURNING *`,
    [accountId, workspaceId, replyMode, autoHide, dailyReplyLimit]
  );
  return rows[0];
}

// One monitored account whose last sweep is ≥15 minutes old; leased by stamping last_checked_at.
export async function claimCommentSweep() {
  const { rows } = await query(
    `UPDATE ig_comment_settings SET last_checked_at = now()
      WHERE account_id = (
        SELECT s.account_id FROM ig_comment_settings s JOIN workspaces w ON w.id = s.workspace_id
         WHERE (s.reply_mode <> 'off' OR s.auto_hide) AND w.status <> 'suspended'
           AND (s.last_checked_at IS NULL OR s.last_checked_at < now() - interval '15 minutes')
         ORDER BY s.last_checked_at ASC NULLS FIRST LIMIT 1 FOR UPDATE OF s SKIP LOCKED
      )
      RETURNING *`
  );
  return rows[0] || null;
}

export async function recordCommentCheck(accountId, error) {
  await query(
    'UPDATE ig_comment_settings SET last_checked_at = now(), last_error = $2 WHERE account_id = $1',
    [accountId, error ? String(error).slice(0, 300) : null]
  );
}

export async function insertComments(workspaceId, accountId, comments) {
  for (const c of comments) {
    await query(
      `INSERT INTO ig_comments (workspace_id, account_id, ig_comment_id, ig_media_id, media_permalink, media_caption,
                                author, text, commented_at, hidden)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (account_id, ig_comment_id) DO NOTHING`,
      [workspaceId, accountId, c.id, c.mediaId, c.permalink, c.caption ? c.caption.slice(0, 500) : null,
        c.author, c.text.slice(0, 2200), c.timestamp, c.hidden]
    );
  }
}

export async function pendingComments(accountId, limit) {
  const { rows } = await query(
    "SELECT * FROM ig_comments WHERE account_id = $1 AND status = 'new' ORDER BY commented_at ASC LIMIT $2",
    [accountId, limit]
  );
  return rows;
}

export async function repliedLast24h(accountId) {
  const { rows } = await query(
    "SELECT count(*)::int AS n FROM ig_comments WHERE account_id = $1 AND status = 'replied' AND replied_at > now() - interval '24 hours'",
    [accountId]
  );
  return rows[0].n;
}

export async function updateComment(id, fields) {
  const { sql, values } = setClause(fields, 2);
  await query(`UPDATE ig_comments SET ${sql}, updated_at = now() WHERE id = $1`, [id, ...values]);
}

// Claim a comment for replying exactly once (new/draft/error → replying).
export async function claimReply(id, text) {
  const { rows } = await query(
    `UPDATE ig_comments SET status = 'replying', reply_text = $2, updated_at = now()
      WHERE id = $1 AND status IN ('new', 'draft', 'error') RETURNING *`,
    [id, text]
  );
  return rows[0] || null;
}

export async function getComment(workspaceId, id) {
  const { rows } = await query('SELECT * FROM ig_comments WHERE id = $1 AND workspace_id = $2', [id, workspaceId]);
  return rows[0] || null;
}

const COMMENT_FILTERS = {
  needs_reply: "c.status IN ('draft', 'error')",
  flagged: "c.status = 'flagged'",
  replied: "c.status = 'replied'",
  all: 'true',
};

export async function listComments(workspaceId, { accountId, filter = 'needs_reply', limit = 100 }) {
  const where = COMMENT_FILTERS[filter] || COMMENT_FILTERS.needs_reply;
  const { rows } = await query(
    `SELECT c.*, a.username FROM ig_comments c JOIN instagram_accounts a ON a.id = c.account_id
      WHERE c.workspace_id = $1 AND ($2::uuid IS NULL OR c.account_id = $2) AND ${where}
      ORDER BY c.commented_at DESC NULLS LAST LIMIT $3`,
    [workspaceId, accountId || null, limit]
  );
  return rows;
}

export async function commentCounts(workspaceId) {
  const { rows } = await query(
    `SELECT count(*) FILTER (WHERE status IN ('draft', 'error'))::int AS needs_reply,
            count(*) FILTER (WHERE status = 'flagged')::int AS flagged,
            count(*) FILTER (WHERE status = 'replied')::int AS replied
       FROM ig_comments WHERE workspace_id = $1`,
    [workspaceId]
  );
  return rows[0];
}

// ─── Analytics ──────────────────────────────────────────────────────────────

// Published in the last 14 days and not measured in the last 6 hours.
export async function postsNeedingMetrics(limit = 10) {
  const { rows } = await query(
    `SELECT p.id, p.workspace_id, p.account_id, p.ig_media_id FROM ig_generated_posts p
       JOIN workspaces w ON w.id = p.workspace_id
      WHERE p.status = 'published' AND p.ig_media_id IS NOT NULL AND p.published_at > now() - interval '14 days'
        AND w.status <> 'suspended'
        AND NOT EXISTS (SELECT 1 FROM ig_post_metrics m WHERE m.post_id = p.id AND m.fetched_at > now() - interval '6 hours')
      ORDER BY p.published_at DESC LIMIT $1`,
    [limit]
  );
  return rows;
}

export async function insertMetrics(post, m) {
  await query(
    'INSERT INTO ig_post_metrics (post_id, workspace_id, likes, reach, saves, comments) VALUES ($1, $2, $3, $4, $5, $6)',
    [post.id, post.workspace_id, m.likes, m.reach, m.saves, m.comments]
  );
}

// Published posts with their latest metrics snapshot.
export async function analytics(workspaceId, accountId) {
  const { rows } = await query(
    `SELECT p.id, p.headline, p.permalink, p.published_at, p.image_file, p.origin,
            m.likes, m.reach, m.saves, m.comments, m.fetched_at
       FROM ig_generated_posts p
       LEFT JOIN LATERAL (SELECT * FROM ig_post_metrics x WHERE x.post_id = p.id ORDER BY fetched_at DESC LIMIT 1) m ON true
      WHERE p.workspace_id = $1 AND p.account_id = $2 AND p.status = 'published'
      ORDER BY p.published_at DESC LIMIT 60`,
    [workspaceId, accountId]
  );
  return rows;
}

// ─── Activity log ───────────────────────────────────────────────────────────

// Never throws: logging must never break the pipeline.
export async function log({ workspaceId = null, accountId = null, postId = null, stage, level = 'info', message, context = {} }) {
  try {
    await query(
      `INSERT INTO ig_jobs_log (workspace_id, account_id, post_id, stage, level, message, context)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [workspaceId, accountId, postId, stage, level, String(message).slice(0, 1000), JSON.stringify(context)]
    );
  } catch (err) {
    console.error('[igStudio] log failed:', err.message);
  }
}

export async function listLogs(workspaceId, accountId, limit = 60) {
  const { rows } = await query(
    `SELECT id, post_id, stage, level, message, context, created_at FROM ig_jobs_log
      WHERE workspace_id = $1 AND account_id = $2 ORDER BY created_at DESC LIMIT $3`,
    [workspaceId, accountId, limit]
  );
  return rows;
}

// Meta data-deletion requests are logged without a workspace; looked up by confirmation code.
export async function findDeletionRequest(code) {
  const { rows } = await query(
    "SELECT created_at FROM ig_jobs_log WHERE stage = 'data_deletion' AND context->>'confirmation_code' = $1 LIMIT 1",
    [code]
  );
  return rows[0] || null;
}
