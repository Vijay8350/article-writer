-- Comment auto-reply controls: which kinds of comments get a reply, owner-written
-- guidance for the AI's replies, and fixed keyword replies (e.g. "price" → "Check
-- your DMs!"). Plus who sent each reply, for the comment overview.
ALTER TABLE ig_comment_settings ADD COLUMN IF NOT EXISTS reply_to text[] NOT NULL DEFAULT '{question,positive,neutral}';
ALTER TABLE ig_comment_settings ADD COLUMN IF NOT EXISTS reply_instructions text;
-- [{ "keywords": ["price", "cost"], "reply": "Hi! We've sent you the details in DM 💌" }]
ALTER TABLE ig_comment_settings ADD COLUMN IF NOT EXISTS keyword_rules jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE ig_comments ADD COLUMN IF NOT EXISTS reply_source text; -- ai | rule | manual (who wrote the reply that was sent)
CREATE INDEX IF NOT EXISTS idx_ig_comments_account_time ON ig_comments(account_id, commented_at DESC);
