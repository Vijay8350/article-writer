import { query } from '../db/index.js';

// Everything the Dashboard's analytics overview shows, for one workspace.
// Article events live in activity_log; rows written since migration 014 carry
// workspace_id directly. Older rows have NULL, so those fall back to "a member
// of this workspace did it" via memberships.

const DAYS = 30;
const ARTICLE_EVENTS = `
  FROM activity_log a
  LEFT JOIN memberships m ON a.workspace_id IS NULL AND m.user_id = a.user_id AND m.workspace_id = $1
  WHERE (a.workspace_id = $1 OR m.workspace_id IS NOT NULL)`;

// Day-by-day counts for the last 30 days, zero-filled, oldest first.
function fillDays(rows, keys) {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const out = [];
  const today = new Date();
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const day = d.toISOString().slice(0, 10);
    const row = byDay.get(day) || {};
    out.push({ day, ...Object.fromEntries(keys.map((k) => [k, Number(row[k] || 0)])) });
  }
  return out;
}

export async function articleTotals(workspaceId) {
  const { rows } = await query(
    `SELECT
       count(*) FILTER (WHERE a.action = 'generate')::int                        AS generated,
       count(*) FILTER (WHERE a.action = 'publish')::int                         AS published,
       count(*) FILTER (WHERE a.action = 'save_draft')::int                      AS drafts,
       count(*) FILTER (WHERE a.action = 'generate'
                          AND a.created_at > now() - interval '30 days')::int    AS generated_30d,
       count(*) FILTER (WHERE a.action = 'publish'
                          AND a.created_at > now() - interval '30 days')::int    AS published_30d
     ${ARTICLE_EVENTS} AND a.action IN ('generate', 'publish', 'save_draft')`,
    [workspaceId]
  );
  return rows[0];
}

// Articles generated / published per day over the last 30 days.
export async function articleDaily(workspaceId) {
  const { rows } = await query(
    `SELECT to_char(a.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
            count(*) FILTER (WHERE a.action = 'generate')::int AS generated,
            count(*) FILTER (WHERE a.action = 'publish')::int  AS published
       ${ARTICLE_EVENTS} AND a.action IN ('generate', 'publish') AND a.created_at > now() - interval '30 days'
      GROUP BY 1`,
    [workspaceId]
  );
  return fillDays(rows, ['generated', 'published']);
}

// Monthly article + Instagram post usage for the last 6 calendar months (from
// the plan meter), zero-filled so quiet months still appear on the chart.
export async function usageByMonth(workspaceId) {
  const { rows } = await query(
    `SELECT period, articles_generated AS articles, ig_posts_generated AS ig_posts
       FROM usage_counters WHERE workspace_id = $1 AND period >= to_char(now() - interval '5 months', 'YYYY-MM')`,
    [workspaceId]
  );
  const byPeriod = new Map(rows.map((r) => [r.period, r]));
  const out = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const row = byPeriod.get(period) || {};
    out.push({ period, articles: Number(row.articles || 0), ig_posts: Number(row.ig_posts || 0) });
  }
  return out;
}

// Blog campaigns: status counts and the outcome of every article they produced.
export async function campaignStats(workspaceId) {
  const [{ rows: campaigns }, { rows: articles }] = await Promise.all([
    query(
      `SELECT status, count(*)::int AS n FROM campaigns WHERE workspace_id = $1 GROUP BY status`,
      [workspaceId]
    ),
    query(
      `SELECT status, count(*)::int AS n FROM campaign_articles WHERE workspace_id = $1 GROUP BY status`,
      [workspaceId]
    ),
  ]);
  return { campaigns, articles };
}

export async function scheduledStats(workspaceId) {
  const { rows } = await query(
    `SELECT status, count(*)::int AS n FROM scheduled_posts WHERE workspace_id = $1 GROUP BY status`,
    [workspaceId]
  );
  return rows;
}

// Instagram: product autoposts + Studio posts per day (published vs failed), last 30 days.
export async function instagramDaily(workspaceId) {
  const { rows } = await query(
    `SELECT day,
            sum(published)::int AS published,
            sum(failed)::int    AS failed
       FROM (
         SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
                count(*) FILTER (WHERE status = 'published') AS published,
                count(*) FILTER (WHERE status = 'failed')    AS failed
           FROM instagram_posts
          WHERE workspace_id = $1 AND created_at > now() - interval '30 days'
          GROUP BY 1
         UNION ALL
         SELECT to_char(coalesce(published_at, created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
                count(*) FILTER (WHERE status = 'published'),
                count(*) FILTER (WHERE status = 'qa_failed')
           FROM ig_generated_posts
          WHERE workspace_id = $1 AND coalesce(published_at, created_at) > now() - interval '30 days'
          GROUP BY 1
       ) x
      GROUP BY day`,
    [workspaceId]
  );
  return fillDays(rows, ['published', 'failed']);
}

export async function instagramTotals(workspaceId) {
  const { rows } = await query(
    `SELECT
       (SELECT count(*)::int FROM instagram_accounts WHERE workspace_id = $1)                                   AS accounts,
       (SELECT count(*)::int FROM instagram_automations WHERE workspace_id = $1 AND status = 'active')          AS active_jobs,
       (SELECT count(*)::int FROM instagram_posts WHERE workspace_id = $1 AND status = 'published')             AS product_posts,
       (SELECT count(*)::int FROM ig_generated_posts WHERE workspace_id = $1 AND status = 'published')          AS studio_posts,
       (SELECT count(*)::int FROM ig_generated_posts WHERE workspace_id = $1 AND status = 'ready')              AS studio_ready,
       (SELECT count(*)::int FROM ig_generated_posts WHERE workspace_id = $1 AND status = 'qa_failed')          AS studio_qa_failed,
       (SELECT count(*)::int FROM ig_comments WHERE workspace_id = $1 AND status IN ('draft', 'error'))         AS comments_waiting,
       (SELECT count(*)::int FROM ig_comments WHERE workspace_id = $1 AND status = 'flagged')                   AS comments_flagged,
       (SELECT count(*)::int FROM ig_comments WHERE workspace_id = $1 AND status = 'replied'
                                                AND replied_at > now() - interval '30 days')                    AS replies_30d`,
    [workspaceId]
  );
  return rows[0];
}

// Studio quality gate: pass rate and average score over everything that went through it.
export async function qualityGate(workspaceId) {
  const { rows } = await query(
    `SELECT count(*)::int AS checked,
            count(*) FILTER (WHERE status IN ('ready', 'published', 'publishing'))::int AS passed,
            round(avg(qa_score))::int AS avg_score,
            round(avg(regen_attempts), 1)::float AS avg_attempts
       FROM ig_generated_posts
      WHERE workspace_id = $1 AND qa_score IS NOT NULL`,
    [workspaceId]
  );
  return rows[0];
}

// Engagement of published Studio posts (latest metrics snapshot each), top 5 by likes.
export async function topStudioPosts(workspaceId) {
  const { rows } = await query(
    `SELECT p.id, p.headline, p.permalink, p.published_at, m.likes, m.reach, m.saves, m.comments
       FROM ig_generated_posts p
       JOIN LATERAL (SELECT * FROM ig_post_metrics x WHERE x.post_id = p.id ORDER BY fetched_at DESC LIMIT 1) m ON true
      WHERE p.workspace_id = $1 AND p.status = 'published'
      ORDER BY m.likes DESC NULLS LAST LIMIT 5`,
    [workspaceId]
  );
  return rows;
}

// Latest things that happened in this workspace, across both halves of the app.
export async function recentActivity(workspaceId, limit = 10) {
  const { rows } = await query(
    `SELECT * FROM (
       SELECT a.created_at, 'blog' AS area, a.action AS kind, a.detail AS title, u.email AS who
         FROM activity_log a
         LEFT JOIN memberships m ON a.workspace_id IS NULL AND m.user_id = a.user_id AND m.workspace_id = $1
         LEFT JOIN users u ON u.id = a.user_id
        WHERE (a.workspace_id = $1 OR m.workspace_id IS NOT NULL)
          AND a.action IN ('generate', 'publish', 'save_draft')
       UNION ALL
       SELECT created_at, 'instagram', 'product_post_' || status, product_title, NULL
         FROM instagram_posts WHERE workspace_id = $1
       UNION ALL
       SELECT coalesce(published_at, updated_at), 'instagram', 'studio_' || status, headline, NULL
         FROM ig_generated_posts WHERE workspace_id = $1 AND status IN ('published', 'ready', 'qa_failed')
       UNION ALL
       SELECT created_at, 'blog', 'campaign_' || status, title, NULL
         FROM campaign_articles WHERE workspace_id = $1
     ) x
     ORDER BY created_at DESC LIMIT $2`,
    [workspaceId, limit]
  );
  return rows;
}
