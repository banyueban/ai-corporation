CREATE TABLE pi_command_call (
  tool_call_id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL REFERENCES pi_task(id) ON DELETE CASCADE,
  command_text TEXT NOT NULL CHECK (length(command_text) BETWEEN 1 AND 20000),
  status TEXT NOT NULL CHECK (status IN (
    'STARTING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT', 'UNKNOWN'
  )),
  result_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_pi_command_call_task
ON pi_command_call(task_id, created_at, tool_call_id);

CREATE TABLE pi_command_grant (
  task_id TEXT PRIMARY KEY NOT NULL REFERENCES pi_task(id) ON DELETE CASCADE,
  granted_at TEXT NOT NULL
) STRICT;

ALTER TABLE pi_task_event RENAME TO pi_task_event_before_command_events;

CREATE TABLE pi_task_event (
  task_id TEXT NOT NULL REFERENCES pi_task(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  kind TEXT NOT NULL CHECK (kind IN (
    'PROGRESS', 'MODEL_INPUT', 'MODEL_OUTPUT',
    'TOOL_START', 'TOOL_RESULT', 'TOOL_ERROR', 'TOOL_UPDATE',
    'APPROVAL_REQUIRED', 'APPROVAL_RESOLVED'
  )),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (task_id, sequence)
) STRICT;

INSERT INTO pi_task_event (task_id, sequence, kind, content, created_at)
SELECT task_id, sequence, kind, content, created_at
FROM pi_task_event_before_command_events;

DROP TABLE pi_task_event_before_command_events;
