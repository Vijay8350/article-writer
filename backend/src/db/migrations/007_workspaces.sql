-- Workspace = the tenant (the billable account). A user can belong to multiple.
CREATE TABLE IF NOT EXISTS workspaces (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  slug          citext UNIQUE NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status        text NOT NULL DEFAULT 'active',  -- active | suspended
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Per-workspace user roles: owner | admin | member.
-- (Global users.role 'superadmin'/'admin'/'user' is the vendor tier — separate.)
CREATE TABLE IF NOT EXISTS memberships (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  role         text NOT NULL DEFAULT 'member',
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);

CREATE TABLE IF NOT EXISTS invitations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email        citext NOT NULL,
  role         text NOT NULL DEFAULT 'member',
  token_hash   text NOT NULL,
  invited_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  expires_at   timestamptz NOT NULL,
  accepted_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_workspace ON invitations(workspace_id);

-- Backfill: each existing user gets a personal workspace with themselves as owner.
INSERT INTO workspaces (id, name, slug, owner_user_id)
SELECT
  gen_random_uuid(),
  COALESCE(NULLIF(u.name, ''), split_part(u.email::text, '@', 1)) || '''s Workspace',
  split_part(u.email::text, '@', 1) || '-' || substring(gen_random_uuid()::text from 1 for 6),
  u.id
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.owner_user_id = u.id);

-- Owner membership for each backfilled workspace.
INSERT INTO memberships (workspace_id, user_id, role)
SELECT w.id, w.owner_user_id, 'owner'
  FROM workspaces w
  WHERE NOT EXISTS (
    SELECT 1 FROM memberships m
      WHERE m.workspace_id = w.id AND m.user_id = w.owner_user_id
  );
