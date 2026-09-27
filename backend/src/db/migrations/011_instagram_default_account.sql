-- One default Instagram account per workspace (preselected by the Scheduler and
-- Business DNA, and the account future comment auto-reply will watch), plus when
-- its connection was last live-checked against the Instagram API.
ALTER TABLE instagram_accounts ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;
ALTER TABLE instagram_accounts ADD COLUMN IF NOT EXISTS last_checked_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_instagram_accounts_one_default
  ON instagram_accounts(workspace_id) WHERE is_default;

-- Backfill: in every workspace without a default, the oldest account becomes it.
UPDATE instagram_accounts SET is_default = true
 WHERE id IN (
   SELECT DISTINCT ON (workspace_id) id FROM instagram_accounts
    WHERE workspace_id NOT IN (SELECT workspace_id FROM instagram_accounts WHERE is_default)
    ORDER BY workspace_id, created_at
 );
