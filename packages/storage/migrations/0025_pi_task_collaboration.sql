-- 普通任务保持原样；协作任务另外保存协作状态，避免重建已有任务表。
ALTER TABLE pi_task
ADD COLUMN task_mode TEXT NOT NULL DEFAULT 'SINGLE'
CHECK (task_mode IN ('SINGLE', 'COLLABORATION'));

ALTER TABLE pi_task
ADD COLUMN collaboration_status TEXT
CHECK (collaboration_status IS NULL OR collaboration_status IN (
  'RUNNING', 'WAITING_USER', 'WAITING_ACCEPTANCE',
  'COMPLETED', 'CANCELLED', 'FAILED', 'INTERRUPTED'
));

CREATE TABLE pi_task_assignment (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL REFERENCES pi_task(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES pi_employee(id),
  employee_name TEXT NOT NULL CHECK (length(employee_name) BETWEEN 1 AND 120),
  instruction TEXT NOT NULL CHECK (length(instruction) BETWEEN 1 AND 20000),
  role TEXT NOT NULL CHECK (role IN ('FINAL', 'HELPER')),
  status TEXT NOT NULL CHECK (status IN (
    'PENDING', 'RUNNING', 'WAITING_USER', 'SUCCEEDED',
    'FAILED', 'CANCELLED', 'INTERRUPTED'
  )),
  output TEXT,
  failure_message TEXT,
  position INTEGER NOT NULL CHECK (position >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (task_id, position)
) STRICT;

CREATE INDEX idx_pi_task_assignment_task
ON pi_task_assignment(task_id, position);

ALTER TABLE pi_task_event ADD COLUMN assignment_id TEXT;
ALTER TABLE pi_task_event ADD COLUMN employee_id TEXT;
ALTER TABLE pi_task_event ADD COLUMN employee_name TEXT;
