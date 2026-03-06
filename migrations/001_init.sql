CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS invite_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  uses        INTEGER NOT NULL DEFAULT 0,
  max_uses    INTEGER,
  expires_at  TIMESTAMPTZ,
  role_ids    TEXT[] NOT NULL DEFAULT '{}',
  channel_ids TEXT[] NOT NULL DEFAULT '{}',
  notes       TEXT,
  created_by  TEXT,
  edited_by   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS redemptions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id          UUID NOT NULL REFERENCES invite_codes(id) ON DELETE CASCADE,
  code             TEXT NOT NULL,
  user_id          TEXT NOT NULL,
  username         TEXT NOT NULL,
  roles_granted    TEXT[] NOT NULL DEFAULT '{}',
  channels_granted TEXT[] NOT NULL DEFAULT '{}',
  is_revoked       BOOLEAN NOT NULL DEFAULT FALSE,
  redeemed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action       TEXT NOT NULL,
  performed_by TEXT,
  target_code  TEXT,
  details      JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
