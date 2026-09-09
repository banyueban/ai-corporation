CREATE TABLE pi_task_attachment (
  task_id TEXT NOT NULL REFERENCES pi_task(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 255),
  media_type TEXT NOT NULL CHECK (media_type IN (
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/pdf', 'text/plain', 'text/markdown'
  )),
  size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 52428800),
  sha256 TEXT NOT NULL CHECK (
    length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  storage_name TEXT NOT NULL CHECK (
    length(storage_name) BETWEEN 1 AND 100
    AND storage_name NOT GLOB '*[^a-z0-9.-]*'
  ),
  created_at TEXT NOT NULL,
  PRIMARY KEY (task_id, id),
  UNIQUE (task_id, storage_name)
) STRICT;

CREATE INDEX idx_pi_task_attachment_created
ON pi_task_attachment(task_id, created_at, id);

ALTER TABLE pi_workspace_write RENAME TO pi_workspace_write_old;

CREATE TABLE pi_workspace_write (
  tool_call_id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL REFERENCES pi_task(id) ON DELETE CASCADE,
  relative_path TEXT NOT NULL,
  base_sha256 TEXT,
  target_sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('STARTING', 'SUCCEEDED', 'FAILED', 'UNKNOWN')),
  result_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  operation_kind TEXT NOT NULL DEFAULT 'TEXT_WRITE'
    CHECK (operation_kind IN ('TEXT_WRITE', 'SKILL_ASSET', 'DOCUMENT_BINARY'))
) STRICT;

INSERT INTO pi_workspace_write (
  tool_call_id, task_id, relative_path, base_sha256, target_sha256, status,
  result_json, created_at, updated_at, operation_kind
)
SELECT tool_call_id, task_id, relative_path, base_sha256, target_sha256, status,
  result_json, created_at, updated_at, operation_kind
FROM pi_workspace_write_old;

DROP TABLE pi_workspace_write_old;

CREATE INDEX idx_pi_workspace_write_task
ON pi_workspace_write(task_id, created_at, tool_call_id);

ALTER TABLE pi_task_deliverable RENAME TO pi_task_deliverable_old;

CREATE TABLE pi_task_deliverable (
  task_id TEXT NOT NULL REFERENCES pi_task(id) ON DELETE CASCADE,
  relative_path TEXT NOT NULL CHECK (length(relative_path) BETWEEN 1 AND 32767),
  source TEXT NOT NULL CHECK (
    source IN ('WORKSPACE_WRITE', 'COMMAND_REGISTERED', 'SKILL_ASSET', 'DOCUMENT_CREATE')
  ),
  change_kind TEXT NOT NULL CHECK (
    change_kind IN ('CREATED', 'MODIFIED', 'REGISTERED')
  ),
  sha256 TEXT NOT NULL CHECK (
    length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 0 AND 104857600),
  diff_text TEXT CHECK (diff_text IS NULL OR length(diff_text) <= 2200000),
  source_call_id TEXT NOT NULL,
  registered_at TEXT NOT NULL,
  PRIMARY KEY (task_id, relative_path)
) STRICT;

INSERT INTO pi_task_deliverable (
  task_id, relative_path, source, change_kind, sha256, size_bytes,
  diff_text, source_call_id, registered_at
)
SELECT task_id, relative_path, source, change_kind, sha256, size_bytes,
  diff_text, source_call_id, registered_at
FROM pi_task_deliverable_old;

DROP TABLE pi_task_deliverable_old;

CREATE INDEX idx_pi_task_deliverable_registered
ON pi_task_deliverable(task_id, registered_at, relative_path);
