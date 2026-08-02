ALTER TABLE provider ADD COLUMN api_dialect TEXT NOT NULL
  DEFAULT 'CHAT_COMPLETIONS'
  CHECK (api_dialect IN ('CHAT_COMPLETIONS'));

ALTER TABLE provider ADD COLUMN selected_model_id TEXT
  CHECK (
    selected_model_id IS NULL
    OR length(CAST(selected_model_id AS BLOB)) BETWEEN 1 AND 512
  );

ALTER TABLE provider ADD COLUMN generation_timeout_ms INTEGER NOT NULL
  DEFAULT 60000
  CHECK (generation_timeout_ms BETWEEN 5000 AND 300000);

CREATE TABLE provider_generation_test (
  provider_id TEXT PRIMARY KEY NOT NULL
    REFERENCES provider(id) ON DELETE CASCADE,
  provider_version INTEGER NOT NULL CHECK (provider_version >= 1),
  model_id TEXT NOT NULL CHECK (
    length(CAST(model_id AS BLOB)) BETWEEN 1 AND 512
  ),
  status TEXT NOT NULL CHECK (status IN ('SUCCEEDED','FAILED')),
  failure_reason TEXT CHECK (
    failure_reason IS NULL OR failure_reason IN (
      'AUTHENTICATION','PERMISSION','RATE_LIMIT','QUOTA_EXHAUSTED',
      'INVALID_REQUEST','MODEL_NOT_FOUND','CONTENT_FILTER','TIMEOUT',
      'NETWORK','PROVIDER_INTERNAL','CANCELLED'
    )
  ),
  retryable INTEGER CHECK (retryable IN (0,1)),
  suggested_backoff_ms INTEGER CHECK (suggested_backoff_ms >= 0),
  stop_reason TEXT CHECK (
    stop_reason IS NULL OR stop_reason IN (
      'COMPLETED','OUTPUT_LIMIT','CONTENT_FILTER','UNKNOWN'
    )
  ),
  output_preview TEXT CHECK (
    output_preview IS NULL
    OR length(CAST(output_preview AS BLOB)) <= 65536
  ),
  usage_json TEXT NOT NULL CHECK (
    json_valid(usage_json) AND json_type(usage_json) = 'object'
  ),
  completed_at TEXT NOT NULL,
  CHECK (
    (status = 'SUCCEEDED' AND failure_reason IS NULL AND retryable IS NULL
      AND suggested_backoff_ms IS NULL AND stop_reason IS NOT NULL
      AND output_preview IS NOT NULL)
    OR
    (status = 'FAILED' AND failure_reason IS NOT NULL AND retryable IS NOT NULL
      AND stop_reason IS NULL AND output_preview IS NULL)
  )
) STRICT;
