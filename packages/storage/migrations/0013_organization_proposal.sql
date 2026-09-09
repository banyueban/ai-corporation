CREATE TABLE organization_version (
  id TEXT NOT NULL UNIQUE,
  corporation_id TEXT NOT NULL REFERENCES corporation(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES task_plan(id) ON DELETE RESTRICT,
  plan_version INTEGER NOT NULL CHECK (plan_version >= 1),
  version INTEGER NOT NULL CHECK (version >= 1),
  status TEXT NOT NULL CHECK (status IN ('DRAFT','APPROVED','SUPERSEDED')),
  snapshot_json TEXT NOT NULL CHECK (
    json_valid(snapshot_json) AND json_type(snapshot_json) = 'object'
  ),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (corporation_id, version),
  FOREIGN KEY (plan_id, corporation_id)
    REFERENCES task_plan(id, corporation_id)
) STRICT;

CREATE UNIQUE INDEX idx_organization_current
ON organization_version(corporation_id)
WHERE status <> 'SUPERSEDED';

CREATE TABLE organization_proposal_command (
  command_id TEXT PRIMARY KEY NOT NULL,
  corporation_id TEXT NOT NULL REFERENCES corporation(id) ON DELETE CASCADE,
  request_hash TEXT NOT NULL CHECK (
    length(request_hash) = 64 AND request_hash NOT GLOB '*[^0-9a-f]*'
  ),
  result_organization_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (result_organization_id)
    REFERENCES organization_version(id)
) STRICT;
