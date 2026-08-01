# Model Provider 与多模型接入设计

## 1. 目标

以稳定的最小能力接口接入多个模型厂商，同时保留厂商原生特性。系统调度“能力与策略”，而不是在 Task 中硬编码模型名。

## 2. Provider 接口

```ts
interface ModelProvider {
  descriptor(): ProviderDescriptor;
  validateConfig(config: ProviderConfig): Promise<ValidationResult>;
  listModels(config: ProviderConfig): Promise<ModelDescriptor[]>;
  generate(
    request: NormalizedModelRequest,
    signal: AbortSignal
  ): Promise<NormalizedModelResponse>;
  stream?(
    request: NormalizedModelRequest,
    signal: AbortSignal
  ): AsyncIterable<ModelStreamEvent>;
}
```

## 3. 能力描述

```ts
type ModelDescriptor = {
  id: string;
  displayName: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  capabilities: {
    text: boolean;
    vision: boolean;
    toolCalling: boolean;
    jsonSchema: boolean;
    streaming: boolean;
  };
  pricing?: PricingMetadata;
  source: "PROVIDER" | "USER" | "BUILT_IN";
  observedAt: string;
};
```

能力元数据可能过期。连接测试与运行错误可更新健康状态，但不可自动篡改用户价格。

## 4. 适配策略

v0.1：

- 一个 OpenAI 风格适配器；
- 至少一个测试/模拟 Provider；
- 架构允许后续增加 Anthropic、Gemini、Ollama 等原生适配器。

“OpenAI Compatible”仅指某一请求格式子集，不假设：

- Tool Call 语义完全一致；
- usage 字段一致；
- JSON Schema 严格程度一致；
- 错误码一致；
- 模型名称可跨 Provider 使用。

## 5. 标准请求

```ts
type NormalizedModelRequest = {
  modelId: string;
  messages: NormalizedMessage[];
  tools?: ToolDescriptor[];
  responseSchema?: object;
  temperature?: number;
  maxOutputTokens?: number;
  metadata: {
    corporationId: string;
    taskId: string;
    runId: string;
    purpose: string;
  };
};
```

Provider Adapter 负责转换，无法支持的必需能力在调用前报错。

## 6. 用量与费用

```ts
type NormalizedUsage = {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  costMicros?: string;
  costSource: "PROVIDER" | "LOCAL_CALCULATION" | "UNKNOWN";
};
```

如果 Provider 不返回费用，按版本化价格元数据估算并明确标记。

## 7. 凭据

- Key 存 OS 安全存储；
- SQLite 只保存 `secret_ref`；
- 用户在专用密码输入框录入 Key；Renderer 只在本次输入至提交完成期间短暂持有该值，必须默认遮挡，提交后立即清除；
- 已存 Key 永不回传 Renderer；列表、详情、错误、事件和恢复状态只返回 `hasCredential` 等非敏感状态，不返回 `secret_ref` 或 Key；
- Key 只通过专用 typed Provider IPC 单向提交到 Main；不得暴露通用 secure-store IPC、读取接口或原始 RPC；
- 受信 Main 只能通过版本化的 [Secure Store RPC](../04-protocols/Secure-Store-RPC.md) 调用
  Native Core；安全存储不可用时失败关闭，不得写入文件、SQLite 或环境变量；
- 请求日志不记录 Authorization；
- Endpoint 变更后重新连接测试；
- 导出配置不含 Key。

## 8. 错误归一化

Provider 状态分成三个相互独立的维度：

- `ProviderConfigStatus`：`ENABLED` 或 `DISABLED`，表示配置是否允许被调度；
- `ProviderHealthStatus`：`HEALTHY`、`DEGRADED`、`OPEN` 或 `HALF_OPEN`，由 Scheduler 维护运行时健康和熔断；
- `ProviderFailureReason`：以下标准错误类别，描述最近一次失败原因。

错误类别：

- `AUTHENTICATION`
- `PERMISSION`
- `RATE_LIMIT`
- `QUOTA_EXHAUSTED`
- `INVALID_REQUEST`
- `MODEL_NOT_FOUND`
- `CONTENT_FILTER`
- `TIMEOUT`
- `NETWORK`
- `PROVIDER_INTERNAL`
- `CANCELLED`

每类带 `retryable` 和建议退避。认证错误不重试。

## 9. 流式与取消

- 流式事件仅用于 UI 与内部累积；
- 最终响应必须经过完整 Schema 验证；
- 用户取消传播到 HTTP 请求；
- 中断的部分输出不成为正式 Artifact；
- Provider 不支持可靠取消时，忽略迟到结果并结算已知用量。

## 10. 数据策略

调用前根据：

- Artifact 敏感性；
- Provider 数据策略；
- 用户设置；
- Task 权限；
- Local-only 要求；

决定是否允许远程发送。脱敏是单独步骤，不能以“可能已脱敏”默认放行。

## 11. 模型路由与配置

- Agent Definition 引用 `modelPolicyId`；
- Scheduler 在运行时选择 Model Route；
- Run 保存完整路由快照；
- 用户可固定模型；
- 回退仅在允许的候选集内；
- Planner/Executor/Judge 可配置不同策略。

## 12. 测试重点

- 各错误归一化；
- Tool/Schema 能力探测；
- usage 与费用；
- 取消和迟到响应；
- Key 不进入日志/IPC；
- Provider 差异；
- 不满足能力时调用前失败；
- 数据策略阻断。

## 13. v0.1 模块验收断言

- 真实 Provider 与 Mock Provider 可互换；
- Agent/Task 不包含厂商专属字段；
- Tool Calling、JSON 输出、流式、取消可归一化；
- 成本和错误可记录；
- 凭据边界验证通过。
