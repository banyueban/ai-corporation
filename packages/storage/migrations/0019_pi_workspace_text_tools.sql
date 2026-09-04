ALTER TABLE pi_task
ADD COLUMN workspace_id TEXT REFERENCES workspace(id);

CREATE TABLE pi_workspace_write (
  tool_call_id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL REFERENCES pi_task(id) ON DELETE CASCADE,
  relative_path TEXT NOT NULL,
  base_sha256 TEXT,
  target_sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('STARTING', 'SUCCEEDED', 'FAILED', 'UNKNOWN')),
  result_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_pi_workspace_write_task
ON pi_workspace_write(task_id, created_at, tool_call_id);
