-- Category-driven automated content campaigns
CREATE TABLE IF NOT EXISTS campaigns (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              text NOT NULL,
  collection_handle text,
  collection_title  text NOT NULL,
  cadence           text NOT NULL DEFAULT 'manual',   -- manual | daily | monthly
  articles_per_run  int  NOT NULL DEFAULT 1,
  word_count        int  NOT NULL DEFAULT 1500,
  ai_model          text NOT NULL DEFAULT 'gemini',
  blog_id           text,
  publish_mode      text NOT NULL DEFAULT 'draft',     -- live | draft
  status            text NOT NULL DEFAULT 'active',    -- active | paused
  run_remaining     int  NOT NULL DEFAULT 0,           -- articles left in the current run
  next_run_at       timestamptz,                       -- when the next run is due (NULL = idle/manual)
  last_run_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campaigns_user ON campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_due ON campaigns(status, next_run_at);

-- Log of every article a campaign produced (also the dedup ledger of covered topics)
CREATE TABLE IF NOT EXISTS campaign_articles (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id          uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id              uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  keyword              text,
  title                text,
  status               text NOT NULL,   -- published | draft | failed | skipped_duplicate | limit_reached
  published_article_id text,
  error                text,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campaign_articles_campaign ON campaign_articles(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_articles_user ON campaign_articles(user_id);
