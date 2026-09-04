# SQLite Schema 设计

## 1. 数据库设置

连接初始化：

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
```

写操作经单写队列串行化。状态迁移使用短事务，不在事务中调用模型或工具。

## 2. Schema 版本

```sql
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
);
```

迁移文件使用 `NNNN_snake_case.sql` 命名并按版本升序执行。每个迁移在
`BEGIN IMMEDIATE` 事务内执行；失败必须回滚。已经应用的迁移以 SHA-256
校验和锁定，文件内容发生变化时拒绝继续，以新版本迁移代替修改历史。

## 3. 工作区与 Corporation

Workspace 字段边界：

- `display_path` 是用户在原生目录选择器中主动授权、允许 Renderer 展示的路径；
- `canonical_root_path` 是敏感安全字段，只允许 Electron Main、Rust Core 和持久化层访问；
- `permission_mode` 描述当前真实读写能力，`access_status` 描述路径是否仍可访问；
- `path_identity_json` 保存平台目录/卷身份校验所需的最小元数据，不向 Renderer 原样暴露；
- 每次创建、恢复或执行文件操作前更新 `last_verified_at` 并重新验证路径身份与权限。

```sql
CREATE TABLE workspace (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  display_path TEXT NOT NULL,
  canonical_root_path TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('windows', 'macos')),
  permission_mode TEXT NOT NULL CHECK (permission_mode IN ('READ_ONLY', 'READ_WRITE')),
  access_status TEXT NOT NULL CHECK (access_status IN (
    'UNVERIFIED','AVAILABLE','MISSING','PERMISSION_DENIED'
  )),
  path_identity_json TEXT NOT NULL DEFAULT '{}',
  last_verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(canonical_root_path)
);

CREATE TABLE corporation (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspace(id),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  status TEXT NOT NULL CHECK (status IN (
    'DRAFT','PLANNING','ORGANIZING','EXECUTING','VERIFYING',
    'WAITING_HUMAN','PAUSED','COMPLETED','FAILED','CANCELLED','ARCHIVED'
  )),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    archived_at TEXT,
    paused_from TEXT CHECK (
      paused_from IS NULL OR paused_from IN (
        'DRAFT','PLANNING','ORGANIZING','EXECUTING','VERIFYING','WAITING_HUMAN'
      )
    ),
    paused_at TEXT,
    active_goal_version INTEGER CHECK (
    active_goal_version IS NULL OR active_goal_version >= 1
  ),
  CHECK (
    (status = 'ARCHIVED' AND archived_at IS NOT NULL)
    OR (status <> 'ARCHIVED' AND archived_at IS NULL)
  )
) STRICT;

CREATE INDEX idx_corporation_workspace_updated
ON corporation(workspace_id, updated_at DESC, id ASC);

CREATE TABLE goal_contract_version (
  corporation_id TEXT NOT NULL REFERENCES corporation(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version >= 1),
  status TEXT NOT NULL CHECK (status IN ('DRAFT','APPROVED','SUPERSEDED')),
  source TEXT NOT NULL CHECK (source IN ('MANUAL','MOCK','PROVIDER')),
  content_json TEXT NOT NULL CHECK (
    json_valid(content_json) AND json_type(content_json) = 'object'
  ),
  created_by TEXT NOT NULL CHECK (created_by = 'local-user'),
  created_at TEXT NOT NULL,
  approved_at TEXT,
  PRIMARY KEY (corporation_id, version),
  CHECK (
    (status = 'APPROVED' AND approved_at IS NOT NULL)
    OR (status <> 'APPROVED' AND approved_at IS NULL)
  )
);

CREATE INDEX idx_goal_contract_corporation_version
ON goal_contract_version(corporation_id, version DESC);

CREATE TABLE goal_generation_operation (
  operation_id TEXT PRIMARY KEY,
  corporation_id TEXT NOT NULL REFERENCES corporation(id) ON DELETE CASCADE,
  request_hash TEXT NOT NULL,
  expected_corporation_version INTEGER NOT NULL CHECK (expected_corporation_version >= 1),
  expected_goal_version INTEGER NOT NULL CHECK (expected_goal_version >= 0),
  provider_id TEXT NOT NULL REFERENCES provider(id),
  provider_version INTEGER NOT NULL CHECK (provider_version >= 1),
  model_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'GENERATING','CLARIFICATION_REQUIRED','EXTENSION_REQUIRED',
    'GOAL_SAVED','FAILED','CANCELLED','INTERRUPTED'
  )),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  cycle_number INTEGER NOT NULL DEFAULT 1 CHECK (cycle_number >= 1),
  round_in_cycle INTEGER NOT NULL DEFAULT 0 CHECK (round_in_cycle BETWEEN 0 AND 5),
  input_json TEXT NOT NULL CHECK (json_valid(input_json)),
  draft_json TEXT CHECK (draft_json IS NULL OR json_valid(draft_json)),
  questions_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(questions_json)),
  answers_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(answers_json)),
  usage_json TEXT NOT NULL DEFAULT '{"costSource":"UNKNOWN"}' CHECK (json_valid(usage_json)),
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  saved_goal_version INTEGER CHECK (saved_goal_version IS NULL OR saved_goal_version >= 1)
) STRICT;

CREATE UNIQUE INDEX idx_goal_generation_active
ON goal_generation_operation(corporation_id)
WHERE status IN ('GENERATING','CLARIFICATION_REQUIRED','EXTENSION_REQUIRED');

CREATE TABLE organization_version (
  id TEXT NOT NULL UNIQUE,
  corporation_id TEXT NOT NULL REFERENCES corporation(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES task_plan(id) ON DELETE RESTRICT,
  plan_version INTEGER NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT','APPROVED','SUPERSEDED')),
  snapshot_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (corporation_id, version)
);

CREATE UNIQUE INDEX idx_organization_current
ON organization_version(corporation_id)
WHERE status <> 'SUPERSEDED';

CREATE TABLE organization_proposal_command (
  command_id TEXT PRIMARY KEY NOT NULL,
  corporation_id TEXT NOT NULL REFERENCES corporation(id) ON DELETE CASCADE,
  request_hash TEXT NOT NULL,
  result_organization_id TEXT NOT NULL REFERENCES organization_version(id),
  created_at TEXT NOT NULL
);
```

`0013_organization_proposal.sql` 物理实现上述团队草案表。M3-TU-01 只保存 `DRAFT` 快照和幂等命令回执；每个 Corporation 只有一个未被取代的草案。快照引用创建时的已批准 Plan，并保存固定模板、模型策略、Task 责任人、职责分离和能力缺口。该迁移不创建 `agent_instance` 或 `agent_run`，不保存精确 Provider/model，也不改变 Corporation 状态。

`0014_organization_activation.sql` 增加 `corporation.active_organization_version`、内置 `agent_definition`、`organization_activation`、激活命令回执和 `agent_instance`。激活事务只允许当前 `DRAFT` organization version 转为 `APPROVED`，保存 Planner/Executor/Judge 三组 Provider ID、Provider 版本、精确模型 ID、API dialect 与策略快照，并按草案成员逐一创建 `READY` Agent Instance；不复制 Key、不创建 `agent_run`、不调用 Provider、不改变 Corporation 的 `DRAFT` 状态。当前草案、Provider 版本、连接验证或模型列表发生竞争变化时整体回滚。激活后 Provider 变化不更新历史快照和 Agent Instance；后续执行前另行校验并阻断失效配置。

`0004_goal_contract.sql` 用 trigger 强制 Goal 只能以 DRAFT 插入、内容列不可更新、只允许协议规定的状态迁移、禁止删除，并验证 `corporation.active_goal_version` 只能逐版指向本 Corporation 的当前 DRAFT。复合 pointer 约束使用 trigger，是因为 SQLite 不能通过 `ALTER TABLE ... ADD COLUMN` 给已有 Corporation 表增加复合外键；Repository 仍必须在同一短事务中写 Goal、pointer、事件与回执。

## 4. 计划与任务

```sql
CREATE TABLE task_plan (
  id TEXT PRIMARY KEY,
  corporation_id TEXT NOT NULL REFERENCES corporation(id) ON DELETE CASCADE,
  goal_version INTEGER NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT','VALIDATED','APPROVED','SUPERSEDED')),
  validation_status TEXT NOT NULL CHECK (validation_status IN ('PENDING','VALID','INVALID')),
  summary TEXT NOT NULL,
  draft_json TEXT NOT NULL CHECK (json_valid(draft_json) AND json_type(draft_json) = 'object'),
  provider_id TEXT NOT NULL REFERENCES provider(id),
  provider_version INTEGER NOT NULL,
  model_id TEXT NOT NULL,
  created_by_operation_id TEXT NOT NULL,
  validation_report_json TEXT CHECK (
    validation_report_json IS NULL OR (
      json_valid(validation_report_json)
      AND json_type(validation_report_json) = 'object'
    )
  ),
  validator_version TEXT,
  validated_draft_hash TEXT CHECK (
    validated_draft_hash IS NULL OR (
      length(validated_draft_hash) = 64
      AND validated_draft_hash NOT GLOB '*[^0-9a-f]*'
    )
  ),
  validated_at TEXT,
  supersedes_plan_id TEXT REFERENCES task_plan(id),
  approved_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(corporation_id, version),
  FOREIGN KEY (corporation_id, goal_version)
    REFERENCES goal_contract_version(corporation_id, version),
  CHECK (
    (validation_status = 'PENDING'
      AND validation_report_json IS NULL
      AND validator_version IS NULL
      AND validated_draft_hash IS NULL
      AND validated_at IS NULL)
    OR (validation_status IN ('VALID','INVALID')
      AND validation_report_json IS NOT NULL
      AND validator_version IS NOT NULL
      AND validated_draft_hash IS NOT NULL
      AND validated_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX idx_task_plan_identity
ON task_plan(id, corporation_id);

CREATE UNIQUE INDEX idx_task_plan_current
ON task_plan(corporation_id)
WHERE status <> 'SUPERSEDED';

CREATE TABLE task (
  id TEXT PRIMARY KEY,
  corporation_id TEXT NOT NULL REFERENCES corporation(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES task_plan(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES task(id),
  title TEXT NOT NULL,
  objective TEXT NOT NULL,
  kind TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 50,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  status TEXT NOT NULL CHECK (status IN (
    'DRAFT','BLOCKED','READY','RUNNING','VERIFYING','WAITING_HUMAN',
    'RETRY_PENDING','REPLAN_REQUIRED','PAUSED','COMPLETED','FAILED','CANCELLED'
  )),
  contract_json TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  assigned_agent_id TEXT,
  lease_owner TEXT,
  lease_expires_at TEXT,
  weight INTEGER NOT NULL DEFAULT 1 CHECK (weight BETWEEN 1 AND 5),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(plan_id, id),
  FOREIGN KEY (plan_id, corporation_id)
    REFERENCES task_plan(id, corporation_id)
);

CREATE INDEX idx_task_ready
ON task(corporation_id, priority DESC, created_at)
WHERE status = 'READY';

CREATE INDEX idx_task_lease
ON task(status, lease_expires_at)
WHERE status = 'RUNNING';

CREATE TABLE task_dependency (
  plan_id TEXT NOT NULL REFERENCES task_plan(id) ON DELETE CASCADE,
  upstream_task_id TEXT NOT NULL,
  downstream_task_id TEXT NOT NULL,
  condition TEXT NOT NULL CHECK (condition = 'ON_SUCCESS'),
  artifact_requirements_json TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (plan_id, upstream_task_id, downstream_task_id),
  CHECK (upstream_task_id <> downstream_task_id),
  FOREIGN KEY (plan_id, upstream_task_id)
    REFERENCES task(plan_id, id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id, downstream_task_id)
    REFERENCES task(plan_id, id) ON DELETE CASCADE
);
```

环检测由应用层事务内完成；SQLite CHECK 无法验证整图无环。`validation_report_json`、`validator_version`、`validated_draft_hash` 和 `validated_at` 由 `0011_plan_validation.sql` 增加；同一迁移创建正式 `task`/`task_dependency`。`supersedes_plan_id`、`approved_at`、每个 Corporation 唯一当前 Plan、连续版本链、旧版本只读状态和 Plan Review 命令幂等记录由 `0012_plan_review.sql` 增加。语义 hash 只覆盖不含动态状态、report 和时间的规范化草稿内容。Repository 必须保证 `INVALID` 没有 Task，`VALID` 的 Task/依赖/report/状态原子一致；保存新版本与旧版本 `SUPERSEDED` 原子一致，只有 `VALIDATED/VALID` 可转为 `APPROVED/VALID`。

## 5. Agent 与 Run

```sql
CREATE TABLE agent_definition (
  id TEXT NOT NULL,
  version INTEGER NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  definition_json TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('BUILT_IN','PLUGIN','PROJECT')),
  retired_at TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (id, version)
);

CREATE TABLE agent_instance (
  id TEXT PRIMARY KEY,
  corporation_id TEXT NOT NULL REFERENCES corporation(id) ON DELETE CASCADE,
  definition_id TEXT NOT NULL,
  definition_version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('CREATED','READY','BUSY','SUSPENDED','RETIRED')),
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (definition_id, definition_version)
    REFERENCES agent_definition(id, version)
);

CREATE TABLE agent_run (
  id TEXT PRIMARY KEY,
  corporation_id TEXT NOT NULL REFERENCES corporation(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  agent_instance_id TEXT NOT NULL REFERENCES agent_instance(id),
  attempt INTEGER NOT NULL,
  status TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  limits_json TEXT NOT NULL,
  usage_json TEXT NOT NULL DEFAULT '{}',
  checkpoint_json TEXT NOT NULL DEFAULT '{}',
  error_json TEXT,
  started_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(task_id, attempt)
);

CREATE INDEX idx_agent_run_task ON agent_run(task_id, attempt DESC);
```

`0016_agent_runtime_model_run.sql` 增加 `agent_run_candidate` 和
`agent_run_command`。候选表保存与 Task `expectedOutputs` 一一对应的正文、类型、
media type 和 SHA-256；`candidate://<UUID>` 引用只由软件在读取时生成。命令表保存
继续、重试、取消的请求哈希和结果 Run，用于防止重复模型调用。该迁移不创建
`artifact` 或 `artifact_version`；正式交付物仍由后续任务实现。

## 6. 模型、工具与审批

```sql
CREATE TABLE key_vault_entry (
  id TEXT PRIMARY KEY,
  ciphertext BLOB NOT NULL CHECK (length(ciphertext) > 0),
  nonce BLOB NOT NULL CHECK (length(nonce) = 12),
  auth_tag BLOB NOT NULL CHECK (length(auth_tag) = 16),
  encryption_version INTEGER NOT NULL CHECK (encryption_version = 1),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE provider (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('OPENAI_COMPATIBLE')),
  name TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  api_dialect TEXT NOT NULL DEFAULT 'CHAT_COMPLETIONS'
    CHECK (api_dialect IN ('CHAT_COMPLETIONS')),
  selected_model_id TEXT,
  generation_timeout_ms INTEGER NOT NULL DEFAULT 60000
    CHECK (generation_timeout_ms BETWEEN 5000 AND 300000),
  key_vault_entry_id TEXT UNIQUE REFERENCES key_vault_entry(id) ON DELETE SET NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  config_status TEXT NOT NULL CHECK (config_status IN ('ENABLED','DISABLED')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE provider_command (
  command_id TEXT PRIMARY KEY NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN ('SAVE','DELETE_KEY')),
  provider_id TEXT NOT NULL REFERENCES provider(id) ON DELETE CASCADE,
  request_hash TEXT NOT NULL CHECK (
    length(request_hash) = 64
    AND request_hash NOT GLOB '*[^0-9a-f]*'
  ),
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  result_version INTEGER NOT NULL CHECK (result_version >= 1),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE provider_connection_test (
  provider_id TEXT PRIMARY KEY NOT NULL
    REFERENCES provider(id) ON DELETE CASCADE,
  provider_version INTEGER NOT NULL CHECK (provider_version >= 1),
  status TEXT NOT NULL CHECK (status IN ('VERIFIED','FAILED')),
  failure_reason TEXT CHECK (
    failure_reason IS NULL OR failure_reason IN (
      'AUTHENTICATION','PERMISSION','RATE_LIMIT','QUOTA_EXHAUSTED',
      'INVALID_REQUEST','MODEL_NOT_FOUND','CONTENT_FILTER','TIMEOUT',
      'NETWORK','PROVIDER_INTERNAL','CANCELLED'
    )
  ),
  retryable INTEGER CHECK (retryable IN (0,1)),
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

CREATE TABLE provider_generation_test (
  provider_id TEXT PRIMARY KEY NOT NULL
    REFERENCES provider(id) ON DELETE CASCADE,
  provider_version INTEGER NOT NULL CHECK (provider_version >= 1),
  model_id TEXT NOT NULL CHECK (length(model_id) BETWEEN 1 AND 512),
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
    output_preview IS NULL OR length(CAST(output_preview AS BLOB)) <= 65536
  ),
  usage_json TEXT NOT NULL CHECK (
    json_valid(usage_json) AND json_type(usage_json) = 'object'
  ),
  completed_at TEXT NOT NULL,
  CHECK (
    (status = 'SUCCEEDED' AND failure_reason IS NULL AND retryable IS NULL
      AND stop_reason IS NOT NULL AND output_preview IS NOT NULL)
    OR
    (status = 'FAILED' AND failure_reason IS NOT NULL AND retryable IS NOT NULL
      AND stop_reason IS NULL AND output_preview IS NULL)
  )
) STRICT;

CREATE TABLE model_call (
  id TEXT PRIMARY KEY,
  corporation_id TEXT NOT NULL REFERENCES corporation(id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN (
    'GOAL_ANALYSIS','PLAN_GENERATION','AGENT_RUN','JUDGE'
  )),
  task_id TEXT,
  run_id TEXT,
  provider_id TEXT NOT NULL REFERENCES provider(id),
  provider_version INTEGER NOT NULL CHECK (provider_version >= 1),
  model_id TEXT NOT NULL,
  attempt INTEGER NOT NULL CHECK (attempt >= 1),
  status TEXT NOT NULL CHECK (status IN (
    'STARTED','SUCCEEDED','FAILED','CANCELLED','INTERRUPTED'
  )),
  request_meta_json TEXT NOT NULL CHECK (json_valid(request_meta_json)),
  response_meta_json TEXT CHECK (
    response_meta_json IS NULL OR json_valid(response_meta_json)
  ),
  usage_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(usage_json)),
  failure_reason TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  CHECK (
    (purpose IN ('AGENT_RUN','JUDGE') AND task_id IS NOT NULL AND run_id IS NOT NULL)
    OR (purpose IN ('GOAL_ANALYSIS','PLAN_GENERATION') AND task_id IS NULL AND run_id IS NULL)
  )
);

CREATE TABLE tool_invocation (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_run(id) ON DELETE CASCADE,
  tool_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  input_json TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  policy_decision TEXT NOT NULL CHECK (policy_decision IN ('ALLOW','DENY','REQUIRE_APPROVAL')),
  status TEXT NOT NULL,
  side_effect TEXT NOT NULL,
  result_json TEXT,
  started_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE approval_request (
  id TEXT PRIMARY KEY,
  corporation_id TEXT NOT NULL REFERENCES corporation(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES task(id),
  tool_invocation_id TEXT REFERENCES tool_invocation(id),
  status TEXT NOT NULL CHECK (status IN ('PENDING','APPROVED','DENIED','EXPIRED','CANCELLED')),
  request_json TEXT NOT NULL,
  response_json TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX idx_approval_pending
ON approval_request(corporation_id, created_at)
WHERE status = 'PENDING';
```

`model_call.response_meta_json` 使用版本化、无正文元数据。M2-TU-05 失败调用可保存固定 `failureDiagnostic` 枚举，以区分 HTTP 服务器错误、空输出、额度耗尽和非法响应结构；不得保存 Prompt、模型正文、隐藏推理、远端 request ID、Header、Key 或自由文本错误。该字段已由 `0009_goal_engine.sql` 定义为可扩展 JSON 对象，本次不修改 `0001`–`0008`，也不需要重建既有表。

`0010_planner_generation.sql` 在不修改 `0001`–`0009` 的前提下增加 `task_plan` 和 `planner_generation_operation`。首个 Plan 只能以 `DRAFT/PENDING` 保存，正式 Plan/Task 身份由 Main 分配；每个 Corporation 同时最多一个 `GENERATING` 操作。操作绑定 Corporation、当前批准 Goal、Provider 版本和精确模型，并保存受限 usage、固定失败原因与 Plan 指针，不保存 Prompt、模型正文、非法 JSON、Workspace 内容、Key、Header 或远端自由文本。遗留 `GENERATING` 在应用启动时转为 `INTERRUPTED`，不得自动重发。

## 7. Artifact 与评价

```sql
CREATE TABLE artifact (
  id TEXT PRIMARY KEY,
  corporation_id TEXT NOT NULL REFERENCES corporation(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  logical_name TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT','CANDIDATE','APPROVED','REJECTED','SUPERSEDED')),
  integrity_status TEXT NOT NULL DEFAULT 'VALID'
    CHECK (integrity_status IN ('VALID','CORRUPTED','MISSING')),
  current_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(task_id, logical_name)
);

CREATE TABLE artifact_version (
  artifact_id TEXT NOT NULL REFERENCES artifact(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  creator_run_id TEXT NOT NULL REFERENCES agent_run(id),
  media_type TEXT NOT NULL,
  storage_kind TEXT NOT NULL,
  storage_ref TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  PRIMARY KEY (artifact_id, version)
);

CREATE TABLE artifact_source (
  artifact_id TEXT NOT NULL,
  artifact_version INTEGER NOT NULL,
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_version INTEGER,
  PRIMARY KEY (artifact_id, artifact_version, source_kind, source_id),
  FOREIGN KEY (artifact_id, artifact_version)
    REFERENCES artifact_version(artifact_id, version) ON DELETE CASCADE
);

CREATE TABLE evaluation (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('PASS','FAIL','NEEDS_HUMAN','ERROR')),
  score REAL,
  report_artifact_id TEXT REFERENCES artifact(id),
  report_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_evaluation_task ON evaluation(task_id, created_at DESC);
```

## 8. 预算、事件和记忆

```sql
CREATE TABLE budget_ledger (
  id TEXT PRIMARY KEY,
  corporation_id TEXT NOT NULL REFERENCES corporation(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES task(id),
  run_id TEXT REFERENCES agent_run(id),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('RESERVE','RELEASE','CHARGE','ADJUST')),
  amount_micros INTEGER NOT NULL,
  token_input INTEGER NOT NULL DEFAULT 0,
  token_output INTEGER NOT NULL DEFAULT 0,
  reference_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_budget_ledger_corp
ON budget_ledger(corporation_id, created_at);

CREATE TABLE domain_event (
  event_id TEXT PRIMARY KEY NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = '1.0'),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'corporation.created','corporation.name.updated','corporation.archived',
      'goal.contract.drafted','goal.contract.approved',
      'corporation.paused','corporation.resumed'
  )),
  aggregate_type TEXT NOT NULL CHECK (aggregate_type = 'CORPORATION'),
  aggregate_id TEXT NOT NULL REFERENCES corporation(id),
  aggregate_version INTEGER NOT NULL CHECK (aggregate_version >= 1),
  corporation_id TEXT NOT NULL REFERENCES corporation(id),
  correlation_id TEXT NOT NULL,
  actor_json TEXT NOT NULL CHECK (json_valid(actor_json)),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  sensitivity TEXT NOT NULL CHECK (sensitivity = 'NORMAL'),
  occurred_at TEXT NOT NULL,
  UNIQUE(aggregate_type, aggregate_id, aggregate_version)
) STRICT;

CREATE INDEX idx_event_corporation_timeline
ON domain_event(corporation_id, occurred_at, event_id);

CREATE TRIGGER domain_event_reject_update
BEFORE UPDATE ON domain_event BEGIN
  SELECT RAISE(ABORT, 'domain_event is append-only');
END;

CREATE TRIGGER domain_event_reject_delete
BEFORE DELETE ON domain_event BEGIN
  SELECT RAISE(ABORT, 'domain_event is append-only');
END;

CREATE TABLE corporation_command (
  command_id TEXT PRIMARY KEY NOT NULL,
  command_type TEXT NOT NULL CHECK (
    command_type IN ('CREATE','UPDATE_NAME','ARCHIVE')
  ),
  request_hash TEXT NOT NULL CHECK (
    length(request_hash) = 64
    AND request_hash NOT GLOB '*[^0-9a-f]*'
  ),
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  result_version INTEGER NOT NULL CHECK (result_version >= 1),
  created_at TEXT NOT NULL
) STRICT;

  CREATE TABLE goal_contract_command (
  command_id TEXT PRIMARY KEY NOT NULL,
  command_type TEXT NOT NULL CHECK (
    command_type IN ('SAVE_DRAFT','APPROVE')
  ),
  corporation_id TEXT NOT NULL REFERENCES corporation(id),
  request_hash TEXT NOT NULL CHECK (
    length(request_hash) = 64
    AND request_hash NOT GLOB '*[^0-9a-f]*'
  ),
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  result_version INTEGER NOT NULL CHECK (result_version >= 1),
  created_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE corporation_state_command (
    command_id TEXT PRIMARY KEY NOT NULL,
    command_type TEXT NOT NULL CHECK (command_type IN ('PAUSE','RESUME')),
    corporation_id TEXT NOT NULL REFERENCES corporation(id),
    request_hash TEXT NOT NULL CHECK (
      length(request_hash) = 64
      AND request_hash NOT GLOB '*[^0-9a-f]*'
    ),
    result_json TEXT NOT NULL CHECK (json_valid(result_json)),
    result_version INTEGER NOT NULL CHECK (result_version >= 1),
    created_at TEXT NOT NULL
  ) STRICT;

CREATE TABLE memory_item (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('CORPORATION','APPLICATION')),
  scope_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('CANDIDATE','ACTIVE','DISPUTED','RETIRED')),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  sensitivity TEXT NOT NULL,
  source_refs_json TEXT NOT NULL,
  valid_from TEXT NOT NULL,
  valid_until TEXT,
  created_at TEXT NOT NULL,
  retired_at TEXT
);

CREATE VIRTUAL TABLE memory_fts USING fts5(
  memory_id UNINDEXED,
  content,
  tokenize = 'unicode61'
);
```

Provider 表只保存应用自管 Key Vault 的记录 ID。`key_vault_entry` 保存 AES-256-GCM v1 密文、
12-byte nonce、16-byte authentication tag 和版本；32-byte 本地加密密钥由应用生成并以独立文件
保存在应用数据目录，不进入 SQLite、OS Keychain/Credential Manager 或 Native Core。任何 SQLite
列、日志和错误都不得包含明文 Key。

创建 Provider 与 Key Vault 记录、替换密文、解除引用并删除 Key Vault 记录分别在短事务中完成。
数据库或本地加密密钥文件缺失、损坏、权限拒绝、版本未知或认证解密失败时固定失败，不返回部分
成功或明文降级。仅取得 SQLite 备份不足以恢复 Key；v0.1 当前任务通过重新录入 Provider Key 恢复。

`provider_connection_test` 由 `0007_provider_connection_test.sql` 建立，只保存当前 Provider 配置版本最近一次已完成连接测试的标准结果和受限模型列表。不存在记录或 `provider_version` 与 Provider 当前版本不一致均投影为 `UNVERIFIED`；Provider Endpoint 变化、Key 替换或 Key 删除必须在同一事务中删除旧测试记录。仅名称或启停状态变化时，投影随 Provider 新版本迁移并保留结果。`CANCELLED` 不覆盖已有结果，迟到响应必须通过版本检查拒绝持久化。该表不保存 Authorization、Key、原始响应或错误正文，也不表示 Scheduler 的运行时健康或熔断状态。

`0008_provider_generation.sql` 为 Provider 增加显式 `CHAT_COMPLETIONS` dialect、精确模型选择和生成超时，并建立最近生成测试投影。模型只能从当前 `VERIFIED` 连接模型列表中选择；Endpoint 或 Key 改变时在同一事务清除连接测试、模型选择和生成测试；名称/启停变化迁移连接与生成投影；超时变化保留连接和模型但清除生成投影；模型变化保留连接但清除生成投影。生成投影只保存固定低风险输入的受限预览、标准 usage/错误与时间；不保存输入、原始远端 DTO、Authorization、Key 或远端 request ID。取消与配置冲突不覆盖已有投影。

`0003_corporation_events.sql` 只建立 M1-TU-04 已冻结的 Corporation CRUD、事件与命令回执字段。`0004_goal_contract.sql` 增加 active Goal pointer、不可变 Goal 版本、Goal 命令回执和两种 Goal 事实事件。`0005_corporation_pause_resume.sql` 增加成对暂停元数据、pause/resume 独立命令回执、两种状态事实事件和物理一致性 trigger；active Plan/Organization、Policy 与事件分发游标仍由后续迁移增加。分发状态不得通过更新 append-only `domain_event` 实现。

`0021_pi_company.sql` 建立 Pi 路线独立的 `pi_company`、`pi_company_employee` 和 `pi_company_workspace`。`pi_task.company_id` 必填并引用 `pi_company`；员工与工作区关系使用联合主键，重复加入保持幂等。升级库只有在已存在 Pi 员工或任务时才创建“我的公司”，随后把现有员工、任务和任务使用过的工作区接入；旧 `corporation` 及其 Goal/Plan 数据保持原样。

`0022_pi_task_deliverable.sql` 为 Pi 路线建立轻量任务成果记录。每项记录固定属于 `pi_task` 和该任务的 Workspace，以任务和相对路径唯一；保存来源、创建/修改分类、交付时 SHA-256、大小、可选差异和登记时间。迁移不扫描工作区、不回填旧任务，也不调用模型、工具、命令或外部服务。

`0023_pi_employee_skill.sql` 建立 `pi_employee_skill(employee_id, skill_name, position)`。`employee_id + skill_name` 和 `employee_id + position` 分别唯一，删除员工级联删除分配关系；迁移把每名员工原 `skill_name` 复制为位置 `0`，不要求重建员工。新版本以关系表为权威列表，并在保存事务内让旧 `pi_employee.skill_name` 镜像第一项；员工不得保存空列表。

同一迁移给 `pi_workspace_write` 增加 `operation_kind`，只允许 `TEXT_WRITE` 或 `SKILL_ASSET`，使应用重启后能按真实操作类型恢复而不重复复制。`pi_task_deliverable.source` 同步增加 `SKILL_ASSET`；迁移通过重建轻量成果表保留已有记录、主键和索引，不扫描或改写 Workspace 文件。

M12-TU-02 不增加 `0024`：脚本与环境安装启动前继续写现有 `pi_command_call.STARTING`，完成后记录真实终态，启动恢复把遗留运行记录改为 `UNKNOWN`；可见计划和结果继续进入 `pi_task_event`。Skill 独立环境使用应用自管文件系统中的原子 `READY` 清单，不把机器绝对路径写入 SQLite；项目环境只写当前 Workspace 的明确子目录且不进入 `pi_task_deliverable`。只有复检成功的清单可被复用，临时或未知环境不能投影为成功。

`0024_pi_task_attachment.sql` 建立 `pi_task_attachment`。每条记录必须属于一个 `pi_task`，保存附件 UUID、任务内显示名称、受限媒体类型、大小、SHA-256、随机私有存储文件名和创建时间；任务删除时级联删除数据库记录，文件系统副本由同一任务清理流程处理。表中不保存用户原始绝对路径、提取正文或模型生成内容。迁移不扫描用户目录、不回填旧任务，也不调用模型或文档工具。

FTS 同步由事务内 repository 维护并用一致性测试覆盖。

## 9. 事务示例

Task 完成：

```sql
BEGIN IMMEDIATE;

UPDATE task
SET status = 'COMPLETED', version = version + 1, updated_at = :now
WHERE id = :task_id AND status = 'VERIFYING' AND version = :expected_version;

-- 调用方确认 changes() = 1

INSERT INTO domain_event (...);

COMMIT;
```

## 10. 备份与恢复

- 使用 SQLite backup API，不复制活跃 WAL 文件组合；
- 迁移前创建带 schema version 的备份；
- Artifact Store 与数据库备份生成 manifest；
- 恢复时校验 Artifact 哈希；
- 默认保留最近 3 个自动备份，具体策略可配置。

## 11. 验收

- DDL 可从空库完整迁移；
- foreign key check 无错误；
- Ready/Timeline/Pending Approval 查询有索引；
- 并发领取和乐观锁测试通过；
- FTS 与 memory_item 一致；
- 备份恢复后 Artifact 引用有效。
