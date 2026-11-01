-- Dashboard analytics: attribute article activity (generate / publish / save_draft)
-- to the workspace it happened in, not just the user. Backfill maps old rows to
-- the one workspace the user belongs to; users in several workspaces keep NULL
-- for their old rows (those are counted under the user's first workspace by the
-- dashboard query's fallback join).
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_activity_log_workspace ON activity_log(workspace_id, created_at DESC);

UPDATE activity_log a SET workspace_id = m.workspace_id
  FROM (SELECT user_id, min(workspace_id::text)::uuid AS workspace_id
          FROM memberships GROUP BY user_id HAVING count(*) = 1) m
 WHERE a.workspace_id IS NULL AND a.user_id = m.user_id
   AND a.action IN ('generate', 'publish', 'save_draft');
