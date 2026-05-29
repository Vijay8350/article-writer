CREATE TABLE IF NOT EXISTS plans (
  id                   text PRIMARY KEY,            -- 'free' | 'pro' | 'business'
  name                 text NOT NULL,
  monthly_article_limit int NOT NULL,
  price_inr            int NOT NULL DEFAULT 0,
  features             jsonb NOT NULL DEFAULT '{}'
);

INSERT INTO plans (id, name, monthly_article_limit, price_inr) VALUES
  ('free',     'Free',     5,   0),
  ('pro',      'Pro',      50,  999),
  ('business', 'Business', 200, 2999)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  monthly_article_limit = EXCLUDED.monthly_article_limit,
  price_inr = EXCLUDED.price_inr;

CREATE TABLE IF NOT EXISTS subscriptions (
  user_id              uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan_id              text NOT NULL DEFAULT 'free' REFERENCES plans(id),
  status               text NOT NULL DEFAULT 'active',
  current_period_start date,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usage_counters (
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period              text NOT NULL,                -- 'YYYY-MM'
  articles_generated  int NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, period)
);
