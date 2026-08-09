# Provider 非流式生成协议

| 属性     | 内容                                                                           |
| -------- | ------------------------------------------------------------------------------ |
| 协议版本 | 1.1                                                                            |
| 适用任务 | M2-TU-04、M2-TU-05                                                             |
| 权威范围 | dialect-neutral 生成 DTO、Chat Completions Adapter、测试生成 IPC、usage 与取消 |

## 1. 当前交付与前向兼容门禁

- 当前只交付 OpenAI-compatible Chat Completions 的非流式生成；网络请求为 `POST <base>/chat/completions`；
- 通用协议、Application Service、Repository 和 Renderer DTO 禁止出现 `messages`、`choices`、`delta`、`chat.completion`、`finish_reason` 等 Chat Completions 专属结构或命名；
- Provider Adapter 必须声明 `dialect`，生产调用不得假设所有 OpenAI-compatible Provider 只有一个 API dialect；
- 未来 Responses 支持必须增加并保留独立的 Responses Adapter，不得替换、重定义或静默迁移 Chat Completions Adapter；
- streaming 使用独立的规范化事件协议和任务合同；不得把 Chat streaming 的 chunk/delta 结构作为未来 Responses streaming 的协议基础；
- 本协议的非流式规范化输入、输出与 usage 可以由未来 dialect Adapter 复用，但不承诺两种远端 API 的原始字段兼容。

## 2. 通用生成 DTO

规范化请求只包含：

- `schemaVersion: 1`；
- `requestId/providerId: UUID v7`；
- `expectedVersion: positive integer`；
- `input`: 1–32 个输入项；每项为 `{ actor, parts }`，`actor` 为 `SYSTEM | USER | ASSISTANT`，`parts` 当前只允许 `{ kind: TEXT, text }`；
- `maxOutputTokens`: 1–65,536；调用方必须按任务 Schema、模型能力、预算和风险选择实际值，测试生成仍固定为 32；
- `outputFormat?`: `TEXT | JSON_OBJECT`；省略等价于 `TEXT`。这是 dialect-neutral 输出约束，不是 Chat DTO；
- `temperature?`: 0–2。

模型 ID、Endpoint、Key、dialect 与生成超时只从已保存 Provider 当前版本读取，Renderer 不得在生成请求中覆盖。公开结果只包含：

- `requestId/providerId/providerVersion/modelId`；
- `outputParts`: 1–32 个 `{ kind: TEXT, text }`；
- `stopReason`: `COMPLETED | OUTPUT_LIMIT | CONTENT_FILTER | UNKNOWN`；
- `usage` 与 `completedAt`。

通用 DTO 不携带远端 request、response、header、原始错误、Chat choice/message 或 Provider 私有字段。输入 UTF-8 总量最多 64 KiB，输出正文最多 1 MiB。

## 3. usage

`NormalizedUsage` 字段：

- `inputTokens?`、`outputTokens?`、`cachedInputTokens?`、`reasoningTokens?`：非负安全整数；
- `costMicros?`: 非负 decimal string；
- `costSource`: `PROVIDER | LOCAL_CALCULATION | UNKNOWN`。

当前 Chat Adapter 只接受远端明确返回且通过严格验证的 token 字段。没有可靠 Provider 费用时不得猜测价格，`costMicros` 省略且 `costSource` 为 `UNKNOWN`。未知 usage 字段忽略，非法已知字段使成功响应按 `PROVIDER_INTERNAL` 失败。

## 4. Chat Completions Adapter

Adapter descriptor 固定声明 `dialect: CHAT_COMPLETIONS`。它把规范化输入映射为远端 `messages`，把 `maxOutputTokens` 映射为 `max_tokens`，把 `outputFormat: JSON_OBJECT` 映射为 `response_format: { type: json_object }`，并固定 `stream: false`；解析仅接受一个合法文本 choice，远端 Chat DTO 不跨出 Adapter。未来 Responses Adapter 必须自行映射同一个通用约束，不能复用或暴露 Chat 请求结构。

沿用 Provider Endpoint 安全策略：远程 HTTPS、精确 loopback HTTP、禁止 URL 凭据/query/fragment 和 redirect；Authorization 只发送到保存 Endpoint 下解析出的 `chat/completions`。响应体最多 1 MiB。生成超时来自保存配置，默认 60 秒、允许 5–300 秒；用户始终可取消。

错误映射沿用 Provider 标准失败原因，并补充：404 或远端明确模型不存在 → `MODEL_NOT_FOUND`；内容过滤 → `CONTENT_FILTER`；其他非法成功结构 → `PROVIDER_INTERNAL`。Adapter 可附带不对 Renderer 公开的安全诊断枚举，用于区分 `HTTP_SERVER_ERROR | RESPONSE_TOO_LARGE | INVALID_UTF8 | INVALID_JSON | INVALID_RESPONSE_SHAPE | EMPTY_OUTPUT | OUTPUT_LIMIT_WITHOUT_OUTPUT | INVALID_USAGE`。诊断不得包含响应正文、隐藏推理、远端 request ID、Header、Key 或任意自由文本；原始错误正文仍只在 Adapter 内受限解析，不进入普通结果、持久化、Renderer、日志或诊断。

## 5. Provider 配置与模型选择

- Provider 配置增加 `apiDialect: CHAT_COMPLETIONS`、`selectedModelId?` 与 `generationTimeoutMs`；
- 用户只能从当前 `VERIFIED` 连接测试返回的模型列表中精确选择模型，不提供自由输入且不自动回退；
- Endpoint 或 Key 改变时，同一事务清除连接测试、模型选择与生成测试投影；名称或启停变化迁移连接与生成投影；超时变化保留连接和模型选择但清除生成投影；模型变化保留连接但清除生成投影；
- 选择模型时再次校验 Provider 版本、连接状态和模型列表；生成开始与落库时均校验 Provider 版本；
- disabled、未验证、无 Key、无模型选择或模型不在当前列表时，必须在发网前固定失败。

## 6. 测试生成 IPC 与生命周期

固定 channel：

- `provider:test-generation`；
- `provider:cancel-generation-test`。

测试生成使用协议第 2 节请求。Settings 只发送应用内固定、无用户资料的低风险输入，并将 `maxOutputTokens` 固定为 32；普通生产生成服务仍接受规范化输入供后续 Goal Engine 使用。相同 requestId 不得重复发起，取消只影响目标请求；取消或 Provider 版本变化后的迟到响应不得覆盖旧有效投影。

Settings 显示 `IDLE | GENERATING | SUCCEEDED | FAILED | CANCELLED` 交互状态。只持久化最近一次已完成的 `SUCCEEDED/FAILED` 投影；成功保存 model、stopReason、usage、完成时间和受限输出预览，失败只保存标准错误与时间。取消不持久化且保留此前结果。

## 7. 安全与兼容

- Key 仅由 Main 从应用自管 Key Vault 解密后传入单次 Adapter 调用；Renderer 不获得 Key 或通用 fetch；
- Prompt、输出、Key、Authorization、原始网络正文和远端请求 ID 不进入日志、错误、trace 或 CI artifact；测试生成投影只保存固定输入对应的受限输出预览；
- 既有 Provider v1 DTO 与连接测试行为保持同 major 兼容；配置新增字段有明确默认值；
- `outputFormat` 的默认值保持文本行为；65,536 是通用协议上限，不表示所有 Provider 都支持该额度，Adapter/Provider 明确拒绝时仍按标准失败返回，不得静默降低或自动回退；
- Mock Adapter 实现同一非流式通用生成接口，但不成为生产 Provider 类型或 Settings 选项；
- 真实 Provider smoke 只在本机通过正式 UI 和应用自管 Key Vault执行，不进入普通 CI，不读取真实工作区，不记录凭据或完整原始响应。
