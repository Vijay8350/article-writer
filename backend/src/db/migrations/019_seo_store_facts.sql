-- SEO automation: the store's own facts (does it take Cash on Delivery, is there free
-- shipping), so the audit can catch product text that promises otherwise.
--   store_facts: { "cod": false, "freeShipping": "none" | "all" | "over", "freeShippingMin": 999 }
-- NULL means the owner hasn't said yet, and nothing is checked.

ALTER TABLE seo_settings ADD COLUMN IF NOT EXISTS store_facts jsonb;
ALTER TABLE seo_settings ADD COLUMN IF NOT EXISTS fix_claims boolean NOT NULL DEFAULT true; -- remove promises the facts contradict
