ALTER TABLE task_plan ADD COLUMN validation_report_json TEXT CHECK (
  validation_report_json IS NULL OR (
    json_valid(validation_report_json)
    AND json_type(validation_report_json) = 'object'
  )
);
ALTER TABLE task_plan ADD COLUMN validator_version TEXT CHECK (
  validator_version IS NULL OR length(CAST(validator_version AS BLOB)) BETWEEN 1 AND 32
);
ALTER TABLE task_plan ADD COLUMN validated_draft_hash TEXT CHECK (
  validated_draft_hash IS NULL OR (
    length(validated_draft_hash) = 64
    AND validated_draft_hash NOT GLOB '*[^0-9a-f]*'
  )
);
ALTER TABLE task_plan ADD COLUMN validated_at TEXT;

CREATE UNIQUE INDEX idx_task_plan_identity
ON task_plan(id, corporation_id);

CREATE TABLE task (
  id TEXT PRIMARY KEY NOT NULL,
  corporation_id TEXT NOT NULL REFERENCES corporation(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES task_plan(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES task(id),
  title TEXT NOT NULL,
  objective TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'ANALYSIS','GENERATION','TRANSFORMATION','VALIDATION','HUMAN_DECISION'
  )),
  priority INTEGER NOT NULL CHECK (priority BETWEEN 0 AND 100),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  status TEXT NOT NULL CHECK (status IN (
    'DRAFT','BLOCKED','READY','RUNNING','VERIFYING','WAITING_HUMAN',
    'RETRY_PENDING','REPLAN_REQUIRED','PAUSED','COMPLETED','FAILED','CANCELLED'
  )),
  contract_json TEXT NOT NULL CHECK (
    json_valid(contract_json) AND json_type(contract_json) = 'object'
  ),
  attempt INTEGER NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  max_attempts INTEGER NOT NULL CHECK (max_attempts BETWEEN 1 AND 10),
  assigned_agent_id TEXT,
  lease_owner TEXT,
  lease_expires_at TEXT,
  weight INTEGER NOT NULL DEFAULT 1 CHECK (weight BETWEEN 1 AND 5),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(plan_id, id),
  FOREIGN KEY (plan_id, corporation_id)
    REFERENCES task_plan(id, corporation_id)
) STRICT;

CREATE INDEX idx_task_ready
ON task(corporation_id, priority DESC, created_at)
WHERE status = 'READY';

CREATE INDEX idx_task_lease
ON task(status, lease_expires_at)
WHERE status = 'RUNNING';

CREATE TABLE task_dependency (
  plan_id TEXT NOT NULL REFERENCES task_plan(id) ON DELETE CASCADE,
  upstream_task_id TEXT NOT NULL,
  downstream_task_id TEXT NOT NULL,
  condition TEXT NOT NULL CHECK (condition = 'ON_SUCCESS'),
  artifact_requirements_json TEXT NOT NULL DEFAULT '[]' CHECK (
    json_valid(artifact_requirements_json)
    AND json_type(artifact_requirements_json) = 'array'
  ),
  PRIMARY KEY (plan_id, upstream_task_id, downstream_task_id),
  CHECK (upstream_task_id <> downstream_task_id),
  FOREIGN KEY (plan_id, upstream_task_id)
    REFERENCES task(plan_id, id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id, downstream_task_id)
    REFERENCES task(plan_id, id) ON DELETE CASCADE
) STRICT;
