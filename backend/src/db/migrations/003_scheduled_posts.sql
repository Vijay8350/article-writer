CREATE TABLE IF NOT EXISTS scheduled_posts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id             uuid REFERENCES shopify_stores(id) ON DELETE SET NULL,
  blog_id              text,
  topic                text NOT NULL,
  word_count           int,
  ai_model             text,
  run_at               timestamptz NOT NULL,
  status               text NOT NULL DEFAULT 'pending', -- pending | processing | published | failed
  published_article_id text,
  error                text,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_user ON scheduled_posts(user_id);
-- The worker polls on (status, run_at); index it.
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_due ON scheduled_posts(status, run_at);
