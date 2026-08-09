CREATE TABLE task_plan (
  id TEXT PRIMARY KEY NOT NULL,
  corporation_id TEXT NOT NULL REFERENCES corporation(id) ON DELETE CASCADE,
  goal_version INTEGER NOT NULL CHECK (goal_version >= 1),
  version INTEGER NOT NULL CHECK (version >= 1),
  status TEXT NOT NULL CHECK (
    status IN ('DRAFT','VALIDATED','APPROVED','SUPERSEDED')
  ),
  validation_status TEXT NOT NULL CHECK (
    validation_status IN ('PENDING','VALID','INVALID')
  ),
  summary TEXT NOT NULL CHECK (
    length(CAST(summary AS BLOB)) BETWEEN 1 AND 16384
  ),
  draft_json TEXT NOT NULL CHECK (
    json_valid(draft_json) AND json_type(draft_json) = 'object'
  ),
  provider_id TEXT NOT NULL REFERENCES provider(id),
  provider_version INTEGER NOT NULL CHECK (provider_version >= 1),
  model_id TEXT NOT NULL CHECK (
    length(CAST(model_id AS BLOB)) BETWEEN 1 AND 512
  ),
  created_by_operation_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  UNIQUE(corporation_id, version),
  FOREIGN KEY (corporation_id, goal_version)
    REFERENCES goal_contract_version(corporation_id, version),
  CHECK (
    (status = 'DRAFT' AND validation_status IN ('PENDING','INVALID'))
    OR (status IN ('VALIDATED','APPROVED') AND validation_status = 'VALID')
    OR status = 'SUPERSEDED'
  )
) STRICT;

CREATE INDEX idx_task_plan_corporation_version
ON task_plan(corporation_id, version DESC);

CREATE TABLE planner_generation_operation (
  operation_id TEXT PRIMARY KEY NOT NULL,
  corporation_id TEXT NOT NULL REFERENCES corporation(id) ON DELETE CASCADE,
  request_hash TEXT NOT NULL CHECK (
    length(request_hash) = 64
    AND request_hash NOT GLOB '*[^0-9a-f]*'
  ),
  expected_corporation_version INTEGER NOT NULL CHECK (
    expected_corporation_version >= 1
  ),
  goal_version INTEGER NOT NULL CHECK (goal_version >= 1),
  provider_id TEXT NOT NULL REFERENCES provider(id),
  provider_version INTEGER NOT NULL CHECK (provider_version >= 1),
  model_id TEXT NOT NULL CHECK (
    length(CAST(model_id AS BLOB)) BETWEEN 1 AND 512
  ),
  status TEXT NOT NULL CHECK (status IN (
    'GENERATING','PLAN_SAVED','FAILED','CANCELLED','INTERRUPTED'
  )),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  usage_json TEXT NOT NULL DEFAULT '{"costSource":"UNKNOWN"}' CHECK (
    json_valid(usage_json) AND json_type(usage_json) = 'object'
  ),
  failure_reason TEXT CHECK (
    failure_reason IS NULL OR failure_reason IN (
      'PROVIDER_FAILURE','INVALID_MODEL_OUTPUT','INPUT_TOO_LARGE','PROVIDER_UNAVAILABLE',
      'VERSION_CONFLICT','STORAGE_UNAVAILABLE'
    )
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  saved_plan_id TEXT REFERENCES task_plan(id),
  CHECK (
    (status = 'FAILED' AND failure_reason IS NOT NULL
      AND completed_at IS NOT NULL AND saved_plan_id IS NULL)
    OR (status IN ('CANCELLED','INTERRUPTED')
      AND failure_reason IS NULL AND completed_at IS NOT NULL
      AND saved_plan_id IS NULL)
    OR (status = 'PLAN_SAVED' AND failure_reason IS NULL
      AND completed_at IS NOT NULL AND saved_plan_id IS NOT NULL)
    OR (status = 'GENERATING' AND failure_reason IS NULL
      AND completed_at IS NULL AND saved_plan_id IS NULL)
  )
) STRICT;

CREATE UNIQUE INDEX idx_planner_generation_active
ON planner_generation_operation(corporation_id)
WHERE status = 'GENERATING';

CREATE INDEX idx_planner_generation_corporation_updated
ON planner_generation_operation(corporation_id, updated_at DESC, operation_id DESC);
