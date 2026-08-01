# M2-TU-03 Provider 连接测试垂直切片

| 属性 | 值 |
|---|---|
| 任务单元 ID | M2-TU-03 |
| 状态 | 进行中 |
| 所属 Milestone | Milestone 2：Provider 与 Goal/Plan |
| 主要结果 | 用户可在 Settings 对已保存的 OpenAI-compatible Provider 执行可取消、可恢复结果的非生成连接测试，并获得不泄密的标准错误与模型列表 |
| 基线提交 | `01c8567fb90b8d863f2385d822981f0755df8f22` |

## 1. 需求与设计引用

- 用户范围决策：选择方案 A，仅交付 OpenAI-compatible/Mock Adapter、固定错误归一化和 Settings Test connection；真实模型生成与 usage 留给 M2-TU-04；
- 用户细节决策：`1A + 2A + 3A + 4A`，即 `GET <base>/models`、测试专用 Mock Adapter、远程 HTTPS/loopback HTTP 且禁止 redirect、持久化结果与模型列表；超时补充决策 A，即固定 15 秒、始终可取消、10 秒后显示诊断；
- [MVP Plan：Milestone 2](../MVP-Plan.md)；
- [PRD 首次设置、FR-002、可靠性与安全隐私](../../01-product/PRD.md)；
- [Provider 连接测试协议](../../04-protocols/Provider-Connection-Test-Protocol.md)与[Provider Key Vault 协议](../../04-protocols/Provider-Key-Vault-Protocol.md)；
- [Model Provider](../../05-infrastructure/Model-Provider.md)、[SQLite Schema](../../05-infrastructure/SQLite-Schema.md)与[Data Model](../../05-infrastructure/Data-Model.md)；
- [Technical Design](../../02-architecture/Technical-Design.md)与[Threat Model T-04、T-07、T-13](../Threat-Model.md)；
- [Testing Strategy](../Testing-Strategy.md)；
- [Core User Flow 01](../../07-ui/Core-User-Flows.md)、[Wireframes UI-11](../../07-ui/Wireframes.md)、[Screen State Matrix](../../07-ui/Screen-State-Matrix.md)与[UI Acceptance UI-AC-01](../../07-ui/UI-Acceptance.md)。

本合同只承诺连接测试垂直切片。它证明已保存配置能够鉴权并列出模型，不证明模型生成、Tool/Schema/stream 能力、usage、费用、运行时健康、熔断、回退、完整 Onboarding 或 Goal/Plan 已完成。

## 2. 前置条件

- M2-TU-02 已完成，`provider`、应用自管 Key Vault、typed Provider IPC、Settings / Providers、真实 Electron 窗口 E2E 和双平台最终包门禁可用；
- `main` 与 `origin/main` 的合同基线为 `01c8567fb90b8d863f2385d822981f0755df8f22`，开始合同时工作区无其他改动；
- `0001`–`0006` migration 不可修改；本任务独占 `0007_provider_connection_test.sql`；
- 自动化只使用带 `M2-TU-03` 标记的随机 user data directory、动态 loopback HTTP Server、随机假 Key 和合成模型响应；
- 不需要真实 Provider、真实 API Key、外网访问或付费模型调用；Mock 通过注入实现，不改变生产 Provider 类型；
- Windows 本地验证，macOS Apple Silicon 由同一验收提交的 CI job 提供证据。

## 3. 包含范围

- `ModelProvider` 最小接口、OpenAI-compatible Adapter 和 Deterministic Mock Provider；本任务实现 `descriptor/validateConfig/listModels` 以及连接测试需要的取消和错误归一化，生成方法只保留后续可扩展边界，不提供生产生成能力；
- Endpoint 规范化与安全校验：API base URL + `models`、远程 HTTPS、loopback HTTP、禁止 username/password/query/fragment/redirect；
- Bearer Key 只在 Main/Application Service 从 Key Vault 解密后进入单次请求；15 秒截止、用户取消、10 秒 UI 诊断、1 MiB 响应和 1,000 模型上限；
- HTTP/传输/取消/响应 Schema 的固定 `ProviderFailureReason`、retryable 与建议退避映射；原始正文不跨 Adapter；
- `0007_provider_connection_test.sql`、Repository 投影与版本保护；持久化 `VERIFIED/FAILED`、标准失败、测试时间和模型列表；Endpoint 或 Key 变化重置，名称/启停变化保留，取消与迟到结果不覆盖；
- `provider.testConnection/cancelConnectionTest` 严格协议、Main IPC、Preload 与 `DesktopApi`；既有 Provider 方法兼容；
- Settings / Providers 的 Unverified、Testing、Verified、Failed、Cancelled、超时、诊断和模型列表状态；禁止重复测试并提供准确修复动作；
- Adapter、协议、migration、Repository、Service、IPC、组件、可访问性、开发态真实窗口、最终包、泄密、故障、跨平台和回归测试；
- 同步 Provider 网络安全唯一权威文档和测试攻击集。

本任务完成后，Milestone 2 的“OpenAI 风格 Provider + Mock Provider”中连接/列模能力和“连接测试、错误归一化”部分关闭；生成、usage、Goal/Plan 和 Milestone 级验收仍未完成。

## 4. 非范围

- `/chat/completions`、Responses API、真实模型生成、stream、Tool Call、JSON Schema、正式取消结算或迟到生成响应；
- token usage、费用、价格元数据、预算 reservation、`model_call` 或调用事件；
- Scheduler、Provider runtime health、熔断、`HEALTHY/DEGRADED/OPEN/HALF_OPEN`、自动重试或回退；
- 将 Mock Provider 写入 SQLite、暴露到正式 Settings 或交付用户可选择的 Mock 类型；
- Planner/Executor/Judge 默认路由、模型策略编辑、完整 Onboarding、Dashboard 执行门禁；
- 用户可配置连接超时；正式模型调用超时由 M2-TU-04 定义；
- HTTP LAN 地址、redirect、代理配置、客户端证书、OAuth、组织 Header、Azure/OpenAI 厂商专属扩展；
- Goal Engine、Planner、JSON 修复、DAG、Plan Review 和 Corporation 模型执行。

## 5. 依赖与接口

- 唯一跨进程合同为 `Provider-Connection-Test-Protocol.md`、`Provider-Key-Vault-Protocol.md` 与 `packages/protocols` Schema；不得复制 DTO；
- `provider.testConnection` 输入 `requestId/providerId/expectedVersion`，只测试 SQLite 中该版本保存的 Endpoint 与 Key，不接受 Renderer 传入临时 Key、Authorization、任意 URL 或原始 Header；
- `provider.cancelConnectionTest` 只接受 requestId；取消幂等且只影响对应活跃请求；Provider 版本、窗口和 request 所有权必须校验；
- Provider Endpoint 保存变化、Key 替换或删除使旧连接结果在同一事务中失效；仅名称/启停变化保留并迁移投影版本；连接测试落库前再次比较版本；
- `provider.list` 的可选连接测试投影保持旧 command receipt 和同 major DTO 兼容；普通 DTO 不携带 Key、密文或原始网络正文；
- Adapter 接收受限 config、已解密 Key 与 `AbortSignal`；不依赖 Electron、SQLite 或 Renderer；Mock 与真实 Adapter 使用同一公开结果；
- 连接测试不是数据库事务内网络调用：先读取版本化快照，事务外请求，再以条件写入提交投影；
- 既有 Workspace、Corporation、Goal、pause/resume、Key Vault、health 和打包接口保持兼容。

## 6. 交付物与所有权

- 专属修改区：`0007_provider_connection_test.sql`、Provider connection protocol/Adapter/repository/service/IPC、M2-TU-03 Mock HTTP fixture、Settings connection UI 和专属 E2E/secret scan；
- 共享冲突区：protocol/storage exports、migration tests、Provider repository/service、Main/Preload/DesktopApi、Renderer Provider Settings/styles、Playwright/打包脚本、CI、权威 Provider/UI/安全文档和 `PROJECT_STATUS.md`；
- `0001`–`0006`、M1 协议/状态机和已完成合同不可修改；M2-TU-02 合同和证据只读；
- 共享冲突区由本任务串行集成，相邻 Provider、migration、Renderer Settings 或网络安全任务不得并行修改。

## 7. 验收合同

- [ ] 协议：test/cancel v1 Schema 严格拒绝额外字段、错误版本、非法 UUID/版本和未授权调用；既有 Provider DTO/command receipt 兼容，公开错误不含输入或原始正文；
- [ ] Endpoint 安全：远程 HTTPS 与三种 loopback HTTP 允许；其他 scheme、远程 HTTP、URL 凭据/query/fragment、混淆 loopback 和 redirect 全部在发送 Authorization 前拒绝；
- [ ] Adapter 成功：OpenAI-compatible 与 Deterministic Mock 对合法 2xx `data[].id` 返回去重、受限、稳定模型 DTO；请求准确命中 `<base>/models` 且不执行生成调用；
- [ ] 错误归一化：401、403、两类 429、其他 4xx、5xx、非法 2xx、DNS/TLS/socket、15 秒截止和用户取消逐类得到固定 reason/retryable/backoff；原始正文不外泄；
- [ ] 资源边界：redirect 不跟随，响应超过 1 MiB、模型超过 1,000、ID 空/超 512 bytes 或 JSON 结构错误均安全失败，连接、timer、Abort listener 和本地 Server 无残留；
- [ ] 迁移：空库和 `0001`–`0006` 升级到 `0007` 成功；表、STRICT/CHECK/FK/JSON 约束、级联和 foreign key check 与权威 Schema 一致，中断可重试；
- [ ] 持久化生命周期：Unverified → Verified/Failed 可在 SQLite 重开、Renderer reload 和应用重启恢复；模型/时间/失败字段准确；取消不覆盖，配置/Key 变化重置；
- [ ] 并发与迟到：相同 requestId 不重复发起；两个 Provider 隔离；取消只影响目标请求；测试中 Provider 版本变化时迟到结果返回冲突且不覆盖新配置或旧有效结果；
- [ ] Key 边界：测试只使用已保存 Vault Key；缺 Key/Vault 故障固定失败且不发网络；Authorization、Key、密文、原始正文不进入协议普通结果、SQLite/WAL/SHM、日志、错误、HTML、截图、trace 或诊断；
- [ ] IPC 安全：未注册 channel、非法 payload、伪造 URL/Header/Key、错误窗口、重复/未知取消和底层异常固定拒绝；Renderer 无通用 fetch、数据库、文件、Vault 或 Native RPC 能力；
- [ ] 用户界面：用户可从 Settings 对已保存 Provider 测试、取消、重试并查看模型；pending 防双击，10 秒后诊断，15 秒超时；成功/失败/取消不被错误标成运行时健康；
- [ ] UI 状态与恢复：Unverified、Testing、Verified、Failed、Cancelled、Conflict、Missing Key、Vault unavailable、Network、Timeout、Authentication、Permission、Rate/Quota 和 Invalid response 显示发生事项、影响与可执行修复；重启展示持久化事实；
- [ ] UI 适配：键盘/焦点/live region/label/错误关联通过；1024 × 700、1440 × 900、200% 缩放下测试、取消、诊断、错误和模型列表可完成且窗口控制区不遮挡；
- [ ] 开发态与最终包：Windows/macOS 同一提交的真实窗口分别完成成功、认证失败、取消、超时、重启恢复和配置变化重置；功能断言、Server/端口/进程与 fixture 清理独立通过；
- [ ] Mock 与隔离：Mock Adapter 不出现在生产 Provider Schema/SQLite/Settings/最终包用户入口；每例动态 loopback 端口、自建数据且不访问外网、真实应用数据或其他任务残留；
- [ ] 回归与治理：`pnpm check`、`pnpm check:status`、`pnpm check:task-units`、`git diff --check`、Rust fmt/clippy、既有 Workspace/Corporation/Goal/pause/restart/Key Vault E2E 全部通过；P0/P1 为 0，未执行必检项为 0。

## 8. 隔离与干扰控制

- 每例使用 `M2-TU-03-<random>` user data directory、SQLite、Provider/request ID、随机无价值 Key、动态 loopback 端口和自有 AbortController；
- Mock HTTP Server 只监听 loopback、记录脱敏请求元数据并验证 Authorization 的 Key 哈希，不打印明文；测试结束等待 socket 和 Server 完全关闭；
- fixture 自行从空库或声明的 `0006` 数据建立前置条件，不读取本机真实应用数据库、Key 文件、网络代理、DNS 配置、外网或其他任务 fixture；
- 时间与 UUID 注入；15 秒截止用可控 clock/timer 单测，真实窗口用确定性短夹具模式验证可观察超时而不改变生产常量；
- SQLite/WAL/SHM、日志、stdout/stderr、HTML、截图、trace 和最终 artifacts 分别扫描；只报告随机 Key 的 SHA-256 标识；
- Renderer reload、应用进程重启、SQLite 重开、开发态/最终包和平台为独立维度；功能结果与清理结果分别报告；
- 清理只删除已解析并验证位于任务临时根目录内的资源；失败独立报告，不隐藏功能结论。

## 9. 证据计划

- `pnpm check:status`、`pnpm check:task-units`、`pnpm check`、`git diff --check`、Rust fmt/clippy；
- Protocol strict Schema、Endpoint/URL 攻击集、Adapter/Mock 合同、HTTP/error/response limit/取消/timer 单测；
- migration 空库/升级/约束测试，Repository 版本化投影、失效、重开、并发和故障测试；
- Main/Preload typed IPC、Renderer 组件/状态/键盘/axe 测试；
- 开发态与最终包 Playwright Electron 真实窗口旅程，覆盖成功、失败、取消、超时、重启恢复、配置变化与三种尺寸/缩放；
- SQLite/WAL/SHM、日志、错误、Renderer bundle、HTML、截图、trace、stdout/stderr 和最终 artifact 定向 Secret/原始正文扫描；
- 同一验收提交的 GitHub Actions run、Windows/macOS job、最终包 artifact ID、哈希和步骤级结果。

## 10. 完成规则

只有 16 项验收断言按错误类别 × Provider 实现 × 配置版本/取消/重启生命周期 × 开发态/最终包 × Windows/macOS 展开后全部取得当前提交直接证据，动态 Server、端口、timer、进程和 fixture 清理通过，P0/P1 为 0、未执行必检项为 0，方可标记完成。本任务只关闭 Provider 连接/列模垂直切片，不代表真实生成、usage、完整 Onboarding、Goal/Plan、Milestone 2 或发布完成。
