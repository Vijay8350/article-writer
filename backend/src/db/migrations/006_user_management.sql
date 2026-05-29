-- User status (approval gate). Existing users become 'active'; NEW signups default to 'pending'.
ALTER TABLE users ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE users ALTER COLUMN status SET DEFAULT 'pending';

-- Promote the existing seeded admin to superadmin (there is exactly one).
UPDATE users SET role = 'superadmin' WHERE role = 'admin';

-- Activity feed (logins, generations, publishes, admin actions, etc.)
CREATE TABLE IF NOT EXISTS activity_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES users(id) ON DELETE CASCADE,
  action     text NOT NULL,
  detail     text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at DESC);

-- In-app plan upgrade requests
CREATE TABLE IF NOT EXISTS upgrade_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_plan text NOT NULL REFERENCES plans(id),
  status         text NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  note           text,
  resolved_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  resolved_at    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_upgrade_requests_status ON upgrade_requests(status);
CREATE INDEX IF NOT EXISTS idx_upgrade_requests_user ON upgrade_requests(user_id);
