-- Per-user Shopify stores (access token encrypted at rest)
CREATE TABLE IF NOT EXISTS shopify_stores (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_url              text NOT NULL,
  access_token_encrypted text NOT NULL,
  shop_name              text,
  is_default             boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shopify_stores_user ON shopify_stores(user_id);

-- Optional per-user AI key overrides (fall back to platform keys when null)
CREATE TABLE IF NOT EXISTS ai_credentials (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  gemini_key_encrypted   text,
  deepseek_key_encrypted text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- Per-user Business DNA snapshot (replaces backend/src/data/businessDna.json)
CREATE TABLE IF NOT EXISTS business_dna (
  user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  store_id   uuid REFERENCES shopify_stores(id) ON DELETE SET NULL,
  data       jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
