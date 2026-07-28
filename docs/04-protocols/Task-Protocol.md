# Task Protocol v1.0

## 1. 目的

Task Protocol 是 AI Corporation 的工作合同。它使 Planner、Scheduler、Agent Runtime、Evaluation Engine 和 UI 对“做什么、使用什么输入、如何算完成”有同一理解。

## 2. Task Contract

```ts
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
  inputRefs: ArtifactRef[];
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

## 3. 输出合同

```ts
type OutputContract = {
  logicalName: string;
  artifactType: ArtifactType;
  mediaType: string;
  schemaRef?: string;
  required: boolean;
  description: string;
};
```

## 4. 能力要求

```ts
type CapabilityRequirement = {
  path: string;
  minimumLevel: number;
  mandatory: boolean;
};
```

v0.1 能力路径使用小写点分层命名。禁止把具体模型名写成能力。

## 5. 预算与重试

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

## 6. 状态事件

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

## 7. 依赖协议

```ts
type TaskDependency = {
  upstreamTaskId: string;
  downstreamTaskId: string;
  condition: "ON_SUCCESS" | "ON_COMPLETION";
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

## 8. 命令

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

## 9. 示例

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
      "artifactId": "goal-contract",
      "version": 1
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
      "evaluatorHint": "CONTENT",
      "expected": ["目标", "非目标", "功能需求", "验收标准"],
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

## 10. 验收

- Task Contract 可独立验证；
- 没有 acceptance criteria 的 Task 无法 Ready；
- 依赖图可检测环；
- 权限要求可映射到 Policy；
- 预算、重试和输出合同可由各引擎一致消费。

