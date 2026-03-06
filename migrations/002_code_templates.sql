CREATE TABLE IF NOT EXISTS code_templates (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    TEXT UNIQUE NOT NULL,
  description             TEXT DEFAULT NULL,
  role_ids                TEXT[] DEFAULT '{}',
  channel_ids             TEXT[] DEFAULT '{}',
  default_max_uses        INTEGER DEFAULT NULL,
  default_expires_in_days INTEGER DEFAULT NULL,
  default_notes           TEXT DEFAULT NULL,
  is_active               BOOLEAN DEFAULT TRUE,
  created_by              TEXT NOT NULL,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  edited_by               TEXT DEFAULT NULL,
  edited_at               TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_code_templates_name_lower 
  ON code_templates (lower(name));
