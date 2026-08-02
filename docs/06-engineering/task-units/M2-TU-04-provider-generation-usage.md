# M2-TU-04 Provider 非流式生成与 usage 垂直切片

| 属性 | 值 |
|---|---|
| 任务单元 ID | M2-TU-04 |
| 状态 | 进行中 |
| 所属 Milestone | Milestone 2：Provider 与 Goal/Plan |
| 主要结果 | 用户可为已验证 Provider 精确选择模型并从 Settings 完成可取消、可恢复证据的非流式真实生成测试，系统以 dialect-neutral DTO 返回并持久化标准 usage |
| 基线提交 | `bcd5b0f9122d6092178d1049d8cfa0515a1232e0` |

## 1. 需求与设计引用

- 用户决策：`1A + 2A + 3A + 4A + 5A + 6A`；当前交付 Chat Completions 非流式生成、精确列表模型、持久化 usage、可配置 5–300 秒超时和本机真实 Provider smoke；
- 用户 Responses 前向兼容硬门禁：通用协议无 Chat 专属 DTO；Adapter 不假设单一 dialect；未来 Responses Adapter 与 Chat Adapter并存；streaming 独立建协议/任务且不以 Chat streaming 为基础；
- 用户提供本机真实 Provider 资源，仅保存于 AI Corporation Desktop 应用自管 Key Vault，不进入 Git、源码、fixture、CI、日志或截图；
- [MVP Plan：Milestone 2](../MVP-Plan.md)、[PRD FR-002/FR-007](../../01-product/PRD.md)；
- [Provider 非流式生成协议](../../04-protocols/Provider-Generation-Protocol.md)、[Provider 连接测试协议](../../04-protocols/Provider-Connection-Test-Protocol.md)；
- [Model Provider](../../05-infrastructure/Model-Provider.md)、[Data Model](../../05-infrastructure/Data-Model.md)、[SQLite Schema](../../05-infrastructure/SQLite-Schema.md)；
- [Technical Design](../../02-architecture/Technical-Design.md)、[Threat Model T-04/T-07/T-09/T-13](../Threat-Model.md)、[Testing Strategy](../Testing-Strategy.md)；
- [Core User Flow 01](../../07-ui/Core-User-Flows.md)、[Wireframes UI-11](../../07-ui/Wireframes.md)、[Screen State Matrix](../../07-ui/Screen-State-Matrix.md)、[UI Acceptance UI-AC-01](../../07-ui/UI-Acceptance.md)。

## 2. 前置条件

- M2-TU-02、M2-TU-03 已完成；Provider、应用自管 Key Vault、模型列表、错误归一化和真实窗口/最终包门禁可用；
- `main` 与 `origin/main` 基线为 `bcd5b0f9122d6092178d1049d8cfa0515a1232e0`，合同建立时工作区无其他修改；
- `0001`–`0007` 不可修改；本任务独占 `0008_provider_generation.sql`；
- 自动测试只使用随机假 Key、动态 loopback Mock HTTP 和 `M2-TU-04-<random>` userData；真实资源仅用于合同自动矩阵通过后的本机 live smoke；
- 本机 live smoke 使用正式 Renderer 输入与正式应用 userData；不得通过数据库脚本、环境变量或旁路明文配置注入 Key。

## 3. 包含范围

- dialect-neutral `NormalizedGenerationRequest/Response/Usage` Schema 与 test/cancel typed IPC；
- `ModelProvider.generate`、Chat Completions 非流式 Adapter 与 Deterministic Mock；
- `apiDialect: CHAT_COMPLETIONS` 显式 descriptor/config；为未来并存 Responses Adapter 保留选择边界；
- Provider 精确模型选择、默认 60 秒且 5–300 秒可配置的生成超时；
- `0008_provider_generation.sql`：Provider 生成配置和最近生成测试投影，保存标准状态、模型、stopReason、usage、受限预览与时间；
- Main/Application Service 解密已保存 Key，事务外调用，取消、超时、并发、版本变化与迟到结果保护；
- Settings 模型下拉、生成超时、固定低风险 Test generation、取消、结果预览和 usage；
- Mock/loopback 自动矩阵、Windows 本机真实 Provider smoke、Windows/macOS 开发态及最终包真实窗口回归。

本任务关闭 Milestone 2 中 OpenAI 风格 Provider 的非流式生成与标准 usage 基础，但不关闭 Goal Engine、Planner、结构化输出修复、stream、Tool Call、费用账本或 Milestone 2。

## 4. 非范围

- Responses API/Adapter、Chat streaming、Responses streaming 或任何流式事件协议；
- Goal Contract/Plan/Task Graph 生成、JSON Schema、非法 JSON 修复、Tool Call；
- 用户自由输入模型、自动模型回退、模型路由、Planner/Executor/Judge 策略；
- 价格元数据录入、费用估算、budget reservation/ledger、运行时健康/熔断/重试调度；
- 保存任意用户 Prompt、完整 Provider 原始请求/响应或真实项目数据；
- 将真实 Key 放入 `.env`、CI secret、测试 fixture、命令行、Git 或自动截图；
- macOS 上调用用户提供的真实凭据；macOS 使用同协议 Mock/loopback 与最终包验收。

## 5. 依赖与接口

- 唯一跨进程合同为 Provider Generation/Connection/Key Vault Protocol 与 `packages/protocols` Schema；禁止复制 DTO；
- 通用生成 DTO 使用 `input items/output parts/stopReason/usage`，不得出现 Chat 原始 DTO；Chat 映射封装在 `OpenAiChatCompletionsAdapter` 内；
- Provider 配置保存必须版本化、幂等；Endpoint/Key 改变清除连接/模型/生成投影，名称/启停迁移投影，模型/超时变化只清除生成投影；
- test generation 只能使用当前版本已保存 Endpoint/Key/model/dialect/timeout；Renderer 不能传 Key、任意 URL、Header、dialect 或 model override；
- 网络调用不在数据库事务内；开始前快照版本，结束时条件写入；取消、冲突或迟到不覆盖；
- 未来 Responses Adapter 添加新 dialect 分支并与 Chat Adapter 共存；streaming 必须由新任务定义独立规范化事件协议。

## 6. 交付物与所有权

- 专属修改区：Provider Generation Protocol、`0008_provider_generation.sql`、generation Schema/Adapter/fixture/tests、M2-TU-04 E2E；
- 共享冲突区：Provider/Key Vault DTO、repository/service/IPC、Main/Preload/DesktopApi、Settings/styles、Model Provider/Data/SQLite/Threat/UI 文档、打包脚本、`PROJECT_STATUS.md`；
- `0001`–`0007`、已完成任务合同、Corporation/Goal 状态机不得修改；
- 本任务串行拥有共享 Provider 与 Settings 边界，相邻 Provider/迁移/UI 任务不得并行修改。

## 7. 验收合同

- [ ] 前向兼容：通用协议、Service、Repository、Renderer 和持久化无 Chat 专属 DTO/字段；Chat Adapter 显式声明 dialect；静态/合同测试证明未来 Responses 可新增并存分支且 streaming 不复用本协议；
- [ ] 协议：generate/cancel v1 Schema 严格拒绝额外字段、错误版本、非法 UUID/版本、空/超限输入、非法 token/temperature/usage/输出与未授权调用；公开错误不含输入或原始正文；
- [ ] Chat 请求：准确 `POST <base>/chat/completions`，Bearer 使用已保存 Key，映射 input/max tokens/temperature，固定 `stream:false`，禁止 redirect 且不发送额外敏感 header；
- [ ] Chat 响应：合法单一文本 choice 映射为通用 outputParts/stopReason；Chat 原始结构不跨 Adapter；空、多 choice、非文本、超 1 MiB、非法 UTF-8/JSON/usage 安全失败；
- [ ] 错误归一化：401、403、404/model missing、429 rate/quota、其他 4xx、5xx、content filter、DNS/TLS/socket、5–300 秒 timeout 和用户取消得到固定 reason/retryable/backoff；正文不外泄；
- [ ] Mock：Deterministic Mock 与 Chat Adapter 实现同一 generate 合同；成功、错误、usage 缺失/存在、取消和迟到矩阵一致，Mock 不进入生产类型/SQLite/UI；
- [ ] 迁移：空库与 `0001`–`0007` 升级到 `0008` 成功；STRICT/CHECK/FK/JSON/级联/默认值/foreign key check 与权威 Schema 一致，中断可重试；
- [ ] 模型与配置：仅可从当前 VERIFIED 模型列表精确选择；无自由输入/自动回退；默认 60 秒且仅 5–300 秒；Endpoint/Key 改变清除选择及投影，名称/启停/超时变化符合协议；
- [ ] 持久化：成功/失败投影与 usage 可在 SQLite 重开、Renderer reload 和应用重启恢复；不保存任意输入、完整原始响应、Key、Authorization 或远端 request ID；取消/冲突不覆盖；
- [ ] 并发：同 requestId 不重复调用；两个 Provider 隔离；取消只影响目标；Provider 版本变化时迟到结果返回冲突且不覆盖新配置或旧有效结果；资源/timer/listener/server/port 无残留；
- [ ] Key/IPC：缺 Key、Vault 故障、disabled、未验证、未选择/过期模型在发网前失败；错误窗口、伪造 model/dialect/URL/Header/Key 和未知取消固定拒绝；Renderer 无通用 fetch/Vault/DB/文件/Native RPC；
- [ ] UI：Settings 可选择精确模型、设置 timeout、发起/取消/重试固定低风险生成并查看受限输出、stopReason、token usage 与 UNKNOWN cost；pending、诊断、错误与修复动作准确；
- [ ] UI 恢复与适配：重载/重启恢复持久化事实但不自动重发；键盘/焦点/live region/label/错误关联及 1024×700、1440×900、200% 缩放可完成；Key 默认遮挡且不进入截图；
- [ ] 自动真实窗口：Windows/macOS 同一提交开发态与最终包用 loopback 完成成功、usage、错误、取消、超时、重启、配置变化和回归；功能与清理独立通过；
- [ ] 本机真实 Provider：自动矩阵通过后，经正式 Renderer 将本机资源保存到应用自管 Key Vault，精确选择已返回模型并完成一次 ≤32 output tokens 的非敏感生成；只记录脱敏成功、模型、usage/UNKNOWN cost、时间和泄密扫描；
- [ ] 治理：`pnpm check`、status/task-unit/diff、Rust fmt/clippy、secret scan、既有 Workspace/Corporation/Goal/pause/restart/Key Vault/connection E2E 全部通过；Windows/macOS CI 同提交最终包与 artifacts 成功；P0/P1 和未执行必检项为 0。

## 8. 隔离与干扰控制

- 自动测试使用 `M2-TU-04-<random>` userData、SQLite、Provider/request ID、随机假 Key、动态 loopback 端口和自有 AbortController；
- Mock Server 只监听 loopback，验证 Key 哈希而不打印明文；结束等待 socket/server/进程/端口全部释放；
- 固定生成输入不含用户数据；测试输出/原始正文不写日志或 artifact；只验证受限规范化结果；
- 本机真实 smoke 使用正式应用 userData，与自动 fixture 完全隔离；不把真实值写入仓库临时文件或环境；凭据由 Renderer 输入后只由应用 Key Vault 管理；
- SQLite/WAL/SHM、日志、HTML、截图、trace、stdout/stderr、bundle 与 artifacts 分别做 Key/Authorization/原始正文定向扫描；
- 清理只删除已解析并验证位于任务临时根内的自动 fixture；正式本机 Provider 配置按用户要求保留，不属于测试清理目标。

## 9. 证据计划

- `pnpm check:status`、`pnpm check:task-units`、`pnpm check`、`pnpm test:e2e`、`git diff --check`、Rust fmt/clippy；
- Protocol/Adapter/Mock 的 dialect-neutral、请求映射、响应限制、错误、usage、timeout/cancel 与资源清理单元/组件测试；
- `0008` 空库/逐版本升级/约束/重试，Repository 版本、选择、投影、重开、并发与故障测试；
- Main/Preload IPC、Renderer 状态/键盘/axe、开发态和最终包 Playwright Electron 真实窗口矩阵；
- 本机正式应用真实 Provider smoke 的脱敏结果、usage、时间、数据库/日志泄密扫描与重启恢复；
- 同一候选提交的 Windows/macOS GitHub Actions run/job、逐步结论、最终包 artifact ID/digest。

## 10. 完成规则

只有 16 项验收断言按 dialect/错误 × 配置版本/取消/恢复 × 开发态/最终包 × Windows/macOS 展开并全部取得当前提交直接证据，本机真实 Provider smoke 通过且凭据只存在应用自管 Key Vault，资源清理通过，P0/P1 与未执行必检项为 0，方可标记完成。本任务不代表 Responses、streaming、Goal/Plan、费用预算或 Milestone 2 完成。
