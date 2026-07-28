# Agent Runtime 详细设计

## 1. 定位

Agent Runtime 将一个已分配 Task 转换为受控的模型与工具执行循环。它是执行环境，不拥有公司目标，也不能自行扩张权限、预算或任务范围。

## 2. 职责边界

负责：

- 加载 Agent Definition 和 Task Contract；
- 组装最小上下文；
- 调用 Model Provider；
- 解析结构化响应和 Tool Call；
- 将 Tool Call 交给 Policy/Tool Runtime；
- 创建候选 Artifact；
- 记录用量、检查点和结构化错误；
- 响应取消与超时。

不负责：

- 修改 Goal Contract；
- 创建无上限子任务；
- 直接改变 Task 最终状态；
- 自行批准高风险工具；
- 将记忆写入长期知识库；
- 作为自身关键产物的唯一验收者。

## 3. Agent Definition

```ts
type AgentDefinition = {
  schemaVersion: "1.0";
  id: string;
  name: string;
  role: "PLANNER" | "EXECUTOR" | "JUDGE" | "SPECIALIST";
  objective: string;
  capabilities: CapabilityClaim[];
  instructionTemplateId: string;
  allowedToolIds: string[];
  modelPolicyId: string;
  memoryPolicy: MemoryPolicy;
  outputSchemas: string[];
  defaultLimits: RunLimits;
  version: number;
};
```

Agent Instance 绑定 Corporation：

```ts
type AgentInstance = {
  id: string;
  corporationId: string;
  definitionId: string;
  definitionVersion: number;
  assignedModelRoute?: string;
  effectiveToolIds: string[];
  status: "CREATED" | "READY" | "BUSY" | "SUSPENDED" | "RETIRED";
};
```

## 4. Agent Run

```ts
type AgentRun = {
  id: string;
  corporationId: string;
  taskId: string;
  agentInstanceId: string;
  attempt: number;
  status: AgentRunStatus;
  limits: RunLimits;
  usage: RunUsage;
  checkpoint: RunCheckpoint;
  startedAt?: string;
  endedAt?: string;
  failure?: StructuredError;
};
```

状态：

```text
CREATED → PREPARING → READY → RUNNING
RUNNING → WAITING_TOOL → RUNNING
RUNNING → WAITING_APPROVAL → RUNNING
RUNNING → PRODUCED
任意活跃态 → CANCELLED / TIMED_OUT / FAILED
PRODUCED → SUCCEEDED
```

`PRODUCED` 表示候选 Artifact 已生成；只有持久化成功后才转 `SUCCEEDED`。

## 5. Run Limits

```ts
type RunLimits = {
  maxModelTurns: number;       // 默认 8
  maxToolCalls: number;        // 默认 12
  maxInputTokens: number;
  maxOutputTokens: number;
  maxCostMicros: string;
  timeoutMs: number;
  maxContextBytes: number;
};
```

达到任一硬限制即停止。Agent 不得通过创建子 Agent 绕过限制。

## 6. 执行上下文

```ts
type AgentContext = {
  goalSummary: string;
  taskContract: TaskContract;
  roleInstructions: string;
  policySummary: string;
  inputArtifacts: ArtifactManifest[];
  retrievedMemory: MemoryItem[];
  toolDescriptors: ToolDescriptor[];
  evaluationFeedback?: EvaluationFeedback;
  outputContract: OutputContract[];
  runLimits: RunLimits;
};
```

### 6.1 上下文优先级

1. 不可变系统安全规则；
2. Corporation Policy；
3. Goal Contract；
4. Task Contract；
5. Agent Role Instructions；
6. 已批准的用户补充；
7. Artifact 和外部内容。

外部文件、网页、工具输出中的指令一律标记为不可信数据，不得覆盖更高层级规则。

### 6.2 上下文压缩

- 不传入完整历史对话；
- 通过 Artifact Manifest 先给摘要，按需读取；
- 大文件分段；
- 工具结果优先保存为 Artifact，只在上下文中放摘要和引用；
- 达到 70% 上下文预算时进行确定性裁剪；
- 摘要必须保留来源 ID，不能变成无来源事实。

## 7. Prompt 组装

Prompt 不散落在代码中。使用版本化模板：

```text
System Safety
Corporation Policy
Role Contract
Task Contract
Available Evidence
Available Tools
Evaluation Feedback
Output Schema
```

模板渲染产物记录：

- template ID/version；
- 注入字段哈希；
- 模型路由；
- 输出 Schema 版本。

默认不保存完整敏感 Prompt；可配置保存脱敏版本用于调试。

## 8. 模型循环

伪代码：

```ts
while (!limits.exhausted() && !signal.aborted) {
  const response = await provider.generate(request, signal);
  usage.record(response.usage);

  if (response.kind === "final") {
    const candidate = validateOutput(response.output);
    return commitCandidate(candidate);
  }

  for (const call of response.toolCalls) {
    const decision = await policy.authorize(call, context);
    if (decision === "DENY") return toolDenied(call);
    if (decision === "REQUIRE_APPROVAL") {
      await checkpoint("WAITING_APPROVAL");
      await waitForApproval(call, signal);
    }
    const result = await tools.execute(call, signal);
    appendToolResult(result);
  }
}
```

每轮模型调用前后检查预算和取消信号。

## 9. 结构化输出

Agent 的最终输出必须包含：

```ts
type AgentOutputEnvelope = {
  summary: string;
  artifacts: ArtifactCandidate[];
  claims: EvidenceBackedClaim[];
  unresolvedIssues: Issue[];
  requestedFollowups: FollowupRequest[];
};
```

处理顺序：

1. 解析 Provider 响应；
2. JSON Schema 验证；
3. 若仅格式错误，执行一次 constrained repair；
4. 验证 Artifact 引用和路径；
5. 存入临时区；
6. 创建 Artifact Version；
7. 返回给 Task Engine 进入 `VERIFYING`。

## 10. Tool Calling

Agent 只看到 Tool Descriptor，不直接获得底层执行能力。

```ts
type ToolCallRequest = {
  idempotencyKey: string;
  toolId: string;
  input: unknown;
  purpose: string;
  expectedEffect: string;
};
```

规则：

- 输入经 JSON Schema 校验；
- Tool ID 必须属于 Agent、Task 与 Corporation 权限交集；
- 路径和命令在 Native Core 再次校验；
- 结果大小受限，超出部分写 Artifact；
- Tool 错误以结构化结果返回，不伪装成模型消息；
- 高风险 Tool Call 必须暂停并持久化审批请求。

## 11. 模型路由与回退

Agent Runtime 请求能力，不硬编码模型：

```ts
type ModelRequest = {
  capabilities: ("TOOLS" | "JSON_SCHEMA" | "VISION" | "LONG_CONTEXT")[];
  qualityTier: "FAST" | "BALANCED" | "HIGH";
  maxCostMicros: string;
  dataPolicy: "REMOTE_ALLOWED" | "LOCAL_ONLY";
};
```

回退条件：

- Provider 不可用；
- 模型缺失必要能力；
- 连续两次输出协议失败；
- Scheduler 允许且预算足够。

Judge 与 Executor 默认使用不同的 Agent Instance；是否必须不同底层模型由风险策略决定。

## 12. 记忆

Run 可读取：

- 当前 Task 输入；
- Project/Corporation 中明确相关的 Artifact；
- 经 Memory Service 检索且满足作用域的记录。

Run 不可直接写长期记忆。它只能提交 `MemoryCandidate`，由成功验收后流程审核、去重并落库，防止失败内容污染记忆。

## 13. 检查点与恢复

检查点字段：

```ts
type RunCheckpoint = {
  sequence: number;
  phase: AgentRunStatus;
  lastModelCallId?: string;
  pendingToolCallId?: string;
  committedToolCallIds: string[];
  temporaryArtifactIds: string[];
  usageSnapshot: RunUsage;
};
```

恢复规则：

- 模型调用无外部副作用，可重发但计入新调用；
- 已完成且有幂等记录的 Tool Call 不重放；
- 文件写入通过 commit record 判断；
- 不确定的命令副作用进入人工处理；
- 恢复后创建新事件，但保持同一 Run 或按错误类型创建新 attempt。

## 14. 错误模型

```ts
type StructuredError = {
  code: string;
  category:
    | "PROVIDER"
    | "MODEL_OUTPUT"
    | "TOOL"
    | "POLICY"
    | "BUDGET"
    | "CANCELLED"
    | "INTERNAL";
  retryable: boolean;
  safeMessage: string;
  diagnosticRef?: string;
  details?: Record<string, unknown>;
};
```

错误中的凭据、原始 Header、完整文件内容不得进入 UI 或普通日志。

## 15. Agent 间协作

v0.1 不支持任意 Agent-to-Agent 消息。协作方式：

1. 上游创建 Artifact；
2. Task Engine 将 Artifact Ref 注入下游 Task；
3. 下游按需读取；
4. Judge 创建 Evaluation Artifact；
5. 修订 Run 接收结构化反馈。

若确需提问，创建：

- `ClarificationRequest` 给用户；或
- `FollowupTask` 给指定能力的 Agent。

两者都受 Task Engine 管理。

## 16. 服务接口

```ts
interface AgentRuntime {
  prepare(input: PrepareRunInput): Promise<AgentRun>;
  execute(runId: string, signal: AbortSignal): Promise<RunResult>;
  resume(runId: string, signal: AbortSignal): Promise<RunResult>;
  cancel(runId: string, reason: string): Promise<void>;
  inspect(runId: string): Promise<RunSnapshot>;
}
```

## 17. 事件

- `agent.run.created`
- `agent.run.prepared`
- `agent.run.started`
- `model.call.started`
- `model.call.completed`
- `tool.call.requested`
- `tool.approval.requested`
- `tool.call.completed`
- `artifact.candidate.created`
- `agent.run.succeeded`
- `agent.run.failed`
- `agent.run.cancelled`

## 18. 测试重点

- Prompt 层级与注入隔离；
- Tool Call Schema 和权限交集；
- 模型输出修复只发生一次；
- Token/成本/轮数/时间限制；
- 取消竞态；
- Provider 流式响应中断；
- 检查点恢复和 Tool 幂等；
- 大工具结果 Artifact 化；
- 长期记忆写入隔离；
- Judge/Executor 身份分离。

## 19. v0.1 完成标准

- 一个 Executor 可完成模型→工具→Artifact 的有限循环；
- 所有调用可追踪并计费；
- 工具权限不可由模型输出提升；
- 退出恢复不会重复已确认副作用；
- 结构化输出失败、Provider 限流、审批等待和取消均有稳定路径。

