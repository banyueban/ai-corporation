CREATE TABLE pi_employee_skill (
  employee_id TEXT NOT NULL REFERENCES pi_employee(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL CHECK (
    length(skill_name) BETWEEN 1 AND 64
    AND skill_name NOT GLOB '*[^a-z0-9-]*'
    AND skill_name NOT LIKE '-%'
    AND skill_name NOT LIKE '%-'
    AND skill_name NOT LIKE '%--%'
  ),
  position INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (employee_id, skill_name),
  UNIQUE (employee_id, position)
) STRICT;

-- 旧员工不需要重建：原来的单项技能成为多项列表中的第一项。
INSERT INTO pi_employee_skill (employee_id, skill_name, position)
SELECT id, skill_name, 0
FROM pi_employee;

ALTER TABLE pi_workspace_write
ADD COLUMN operation_kind TEXT NOT NULL DEFAULT 'TEXT_WRITE'
CHECK (operation_kind IN ('TEXT_WRITE', 'SKILL_ASSET'));

-- 成果来源增加 Skill 资源复制。SQLite 不能直接修改 CHECK，因此安全重建轻量表。
ALTER TABLE pi_task_deliverable RENAME TO pi_task_deliverable_old;

CREATE TABLE pi_task_deliverable (
  task_id TEXT NOT NULL REFERENCES pi_task(id) ON DELETE CASCADE,
  relative_path TEXT NOT NULL CHECK (length(relative_path) BETWEEN 1 AND 32767),
  source TEXT NOT NULL CHECK (
    source IN ('WORKSPACE_WRITE', 'COMMAND_REGISTERED', 'SKILL_ASSET')
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
SELECT
  task_id, relative_path, source, change_kind, sha256, size_bytes,
  diff_text, source_call_id, registered_at
FROM pi_task_deliverable_old;

DROP TABLE pi_task_deliverable_old;

CREATE INDEX idx_pi_task_deliverable_registered
ON pi_task_deliverable(task_id, registered_at, relative_path);
