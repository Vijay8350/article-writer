-- Instagram autopost: connected Instagram professional accounts, scheduler jobs
-- (public Shopify storefront → Instagram account at a daily time; many per site),
-- and a post log that doubles as the product rotation ledger.

CREATE TABLE IF NOT EXISTS instagram_accounts (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id           uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ig_user_id             text NOT NULL,
  username               text,
  token_type             text NOT NULL,          -- instagram (IGAA…, Instagram Login) | facebook (EAA…, Facebook Login)
  access_token_encrypted text NOT NULL,
  token_expires_at       timestamptz,            -- NULL = unknown / non-expiring
  token_next_refresh_at  timestamptz,            -- only for token_type = instagram
  token_error            text,
  created_by             uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, ig_user_id)
);
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_refresh ON instagram_accounts(token_type, token_next_refresh_at);

CREATE TABLE IF NOT EXISTS instagram_automations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id           uuid NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  site_url             text NOT NULL,                  -- canonical https://domain
  site_name            text,
  currency             text,
  post_time            time NOT NULL DEFAULT '10:00',  -- wall-clock time in `timezone`
  timezone             text NOT NULL DEFAULT 'Asia/Kolkata',
  caption_instructions text,
  hashtags             text,                           -- always appended, e.g. "#glowfinch #jewellery"
  status               text NOT NULL DEFAULT 'active', -- active | paused
  retry_count          int  NOT NULL DEFAULT 0,        -- failed attempts since the last scheduled success
  next_run_at          timestamptz,
  last_run_at          timestamptz,
  locked_until         timestamptz,                    -- run lease so scheduler + "Post now" never double-post
  created_by           uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_instagram_automations_workspace ON instagram_automations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_instagram_automations_due ON instagram_automations(status, next_run_at);

CREATE TABLE IF NOT EXISTS instagram_posts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id  uuid NOT NULL REFERENCES instagram_automations(id) ON DELETE CASCADE,
  workspace_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  trigger        text NOT NULL DEFAULT 'schedule',  -- schedule | manual
  product_id     text,
  product_title  text,
  product_url    text,
  image_count    int,
  caption        text,
  status         text NOT NULL,                     -- published | failed
  ig_media_id    text,
  permalink      text,
  error          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_instagram_posts_automation ON instagram_posts(automation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_instagram_posts_workspace ON instagram_posts(workspace_id);
