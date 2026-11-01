-- SEO automation: a daily full-site audit, Google Search Console data, fixes written by
-- AI and applied to Shopify, and a log of every change so each one can be undone.

CREATE TABLE IF NOT EXISTS seo_settings (
  workspace_id    uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  enabled         boolean NOT NULL DEFAULT false,
  run_time        time NOT NULL DEFAULT '03:00',
  timezone        text NOT NULL DEFAULT 'Asia/Kolkata',
  max_fixes       int  NOT NULL DEFAULT 10,        -- pages improved per run
  fix_meta        boolean NOT NULL DEFAULT true,   -- meta titles and descriptions
  fix_alt         boolean NOT NULL DEFAULT true,   -- product image alt text
  fix_links       boolean NOT NULL DEFAULT true,   -- dead links inside articles
  fix_articles    boolean NOT NULL DEFAULT false,  -- rewrites article text, so it starts off
  next_run_at     timestamptz,
  last_run_at     timestamptz,
  locked_until    timestamptz,                     -- one audit at a time per workspace
  google_refresh_token_encrypted text,
  google_email    text,
  google_site     text,                            -- Search Console property
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_seo_settings_due ON seo_settings(enabled, next_run_at);

CREATE TABLE IF NOT EXISTS seo_audits (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  trigger       text NOT NULL DEFAULT 'schedule',  -- schedule | manual
  status        text NOT NULL DEFAULT 'running',   -- running | done | failed
  pages_checked int  NOT NULL DEFAULT 0,
  issues_found  int  NOT NULL DEFAULT 0,
  fixes_applied int  NOT NULL DEFAULT 0,
  score         int,
  search        jsonb,                             -- Search Console summary for this run
  error         text,
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_seo_audits_workspace ON seo_audits(workspace_id, started_at DESC);

CREATE TABLE IF NOT EXISTS seo_issues (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  audit_id      uuid REFERENCES seo_audits(id) ON DELETE SET NULL,
  resource_type text NOT NULL,                     -- product | collection | article | page
  resource_id   text NOT NULL,
  blog_id       text,
  url           text,
  title         text,
  type          text NOT NULL,                     -- see lib/seoRules.js
  severity      text NOT NULL,                     -- critical | high | medium | low
  detail        text,
  status        text NOT NULL DEFAULT 'open',      -- open | fixed | resolved | ignored
  first_seen    timestamptz NOT NULL DEFAULT now(),
  last_seen     timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz,
  UNIQUE (workspace_id, resource_type, resource_id, type)
);
CREATE INDEX IF NOT EXISTS idx_seo_issues_open ON seo_issues(workspace_id, status);

CREATE TABLE IF NOT EXISTS seo_changes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  audit_id      uuid REFERENCES seo_audits(id) ON DELETE SET NULL,
  resource_type text NOT NULL,
  resource_id   text NOT NULL,
  blog_id       text,
  url           text,
  title         text,
  field         text NOT NULL,                     -- meta | image_alt | article_links | article_body
  before_value  jsonb,
  after_value   jsonb,
  source        text NOT NULL DEFAULT 'auto',      -- auto | manual
  status        text NOT NULL DEFAULT 'applied',   -- applied | undone
  created_at    timestamptz NOT NULL DEFAULT now(),
  undone_at     timestamptz
);
CREATE INDEX IF NOT EXISTS idx_seo_changes_workspace ON seo_changes(workspace_id, created_at DESC);
