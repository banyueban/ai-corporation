CREATE TABLE pi_task_deliverable (
  task_id TEXT NOT NULL REFERENCES pi_task(id) ON DELETE CASCADE,
  relative_path TEXT NOT NULL CHECK (length(relative_path) BETWEEN 1 AND 32767),
  source TEXT NOT NULL CHECK (source IN ('WORKSPACE_WRITE', 'COMMAND_REGISTERED')),
  change_kind TEXT NOT NULL CHECK (change_kind IN ('CREATED', 'MODIFIED', 'REGISTERED')),
  sha256 TEXT NOT NULL CHECK (
    length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 0 AND 104857600),
  diff_text TEXT CHECK (diff_text IS NULL OR length(diff_text) <= 2200000),
  source_call_id TEXT NOT NULL,
  registered_at TEXT NOT NULL,
  PRIMARY KEY (task_id, relative_path)
) STRICT;

CREATE INDEX idx_pi_task_deliverable_registered
ON pi_task_deliverable(task_id, registered_at, relative_path);
