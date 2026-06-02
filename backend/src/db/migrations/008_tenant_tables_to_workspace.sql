-- Move every tenant table from user_id scoping to workspace_id scoping.
-- For each table, the backfill maps an existing row to the workspace OWNED by
-- the row's user (created by migration 007). All statements are idempotent.

-- ── shopify_stores ───────────────────────────────────────────────────────────
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
UPDATE shopify_stores s SET workspace_id = w.id
  FROM workspaces w WHERE w.owner_user_id = s.user_id AND s.workspace_id IS NULL;
ALTER TABLE shopify_stores ALTER COLUMN workspace_id SET NOT NULL;
DROP INDEX IF EXISTS idx_shopify_stores_user;
ALTER TABLE shopify_stores DROP COLUMN IF EXISTS user_id;
CREATE INDEX IF NOT EXISTS idx_shopify_stores_workspace ON shopify_stores(workspace_id);

-- ── ai_credentials (was UNIQUE user_id) ──────────────────────────────────────
ALTER TABLE ai_credentials ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
UPDATE ai_credentials c SET workspace_id = w.id
  FROM workspaces w WHERE w.owner_user_id = c.user_id AND c.workspace_id IS NULL;
ALTER TABLE ai_credentials ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE ai_credentials DROP CONSTRAINT IF EXISTS ai_credentials_user_id_key;
ALTER TABLE ai_credentials DROP COLUMN IF EXISTS user_id;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_credentials_workspace_id_key') THEN
    ALTER TABLE ai_credentials ADD CONSTRAINT ai_credentials_workspace_id_key UNIQUE (workspace_id);
  END IF;
END $$;

-- ── business_dna (was PRIMARY KEY user_id) ───────────────────────────────────
ALTER TABLE business_dna ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
UPDATE business_dna bd SET workspace_id = w.id
  FROM workspaces w WHERE w.owner_user_id = bd.user_id AND bd.workspace_id IS NULL;
ALTER TABLE business_dna ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE business_dna DROP CONSTRAINT IF EXISTS business_dna_pkey;
ALTER TABLE business_dna DROP COLUMN IF EXISTS user_id;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'business_dna'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE business_dna ADD PRIMARY KEY (workspace_id);
  END IF;
END $$;

-- ── scheduled_posts (keep user_id → created_by) ──────────────────────────────
ALTER TABLE scheduled_posts ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
UPDATE scheduled_posts sp SET workspace_id = w.id
  FROM workspaces w WHERE w.owner_user_id = sp.user_id AND sp.workspace_id IS NULL;
ALTER TABLE scheduled_posts ALTER COLUMN workspace_id SET NOT NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scheduled_posts' AND column_name='user_id') THEN
    ALTER TABLE scheduled_posts RENAME COLUMN user_id TO created_by;
  END IF;
END $$;
DROP INDEX IF EXISTS idx_scheduled_posts_user;
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_workspace ON scheduled_posts(workspace_id);

-- ── campaigns (keep user_id → created_by) ────────────────────────────────────
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
UPDATE campaigns c SET workspace_id = w.id
  FROM workspaces w WHERE w.owner_user_id = c.user_id AND c.workspace_id IS NULL;
ALTER TABLE campaigns ALTER COLUMN workspace_id SET NOT NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaigns' AND column_name='user_id') THEN
    ALTER TABLE campaigns RENAME COLUMN user_id TO created_by;
  END IF;
END $$;
DROP INDEX IF EXISTS idx_campaigns_user;
CREATE INDEX IF NOT EXISTS idx_campaigns_workspace ON campaigns(workspace_id);

-- ── campaign_articles ────────────────────────────────────────────────────────
ALTER TABLE campaign_articles ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
UPDATE campaign_articles ca SET workspace_id = w.id
  FROM workspaces w WHERE w.owner_user_id = ca.user_id AND ca.workspace_id IS NULL;
ALTER TABLE campaign_articles ALTER COLUMN workspace_id SET NOT NULL;
DROP INDEX IF EXISTS idx_campaign_articles_user;
ALTER TABLE campaign_articles DROP COLUMN IF EXISTS user_id;
CREATE INDEX IF NOT EXISTS idx_campaign_articles_workspace ON campaign_articles(workspace_id);

-- ── subscriptions (was PRIMARY KEY user_id) ──────────────────────────────────
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
UPDATE subscriptions s SET workspace_id = w.id
  FROM workspaces w WHERE w.owner_user_id = s.user_id AND s.workspace_id IS NULL;
ALTER TABLE subscriptions ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_pkey;
ALTER TABLE subscriptions DROP COLUMN IF EXISTS user_id;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'subscriptions'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE subscriptions ADD PRIMARY KEY (workspace_id);
  END IF;
END $$;

-- ── usage_counters (was PK (user_id, period)) ────────────────────────────────
ALTER TABLE usage_counters ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
UPDATE usage_counters uc SET workspace_id = w.id
  FROM workspaces w WHERE w.owner_user_id = uc.user_id AND uc.workspace_id IS NULL;
ALTER TABLE usage_counters ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE usage_counters DROP CONSTRAINT IF EXISTS usage_counters_pkey;
ALTER TABLE usage_counters DROP COLUMN IF EXISTS user_id;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'usage_counters'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE usage_counters ADD PRIMARY KEY (workspace_id, period);
  END IF;
END $$;

-- ── upgrade_requests (keep user_id → requested_by) ───────────────────────────
ALTER TABLE upgrade_requests ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
UPDATE upgrade_requests ur SET workspace_id = w.id
  FROM workspaces w WHERE w.owner_user_id = ur.user_id AND ur.workspace_id IS NULL;
ALTER TABLE upgrade_requests ALTER COLUMN workspace_id SET NOT NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='upgrade_requests' AND column_name='user_id') THEN
    ALTER TABLE upgrade_requests RENAME COLUMN user_id TO requested_by;
  END IF;
END $$;
DROP INDEX IF EXISTS idx_upgrade_requests_user;
CREATE INDEX IF NOT EXISTS idx_upgrade_requests_workspace ON upgrade_requests(workspace_id);
