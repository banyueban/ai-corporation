ALTER TABLE corporation
ADD COLUMN active_goal_version INTEGER
CHECK (active_goal_version IS NULL OR active_goal_version >= 1);

CREATE TABLE goal_contract_version (
  corporation_id TEXT NOT NULL REFERENCES corporation(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version >= 1),
  status TEXT NOT NULL CHECK (
    status IN ('DRAFT', 'APPROVED', 'SUPERSEDED')
  ),
  source TEXT NOT NULL CHECK (source IN ('MANUAL', 'MOCK')),
  content_json TEXT NOT NULL CHECK (
    json_valid(content_json)
    AND json_type(content_json) = 'object'
  ),
  created_by TEXT NOT NULL CHECK (created_by = 'local-user'),
  created_at TEXT NOT NULL,
  approved_at TEXT,
  PRIMARY KEY (corporation_id, version),
  CHECK (
    (status = 'APPROVED' AND approved_at IS NOT NULL)
    OR (status <> 'APPROVED' AND approved_at IS NULL)
  )
) STRICT;

CREATE INDEX idx_goal_contract_corporation_version
ON goal_contract_version(corporation_id, version DESC);

CREATE TRIGGER goal_contract_require_draft_insert
BEFORE INSERT ON goal_contract_version
WHEN NEW.status <> 'DRAFT' OR NEW.approved_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'goal contract must be inserted as draft');
END;

CREATE TRIGGER goal_contract_reject_content_update
BEFORE UPDATE OF
  corporation_id,
  version,
  source,
  content_json,
  created_by,
  created_at
ON goal_contract_version
BEGIN
  SELECT RAISE(ABORT, 'goal contract content is immutable');
END;

CREATE TRIGGER goal_contract_validate_status_update
BEFORE UPDATE OF status, approved_at ON goal_contract_version
WHEN NOT (
  (
    OLD.status = 'DRAFT'
    AND NEW.status = 'APPROVED'
    AND NEW.approved_at IS NOT NULL
  )
  OR (
    OLD.status IN ('DRAFT', 'APPROVED')
    AND NEW.status = 'SUPERSEDED'
    AND NEW.approved_at IS NULL
  )
)
BEGIN
  SELECT RAISE(ABORT, 'invalid goal contract status transition');
END;

CREATE TRIGGER goal_contract_reject_delete
BEFORE DELETE ON goal_contract_version
BEGIN
  SELECT RAISE(ABORT, 'goal contract is append-only');
END;

CREATE TRIGGER corporation_validate_active_goal
BEFORE UPDATE OF active_goal_version ON corporation
WHEN NEW.active_goal_version IS NOT OLD.active_goal_version
  AND (
    NEW.active_goal_version IS NULL
    OR NEW.active_goal_version <> COALESCE(OLD.active_goal_version, 0) + 1
    OR NOT EXISTS (
      SELECT 1
      FROM goal_contract_version
      WHERE corporation_id = NEW.id
        AND version = NEW.active_goal_version
        AND status = 'DRAFT'
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'invalid active goal version');
END;

CREATE TABLE goal_contract_command (
  command_id TEXT PRIMARY KEY NOT NULL,
  command_type TEXT NOT NULL CHECK (
    command_type IN ('SAVE_DRAFT', 'APPROVE')
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

CREATE INDEX idx_goal_contract_command_corporation
ON goal_contract_command(corporation_id, created_at, command_id);

DROP TRIGGER domain_event_reject_update;
DROP TRIGGER domain_event_reject_delete;
DROP INDEX idx_event_corporation_timeline;

ALTER TABLE domain_event RENAME TO domain_event_v0003;

CREATE TABLE domain_event (
  event_id TEXT PRIMARY KEY NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = '1.0'),
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'corporation.created',
      'corporation.name.updated',
      'corporation.archived',
      'goal.contract.drafted',
      'goal.contract.approved'
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
FROM domain_event_v0003;

DROP TABLE domain_event_v0003;

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
