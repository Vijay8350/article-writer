-- A password-protected online store (every development store, and many stores before
-- launch) answers every page with Shopify's password page, so the SEO check can't read its
-- live pages. Such a run says so here, and the SEO page explains it to the owner. Idempotent.
--
-- seo_issues.status also gains 'unchecked' (no constraint to change): a problem only the
-- live page could show, set aside by a run that couldn't read it. Not on any list, never
-- counted as fixed or gone, and open again when a later check finds it.
ALTER TABLE seo_audits ADD COLUMN IF NOT EXISTS password_protected boolean NOT NULL DEFAULT false;
