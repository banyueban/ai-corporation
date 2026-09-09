CREATE TABLE pi_task (
  id TEXT PRIMARY KEY NOT NULL,
  employee_id TEXT NOT NULL REFERENCES pi_employee(id),
  user_input TEXT NOT NULL CHECK (length(user_input) BETWEEN 1 AND 20000),
  status TEXT NOT NULL CHECK (status IN (
    'RUNNING', 'WAITING_ACCEPTANCE', 'CHANGES_REQUESTED',
    'COMPLETED', 'CANCELLED', 'FAILED', 'INTERRUPTED'
  )),
  final_output TEXT,
  failure_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE pi_task_event (
  task_id TEXT NOT NULL REFERENCES pi_task(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  kind TEXT NOT NULL CHECK (kind IN (
    'PROGRESS', 'MODEL_INPUT', 'MODEL_OUTPUT',
    'TOOL_START', 'TOOL_RESULT', 'TOOL_ERROR'
  )),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (task_id, sequence)
) STRICT;

CREATE INDEX idx_pi_task_employee_updated
ON pi_task(employee_id, updated_at DESC, id);
