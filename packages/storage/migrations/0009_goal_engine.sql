DROP TRIGGER goal_contract_require_draft_insert;
DROP TRIGGER goal_contract_reject_content_update;
DROP TRIGGER goal_contract_validate_status_update;
DROP TRIGGER goal_contract_reject_delete;
DROP TRIGGER corporation_validate_active_goal;
DROP INDEX idx_goal_contract_corporation_version;

ALTER TABLE goal_contract_version RENAME TO goal_contract_version_v0008;

CREATE TABLE goal_contract_version (
  corporation_id TEXT NOT NULL REFERENCES corporation(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version >= 1),
  status TEXT NOT NULL CHECK (
    status IN ('DRAFT', 'APPROVED', 'SUPERSEDED')
  ),
  source TEXT NOT NULL CHECK (source IN ('MANUAL', 'MOCK', 'PROVIDER')),
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

INSERT INTO goal_contract_version (
  corporation_id, version, status, source, content_json,
  created_by, created_at, approved_at
)
SELECT
  corporation_id, version, status, source, content_json,
  created_by, created_at, approved_at
FROM goal_contract_version_v0008;

DROP TABLE goal_contract_version_v0008;

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

CREATE TABLE goal_generation_operation (
  operation_id TEXT PRIMARY KEY NOT NULL,
  corporation_id TEXT NOT NULL REFERENCES corporation(id) ON DELETE CASCADE,
  request_hash TEXT NOT NULL CHECK (
    length(request_hash) = 64
    AND request_hash NOT GLOB '*[^0-9a-f]*'
  ),
  expected_corporation_version INTEGER NOT NULL CHECK (
    expected_corporation_version >= 1
  ),
  expected_goal_version INTEGER NOT NULL CHECK (expected_goal_version >= 0),
  provider_id TEXT NOT NULL REFERENCES provider(id),
  provider_version INTEGER NOT NULL CHECK (provider_version >= 1),
  model_id TEXT NOT NULL CHECK (
    length(CAST(model_id AS BLOB)) BETWEEN 1 AND 512
  ),
  status TEXT NOT NULL CHECK (status IN (
    'GENERATING','CLARIFICATION_REQUIRED','EXTENSION_REQUIRED',
    'GOAL_SAVED','FAILED','CANCELLED','INTERRUPTED'
  )),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  cycle_number INTEGER NOT NULL DEFAULT 1 CHECK (cycle_number >= 1),
  round_in_cycle INTEGER NOT NULL DEFAULT 0 CHECK (
    round_in_cycle BETWEEN 0 AND 5
  ),
  input_json TEXT NOT NULL CHECK (
    json_valid(input_json) AND json_type(input_json) = 'object'
  ),
  draft_json TEXT CHECK (
    draft_json IS NULL
    OR (json_valid(draft_json) AND json_type(draft_json) = 'object')
  ),
  questions_json TEXT NOT NULL DEFAULT '[]' CHECK (
    json_valid(questions_json) AND json_type(questions_json) = 'array'
  ),
  answers_json TEXT NOT NULL DEFAULT '[]' CHECK (
    json_valid(answers_json) AND json_type(answers_json) = 'array'
  ),
  usage_json TEXT NOT NULL DEFAULT '{"costSource":"UNKNOWN"}' CHECK (
    json_valid(usage_json) AND json_type(usage_json) = 'object'
  ),
  failure_reason TEXT CHECK (
    failure_reason IS NULL OR failure_reason IN (
      'PROVIDER_FAILURE','INVALID_MODEL_OUTPUT','WORKSPACE_UNAVAILABLE',
      'PROVIDER_UNAVAILABLE','VERSION_CONFLICT','STORAGE_UNAVAILABLE'
    )
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  saved_goal_version INTEGER CHECK (
    saved_goal_version IS NULL OR saved_goal_version >= 1
  ),
  CHECK (
    (status = 'FAILED' AND failure_reason IS NOT NULL
      AND completed_at IS NOT NULL AND saved_goal_version IS NULL)
    OR (status IN ('GOAL_SAVED','CANCELLED','INTERRUPTED')
      AND failure_reason IS NULL AND completed_at IS NOT NULL
      AND ((status = 'GOAL_SAVED') = (saved_goal_version IS NOT NULL)))
    OR (status IN ('GENERATING','CLARIFICATION_REQUIRED','EXTENSION_REQUIRED')
      AND failure_reason IS NULL AND completed_at IS NULL
      AND saved_goal_version IS NULL)
  )
) STRICT;

CREATE UNIQUE INDEX idx_goal_generation_active
ON goal_generation_operation(corporation_id)
WHERE status IN ('GENERATING','CLARIFICATION_REQUIRED','EXTENSION_REQUIRED');

CREATE INDEX idx_goal_generation_corporation_updated
ON goal_generation_operation(corporation_id, updated_at DESC, operation_id DESC);

CREATE TABLE model_call (
  id TEXT PRIMARY KEY NOT NULL,
  corporation_id TEXT NOT NULL REFERENCES corporation(id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN (
    'GOAL_ANALYSIS','PLAN_GENERATION','AGENT_RUN','JUDGE'
  )),
  task_id TEXT,
  run_id TEXT,
  provider_id TEXT NOT NULL REFERENCES provider(id),
  provider_version INTEGER NOT NULL CHECK (provider_version >= 1),
  model_id TEXT NOT NULL CHECK (
    length(CAST(model_id AS BLOB)) BETWEEN 1 AND 512
  ),
  attempt INTEGER NOT NULL CHECK (attempt >= 1),
  status TEXT NOT NULL CHECK (status IN (
    'STARTED','SUCCEEDED','FAILED','CANCELLED','INTERRUPTED'
  )),
  request_meta_json TEXT NOT NULL CHECK (
    json_valid(request_meta_json) AND json_type(request_meta_json) = 'object'
  ),
  response_meta_json TEXT CHECK (
    response_meta_json IS NULL
    OR (json_valid(response_meta_json) AND json_type(response_meta_json) = 'object')
  ),
  usage_json TEXT NOT NULL DEFAULT '{"costSource":"UNKNOWN"}' CHECK (
    json_valid(usage_json) AND json_type(usage_json) = 'object'
  ),
  failure_reason TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  UNIQUE (operation_id, attempt),
  CHECK (
    (purpose IN ('AGENT_RUN','JUDGE') AND task_id IS NOT NULL AND run_id IS NOT NULL)
    OR (purpose IN ('GOAL_ANALYSIS','PLAN_GENERATION')
      AND task_id IS NULL AND run_id IS NULL)
  ),
  CHECK (
    (status = 'STARTED' AND ended_at IS NULL)
    OR (status <> 'STARTED' AND ended_at IS NOT NULL)
  )
) STRICT;

CREATE INDEX idx_model_call_operation
ON model_call(operation_id, attempt);
