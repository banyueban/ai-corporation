ALTER TABLE task_plan ADD COLUMN supersedes_plan_id TEXT REFERENCES task_plan(id);
ALTER TABLE task_plan ADD COLUMN approved_at TEXT;

CREATE UNIQUE INDEX idx_task_plan_current
ON task_plan(corporation_id)
WHERE status <> 'SUPERSEDED';

CREATE INDEX idx_task_plan_supersedes
ON task_plan(supersedes_plan_id);

CREATE TABLE plan_review_command (
  command_id TEXT PRIMARY KEY NOT NULL,
  corporation_id TEXT NOT NULL REFERENCES corporation(id) ON DELETE CASCADE,
  command_type TEXT NOT NULL CHECK (command_type IN ('SAVE_VERSION','APPROVE')),
  request_hash TEXT NOT NULL CHECK (
    length(request_hash) = 64
    AND request_hash NOT GLOB '*[^0-9a-f]*'
  ),
  result_plan_id TEXT NOT NULL REFERENCES task_plan(id),
  created_at TEXT NOT NULL
) STRICT;

CREATE TRIGGER task_plan_approval_insert_guard
BEFORE INSERT ON task_plan
WHEN (
  (NEW.status = 'APPROVED' AND (NEW.validation_status <> 'VALID' OR NEW.approved_at IS NULL))
  OR (NEW.status <> 'APPROVED' AND NEW.approved_at IS NOT NULL)
)
BEGIN
  SELECT RAISE(ABORT, 'invalid task plan approval state');
END;

CREATE TRIGGER task_plan_approval_update_guard
BEFORE UPDATE OF status, validation_status, approved_at ON task_plan
WHEN (
  (OLD.status = 'APPROVED' AND (
    NEW.status <> OLD.status OR NEW.validation_status <> OLD.validation_status
    OR NEW.approved_at <> OLD.approved_at
  ))
  OR (NEW.status = 'APPROVED' AND (
    OLD.status <> 'VALIDATED' OR OLD.validation_status <> 'VALID'
    OR NEW.validation_status <> 'VALID' OR NEW.approved_at IS NULL
  ))
  OR (NEW.status <> 'APPROVED' AND NEW.approved_at IS NOT NULL)
)
BEGIN
  SELECT RAISE(ABORT, 'invalid task plan approval transition');
END;

CREATE TRIGGER task_plan_version_insert_guard
BEFORE INSERT ON task_plan
WHEN (
  (NEW.version = 1 AND NEW.supersedes_plan_id IS NOT NULL)
  OR (NEW.version > 1 AND NOT EXISTS (
    SELECT 1 FROM task_plan AS previous
    WHERE previous.id = NEW.supersedes_plan_id
      AND previous.corporation_id = NEW.corporation_id
      AND previous.version = NEW.version - 1
      AND previous.status = 'SUPERSEDED'
  ))
)
BEGIN
  SELECT RAISE(ABORT, 'invalid task plan version chain');
END;

CREATE TRIGGER task_plan_supersede_update_guard
BEFORE UPDATE OF status ON task_plan
WHEN (
  (OLD.status = 'SUPERSEDED' AND NEW.status <> OLD.status)
  OR (NEW.status = 'SUPERSEDED' AND NOT (
    (OLD.status = 'VALIDATED' AND OLD.validation_status = 'VALID')
    OR (OLD.status = 'DRAFT' AND OLD.validation_status = 'INVALID')
  ))
)
BEGIN
  SELECT RAISE(ABORT, 'invalid task plan supersede transition');
END;
