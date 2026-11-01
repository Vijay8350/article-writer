-- Which design each Instagram image used (layout, concept, frame, wording), so the
-- next one for that account can avoid repeating it. '{}' = made before this existed.
ALTER TABLE ig_product_images  ADD COLUMN IF NOT EXISTS variant jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE ig_generated_posts ADD COLUMN IF NOT EXISTS variant jsonb NOT NULL DEFAULT '{}'::jsonb;
