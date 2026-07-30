ALTER TABLE corporation
ADD COLUMN paused_from TEXT
CHECK (
  paused_from IS NULL
  OR paused_from IN (
    'DRAFT',
    'PLANNING',
    'ORGANIZING',
    'EXECUTING',
    'VERIFYING',
    'WAITING_HUMAN'
  )
);

ALTER TABLE corporation
ADD COLUMN paused_at TEXT;

CREATE TRIGGER corporation_validate_pause_metadata_insert
BEFORE INSERT ON corporation
WHEN NOT (
  (
    NEW.status = 'PAUSED'
    AND NEW.paused_from IS NOT NULL
    AND NEW.paused_at IS NOT NULL
  )
  OR (
    NEW.status <> 'PAUSED'
    AND NEW.paused_from IS NULL
    AND NEW.paused_at IS NULL
  )
)
BEGIN
  SELECT RAISE(ABORT, 'invalid corporation pause metadata');
END;

CREATE TRIGGER corporation_validate_pause_metadata_update
BEFORE UPDATE OF status, paused_from, paused_at ON corporation
WHEN NOT (
  (
    NEW.status = 'PAUSED'
    AND NEW.paused_from IS NOT NULL
    AND NEW.paused_at IS NOT NULL
  )
  OR (
    NEW.status <> 'PAUSED'
    AND NEW.paused_from IS NULL
    AND NEW.paused_at IS NULL
  )
)
BEGIN
  SELECT RAISE(ABORT, 'invalid corporation pause metadata');
END;

CREATE TABLE corporation_state_command (
  command_id TEXT PRIMARY KEY NOT NULL,
  command_type TEXT NOT NULL CHECK (
    command_type IN ('PAUSE', 'RESUME')
  ),
  corporation_id TEXT NOT NULL REFERENCES corporation(id),
  request_hash TEXT NOT NULL CHECK (
    length(request_hash) = 64
    AND request_hash NOT GLOB '*[^0-9a-f]*'
  ),
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  result_version INTEGER NOT NULL CHECK (result_version >= 1),
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_corporation_state_command_corporation
ON corporation_state_command(corporation_id, created_at, command_id);

DROP TRIGGER domain_event_reject_update;
DROP TRIGGER domain_event_reject_delete;
DROP INDEX idx_event_corporation_timeline;

ALTER TABLE domain_event RENAME TO domain_event_v0004;

CREATE TABLE domain_event (
  event_id TEXT PRIMARY KEY NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = '1.0'),
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'corporation.created',
      'corporation.name.updated',
      'corporation.archived',
      'goal.contract.drafted',
      'goal.contract.approved',
      'corporation.paused',
      'corporation.resumed'
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

INSERT INTO domain_event (
  event_id,
  schema_version,
  event_type,
  aggregate_type,
  aggregate_id,
  aggregate_version,
  corporation_id,
  correlation_id,
  actor_json,
  payload_json,
  sensitivity,
  occurred_at
)
SELECT
  event_id,
  schema_version,
  event_type,
  aggregate_type,
  aggregate_id,
  aggregate_version,
  corporation_id,
  correlation_id,
  actor_json,
  payload_json,
  sensitivity,
  occurred_at
FROM domain_event_v0004;

DROP TABLE domain_event_v0004;

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
