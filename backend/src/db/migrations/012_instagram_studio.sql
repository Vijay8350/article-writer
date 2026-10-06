-- Instagram Studio (ported from the Insta Post Generator tool): AI quote posts
-- whose image must pass a vision quality gate before publishing, per-account
-- Account DNA + prompt library, autopilot posting slots, campaigns, comment
-- auto-reply/moderation, Business DNA deep research and post analytics.
-- Every table is workspace-scoped and hangs off instagram_accounts.

ALTER TABLE instagram_accounts ADD COLUMN IF NOT EXISTS page_id text;
ALTER TABLE instagram_accounts ADD COLUMN IF NOT EXISTS connected_via text NOT NULL DEFAULT 'token'; -- token | facebook_login

-- Plan allowance for generated Instagram posts, metered like articles (a new
-- post counts once; regenerating its image doesn't). Seeded only when the
-- column is first added, so later admin edits survive re-runs.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = current_schema() AND table_name = 'plans' AND column_name = 'monthly_ig_post_limit') THEN
    ALTER TABLE plans ADD COLUMN monthly_ig_post_limit int NOT NULL DEFAULT 10;
    UPDATE plans SET monthly_ig_post_limit = CASE id WHEN 'pro' THEN 100 WHEN 'business' THEN 400 ELSE 10 END;
  END IF;
END $$;
ALTER TABLE usage_counters ADD COLUMN IF NOT EXISTS ig_posts_generated int NOT NULL DEFAULT 0;

-- ── Account DNA: voice, audience, visual identity + the autopilot schedule ──
CREATE TABLE IF NOT EXISTS ig_account_dna (
  account_id        uuid PRIMARY KEY REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  workspace_id      uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  persona           text,
  tone              text,
  audience          text,
  niche             text,
  content_pillars   text[] NOT NULL DEFAULT '{}',
  visual_identity   jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { palette[], mood, style, font, layout }
  language          text NOT NULL DEFAULT 'English',
  dos               text[] NOT NULL DEFAULT '{}',
  donts             text[] NOT NULL DEFAULT '{}',
  examples          text[] NOT NULL DEFAULT '{}',
  hashtag_strategy  text,
  posting_slots     text[] NOT NULL DEFAULT '{}',        -- ["08:00","20:30"], local to `timezone`
  timezone          text NOT NULL DEFAULT 'Asia/Kolkata',
  autopilot         boolean NOT NULL DEFAULT false,       -- off until switched on: it posts publicly
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ig_account_dna_workspace ON ig_account_dna(workspace_id);

-- ── Prompt library, rotated least-recently-used ─────────────────────────────
CREATE TABLE IF NOT EXISTS ig_prompts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id    uuid NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  type          text NOT NULL CHECK (type IN ('quote_idea', 'image_idea')),
  label         text NOT NULL,
  prompt_text   text NOT NULL,
  active        boolean NOT NULL DEFAULT true,
  last_used_at  timestamptz,
  use_count     int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ig_prompts_account ON ig_prompts(account_id, type, active);

-- ── Campaigns: a themed run of posts that feeds the account's autopilot slots ─
CREATE TABLE IF NOT EXISTS ig_campaigns (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id        uuid NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  name              text NOT NULL,
  topic             text,
  goal              text,
  tone              text,
  per_day           int NOT NULL DEFAULT 1,
  days              int NOT NULL DEFAULT 7,
  prompt            text,
  reference_images  text[] NOT NULL DEFAULT '{}',
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'done')),
  posts_target      int NOT NULL DEFAULT 0,
  posts_done        int NOT NULL DEFAULT 0,
  created_by        uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ig_campaigns_workspace ON ig_campaigns(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ig_campaigns_account ON ig_campaigns(account_id, status);

-- ── Ideas: the de-duplication ledger (a normalized hash per account) ────────
CREATE TABLE IF NOT EXISTS ig_content_ideas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id        uuid NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  idea              jsonb NOT NULL,                 -- { theme, angle, format, summary }
  source_prompt_id  uuid REFERENCES ig_prompts(id) ON DELETE SET NULL,
  normalized_hash   text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, normalized_hash)
);

-- ── Generated posts: text → image (+ quality gate) → publish ────────────────
CREATE TABLE IF NOT EXISTS ig_generated_posts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id      uuid NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  idea_id         uuid REFERENCES ig_content_ideas(id) ON DELETE SET NULL,
  campaign_id     uuid REFERENCES ig_campaigns(id) ON DELETE SET NULL,
  headline        text,
  lines           text[] NOT NULL DEFAULT '{}',
  caption         text,
  hashtags        text[] NOT NULL DEFAULT '{}',
  image_file      text,            -- unguessable file name under backend/media/ig
  -- draft (text only) → generating → ready (passed QA) | qa_failed → publishing → published
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'generating', 'ready', 'qa_failed', 'publishing', 'published')),
  qa_score        numeric,
  qa_reasons      text[] NOT NULL DEFAULT '{}',
  regen_attempts  int NOT NULL DEFAULT 0,
  origin          text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual', 'auto', 'campaign')),
  ig_media_id     text,
  permalink       text,
  published_at    timestamptz,
  error           text,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ig_generated_posts_account ON ig_generated_posts(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ig_generated_posts_workspace ON ig_generated_posts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ig_generated_posts_published ON ig_generated_posts(account_id, published_at) WHERE status = 'published';

CREATE TABLE IF NOT EXISTS ig_post_metrics (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       uuid NOT NULL REFERENCES ig_generated_posts(id) ON DELETE CASCADE,
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  likes         int,
  reach         int,
  saves         int,
  comments      int,
  fetched_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ig_post_metrics_post ON ig_post_metrics(post_id, fetched_at DESC);

-- Autopilot idempotency: one run per account, local day and slot — a late or
-- repeated scheduler tick can never post the same slot twice.
CREATE TABLE IF NOT EXISTS ig_slot_runs (
  account_id  uuid NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  run_date    date NOT NULL,
  slot        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, run_date, slot)
);

-- ── Business DNA per Instagram account, built by background deep research ───
CREATE TABLE IF NOT EXISTS ig_business_dna (
  account_id           uuid PRIMARY KEY REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  workspace_id         uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_name        text,
  website_url          text,
  summary              text,
  industry             text,
  offerings            text[] NOT NULL DEFAULT '{}',
  usps                 text[] NOT NULL DEFAULT '{}',
  target_customers     text,
  brand_voice          text,
  tone                 text,
  brand_values         text[] NOT NULL DEFAULT '{}',
  key_messages         text[] NOT NULL DEFAULT '{}',
  content_themes       text[] NOT NULL DEFAULT '{}',
  ctas                 text[] NOT NULL DEFAULT '{}',
  keywords             text[] NOT NULL DEFAULT '{}',
  visual_cues          text,
  language             text,
  dos                  text[] NOT NULL DEFAULT '{}',
  donts                text[] NOT NULL DEFAULT '{}',
  use_in_generation    boolean NOT NULL DEFAULT true,
  sources              jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at         timestamptz,
  research_status      text NOT NULL DEFAULT 'idle'
                       CHECK (research_status IN ('idle', 'queued', 'researching', 'analyzing', 'done', 'error')),
  research_request     jsonb NOT NULL DEFAULT '{}'::jsonb,   -- { website_url, include_instagram, requested_at }
  research_progress    jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{ at, step, detail, level }]
  research_notes       jsonb,                                -- facts, voice samples, customer signals, gaps, stats
  research_error       text,
  research_started_at  timestamptz,
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ig_business_dna_workspace ON ig_business_dna(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ig_business_dna_queue ON ig_business_dna(research_status, updated_at)
  WHERE research_status IN ('queued', 'researching', 'analyzing');

-- ── Comments: AI review, auto-hide of bad ones, drafted/auto-sent replies ───
-- No settings row = the account's comments aren't monitored.
CREATE TABLE IF NOT EXISTS ig_comment_settings (
  account_id         uuid PRIMARY KEY REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  workspace_id       uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  reply_mode         text NOT NULL DEFAULT 'review' CHECK (reply_mode IN ('off', 'review', 'auto')),
  auto_hide          boolean NOT NULL DEFAULT true,
  daily_reply_limit  int NOT NULL DEFAULT 30 CHECK (daily_reply_limit BETWEEN 0 AND 200),
  last_checked_at    timestamptz,
  last_error         text,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ig_comments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id       uuid NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  ig_comment_id    text NOT NULL,
  ig_media_id      text NOT NULL,
  media_permalink  text,
  media_caption    text,
  author           text,
  text             text NOT NULL,
  commented_at     timestamptz,
  verdict          text,          -- positive | question | neutral | bad
  category         text,          -- for bad ones: spam, scam, abuse, hate, sexual, self_promotion, other
  reason           text,
  confidence       numeric,
  -- new → draft | replying → replied | done | flagged → approved | reviewed | deleted | error
  status           text NOT NULL DEFAULT 'new',
  hidden           boolean NOT NULL DEFAULT false,
  reply_text       text,
  reply_ig_id      text,
  replied_at       timestamptz,
  reviewed_at      timestamptz,
  error            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, ig_comment_id)
);
CREATE INDEX IF NOT EXISTS idx_ig_comments_workspace ON ig_comments(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_ig_comments_replied ON ig_comments(account_id, replied_at) WHERE status = 'replied';

-- ── Activity log for every pipeline/comment/research step ───────────────────
-- workspace_id is NULL only for Meta data-deletion requests (not tied to a tenant).
CREATE TABLE IF NOT EXISTS ig_jobs_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id    uuid REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  post_id       uuid REFERENCES ig_generated_posts(id) ON DELETE SET NULL,
  stage         text NOT NULL,
  level         text NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warn', 'error')),
  message       text NOT NULL,
  context       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ig_jobs_log_account ON ig_jobs_log(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ig_jobs_log_stage ON ig_jobs_log(stage, created_at DESC);
