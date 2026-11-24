-- The public Shopify app: stores connected by OAuth or installed from the Shopify App
-- Store (expiring offline tokens + refresh tokens), workspaces that come from a Shopify
-- install, Shopify Billing, and webhook de-duplication. Idempotent.

-- ── Stores: how they were connected, and the refreshable token ──────────────────
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS shop_domain text;
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS auth_source text NOT NULL DEFAULT 'token'; -- token (pasted) | oauth (Connect with Shopify) | app (installed from Shopify)
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS refresh_token_encrypted text;
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS token_expires_at timestamptz;
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS refresh_expires_at timestamptz;
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS scopes text;
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS needs_reconnect boolean NOT NULL DEFAULT false;
ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE shopify_stores
   SET shop_domain = lower(regexp_replace(regexp_replace(store_url, '^https?://', ''), '/.*$', ''))
 WHERE shop_domain IS NULL;

-- One app connection per shop (Shopify issues one token per shop and app); a pasted
-- token can still sit in any workspace.
CREATE UNIQUE INDEX IF NOT EXISTS uq_shopify_stores_app_shop
  ON shopify_stores (shop_domain) WHERE auth_source <> 'token';

-- ── Workspaces created by a Shopify install ─────────────────────────────────────
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'web';   -- web | shopify
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS shopify_shop text;                    -- xyz.myshopify.com for origin = shopify
CREATE UNIQUE INDEX IF NOT EXISTS uq_workspaces_shopify_shop
  ON workspaces (shopify_shop) WHERE shopify_shop IS NOT NULL;

-- The account behind a Shopify install: no password, can't sign in on the website.
ALTER TABLE users ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'web';          -- web | shopify

-- ── Shopify Billing ─────────────────────────────────────────────────────────────
ALTER TABLE plans ADD COLUMN IF NOT EXISTS price_usd numeric(10, 2);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_source text NOT NULL DEFAULT 'manual'; -- manual | shopify
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS shopify_subscription_id text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS shopify_status text;
-- A charge the merchant hasn't approved yet, and the plan it's for.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS shopify_pending_id text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS shopify_pending_plan text;

-- ── Webhooks: each delivery is handled once ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS shopify_webhook_events (
  event_id    text PRIMARY KEY,
  topic       text NOT NULL,
  shop_domain text,
  received_at timestamptz NOT NULL DEFAULT now()
);
