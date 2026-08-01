# Provider 连接测试协议

| 属性 | 内容 |
|---|---|
| 协议版本 | 1.0 |
| 适用任务 | M2-TU-03 |
| 权威范围 | OpenAI-compatible/Mock Adapter、连接测试 IPC、结果持久化与错误归一化 |

## 1. 边界

Renderer 只能通过 typed Provider IPC 请求测试或取消。Electron Main/Application Service 从应用自管 Key Vault 解密已保存 Key，调用 Provider Adapter，并将标准结果写入 SQLite。Renderer 不获得 Authorization、原始响应、原始错误正文或通用网络能力。

生产 Provider 类型仍为 `OPENAI_COMPATIBLE`。Deterministic Mock Provider 只作为同一 `ModelProvider` 接口的测试实现，不写入生产数据库，不显示在正式 Settings UI。

## 2. Endpoint 规则

- 保存值表示 API base URL；连接测试在其尾部安全追加相对路径 `models`；
- 只接受 `http:` 或 `https:`；远程主机必须使用 HTTPS；HTTP 只允许大小写归一化后的 `localhost`、IPv4 `127.0.0.1` 或 IPv6 `::1`；
- 禁止 URL username、password、query 和 fragment；
- 禁止 redirect；Authorization 只发送到解析后的单一目标；
- 固定 15 秒截止，用户可随时取消；
- 响应体最多 1 MiB，最多接受 1,000 个唯一、非空、UTF-8 长度不超过 512 bytes 的模型 ID；超限或结构非法按 `PROVIDER_INTERNAL` 失败。

## 3. IPC

固定 channel：

- `provider:test-connection`
- `provider:cancel-connection-test`

测试请求字段：

- `schemaVersion: 1`
- `requestId: UUID v7`
- `providerId: UUID v7`
- `expectedVersion: positive integer`

取消请求字段：

- `schemaVersion: 1`
- `requestId: UUID v7`

同一个 `requestId` 只能代表一次测试。重复活跃 ID、未知 ID、错误 Provider 版本、缺少 Key、非法 Endpoint、非法 payload 和未授权窗口固定返回脱敏错误。取消为幂等用户意图；取消成功或迟到网络响应均不得覆盖测试前的持久化结果。

## 4. 结果

公开连接状态：

- `UNVERIFIED`：没有与 Provider 当前版本匹配的测试记录；
- `VERIFIED`：最近测试成功；
- `FAILED`：最近测试失败；
- `TESTING` 与 `CANCELLED` 只属于当前 Renderer 交互，不持久化。

公开结果包含 `providerId`、`providerVersion`、`status`、`testedAt`、标准 `failure`（失败时）和受限 `models`。模型项只包含 `id`、`displayName`、`source: PROVIDER` 与 `observedAt`；未知能力和价格不得猜测。

Provider 列表公开 DTO 携带与当前版本匹配的最近连接测试投影。Endpoint 变化、替换 Key 或删除 Key 时，必须在同一事务中使旧记录失效；仅名称或启停状态变化时保留结果并绑定新版本。测试完成写入时再次比较 Provider 版本；版本已变化则返回 `CONFLICT`，不得写入迟到结果。

## 5. 错误归一化

标准失败结构：

- `reason`: `AUTHENTICATION | PERMISSION | RATE_LIMIT | QUOTA_EXHAUSTED | INVALID_REQUEST | MODEL_NOT_FOUND | CONTENT_FILTER | TIMEOUT | NETWORK | PROVIDER_INTERNAL | CANCELLED`
- `retryable: boolean`
- `suggestedBackoffMs?: non-negative integer`

连接测试固定映射：

| 输入 | 标准原因 | retryable |
|---|---|---|
| HTTP 401 | AUTHENTICATION | false |
| HTTP 403 | PERMISSION | false |
| HTTP 429 + `insufficient_quota` | QUOTA_EXHAUSTED | false |
| 其他 HTTP 429 | RATE_LIMIT | true |
| 其他 HTTP 4xx | INVALID_REQUEST | false |
| HTTP 5xx | PROVIDER_INTERNAL | true |
| 15 秒截止 | TIMEOUT | true |
| 用户取消 | CANCELLED | false |
| DNS/TLS/socket 等传输失败 | NETWORK | true |
| 2xx 非法/超限模型响应 | PROVIDER_INTERNAL | false |

`Retry-After` 只接受有效的非负秒数并转换为毫秒；无有效值时可使用固定、受限的建议退避。原始错误 type/code 只允许在 Adapter 内通过严格 Schema 识别 `insufficient_quota`，不得持久化或返回 Renderer。

## 6. 持久化

`0007_provider_connection_test.sql` 建立每 Provider 至多一行的测试投影，保存 Provider 版本、`VERIFIED/FAILED`、标准失败原因、retryable、建议退避、受限模型 JSON 和 UTC 测试时间。

禁止保存：Key、Authorization、Endpoint 副本、原始请求、原始响应、原始错误正文或调用堆栈。连接测试投影与 Scheduler 的 `ProviderHealthStatus`/熔断状态相互独立。

## 7. 兼容与验收

- v1 Schema 严格拒绝额外字段与未知枚举；
- 既有 `provider.list/save/revealKey/deleteKey` 保持同 major 兼容；列表新增连接测试字段必须作为协议 v1 中的明确版本化变更同步更新所有消费者；
- Mock Adapter 与 OpenAI-compatible Adapter 运行同一成功、失败、取消和超限合同测试；
- 自动化只使用 loopback 动态端口、随机假 Key 和合成响应，不访问真实 Provider 或产生费用。
