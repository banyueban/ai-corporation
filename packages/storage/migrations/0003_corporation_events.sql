CREATE TABLE corporation (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspace(id),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  status TEXT NOT NULL CHECK (
    status IN (
      'DRAFT',
      'PLANNING',
      'ORGANIZING',
      'EXECUTING',
      'VERIFYING',
      'WAITING_HUMAN',
      'PAUSED',
      'COMPLETED',
      'FAILED',
      'CANCELLED',
      'ARCHIVED'
    )
  ),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  CHECK (
    (status = 'ARCHIVED' AND archived_at IS NOT NULL)
    OR (status <> 'ARCHIVED' AND archived_at IS NULL)
  )
) STRICT;

CREATE INDEX idx_corporation_workspace_updated
ON corporation(workspace_id, updated_at DESC, id ASC);

CREATE TABLE domain_event (
  event_id TEXT PRIMARY KEY NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = '1.0'),
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'corporation.created',
      'corporation.name.updated',
      'corporation.archived'
    )
  ),
  aggregate_type TEXT NOT NULL CHECK (aggregate_type = 'CORPORATION'),
  aggregate_id TEXT NOT NULL REFERENCES corporation(id),
  aggregate_version INTEGER NOT NULL CHECK (aggregate_version >= 1),
  corporation_id TEXT NOT NULL REFERENCES corporation(id),
  correlation_id TEXT NOT NULL,
  actor_json TEXT NOT NULL CHECK (json_valid(actor_json)),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  sensitivity TEXT NOT NULL CHECK (sensitivity = 'NORMAL'),
  occurred_at TEXT NOT NULL,
  UNIQUE (aggregate_type, aggregate_id, aggregate_version)
) STRICT;

CREATE INDEX idx_event_corporation_timeline
ON domain_event(corporation_id, occurred_at, event_id);

CREATE TRIGGER domain_event_reject_update
BEFORE UPDATE ON domain_event
BEGIN
  SELECT RAISE(ABORT, 'domain_event is append-only');
END;

CREATE TRIGGER domain_event_reject_delete
BEFORE DELETE ON domain_event
BEGIN
  SELECT RAISE(ABORT, 'domain_event is append-only');
END;

CREATE TABLE corporation_command (
  command_id TEXT PRIMARY KEY NOT NULL,
  command_type TEXT NOT NULL CHECK (
    command_type IN ('CREATE', 'UPDATE_NAME', 'ARCHIVE')
  ),
  request_hash TEXT NOT NULL CHECK (
    length(request_hash) = 64
    AND request_hash NOT GLOB '*[^0-9a-f]*'
  ),
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  result_version INTEGER NOT NULL CHECK (result_version >= 1),
  created_at TEXT NOT NULL
) STRICT;
