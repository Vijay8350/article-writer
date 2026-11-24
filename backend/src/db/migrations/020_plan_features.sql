-- Feature-by-feature plans, edited in the Admin console (lib/planFeatures.js).
-- plans.features (from 004) holds { features: {key: bool}, limits: {key: n|null} };
-- missing keys mean ON / unlimited, so existing plans keep everything until edited.
ALTER TABLE plans ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 0;
UPDATE plans SET sort_order = CASE id WHEN 'free' THEN 0 WHEN 'pro' THEN 10 WHEN 'business' THEN 20 ELSE sort_order END
 WHERE sort_order = 0 AND id IN ('pro', 'business');

-- One workspace's own changes to its plan, same shape as plans.features (a key wins).
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS overrides jsonb NOT NULL DEFAULT '{}';
