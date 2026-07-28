# Agent Protocol v1.0

## 1. 目的

Agent Protocol 定义 Organization Engine、Scheduler、Agent Runtime、Provider 和 UI 之间的稳定数据合同。协议描述 Agent 的身份、运行上下文、输出和错误，不规定具体类结构。

## 2. 通用信封

```ts
type Envelope<T> = {
  schemaVersion: "1.0";
  messageId: string;
  correlationId: string;
  causationId?: string;
  corporationId: string;
  taskId?: string;
  runId?: string;
  timestamp: string;
  payload: T;
};
```

规则：

- ID 使用 UUID v7；
- 时间使用 UTC ISO-8601；
- `correlationId` 贯穿一次用户操作或任务链；
- 未知可选字段保留，未知必需语义拒绝；
- 敏感字段不得进入通用 Envelope。

## 3. Agent Definition

```json
{
  "schemaVersion": "1.0",
  "id": "agent-def-writer",
  "version": 1,
  "name": "Document Executor",
  "role": "EXECUTOR",
  "objective": "根据任务合同创建结构化文档",
  "capabilities": [
    {
      "path": "writing.technical_document",
      "level": 0.8,
      "confidence": 0.6,
      "source": "BUILT_IN_PRIOR"
    }
  ],
  "instructionTemplateId": "executor.document.v1",
  "allowedToolIds": ["workspace.read_text", "workspace.propose_write"],
  "modelPolicyId": "balanced-tools",
  "memoryPolicy": {
    "readScopes": ["CORPORATION"],
    "mayProposeMemory": true
  },
  "outputSchemas": ["agent-output-envelope.v1"],
  "defaultLimits": {
    "maxModelTurns": 8,
    "maxToolCalls": 12,
    "timeoutMs": 900000
  }
}
```

能力等级为估计值，不等于认证。必须同时保存 `confidence` 和 `source`。

## 4. Run 请求

```ts
type StartAgentRun = {
  agentInstanceId: string;
  taskContractRef: string;
  inputArtifactRefs: ArtifactRef[];
  evaluationFeedbackRef?: string;
  modelRoute: ModelRouteSnapshot;
  effectivePolicyRef: string;
  limits: RunLimits;
  idempotencyKey: string;
};
```

相同 `idempotencyKey` 不得创建两个活跃 Run。

## 5. Agent 输出

```ts
type AgentOutputEnvelope = {
  summary: string;
  artifacts: {
    logicalName: string;
    type: ArtifactType;
    mediaType: string;
    contentRef: TemporaryContentRef;
  }[];
  claims: {
    statement: string;
    evidenceRefs: EvidenceRef[];
    confidence: number;
  }[];
  unresolvedIssues: {
    code: string;
    message: string;
    blocking: boolean;
  }[];
  requestedFollowups: {
    kind: "CLARIFICATION" | "FOLLOWUP_TASK";
    reason: string;
    requiredCapability?: string;
  }[];
};
```

最终结果不允许只返回自由文本；自由文本必须包装为 `TEXT` Artifact。

## 6. Tool Call 消息

```ts
type AgentToolCall = {
  callId: string;
  idempotencyKey: string;
  toolId: string;
  input: unknown;
  purpose: string;
  expectedEffect: string;
};

type AgentToolResult = {
  callId: string;
  status: "SUCCEEDED" | "FAILED" | "DENIED" | "CANCELLED" | "UNKNOWN";
  output?: unknown;
  artifactRefs?: ArtifactRef[];
  error?: ProtocolError;
  sideEffect: "NONE" | "REVERSIBLE" | "IRREVERSIBLE" | "UNKNOWN";
};
```

## 7. 运行事件

- `agent.run.created`
- `agent.run.state.changed`
- `agent.context.prepared`
- `agent.output.repair.requested`
- `agent.output.produced`
- `agent.run.completed`
- `agent.run.failed`

状态事件必须携带 `from`、`to`、`reasonCode`，但不携带完整 Prompt。

## 8. 协议错误

```ts
type ProtocolError = {
  code: string;
  category: "VALIDATION" | "POLICY" | "PROVIDER" | "TOOL" | "BUDGET" | "INTERNAL";
  retryable: boolean;
  message: string;
  diagnosticRef?: string;
};
```

错误码示例：

- `AGENT_DEFINITION_INVALID`
- `MODEL_ROUTE_UNAVAILABLE`
- `OUTPUT_SCHEMA_INVALID`
- `TOOL_NOT_ALLOWED`
- `RUN_LIMIT_EXCEEDED`
- `RUN_CANCELLED`

## 9. 兼容性

- 同 major 版本可新增可选字段；
- 枚举新增值必须由接收方安全降级；
- 删除字段、改变默认值或含义需要 major 版本；
- Definition、Prompt、Policy 和 Model Route 在 Run 启动时快照化；
- 协议 JSON Schema 存放于仓库 `schemas/`，代码类型由 Schema 生成或做一致性测试。

## 10. 验收

- 所有示例通过 JSON Schema；
- 重复 Run 请求具备幂等性；
- Agent 不能在协议中声明额外权限；
- 所有输出可关联到 Artifact、Task 和 Run；
- 错误可被 Task Engine 明确分类。

