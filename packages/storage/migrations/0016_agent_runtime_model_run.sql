CREATE TABLE agent_run_candidate (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL REFERENCES agent_run(id) ON DELETE CASCADE,
  logical_name TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  media_type TEXT NOT NULL,
  content TEXT NOT NULL CHECK (length(CAST(content AS BLOB)) BETWEEN 1 AND 1048576),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  created_at TEXT NOT NULL,
  UNIQUE(run_id, logical_name)
) STRICT;

CREATE TABLE agent_run_command (
  command_id TEXT PRIMARY KEY NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN ('CONTINUE','RETRY','CANCEL')),
  corporation_id TEXT NOT NULL REFERENCES corporation(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES agent_run(id) ON DELETE CASCADE,
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64 AND request_hash NOT GLOB '*[^0-9a-f]*'),
  result_run_id TEXT NOT NULL REFERENCES agent_run(id),
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_agent_run_candidate_run ON agent_run_candidate(run_id);
