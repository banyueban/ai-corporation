# Task Protocol v1.0

## 1. 目的

Task Protocol 是 AI Corporation 的工作合同。它使 Planner、Scheduler、Agent Runtime、Evaluation Engine 和 UI 对“做什么、使用什么输入、如何算完成”有同一理解。

模型生成阶段不直接返回本协议的正式 `TaskContract`。模型候选、局部引用、可信 ID 分配和未验证 Plan DRAFT 由 [Planner Protocol](Planner-Protocol.md) 定义；只有后续计划验证通过后才转换并物化为本协议的正式合同。

## 2. Task Contract

```ts
type TaskKind =
  | "ANALYSIS"
  | "GENERATION"
  | "TRANSFORMATION"
  | "VALIDATION"
  | "HUMAN_DECISION";
type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type TaskDependencyRef = {
  taskId: string;
  condition: "ON_SUCCESS";
};

type PermissionRequirement = {
  workspaceRead: boolean;
  workspaceWrite: string[];
  processProfiles: string[];
};
type TaskStatus =
  | "DRAFT"
  | "BLOCKED"
  | "READY"
  | "RUNNING"
  | "VERIFYING"
  | "WAITING_HUMAN"
  | "RETRY_PENDING"
  | "REPLAN_REQUIRED"
  | "PAUSED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

type TaskContract = {
  schemaVersion: "1.0";
  id: string;
  corporationId: string;
  planVersion: number;
  parentId?: string;
  title: string;
  objective: string;
  description?: string;
  kind: TaskKind;
  priority: number;
  riskLevel: RiskLevel;
  requiredCapabilities: CapabilityRequirement[];
  requiredTools: string[];
  inputRefs: TaskInputRef[];
  expectedOutputs: OutputContract[];
  acceptanceCriteria: AcceptanceCriterion[];
  dependencies: TaskDependencyRef[];
  budget: TaskBudget;
  retryPolicy: RetryPolicy;
  permissionRequest: PermissionRequirement;
  assumptions: string[];
  nonGoals: string[];
};
```

正式 Task 的输入是计划期逻辑引用，不伪造尚未生成的 Artifact：

```ts
type TaskInputRef =
  | {
      source: "GOAL_CONTRACT";
      goalVersion: number;
      logicalName: string;
      mediaType?: string;
      required: boolean;
    }
  | {
      source: "TASK_OUTPUT";
      upstreamTaskId: string;
      logicalName: string;
      mediaType?: string;
      required: boolean;
    };
```

`TASK_OUTPUT` 必须在同一 Plan 的依赖路径上引用真实上游 Task 的已声明输出。Task 开始前才把它解析为带精确版本和哈希的 `ArtifactRef` 并写入 Run 快照。`GOAL_CONTRACT` 固定绑定 Plan 的已批准 Goal version，不创建伪 Artifact。

## 3. 输出合同

```ts
type OutputContract = {
  logicalName: string;
  artifactType: ArtifactType;
  mediaType: string;
  required: boolean;
  description: string;
};
```

Planner media type 到 `ArtifactType` 的固定映射、未知值处理和 `FILE` 语义只由 [Plan Validation Protocol](Plan-Validation-Protocol.md) 定义。

## 4. 验收标准

```ts
type AcceptanceCriterion = {
  id: string;
  description: string;
  severity: "REQUIRED" | "RECOMMENDED";
  evidenceRequired: string[];
};
```

`id` 在单个 Task 内唯一。`evidenceRequired` 是受限、去重的证据标签，不强制等于输出 logical name。M2-TU-07 不猜测 evaluator、expected value 或评价结论；具体评价器选择属于后续 Evaluation 任务。

## 5. 能力要求

```ts
type CapabilityRequirement = {
  path: string;
  minimumLevel: number;
  mandatory: boolean;
};
```

v0.1 能力路径使用小写点分层命名。禁止把具体模型名写成能力。

## 6. 预算与重试

```ts
type TaskBudget = {
  maxInputTokens?: number;
  maxOutputTokens?: number;
  maxCostMicros?: string;
  maxDurationMs?: number;
};

type RetryPolicy = {
  maxAttempts: number;
  maxEvaluationRevisions: number;
  retryableCategories: string[];
};
```

## 7. 状态事件

状态本身存数据库，变更通过事件发布：

```ts
type TaskStateChanged = {
  taskId: string;
  from: TaskStatus;
  to: TaskStatus;
  reasonCode: string;
  actor: {
    kind: "USER" | "SYSTEM" | "AGENT";
    id: string;
  };
  attempt: number;
  occurredAt: string;
};
```

## 8. 依赖协议

```ts
type TaskDependency = {
  upstreamTaskId: string;
  downstreamTaskId: string;
  condition: "ON_SUCCESS";
  artifactRequirements: {
    logicalName?: string;
    artifactType?: ArtifactType;
  }[];
};
```

验证：

- 不允许自依赖；
- 不允许环；
- 引用 Task 必须属于同一 Corporation 和 Plan lineage；
- 依赖 Artifact 在 Run 启动时解析到固定版本。

## 9. 命令

```ts
type TaskCommand =
  | { type: "APPROVE_PLAN"; planId: string }
  | { type: "PAUSE_TASK"; taskId: string; reason: string }
  | { type: "RESUME_TASK"; taskId: string }
  | { type: "CANCEL_TASK"; taskId: string; reason: string }
  | { type: "RETRY_TASK"; taskId: string; strategy: RetryStrategy }
  | { type: "REQUEST_REPLAN"; taskId: string; reason: string };
```

每个命令含 command ID 和 idempotency key。

## 10. 示例

```json
{
  "schemaVersion": "1.0",
  "id": "task-write-prd",
  "corporationId": "corp-001",
  "planVersion": 1,
  "title": "编写产品需求文档",
  "objective": "根据已确认目标合同创建 PRD.md",
  "kind": "GENERATION",
  "priority": 80,
  "riskLevel": "MEDIUM",
  "requiredCapabilities": [
    {
      "path": "writing.product_requirement",
      "minimumLevel": 0.7,
      "mandatory": true
    }
  ],
  "requiredTools": ["workspace.read_text", "workspace.propose_write"],
  "inputRefs": [
    {
      "source": "GOAL_CONTRACT",
      "goalVersion": 1,
      "logicalName": "approved-goal",
      "required": true
    }
  ],
  "expectedOutputs": [
    {
      "logicalName": "PRD.md",
      "artifactType": "DOCUMENT",
      "mediaType": "text/markdown",
      "required": true,
      "description": "结构化产品需求文档"
    }
  ],
  "acceptanceCriteria": [
    {
      "id": "criterion-sections",
      "description": "包含目标、非目标、功能和验收标准",
      "severity": "REQUIRED",
      "evidenceRequired": ["artifact-section"]
    }
  ],
  "dependencies": [],
  "budget": {
    "maxCostMicros": "200000",
    "maxDurationMs": 900000
  },
  "retryPolicy": {
    "maxAttempts": 3,
    "maxEvaluationRevisions": 2,
    "retryableCategories": ["PROVIDER", "MODEL_OUTPUT", "ACCEPTANCE_FAILED"]
  },
  "permissionRequest": {
    "workspaceRead": true,
    "workspaceWrite": ["docs/01-product/PRD.md"],
    "processProfiles": []
  },
  "assumptions": [],
  "nonGoals": ["编写实现代码"]
}
```

## 11. 验收

- Task Contract 可独立验证；
- 每个 Task 没有 `REQUIRED` acceptance criterion 时计划验证失败，无法成为正式可批准计划；
- 依赖图可检测环；
- 权限要求可映射到 Policy；
- 预算、重试和输出合同可由各引擎一致消费。

## 12. Pi 任务附件与文档工具协议

Pi 路线的附件选择使用独立 IPC。Main 打开文件选择器或接收 Preload 从真实拖放文件解析出的路径，复制成功后只向 Renderer 返回一次性选择 ID 和附件的任务内 ID、名称、类型、大小、哈希；任何绝对路径都不跨到 Renderer。`piTask.start` 可携带一个待提交选择 ID，任务建立后 `PiTask.attachments` 返回固定附件元数据。

每次选择最多 10 个文件，单个文件不超过 50 MiB，总大小不超过 100 MiB。首版只接受 `.docx`、`.pdf`、`.txt`、`.md`，并同时检查扩展名、文件头或 UTF-8；目录、链接、设备文件、宏文档、伪扩展名和选择后变化固定拒绝。用户移除附件、关闭应用或待选择过期时只清理应用暂存副本，不修改原文件。

`document_read` 输入为 `attachmentId`、`offset` 和 `maxChars`，其中单次最多返回 40,000 字符；结果包含规范化 Markdown、总字符数、当前范围、下一偏移和 `hasMore`。`document_create` 输入为 `format`、`relativePath` 和不超过 200,000 字符的规范化 Markdown；只允许新的 `.docx` 或 `.pdf`，成功结果包含真实相对路径、SHA-256 和大小。两项工具都固定属于当前公司、任务、员工和 Workspace，不接受绝对路径、应用私有路径、任意命令或环境变量。
