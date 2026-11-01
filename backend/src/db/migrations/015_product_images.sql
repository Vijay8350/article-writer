-- AI product images: a store's real product photo → a generated Instagram image
-- (compared against that photo by the vision gate) → posted by hand or by a daily
-- job. Daily jobs are ordinary instagram_automations with image_mode = 'ai', so
-- they share the same rotation, lease and schedule as the store-photo jobs.

ALTER TABLE instagram_automations ADD COLUMN IF NOT EXISTS image_mode  text NOT NULL DEFAULT 'photo'; -- photo | ai
ALTER TABLE instagram_automations ADD COLUMN IF NOT EXISTS image_style text; -- style key (lib/igPrompts.js); NULL = a different one each time
ALTER TABLE instagram_automations ADD COLUMN IF NOT EXISTS image_notes text; -- art direction for the image model

ALTER TABLE instagram_posts ADD COLUMN IF NOT EXISTS image_source text; -- photo | ai

CREATE TABLE IF NOT EXISTS ig_product_images (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id    uuid REFERENCES instagram_accounts(id) ON DELETE SET NULL,
  automation_id uuid REFERENCES instagram_automations(id) ON DELETE SET NULL, -- set when a daily job made it
  site_url      text NOT NULL,
  site_name     text,
  currency      text,
  product_id    text NOT NULL,
  product_title text,
  product_url   text,
  source_image  text,                                -- the store photo it was made from
  style         text,
  notes         text,
  image_file    text,                                -- backend/media/ig/<random>.jpg
  caption       text,
  status        text NOT NULL DEFAULT 'generating',  -- generating | ready | qa_failed | failed | publishing | published
  prev_status   text,                                -- restored when a claimed action fails
  qa_score      int,
  qa_reasons    jsonb NOT NULL DEFAULT '[]'::jsonb,
  attempts      int NOT NULL DEFAULT 0,
  ig_media_id   text,
  permalink     text,
  error         text,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  published_at  timestamptz
);
CREATE INDEX IF NOT EXISTS idx_ig_product_images_workspace ON ig_product_images(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ig_product_images_stale ON ig_product_images(status, updated_at);
