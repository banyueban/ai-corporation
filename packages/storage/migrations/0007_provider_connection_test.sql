CREATE TABLE provider_connection_test (
  provider_id TEXT PRIMARY KEY NOT NULL
    REFERENCES provider(id) ON DELETE CASCADE,
  provider_version INTEGER NOT NULL CHECK (provider_version >= 1),
  status TEXT NOT NULL CHECK (status IN ('VERIFIED', 'FAILED')),
  failure_reason TEXT CHECK (
    failure_reason IS NULL OR failure_reason IN (
      'AUTHENTICATION',
      'PERMISSION',
      'RATE_LIMIT',
      'QUOTA_EXHAUSTED',
      'INVALID_REQUEST',
      'MODEL_NOT_FOUND',
      'CONTENT_FILTER',
      'TIMEOUT',
      'NETWORK',
      'PROVIDER_INTERNAL',
      'CANCELLED'
    )
  ),
  retryable INTEGER CHECK (retryable IN (0, 1)),
  suggested_backoff_ms INTEGER CHECK (suggested_backoff_ms >= 0),
  models_json TEXT NOT NULL CHECK (
    json_valid(models_json) AND json_type(models_json) = 'array'
  ),
  tested_at TEXT NOT NULL,
  CHECK (
    (status = 'VERIFIED' AND failure_reason IS NULL AND retryable IS NULL)
    OR
    (status = 'FAILED' AND failure_reason IS NOT NULL AND retryable IS NOT NULL)
  )
) STRICT;

CREATE INDEX idx_provider_connection_test_tested
ON provider_connection_test(tested_at, provider_id);
