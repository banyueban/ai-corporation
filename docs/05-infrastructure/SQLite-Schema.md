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
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'DRAFT','PLANNING','ORGANIZING','EXECUTING','VERIFYING',
    'WAITING_HUMAN','PAUSED','COMPLETED','FAILED','CANCELLED','ARCHIVED'
  )),
  active_goal_version INTEGER,
  active_plan_version INTEGER,
  active_organization_version INTEGER,
  policy_version INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE INDEX idx_corporation_status_updated
ON corporation(status, updated_at DESC);

CREATE TABLE goal_contract_version (
  corporation_id TEXT NOT NULL REFERENCES corporation(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  original_goal TEXT NOT NULL,
  structured_goal_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT','APPROVED','SUPERSEDED')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (corporation_id, version)
);

CREATE TABLE organization_version (
  corporation_id TEXT NOT NULL REFERENCES corporation(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT','APPROVED','SUPERSEDED')),
  snapshot_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (corporation_id, version)
);
```

## 4. 计划与任务

```sql
CREATE TABLE task_plan (
  id TEXT PRIMARY KEY,
  corporation_id TEXT NOT NULL REFERENCES corporation(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT','VALIDATED','APPROVED','SUPERSEDED')),
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(corporation_id, version)
);

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
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_task_ready
ON task(corporation_id, priority DESC, created_at)
WHERE status = 'READY';

CREATE INDEX idx_task_lease
ON task(status, lease_expires_at)
WHERE status = 'RUNNING';

CREATE TABLE task_dependency (
  upstream_task_id TEXT NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  downstream_task_id TEXT NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  condition TEXT NOT NULL CHECK (condition IN ('ON_SUCCESS','ON_COMPLETION')),
  artifact_requirements_json TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (upstream_task_id, downstream_task_id),
  CHECK (upstream_task_id <> downstream_task_id)
);
```

环检测由应用层事务内完成；SQLite CHECK 无法验证整图无环。

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

## 6. 模型、工具与审批

```sql
CREATE TABLE provider (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  endpoint TEXT,
  secret_ref TEXT,
  config_json TEXT NOT NULL DEFAULT '{}',
  config_status TEXT NOT NULL CHECK (config_status IN ('ENABLED','DISABLED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE model_call (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_run(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES provider(id),
  model_id TEXT NOT NULL,
  status TEXT NOT NULL,
  request_meta_json TEXT NOT NULL,
  response_meta_json TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_micros INTEGER,
  started_at TEXT NOT NULL,
  ended_at TEXT
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
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  aggregate_version INTEGER NOT NULL,
  corporation_id TEXT NOT NULL REFERENCES corporation(id) ON DELETE CASCADE,
  correlation_id TEXT NOT NULL,
  causation_id TEXT,
  actor_json TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  sensitivity TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  dispatched_at TEXT,
  UNIQUE(aggregate_type, aggregate_id, aggregate_version)
);

CREATE INDEX idx_event_dispatch
ON domain_event(dispatched_at, occurred_at)
WHERE dispatched_at IS NULL;

CREATE INDEX idx_event_timeline
ON domain_event(corporation_id, occurred_at, event_id);

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
