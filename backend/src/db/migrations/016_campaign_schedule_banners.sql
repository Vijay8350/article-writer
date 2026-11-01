-- Campaign names, written instructions, a start/end window (NULL end = no end date)
-- and how many images go in one post, across daily product jobs, Instagram campaigns
-- and blog campaigns. Product jobs always post generated images now, so image_mode goes.

ALTER TABLE instagram_automations ADD COLUMN IF NOT EXISTS name            text;
ALTER TABLE instagram_automations ADD COLUMN IF NOT EXISTS starts_at       timestamptz;
ALTER TABLE instagram_automations ADD COLUMN IF NOT EXISTS ends_at         timestamptz;
ALTER TABLE instagram_automations ADD COLUMN IF NOT EXISTS images_per_post int NOT NULL DEFAULT 1;
ALTER TABLE instagram_automations DROP COLUMN IF EXISTS image_mode;
ALTER TABLE instagram_automations ALTER COLUMN image_style SET DEFAULT 'banner';
UPDATE instagram_automations SET image_style = 'banner' WHERE image_style IS NULL;

-- A post with several images keeps its first one in image_file (the cover).
ALTER TABLE ig_product_images  ADD COLUMN IF NOT EXISTS images_per_post   int NOT NULL DEFAULT 1;
ALTER TABLE ig_product_images  ADD COLUMN IF NOT EXISTS extra_image_files text[] NOT NULL DEFAULT '{}';
ALTER TABLE ig_generated_posts ADD COLUMN IF NOT EXISTS extra_image_files text[] NOT NULL DEFAULT '{}';

ALTER TABLE ig_campaigns ADD COLUMN IF NOT EXISTS instructions    text;
ALTER TABLE ig_campaigns ADD COLUMN IF NOT EXISTS starts_at       timestamptz;
ALTER TABLE ig_campaigns ADD COLUMN IF NOT EXISTS ends_at         timestamptz;
ALTER TABLE ig_campaigns ADD COLUMN IF NOT EXISTS images_per_post int NOT NULL DEFAULT 1;

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS instructions    text;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS starts_at       timestamptz;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ends_at         timestamptz;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS images_per_post int NOT NULL DEFAULT 3; -- hero + inline images per article
