CREATE TABLE workspace (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  display_path TEXT NOT NULL,
  canonical_root_path TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('windows', 'macos')),
  permission_mode TEXT NOT NULL CHECK (
    permission_mode IN ('READ_ONLY', 'READ_WRITE')
  ),
  access_status TEXT NOT NULL CHECK (
    access_status IN (
      'UNVERIFIED',
      'AVAILABLE',
      'MISSING',
      'PERMISSION_DENIED'
    )
  ),
  path_identity_json TEXT NOT NULL DEFAULT '{}' CHECK (
    json_valid(path_identity_json)
  ),
  last_verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (canonical_root_path)
) STRICT;
