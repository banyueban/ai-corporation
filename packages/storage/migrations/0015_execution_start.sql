CREATE TABLE agent_run (
  id TEXT PRIMARY KEY NOT NULL,
  corporation_id TEXT NOT NULL REFERENCES corporation(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES task(id),
  agent_instance_id TEXT NOT NULL REFERENCES agent_instance(id),
  attempt INTEGER NOT NULL CHECK (attempt >= 1),
  status TEXT NOT NULL CHECK (status IN (
    'CREATED','PREPARING','READY','RUNNING','WAITING_TOOL','WAITING_APPROVAL',
    'PRODUCED','SUCCEEDED','CANCELLED','TIMED_OUT','FAILED'
  )),
  limits_json TEXT NOT NULL CHECK (json_valid(limits_json)),
  usage_json TEXT NOT NULL CHECK (json_valid(usage_json)),
  checkpoint_json TEXT NOT NULL CHECK (json_valid(checkpoint_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT,
  failure_json TEXT CHECK (failure_json IS NULL OR json_valid(failure_json)),
  UNIQUE(task_id, attempt)
) STRICT;

CREATE TABLE execution_start (
  corporation_id TEXT PRIMARY KEY NOT NULL REFERENCES corporation(id) ON DELETE CASCADE,
  command_id TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL CHECK (
    length(request_hash) = 64 AND request_hash NOT GLOB '*[^0-9a-f]*'
  ),
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  created_at TEXT NOT NULL
) STRICT;

DROP TRIGGER domain_event_reject_update;
DROP TRIGGER domain_event_reject_delete;
DROP INDEX idx_event_corporation_timeline;
ALTER TABLE domain_event RENAME TO domain_event_v0014;

CREATE TABLE domain_event (
  event_id TEXT PRIMARY KEY NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = '1.0'),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'corporation.created','corporation.name.updated','corporation.archived',
    'goal.contract.drafted','goal.contract.approved','corporation.paused',
    'corporation.resumed','corporation.execution.started',
    'corporation.human-decision.requested'
  )),
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

INSERT INTO domain_event SELECT * FROM domain_event_v0014;
DROP TABLE domain_event_v0014;
CREATE INDEX idx_event_corporation_timeline ON domain_event(corporation_id, occurred_at, event_id);
CREATE TRIGGER domain_event_reject_update BEFORE UPDATE ON domain_event BEGIN SELECT RAISE(ABORT, 'domain_event is append-only'); END;
CREATE TRIGGER domain_event_reject_delete BEFORE DELETE ON domain_event BEGIN SELECT RAISE(ABORT, 'domain_event is append-only'); END;
