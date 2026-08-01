# Model Provider 与多模型接入设计

## 1. 目标

以稳定的最小能力接口接入多个模型厂商，同时保留厂商原生特性。系统调度“能力与策略”，而不是在 Task 中硬编码模型名。

## 2. Provider 接口

```ts
interface ModelProvider {
  descriptor(): ProviderDescriptor;
  validateConfig(config: ProviderConfig): void;
  listModels(
    config: ProviderConfig,
    signal: AbortSignal
  ): Promise<ModelDescriptor[]>;
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

M2-TU-03 的连接测试采用以下固定边界：

- OpenAI-compatible Adapter 将用户保存的 Endpoint 视为 API base URL，并请求其相对路径 `models`；
- 请求使用已保存 Key 的 Bearer Authorization，不执行生成请求，因此不产生模型生成用量；
- 远程 Endpoint 只允许 HTTPS；HTTP 只允许 `localhost`、`127.0.0.1` 和 `::1`；禁止 URL 用户名、密码、query、fragment 和 HTTP redirect；
- 连接测试固定 15 秒超时，用户可随时取消；超过 10 秒 UI 显示诊断提示；
- 成功要求 2xx 和可验证的 `data[].id` 模型列表；结果、测试时间、标准失败原因和模型列表持久化，Endpoint 或 Key 变化后重置为未验证；
- 持久化的连接测试状态不是 Scheduler 维护的 `ProviderHealthStatus`，不得据此推断熔断或运行时健康；
- Deterministic Mock Provider 是实现同一接口的测试适配器，不进入生产 SQLite 或正式 Settings UI。

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

- Key 由 AI Corporation Desktop 的应用自管 Key Vault 存储和管理，不把 OS Keychain/Credential Manager 或 Native Core 当作权威存储；
- Key Vault 使用应用自行生成的 32-byte 本地加密密钥，以 AES-256-GCM v1 将完整 Key 认证加密后存入 SQLite；Provider 表只保存 `key_vault_entry_id`，日志和错误不得保存明文；
- 本地加密密钥以应用自管文件保存在应用数据目录，不使用 OS Keychain/Credential Manager 或 Native Core；SQLite 与该文件同时泄漏时 Key 可被解密，这是 v0.1 明确接受的限制；
- Renderer 可以录入、替换和删除 Key；回显默认遮挡，只有用户主动选择查看时才从 Key Vault 读取并显示明文；
- 录入、读取、替换和删除使用专用 typed Provider IPC；不得暴露通用数据库、文件或原始 RPC；
- 明文显示状态不得跨页面恢复、Renderer 重载或应用重启自动保留；
- 应用重启后不需要用户解锁；当前会话中用户主动点击“显示”即可读取明文；
- 数据库或本地加密密钥文件缺失、损坏、权限拒绝、版本未知或认证失败时固定失败，不允许明文降级；用户可删除不可恢复记录并重新录入 Key；
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

连接测试的固定映射为：HTTP 401 → `AUTHENTICATION`，403 → `PERMISSION`，429 且响应错误码为 `insufficient_quota` → `QUOTA_EXHAUSTED`，其他 429 → `RATE_LIMIT`，其他 4xx → `INVALID_REQUEST`，5xx → `PROVIDER_INTERNAL`，15 秒截止 → `TIMEOUT`，传输失败 → `NETWORK`，用户取消 → `CANCELLED`。成功响应不是合法模型列表时按不可重试的 `PROVIDER_INTERNAL` 处理。错误正文只在 Adapter 内用于受限解析，不进入 Renderer、日志或持久化结果。

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
