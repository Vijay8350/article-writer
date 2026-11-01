import { query } from '../db/index.js';
import { encrypt, decrypt } from '../lib/crypto.js';
import { nextRunSql } from './instagram.js';

const NEXT_RUN = nextRunSql('timezone', 'run_time');
const SETTINGS_COLS = `workspace_id, enabled, to_char(run_time, 'HH24:MI') AS run_time, timezone, max_fixes, fix_meta, fix_alt,
  fix_links, fix_articles, next_run_at, last_run_at, locked_until, google_email, google_site,
  (google_refresh_token_encrypted IS NOT NULL) AS google_connected`;

export async function getSettings(workspaceId) {
  await query('INSERT INTO seo_settings (workspace_id) VALUES ($1) ON CONFLICT DO NOTHING', [workspaceId]);
  const { rows } = await query(`SELECT ${SETTINGS_COLS} FROM seo_settings WHERE workspace_id = $1`, [workspaceId]);
  return rows[0];
}

const EDITABLE = { enabled: 'enabled', runTime: 'run_time', timezone: 'timezone', maxFixes: 'max_fixes', fixMeta: 'fix_meta', fixAlt: 'fix_alt', fixLinks: 'fix_links', fixArticles: 'fix_articles' };

export async function updateSettings(workspaceId, changes) {
  await getSettings(workspaceId);
  const sets = [];
  const params = [workspaceId];
  for (const [key, col] of Object.entries(EDITABLE)) {
    if (changes[key] === undefined) continue;
    params.push(changes[key]);
    sets.push(`${col} = $${params.length}${col === 'run_time' ? '::time' : ''}`);
  }
  if (sets.length) await query(`UPDATE seo_settings SET ${sets.join(', ')}, updated_at = now() WHERE workspace_id = $1`, params);
  await query(`UPDATE seo_settings SET next_run_at = CASE WHEN enabled THEN ${NEXT_RUN} END WHERE workspace_id = $1`, [workspaceId]);
  return getSettings(workspaceId);
}

export async function saveGoogle(workspaceId, { refreshToken, email }) {
  await getSettings(workspaceId);
  await query(
    `UPDATE seo_settings SET google_refresh_token_encrypted = COALESCE($2, google_refresh_token_encrypted), google_email = $3, updated_at = now()
      WHERE workspace_id = $1`,
    [workspaceId, refreshToken ? encrypt(refreshToken) : null, email || null]
  );
}

export const setGoogleSite = (workspaceId, site) => query('UPDATE seo_settings SET google_site = $2, updated_at = now() WHERE workspace_id = $1', [workspaceId, site]);

export const clearGoogle = (workspaceId) => query(
  'UPDATE seo_settings SET google_refresh_token_encrypted = NULL, google_email = NULL, google_site = NULL, updated_at = now() WHERE workspace_id = $1',
  [workspaceId]
);

export async function googleToken(workspaceId) {
  const { rows } = await query('SELECT google_refresh_token_encrypted t FROM seo_settings WHERE workspace_id = $1', [workspaceId]);
  return rows[0]?.t ? decrypt(rows[0].t) : null;
}

// ─── Runs ────────────────────────────────────────────────────────────────────

const LEASE = "interval '30 minutes'";

// The next workspace whose daily run is due (skips suspended workspaces).
export async function claimDue() {
  const { rows } = await query(
    `UPDATE seo_settings SET locked_until = now() + ${LEASE}
      WHERE workspace_id = (
        SELECT s.workspace_id FROM seo_settings s JOIN workspaces w ON w.id = s.workspace_id
         WHERE s.enabled AND s.next_run_at <= now() AND (s.locked_until IS NULL OR s.locked_until < now()) AND w.status <> 'suspended'
         ORDER BY s.next_run_at LIMIT 1 FOR UPDATE OF s SKIP LOCKED
      ) RETURNING workspace_id`
  );
  return rows[0]?.workspace_id || null;
}

export async function claimManual(workspaceId) {
  await getSettings(workspaceId);
  const { rowCount } = await query(
    `UPDATE seo_settings SET locked_until = now() + ${LEASE} WHERE workspace_id = $1 AND (locked_until IS NULL OR locked_until < now())`,
    [workspaceId]
  );
  return rowCount > 0;
}

export const finishRun = (workspaceId) => query(
  `UPDATE seo_settings SET locked_until = NULL, last_run_at = now(), next_run_at = CASE WHEN enabled THEN ${NEXT_RUN} END WHERE workspace_id = $1`,
  [workspaceId]
);

export async function createAudit(workspaceId, trigger) {
  const { rows } = await query('INSERT INTO seo_audits (workspace_id, trigger) VALUES ($1, $2) RETURNING *', [workspaceId, trigger]);
  return rows[0];
}

export async function finishAudit(id, a) {
  await query(
    `UPDATE seo_audits SET status = $2, pages_checked = $3, issues_found = $4, fixes_applied = $5, score = $6, search = $7, error = $8, finished_at = now()
      WHERE id = $1`,
    [id, a.status, a.pagesChecked || 0, a.issuesFound || 0, a.fixesApplied || 0, a.score ?? null, a.search ? JSON.stringify(a.search) : null, a.error || null]
  );
}

export async function recentAudits(workspaceId, limit = 14) {
  const { rows } = await query('SELECT * FROM seo_audits WHERE workspace_id = $1 ORDER BY started_at DESC LIMIT $2', [workspaceId, limit]);
  return rows;
}

// A run cut off by a restart would otherwise look like it was still going.
export const releaseStale = () => query(
  `UPDATE seo_audits SET status = 'failed', error = 'Interrupted', finished_at = now()
    WHERE status = 'running' AND started_at < now() - interval '45 minutes'`
);

// ─── Issues ──────────────────────────────────────────────────────────────────

// Records this audit's findings. Anything open that it no longer found has been resolved.
export async function syncIssues(workspaceId, auditId, issues) {
  await query(
    `INSERT INTO seo_issues (workspace_id, audit_id, resource_type, resource_id, blog_id, url, title, type, severity, detail)
     SELECT $1, $2, x.resource_type, x.resource_id, x.blog_id, x.url, x.title, x.type, x.severity, x.detail
       FROM jsonb_to_recordset($3::jsonb) AS x(resource_type text, resource_id text, blog_id text, url text, title text, type text, severity text, detail text)
     ON CONFLICT (workspace_id, resource_type, resource_id, type) DO UPDATE SET
       audit_id = EXCLUDED.audit_id, url = EXCLUDED.url, title = EXCLUDED.title, severity = EXCLUDED.severity,
       detail = EXCLUDED.detail, last_seen = now(), resolved_at = NULL,
       status = CASE WHEN seo_issues.status = 'ignored' THEN 'ignored' ELSE 'open' END`,
    [workspaceId, auditId, JSON.stringify(issues)]
  );
  await query(
    `UPDATE seo_issues SET status = 'resolved', resolved_at = now()
      WHERE workspace_id = $1 AND status = 'open' AND audit_id IS DISTINCT FROM $2`,
    [workspaceId, auditId]
  );
}

export async function listIssues(workspaceId, status = 'open', limit = 300) {
  const { rows } = await query(
    `SELECT * FROM seo_issues WHERE workspace_id = $1 AND status = $2
      ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, last_seen DESC LIMIT $3`,
    [workspaceId, status, limit]
  );
  return rows;
}

export async function openIssueUrls(workspaceId, type) {
  const { rows } = await query("SELECT url FROM seo_issues WHERE workspace_id = $1 AND type = $2 AND status = 'open'", [workspaceId, type]);
  return rows.map((r) => r.url);
}

export async function issueCounts(workspaceId) {
  const { rows } = await query(
    "SELECT severity, count(*)::int AS n FROM seo_issues WHERE workspace_id = $1 AND status = 'open' GROUP BY severity",
    [workspaceId]
  );
  return Object.fromEntries(rows.map((r) => [r.severity, r.n]));
}

export async function issueTypeCounts(workspaceId) {
  const { rows } = await query(
    "SELECT type, count(*)::int AS n FROM seo_issues WHERE workspace_id = $1 AND status = 'open' GROUP BY type ORDER BY n DESC",
    [workspaceId]
  );
  return rows;
}

export async function getIssue(workspaceId, id) {
  const { rows } = await query('SELECT * FROM seo_issues WHERE id = $1 AND workspace_id = $2', [id, workspaceId]);
  return rows[0] || null;
}

export const setIssueStatus = (workspaceId, id, status) => query('UPDATE seo_issues SET status = $3 WHERE id = $1 AND workspace_id = $2', [id, workspaceId, status]);

export const markFixed = (workspaceId, resourceType, resourceId, types) => query(
  `UPDATE seo_issues SET status = 'fixed', resolved_at = now()
    WHERE workspace_id = $1 AND resource_type = $2 AND resource_id = $3 AND type = ANY($4) AND status = 'open'`,
  [workspaceId, resourceType, String(resourceId), types]
);

// ─── Change log ──────────────────────────────────────────────────────────────

export async function logChange(workspaceId, c) {
  const { rows } = await query(
    `INSERT INTO seo_changes (workspace_id, audit_id, resource_type, resource_id, blog_id, url, title, field, before_value, after_value, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [workspaceId, c.auditId || null, c.resourceType, String(c.resourceId), c.blogId ? String(c.blogId) : null, c.url || null, c.title || null,
     c.field, JSON.stringify(c.before ?? null), JSON.stringify(c.after ?? null), c.source || 'auto']
  );
  return rows[0];
}

export async function listChanges(workspaceId, limit = 100) {
  const { rows } = await query(
    `SELECT id, resource_type, resource_id, url, title, field, source, status, created_at, undone_at,
            CASE WHEN field = 'article_body' THEN NULL ELSE before_value END AS before_value,
            CASE WHEN field = 'article_body' THEN NULL ELSE after_value END AS after_value
       FROM seo_changes WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [workspaceId, limit]
  );
  return rows;
}

export async function getChange(workspaceId, id) {
  const { rows } = await query('SELECT * FROM seo_changes WHERE id = $1 AND workspace_id = $2', [id, workspaceId]);
  return rows[0] || null;
}

// Only one undo can win, so a double click can't restore twice.
export async function claimUndo(workspaceId, id) {
  const { rows } = await query(
    `UPDATE seo_changes SET status = 'undone', undone_at = now() WHERE id = $1 AND workspace_id = $2 AND status = 'applied' RETURNING *`,
    [id, workspaceId]
  );
  return rows[0] || null;
}

export const reopenChange = (id) => query("UPDATE seo_changes SET status = 'applied', undone_at = NULL WHERE id = $1", [id]);

// Pages changed lately are left alone, so the same page isn't rewritten day after day, and
// a page whose change the owner undid is never touched by the automation again.
export async function recentlyChanged(workspaceId, days) {
  const { rows } = await query(
    `SELECT DISTINCT resource_type, resource_id FROM seo_changes
      WHERE workspace_id = $1 AND (status = 'undone' OR created_at > now() - make_interval(days => $2))`,
    [workspaceId, days]
  );
  return new Set(rows.map((r) => `${r.resource_type}:${r.resource_id}`));
}
