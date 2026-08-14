CREATE TABLE pi_employee (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  provider_id TEXT NOT NULL REFERENCES provider(id),
  provider_version INTEGER NOT NULL CHECK (provider_version >= 1),
  model_id TEXT NOT NULL CHECK (length(model_id) BETWEEN 1 AND 512),
  skill_name TEXT NOT NULL CHECK (length(skill_name) BETWEEN 1 AND 64),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_pi_employee_updated
ON pi_employee(updated_at DESC, id);
