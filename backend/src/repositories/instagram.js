import { query, withTransaction } from '../db/index.js';
import { encrypt, decrypt } from '../lib/crypto.js';

// Next wall-clock occurrence of `time` in time zone `tz`, strictly after now().
// Args are SQL expressions (column names or $n params).
function nextRunSql(tz, time) {
  const today = `((now() AT TIME ZONE ${tz})::date + ${time}) AT TIME ZONE ${tz}`;
  const tomorrow = `((now() AT TIME ZONE ${tz})::date + 1 + ${time}) AT TIME ZONE ${tz}`;
  return `CASE WHEN ${today} > now() THEN ${today} ELSE ${tomorrow} END`;
}
const NEXT_RUN = nextRunSql('timezone', 'post_time');

// ─── Accounts ────────────────────────────────────────────────────────────────

const ACCOUNT_COLS = 'id, ig_user_id, username, token_type, token_expires_at, token_error, is_default, last_checked_at, created_at';

function withToken(row) {
  if (!row) return null;
  const { access_token_encrypted, ...rest } = row;
  return { ...rest, accessToken: decrypt(access_token_encrypted) };
}

// Default account first, so callers can preselect accounts[0].
export async function listAccounts(workspaceId) {
  const { rows } = await query(
    `SELECT ${ACCOUNT_COLS} FROM instagram_accounts WHERE workspace_id = $1 ORDER BY is_default DESC, created_at`,
    [workspaceId]
  );
  return rows;
}

// A workspace with accounts always has exactly one default: if none is set, the
// oldest account becomes it. Always targets the same row, so concurrent calls agree.
async function ensureDefault(workspaceId) {
  await query(
    `UPDATE instagram_accounts SET is_default = true
      WHERE id = (SELECT id FROM instagram_accounts WHERE workspace_id = $1 ORDER BY created_at LIMIT 1)
        AND NOT EXISTS (SELECT 1 FROM instagram_accounts WHERE workspace_id = $1 AND is_default)`,
    [workspaceId]
  );
}

// false if the account isn't in this workspace (nothing changes then).
export async function setDefaultAccount(workspaceId, id) {
  return withTransaction(async (client) => {
    await client.query(
      'UPDATE instagram_accounts SET is_default = false WHERE workspace_id = $1 AND is_default AND id <> $2',
      [workspaceId, id]
    );
    const { rowCount } = await client.query(
      'UPDATE instagram_accounts SET is_default = true WHERE id = $2 AND workspace_id = $1',
      [workspaceId, id]
    );
    if (!rowCount) throw Object.assign(new Error('Account not found'), { notFound: true });
    return true;
  }).catch((err) => { if (err.notFound) return false; throw err; });
}

// Records a live API check: clears the error on success, stores it on failure.
export async function recordConnectionCheck(id, error) {
  await query(
    'UPDATE instagram_accounts SET last_checked_at = now(), token_error = $2 WHERE id = $1',
    [id, error ? String(error).slice(0, 500) : null]
  );
}

export async function getAccountMeta(workspaceId, id) {
  const { rows } = await query(
    `SELECT ${ACCOUNT_COLS} FROM instagram_accounts WHERE id = $1 AND workspace_id = $2`,
    [id, workspaceId]
  );
  return rows[0] || null;
}

// Decrypted token — for the worker/service only, never send to the client.
export async function getAccountWithToken(id) {
  const { rows } = await query('SELECT * FROM instagram_accounts WHERE id = $1', [id]);
  return withToken(rows[0]);
}

// Re-connecting the same Instagram account replaces its token.
export async function upsertAccount(workspaceId, createdBy, { igUserId, username, tokenType, accessToken, tokenExpiresAt }) {
  const { rows } = await query(
    `INSERT INTO instagram_accounts
       (workspace_id, ig_user_id, username, token_type, access_token_encrypted, token_expires_at,
        token_next_refresh_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $4 = 'instagram' THEN now() + interval '1 day' END, $7)
     ON CONFLICT (workspace_id, ig_user_id) DO UPDATE SET
       username = EXCLUDED.username,
       token_type = EXCLUDED.token_type,
       access_token_encrypted = EXCLUDED.access_token_encrypted,
       token_expires_at = EXCLUDED.token_expires_at,
       token_next_refresh_at = EXCLUDED.token_next_refresh_at,
       token_error = NULL
     RETURNING id`,
    [workspaceId, igUserId, username || null, tokenType, encrypt(accessToken), tokenExpiresAt || null, createdBy || null]
  );
  await ensureDefault(workspaceId); // the first account connected becomes the default
  return getAccountMeta(workspaceId, rows[0].id);
}

export async function removeAccount(workspaceId, id) {
  const { rowCount } = await query('DELETE FROM instagram_accounts WHERE id = $1 AND workspace_id = $2', [id, workspaceId]);
  if (rowCount) await ensureDefault(workspaceId); // removed the default → promote the oldest remaining
  return rowCount > 0;
}

// Instagram Login tokens last 60 days; refresh one due token per call. A token
// must be ≥24h old to refresh, which the 1-day initial delay guarantees.
export async function claimTokenRefresh() {
  const { rows } = await query(
    `UPDATE instagram_accounts SET token_next_refresh_at = now() + interval '1 hour'
      WHERE id = (
        SELECT id FROM instagram_accounts
         WHERE token_type = 'instagram' AND token_next_refresh_at <= now()
         ORDER BY token_next_refresh_at LIMIT 1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING *`
  );
  return withToken(rows[0]);
}

export async function markTokenRefreshed(id, accessToken, expiresAt) {
  await query(
    `UPDATE instagram_accounts
        SET access_token_encrypted = $2, token_expires_at = $3,
            token_next_refresh_at = now() + interval '7 days', token_error = NULL
      WHERE id = $1`,
    [id, encrypt(accessToken), expiresAt]
  );
}

export async function markTokenRefreshFailed(id, error) {
  await query(
    `UPDATE instagram_accounts SET token_next_refresh_at = now() + interval '1 day', token_error = $2 WHERE id = $1`,
    [id, String(error).slice(0, 500)]
  );
}

// ─── Automations ─────────────────────────────────────────────────────────────

export async function listAutomations(workspaceId) {
  const { rows } = await query(
    `SELECT a.*, acc.username,
            to_char(a.post_time, 'HH24:MI') AS post_time,
            COALESCE(c.published, 0) AS published_count,
            last.status AS last_status, last.error AS last_error, last.created_at AS last_post_at
       FROM instagram_automations a
       JOIN instagram_accounts acc ON acc.id = a.account_id
       LEFT JOIN (
         SELECT automation_id, COUNT(*) FILTER (WHERE status = 'published') AS published
           FROM instagram_posts GROUP BY automation_id
       ) c ON c.automation_id = a.id
       LEFT JOIN LATERAL (
         SELECT status, error, created_at FROM instagram_posts p
          WHERE p.automation_id = a.id ORDER BY created_at DESC LIMIT 1
       ) last ON true
      WHERE a.workspace_id = $1
      ORDER BY a.status, a.post_time, a.site_name`,
    [workspaceId]
  );
  return rows;
}

export async function getAutomation(workspaceId, id) {
  const { rows } = await query(
    `SELECT *, to_char(post_time, 'HH24:MI') AS post_time
       FROM instagram_automations WHERE id = $1 AND workspace_id = $2`,
    [id, workspaceId]
  );
  return rows[0] || null;
}

export async function createAutomation(workspaceId, createdBy, a) {
  const { rows } = await query(
    `INSERT INTO instagram_automations
       (workspace_id, account_id, site_url, site_name, currency, post_time, timezone,
        caption_instructions, hashtags, created_by, next_run_at)
     VALUES ($1, $2, $3, $4, $5, $6::time, $7::text, $8, $9, $10, ${nextRunSql('$7::text', '$6::time')})
     RETURNING id`,
    [workspaceId, a.accountId, a.siteUrl, a.siteName || null, a.currency || null, a.postTime, a.timezone,
     a.captionInstructions || null, a.hashtags || null, createdBy || null]
  );
  return getAutomation(workspaceId, rows[0].id);
}

const EDITABLE = {
  accountId: 'account_id',
  postTime: 'post_time',
  timezone: 'timezone',
  captionInstructions: 'caption_instructions',
  hashtags: 'hashtags',
  status: 'status',
};

// Any schedule change (time, zone, resume) re-derives next_run_at from the new settings.
export async function updateAutomation(workspaceId, id, changes) {
  const sets = [];
  const params = [id, workspaceId];
  for (const [key, col] of Object.entries(EDITABLE)) {
    if (changes[key] === undefined) continue;
    params.push(changes[key] === '' ? null : changes[key]);
    sets.push(`${col} = $${params.length}${col === 'post_time' ? '::time' : ''}`);
  }
  if (!sets.length) return getAutomation(workspaceId, id);
  const { rowCount } = await query(
    `UPDATE instagram_automations SET ${sets.join(', ')} WHERE id = $1 AND workspace_id = $2`,
    params
  );
  if (!rowCount) return null;
  if (changes.postTime !== undefined || changes.timezone !== undefined || changes.status === 'active') {
    await query(`UPDATE instagram_automations SET next_run_at = ${NEXT_RUN}, retry_count = 0 WHERE id = $1`, [id]);
  }
  return getAutomation(workspaceId, id);
}

export async function removeAutomation(workspaceId, id) {
  const { rowCount } = await query('DELETE FROM instagram_automations WHERE id = $1 AND workspace_id = $2', [id, workspaceId]);
  return rowCount > 0;
}

// Claim ONE due automation with a 10-minute lease (skips suspended workspaces).
export async function claimDue() {
  const { rows } = await query(
    `UPDATE instagram_automations SET locked_until = now() + interval '10 minutes'
      WHERE id = (
        SELECT a.id FROM instagram_automations a
          JOIN workspaces w ON w.id = a.workspace_id
         WHERE a.status = 'active' AND a.next_run_at <= now()
           AND (a.locked_until IS NULL OR a.locked_until < now())
           AND w.status <> 'suspended'
         ORDER BY a.next_run_at LIMIT 1
         FOR UPDATE OF a SKIP LOCKED
      )
      RETURNING *, to_char(post_time, 'HH24:MI') AS post_time`
  );
  return rows[0] || null;
}

// Lease a specific automation for a manual "Post now"; null if it's already running.
export async function claimById(workspaceId, id) {
  const { rows } = await query(
    `UPDATE instagram_automations SET locked_until = now() + interval '10 minutes'
      WHERE id = $1 AND workspace_id = $2 AND (locked_until IS NULL OR locked_until < now())
      RETURNING *, to_char(post_time, 'HH24:MI') AS post_time`,
    [id, workspaceId]
  );
  return rows[0] || null;
}

// Release the lease. Scheduled runs advance the schedule: success → next daily
// slot; failure → retry in 1 hour, up to 2 retries, then give up until tomorrow.
export async function finishRun(id, { trigger, ok }) {
  let schedule = '';
  if (trigger === 'schedule') {
    schedule = ok
      ? `, retry_count = 0, next_run_at = ${NEXT_RUN}`
      : `, retry_count = CASE WHEN retry_count < 2 THEN retry_count + 1 ELSE 0 END,
           next_run_at = CASE WHEN retry_count < 2 THEN now() + interval '1 hour' ELSE ${NEXT_RUN} END`;
  }
  await query(
    `UPDATE instagram_automations
        SET locked_until = NULL, last_run_at = now() ${schedule}
      WHERE id = $1`,
    [id]
  );
}

// ─── Post log / rotation ledger ──────────────────────────────────────────────

export async function logPost(automation, p) {
  const { rows } = await query(
    `INSERT INTO instagram_posts
       (automation_id, workspace_id, trigger, product_id, product_title, product_url,
        image_count, caption, status, ig_media_id, permalink, error)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [automation.id, automation.workspace_id, p.trigger, p.productId || null, p.productTitle || null,
     p.productUrl || null, p.imageCount || null, p.caption || null, p.status, p.igMediaId || null,
     p.permalink || null, p.error ? String(p.error).slice(0, 1000) : null]
  );
  return rows[0];
}

// Rotation ledger: every post from this website to this Instagram account across
// ALL jobs (so two daily jobs never pick the same product), oldest first.
export async function productHistory(automation) {
  const { rows } = await query(
    `SELECT p.product_id, p.status, p.created_at
       FROM instagram_posts p
       JOIN instagram_automations a ON a.id = p.automation_id
      WHERE a.workspace_id = $1 AND a.site_url = $2 AND a.account_id = $3 AND p.product_id IS NOT NULL
      ORDER BY p.created_at`,
    [automation.workspace_id, automation.site_url, automation.account_id]
  );
  return rows;
}

export async function listPosts(workspaceId, automationId, limit = 50) {
  const { rows } = await query(
    `SELECT * FROM instagram_posts WHERE automation_id = $1 AND workspace_id = $2
      ORDER BY created_at DESC LIMIT $3`,
    [automationId, workspaceId, limit]
  );
  return rows;
}
