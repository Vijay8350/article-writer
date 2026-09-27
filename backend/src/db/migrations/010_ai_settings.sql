-- Per-workspace AI preferences, stored next to the workspace's encrypted AI keys:
--   { "providers": { "article": "gemini|deepseek", "enhance": …, "businessDna": … },
--     "deepseekModel": "deepseek-chat" }
-- '{}' means "use the platform defaults" (see services/ai.js).
ALTER TABLE ai_credentials ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;
