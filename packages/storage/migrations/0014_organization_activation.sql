ALTER TABLE corporation ADD COLUMN active_organization_version INTEGER
  CHECK (active_organization_version IS NULL OR active_organization_version >= 1);

CREATE TABLE agent_definition (
  id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  definition_json TEXT NOT NULL CHECK (
    json_valid(definition_json) AND json_type(definition_json) = 'object'
  ),
  created_at TEXT NOT NULL,
  PRIMARY KEY (id, version)
) STRICT;

CREATE TABLE organization_activation (
  id TEXT PRIMARY KEY NOT NULL,
  corporation_id TEXT NOT NULL REFERENCES corporation(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL UNIQUE REFERENCES organization_version(id),
  organization_version INTEGER NOT NULL CHECK (organization_version >= 1),
  routes_json TEXT NOT NULL CHECK (
    json_valid(routes_json) AND json_type(routes_json) = 'object'
  ),
  accepted_degraded_gaps INTEGER NOT NULL CHECK (accepted_degraded_gaps IN (0, 1)),
  activated_at TEXT NOT NULL,
  FOREIGN KEY (corporation_id, organization_version)
    REFERENCES organization_version(corporation_id, version)
) STRICT;

CREATE TABLE organization_activation_command (
  command_id TEXT PRIMARY KEY NOT NULL,
  corporation_id TEXT NOT NULL REFERENCES corporation(id) ON DELETE CASCADE,
  request_hash TEXT NOT NULL CHECK (
    length(request_hash) = 64 AND request_hash NOT GLOB '*[^0-9a-f]*'
  ),
  result_activation_id TEXT NOT NULL REFERENCES organization_activation(id),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE agent_instance (
  id TEXT PRIMARY KEY NOT NULL,
  corporation_id TEXT NOT NULL REFERENCES corporation(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organization_version(id),
  member_id TEXT NOT NULL,
  definition_id TEXT NOT NULL,
  definition_version INTEGER NOT NULL CHECK (definition_version >= 1),
  status TEXT NOT NULL CHECK (status IN ('CREATED','READY','BUSY','SUSPENDED','RETIRED')),
  snapshot_json TEXT NOT NULL CHECK (
    json_valid(snapshot_json) AND json_type(snapshot_json) = 'object'
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, member_id),
  FOREIGN KEY (definition_id, definition_version)
    REFERENCES agent_definition(id, version)
) STRICT;

CREATE TRIGGER organization_activation_insert_guard
BEFORE INSERT ON organization_activation
WHEN NOT EXISTS (
  SELECT 1 FROM organization_version o
  WHERE o.id = NEW.organization_id
    AND o.corporation_id = NEW.corporation_id
    AND o.version = NEW.organization_version
    AND o.status = 'DRAFT'
)
BEGIN
  SELECT RAISE(ABORT, 'organization is not current draft');
END;

CREATE TRIGGER corporation_active_organization_guard
BEFORE UPDATE OF active_organization_version ON corporation
WHEN NEW.active_organization_version IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM organization_version o
  WHERE o.corporation_id = NEW.id
    AND o.version = NEW.active_organization_version
    AND o.status = 'APPROVED'
)
BEGIN
  SELECT RAISE(ABORT, 'active organization must be approved');
END;

CREATE INDEX idx_agent_instance_corporation
ON agent_instance(corporation_id, organization_id, member_id);
