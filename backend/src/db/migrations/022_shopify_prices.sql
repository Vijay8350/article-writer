-- Starting USD prices for Shopify Billing (stores outside India), close to the INR prices
-- (₹999 ≈ $12, ₹2,999 ≈ $36). Only fills a price that isn't set; Admin → Plans changes them.
UPDATE plans SET price_usd = 12 WHERE id = 'pro' AND price_usd IS NULL;
UPDATE plans SET price_usd = 36 WHERE id = 'business' AND price_usd IS NULL;
