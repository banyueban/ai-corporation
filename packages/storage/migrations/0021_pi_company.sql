CREATE TABLE pi_company (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE pi_company_employee (
  company_id TEXT NOT NULL REFERENCES pi_company(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES pi_employee(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (company_id, employee_id)
) STRICT;

CREATE TABLE pi_company_workspace (
  company_id TEXT NOT NULL REFERENCES pi_company(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (company_id, workspace_id)
) STRICT;

CREATE TABLE pi_company_command (
  command_id TEXT PRIMARY KEY NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN (
    'CREATE', 'UPDATE_NAME', 'ADD_EMPLOYEE', 'REMOVE_EMPLOYEE',
    'ADD_WORKSPACE', 'REMOVE_WORKSPACE'
  )),
  company_id TEXT NOT NULL REFERENCES pi_company(id) ON DELETE CASCADE,
  request_hash TEXT NOT NULL CHECK (
    length(request_hash) = 64 AND request_hash NOT GLOB '*[^0-9a-f]*'
  ),
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_pi_company_updated
ON pi_company(updated_at DESC, id);

CREATE INDEX idx_pi_company_employee_employee
ON pi_company_employee(employee_id, company_id);

CREATE INDEX idx_pi_company_workspace_workspace
ON pi_company_workspace(workspace_id, company_id);

-- 该固定 UUID 只用于把升级前已经存在的 Pi 数据接入一个默认公司。
INSERT INTO pi_company (id, name, created_at, updated_at)
SELECT
  '019b0000-0000-7000-8000-000000000001',
  '我的公司',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE EXISTS (SELECT 1 FROM pi_employee)
   OR EXISTS (SELECT 1 FROM pi_task);

INSERT INTO pi_company_employee (company_id, employee_id, created_at)
SELECT
  '019b0000-0000-7000-8000-000000000001',
  id,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM pi_employee
WHERE EXISTS (
  SELECT 1 FROM pi_company
  WHERE id = '019b0000-0000-7000-8000-000000000001'
);

INSERT INTO pi_company_workspace (company_id, workspace_id, created_at)
SELECT DISTINCT
  '019b0000-0000-7000-8000-000000000001',
  workspace_id,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM pi_task
WHERE workspace_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM pi_company
    WHERE id = '019b0000-0000-7000-8000-000000000001'
  );

ALTER TABLE pi_task
ADD COLUMN company_id TEXT REFERENCES pi_company(id);

UPDATE pi_task
SET company_id = '019b0000-0000-7000-8000-000000000001'
WHERE company_id IS NULL;

CREATE INDEX idx_pi_task_company_updated
ON pi_task(company_id, updated_at DESC, id DESC);

CREATE TRIGGER pi_task_require_company_insert
BEFORE INSERT ON pi_task
WHEN NEW.company_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'pi_task company_id is required');
END;

CREATE TRIGGER pi_task_require_company_update
BEFORE UPDATE OF company_id ON pi_task
WHEN NEW.company_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'pi_task company_id is required');
END;

CREATE TRIGGER pi_task_company_immutable
BEFORE UPDATE OF company_id ON pi_task
WHEN NEW.company_id <> OLD.company_id
BEGIN
  SELECT RAISE(ABORT, 'pi_task company_id is immutable');
END;
