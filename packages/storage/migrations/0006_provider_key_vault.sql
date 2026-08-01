CREATE TABLE key_vault_entry (
  id TEXT PRIMARY KEY NOT NULL,
  ciphertext BLOB NOT NULL CHECK (length(ciphertext) > 0),
  nonce BLOB NOT NULL CHECK (length(nonce) = 12),
  auth_tag BLOB NOT NULL CHECK (length(auth_tag) = 16),
  encryption_version INTEGER NOT NULL CHECK (encryption_version = 1),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE provider (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL CHECK (type = 'OPENAI_COMPATIBLE'),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  endpoint TEXT NOT NULL CHECK (length(endpoint) BETWEEN 1 AND 2048),
  key_vault_entry_id TEXT UNIQUE
    REFERENCES key_vault_entry(id) ON DELETE SET NULL,
  config_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(config_json)),
  config_status TEXT NOT NULL
    CHECK (config_status IN ('ENABLED', 'DISABLED')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE provider_command (
  command_id TEXT PRIMARY KEY NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN ('SAVE', 'DELETE_KEY')),
  provider_id TEXT NOT NULL REFERENCES provider(id) ON DELETE CASCADE,
  request_hash TEXT NOT NULL CHECK (
    length(request_hash) = 64
    AND request_hash NOT GLOB '*[^0-9a-f]*'
  ),
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  result_version INTEGER NOT NULL CHECK (result_version >= 1),
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_provider_created ON provider(created_at, id);
CREATE INDEX idx_provider_command_provider
ON provider_command(provider_id, created_at, command_id);
