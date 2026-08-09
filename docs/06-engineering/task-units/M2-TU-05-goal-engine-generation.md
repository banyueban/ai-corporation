# M2-TU-05 Goal Engine 真实生成与有界澄清垂直切片

| 属性           | 值                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 任务单元 ID    | M2-TU-05                                                                                                                                                                 |
| 状态           | 完成                                                                                                                                                                     |
| 所属 Milestone | Milestone 2：Provider 与 Goal/Plan                                                                                                                                       |
| 主要结果       | 用户可明确选择已验证 Provider/精确模型，把 Goal 输入生成并自动保存为可编辑 `PROVIDER` DRAFT；系统支持每周期 5 轮、用户显式续期的结构化澄清和每生成阶段最多一次 JSON 修复 |
| 基线提交       | `f2b89831fca5eae51a125a60f9c932ca8c58cd70`                                                                                                                               |

## 1. 需求与设计引用

- 用户决策：`1A + 2B + 3A + 4A + 5A + 6A`，并补充选择 `7C`：澄清按每周期 5 轮执行；达到周期上限时询问用户，用户可显式增加下一个 5 轮周期；不继续时按 `8A` 由用户选择保存含未确认 HIGH 假设的草稿或取消；真实 DeepSeek V4 验收发现 reasoning continuation 兼容缺口后，用户选择修复方案 A：把无效输出作为明确隔离的 `USER` 修复数据，不构造 `ASSISTANT` 历史或引入 Provider 私有字段；真实验收进一步确认 4,096 token 与默认思考模式及 Goal Schema 不一致且请求未启用结构化输出后，用户选择完整修复方案 A：增加 dialect-neutral `JSON_OBJECT` 约束、把通用/Goal 输出额度提高到 65,536，并记录无正文的安全失败诊断；
- [MVP Plan：Milestone 2](../MVP-Plan.md)、[PRD 创建 Corporation/FR-004](../../01-product/PRD.md)；
- [Goal Engine Protocol](../../04-protocols/Goal-Engine-Protocol.md)、[Goal Contract Protocol](../../04-protocols/Goal-Contract-Protocol.md)、[Provider Generation Protocol](../../04-protocols/Provider-Generation-Protocol.md)；
- [Domain Model](../../02-architecture/Domain-Model.md)、[Technical Design](../../02-architecture/Technical-Design.md)；
- [Data Model](../../05-infrastructure/Data-Model.md)、[SQLite Schema](../../05-infrastructure/SQLite-Schema.md)、[Model Provider](../../05-infrastructure/Model-Provider.md)；
- [Threat Model T-04/T-07/T-09/T-13](../Threat-Model.md)、[Testing Strategy](../Testing-Strategy.md)；
- [Core User Flow 02](../../07-ui/Core-User-Flows.md)、[Wireframes UI-03/UI-04](../../07-ui/Wireframes.md)、[Screen State Matrix Create/Goal](../../07-ui/Screen-State-Matrix.md)、[UI Acceptance UI-AC-02](../../07-ui/UI-Acceptance.md)。

## 2. 前置条件

- M2-TU-02、M2-TU-03、M2-TU-04 已完成；应用自管 Key Vault、Provider 连接/精确模型、非流式 dialect-neutral generate/usage、取消/超时和真实窗口/最终包门禁可用；
- `main` 与 `origin/main` 的设计基线为 `f2b89831fca5eae51a125a60f9c932ca8c58cd70`；开始实施时工作区无其他修改；
- `0001`–`0008` 不可修改；本任务独占 `0009_goal_engine.sql`；
- 自动测试只使用随机假 Key、动态 loopback Mock HTTP、确定性输出脚本和 `M2-TU-05-<random>` userData；
- 本机真实 Provider 只在自动矩阵通过后由正式 Renderer 使用应用 Key Vault 中已保存资源；Key 不进入命令、脚本、环境变量、fixture、日志、截图、Git 或 CI。

## 3. 包含范围

- Goal Engine v1 start/answer/resolve-extension/cancel/get-current strict Schema、typed IPC 与公开投影；
- `PROVIDER` Goal Contract source；普通 Renderer `save-draft` 不能新建或伪造该来源；对已有 `PROVIDER` DRAFT 只允许逐项改变既有 assumption 的 `confirmed`，其余字段逐字段不可变；
- 明确 Provider/精确模型选择；模型输入仅包含 Corporation 名称及用户 Goal 字段，不包含 Workspace 路径、目录或文件；
- 固定、版本化 Goal system prompt；非流式 temperature 0、`outputFormat: JSON_OBJECT`、最多 65,536 output tokens；严格解析单个 JSON 对象；
- 每个生成阶段首次 JSON/Schema 非法时最多一次修复；修复沿用原始 SYSTEM/USER 输入，把受限无效输出作为不可执行的 `USER` 数据，不构造 `ASSISTANT` 历史、不携带 Chat/Provider 私有 continuation/reasoning 字段；修复仍失败则固定失败且不保存 Goal；
- 每周期最多 5 轮结构化 HIGH-impact 澄清；达到上限停止 Provider 调用并等待 `CONTINUE | SAVE_DRAFT | CANCEL`；每次 CONTINUE 只增加一个 5 轮周期；
- 最终无问题时自动保存 `PROVIDER` DRAFT；SAVE_DRAFT 把剩余问题转为去重、未确认 HIGH assumptions 后保存；两者均不批准、不规划、不改变 Corporation 状态；
- `0009_goal_engine.sql`：Goal source 兼容迁移、operation、通用 model_call、约束/索引和重启中断投影；
- Repository/Application Service 的事务外网络、乐观版本、幂等、取消、同 Corporation 单活跃、Provider/Goal/Corporation 变化和迟到结果保护；
- 聚合标准 usage；每次正常/修复调用独立审计，只允许在 `response_meta_json` 保存固定安全失败诊断，不保存输入/输出正文、隐藏推理、自由文本错误或远端 request ID；
- Create/Review UI 的可选提示、Provider/模型与披露说明、生成/取消、结构化回答、周期续期决策、usage、错误、恢复和自动保存结果；
- Windows/macOS 开发态与最终包 loopback 矩阵，以及 Windows 本机真实 Provider 低风险 Goal smoke。

本任务关闭 Milestone 2 的 Goal Engine 真实生成基础，但不关闭 Goal 批准后的规划、Planner、Task Graph、Organization、Plan Review 或 Milestone 2。

## 4. 非范围

- Task Graph、Planner、JSON 计划修复、DAG/输入输出/验收验证、Organization 和 Plan Review；
- Goal approve 后自动进入 PLANNING、启动执行或创建合成 Task/Run；
- Responses Adapter、任何 streaming、Tool Call、Workspace 文件读取、RAG 或任意附件；
- 自动 Provider/模型回退、全局 Planner 默认路由、用户覆盖 system prompt/temperature/token 上限；
- 价格估算、预算 reservation/ledger、Provider runtime health/熔断/自动重试；
- 无限自动澄清、记住续期偏好、未确认 HIGH 假设自动批准；
- 保存完整 prompt/response、非法 JSON、修复正文、Key、Authorization 或远端 request ID；
- macOS 使用用户真实凭据；macOS 只使用同协议 loopback。

## 5. 依赖与接口

- 跨进程唯一合同为 Goal Engine/Goal Contract/Provider Generation Protocol 与 `packages/protocols` Schema；禁止复制 DTO；
- Goal Engine 只能通过 `ModelProvider.generate` 的 dialect-neutral DTO 调用显式 registry Adapter；Chat 原始 DTO 不得进入 Service/Repository/Renderer；
- Goal Engine 使用通用 `JSON_OBJECT` 输出约束；Chat Adapter 与未来 Responses Adapter 必须分别映射，不得让 `response_format` 或其他 dialect 私有字段进入 Service/Repository/Renderer；
- start 绑定当前 DRAFT Corporation、当前 Goal version、Provider version/VERIFIED 模型和 Workspace AVAILABLE 事实；Main 从持久化读取 Corporation 名称和 Provider 配置；
- 网络调用不在 SQLite 事务内；调用前写 operation/model_call 检查点，返回后条件提交；取消、版本冲突和迟到不能覆盖；
- Goal 自动保存复用 Goal Contract 版本事务、事件、指针和回执；operation 只有在该事务成功后才能成为 GOAL_SAVED；
- 每个模型输出必须同时包含完整 draft 与 0–5 个 HIGH 问题；问题 ID 由 Main 生成；模型 assumptions 固定未确认；
- 续期状态不调用 Provider；CONTINUE 后仍等待当前问题答案。每个周期第 5 轮仍有问题进入 EXTENSION_REQUIRED；没有问题则保存；
- 通用 model_call 使用 corporation/operation/purpose；GOAL_ANALYSIS 不得关联或伪造 task/run；未来执行 purpose 再强制真实 task/run。

## 6. 交付物与所有权

- 专属修改区：Goal Engine Protocol/Schema/Service/Repository/IPC、`0009_goal_engine.sql`、Goal prompt/output parser、M2-TU-05 fixture/tests/E2E；
- 共享冲突区：Goal Contract source/repository、Provider service exposure、protocol/storage exports、migration tests、Main/Preload/DesktopApi、App Create/Review/styles、Data/SQLite/Threat/UI 文档、打包脚本和 `PROJECT_STATUS.md`；
- `0001`–`0008`、已完成任务合同、Corporation pause/resume 状态机不得修改；
- 本任务串行拥有 Goal Contract/Provider/Create UI 共享边界，相邻 Planner/Goal/迁移/UI 任务不得并行修改。

## 7. 验收合同

- [x] 协议：五个 Goal Engine v1 channel 的 strict Schema 拒绝额外字段、错误版本/UUID/版本、超限文本/列表/答案、非法枚举和未授权调用；普通 Goal save 不能伪造 `PROVIDER` source；
- [x] 输入披露：开始前明确显示 Provider/精确模型和发送字段；Main 只发送 Corporation 名称及用户 Goal 字段，Workspace 路径/身份/目录/文件、Key、任意 Header 和 Renderer system prompt override 在发网前均不可达；
- [x] Provider 门禁：仅 ENABLED、已保存 Key、VERIFIED 且 selectedModel 仍在当前列表的精确版本可调用；多 Provider 不自动选择/回退，版本变化固定冲突；
- [x] 输出 Schema：请求明确使用 dialect-neutral `JSON_OBJECT` 并由 Chat Adapter 映射远端 JSON 模式；65,536 token 额度覆盖正常 Goal 及模型思考空间；单个受限 JSON 对象严格映射完整 draft 与 0–5 HIGH 问题；缺字段、额外字段、重复/超限、已确认模型 assumption、非 JSON、多对象、Markdown fence、超 1 MiB 和非法 UTF-8 安全失败；
- [x] JSON 修复：每个生成阶段首次非法只调用同 Provider/版本/模型一次修复；修复输入把受限无效输出隔离为 `USER` 数据且不存在 `ASSISTANT` 历史、Chat/Provider 私有 continuation/reasoning 字段；修复成功继续，修复失败停止；正常成功不修复，原始/修复正文不持久化或外泄；
- [x] 澄清周期：每周期精确最多 5 轮；完整答案才生成；周期内继续、无问题自动保存；第 5 轮仍有问题进入 EXTENSION_REQUIRED 并停止调用；轮次/周期/问题不可伪造或跳跃；
- [x] 周期决策：EXTENSION_REQUIRED 只接受用户显式 CONTINUE/SAVE_DRAFT/CANCEL；CONTINUE 每次只增加一个 5 轮周期且不自动调用；下个周期再次到限重新询问；续期不成为偏好；
- [x] Goal 保存：无问题自动保存；SAVE_DRAFT 把剩余问题变为去重未确认 HIGH assumptions；两者创建新 `PROVIDER` DRAFT、supersede 旧版本并原子写 pointer/version/event/receipt；不批准、不规划、不迁移 Corporation；
- [x] 迁移：空库与 `0001`–`0008` 升级 `0009` 成功；已有 MANUAL/MOCK Goal 保持逐字节语义；source、operation、model_call 的 STRICT/CHECK/FK/JSON/唯一活动索引、foreign key check 和中断重试与权威 Schema 一致；
- [x] 调用审计与 usage：正常、修复和每轮澄清各有独立 GOAL_ANALYSIS model_call；关联 corporation/operation/provider/model/attempt，task/run 为空；聚合 token/costSource 准确，Adapter 失败保留标准 ProviderFailureReason，并在内部审计区分 HTTP 5xx、空输出、额度耗尽和非法响应；未知费用不猜测；正文/隐藏推理/远端错误/request ID 不落库；
- [x] 持久化与恢复：草稿、问题、答案、周期/轮次、标准失败与 usage 在 SQLite 重开、Renderer reload 和应用重启恢复；遗留 GENERATING 转 INTERRUPTED 且不自动重放；可显式重试/取消；
- [x] 并发/取消/迟到：同 Corporation 单活跃；相同 operationId 幂等且不同请求冲突；两个 Corporation 隔离；取消只影响目标且 2 秒内进入流程；Corporation/Goal/Provider/operation 变化后的迟到结果不覆盖；timer/listener/server/port/进程无残留；
- [x] 错误与安全：Provider 标准失败、Vault/Storage、Workspace、Schema、答案、状态和版本错误固定归一化；输入/答案/模型正文/路径/Key/Authorization/SQL/堆栈不进入错误、日志、trace、事件、截图或诊断；
- [x] UI：Create 的 Goal 必填，其余 Goal 内容为可选提示；用户明确选择 Provider/模型后可分析、取消、回答问题、查看 cycle/round/usage、续期、保存未确认草稿或取消，并进入真实 Goal Review；pending 防重复；
- [x] UI 恢复与适配：dirty input、部分 Corporation、CLARIFICATION_REQUIRED、EXTENSION_REQUIRED、FAILED/CANCELLED/INTERRUPTED/GOAL_SAVED 恢复准确且不伪造成功；键盘/焦点/live region/label/错误关联及 1024×700、1440×900、200% 可完成；
- [x] 自动真实窗口：Windows/macOS 同一提交开发态与最终包用动态 loopback 覆盖直接成功、一次修复、修复失败、两轮澄清、5 轮到限、续期再到限、保存未确认草稿、取消、中断/重启、版本冲突和既有回归；功能与清理独立通过；
- [x] 本机真实 Provider：自动矩阵通过后，正式 Windows 最终包从 Renderer 明确选择已保存真实 Provider/模型，用非敏感最小 Goal 完成一次真实生成；只记录脱敏状态、Goal source/version、usage/UNKNOWN cost、时间与泄密扫描；
- [x] 治理：协议/设计/Schema/迁移/实现/测试一致；`pnpm check`、status/task-unit/diff、Rust fmt/clippy、secret scan、Workspace/Corporation/Goal/pause/restart/Key Vault/Provider E2E 全部通过；Windows/macOS CI 同提交最终包与 artifacts 成功；P0/P1 和未执行必检项为 0。

## 8. 隔离与干扰控制

- 每例使用 `M2-TU-05-<random>` userData/SQLite、Corporation/operation/request/question ID、随机假 Key、动态 loopback 端口和自有 AbortController；
- fixture 用脚本化队列返回成功、问题、非法 JSON、修复、延迟和错误；只监听 loopback，验证 Authorization 哈希而不打印 Key；
- 每例自行创建 Workspace/Corporation/Provider/Goal 前置事实，不读取正式 userData、其他任务 fixture、网络代理、DNS 或外网；
- 模型 prompt/output 只在受控 fixture 内检查哈希和结构；stdout/stderr、HTML、截图、trace、SQLite/WAL/SHM、bundle 与 artifact 分别扫描；
- Renderer reload、应用重启、SQLite 重开、开发态/最终包、Windows/macOS 与真实 Provider 是独立证据维度；
- 清理只删除解析并验证位于任务临时根内的 fixture；正式 Provider/Key/Goal 按用户要求保留，不是自动清理目标。

## 9. 证据计划

- `pnpm check:status`、`pnpm check:task-units`、`pnpm check`、`pnpm test:e2e`、packaged E2E、`git diff --check`、Rust fmt/clippy、secret scan；
- Protocol strict/攻击集、output parser、prompt disclosure、repair call-count、cycle/extension 状态机和 usage 聚合单元测试；
- `0009` 空库/升级/约束/重试，Repository operation/version/idempotency/中断/model_call/Goal 原子保存测试；
- Main/Preload typed IPC、Renderer component/keyboard/axe/尺寸/缩放和开发态/最终包真实窗口矩阵；
- 本机正式应用真实 Provider smoke 的脱敏 Goal/usage/时间、数据库/日志泄密扫描与重启事实；
- 同一候选提交 Windows/macOS GitHub Actions run/job、最终包 artifact ID/digest。

## 10. 验收证据

最终候选提交 `ffb5637cd39d5744cd974e0dac7f5c4ac2bae182` 的 GitHub Actions run `31295696426` 已通过；Windows job `93200322608` 与 macOS Apple Silicon job `93200322583` 均完整通过工程检查、包含 Goal Engine 1024×700/200% 与 1440×900 专项场景的开发态 Electron E2E、最终包构建、最终包 E2E 和 artifact 上传。用户于 2026-08-09 明确确认人工 UI 验收通过。

| 验收项               | 直接证据                                                                                                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 协议               | `goal-engine.test.ts` 5 项 strict Schema 测试、`goal-engine-ipc.test.ts` 3 项授权/五 channel 额外字段拒绝测试、Goal Contract forged PROVIDER 拒绝测试；`pnpm check` 通过。                                       |
| 2 输入披露           | `goal-engine-service.test.ts` 的 disclosed-fields 断言、开发态/最终包真实窗口披露文案与 loopback 请求断言；Workspace/Key/Header 不进入 Goal 模型输入。                                                           |
| 3 Provider 门禁      | Provider Service 的已保存 Key、ENABLED/VERIFIED/精确版本/迟到版本测试；开发态和最终包仅能显式选择验证模型。                                                                                                      |
| 4 输出 Schema        | Provider Generation strict/额度测试、Chat Adapter JSON object 映射和非法/超限响应测试；窗口实际请求断言 `json_object`、65,536、非流式。                                                                          |
| 5 JSON 修复          | Service 的恰好一次修复、二次非法失败、安全修复输入/审计测试；扩展后的跨平台窗口矩阵直接覆盖修复成功与再次失败。                                                                                                  |
| 6 澄清周期           | Repository 五轮状态机测试；跨平台窗口矩阵直接完成 cycle 1 和 cycle 2 各 5 轮并在每个上限停止。                                                                                                                   |
| 7 周期决策           | Protocol 决策枚举、Repository 单周期 CONTINUE；窗口矩阵覆盖显式续期、再次到限、SAVE_DRAFT 和 CANCEL。                                                                                                            |
| 8 Goal 保存          | Repository 原子 PROVIDER DRAFT 测试、窗口未确认 HIGH 假设门禁；真实 Provider B 路径保存 version 1 DRAFT，7 条 assumptions 中 6 条为未确认 HIGH。                                                                 |
| 9 迁移               | Storage migration 空库、0001–0008 升级、0009 约束/外键/既有 MANUAL 语义测试；Storage 78/78 通过。                                                                                                                |
| 10 审计与 usage      | Repository/model_call、Service 正常/修复/失败诊断及 usage 聚合测试；真实 Provider 11/11 `SUCCEEDED`，标准聚合 usage 且无正文诊断。                                                                               |
| 11 持久化与恢复      | Repository transcript/reopen/interrupt 测试；跨平台窗口异常退出后恢复 `INTERRUPTED`，调用数保持不变且不自动重放。                                                                                                |
| 12 并发/取消/迟到    | Repository 单活跃/版本测试、Provider Service 多 operation/取消/迟到测试；窗口矩阵直接覆盖生成取消、周期到限取消、版本冲突和重启。                                                                                |
| 13 错误与安全        | 固定 Schema/Provider diagnostics 测试、Protocol 无值诊断测试、`pnpm secret:scan`；正式 userData 55 文件 Key 形态与 Authorization Bearer 命中均为 0。                                                             |
| 14 UI                | Windows/macOS 开发态窗口覆盖显式选择、生成、取消、回答、cycle/round/usage、续期、保存和 Review；最终包覆盖 PROVIDER draft 与 usage。                                                                             |
| 15 UI 恢复与适配     | Electron E2E 覆盖焦点、axe、失败/取消/中断/Goal saved 恢复；完整窗口套件覆盖 1024×700、1440×900 和 200% 的既有核心回归。                                                                                         |
| 16 自动真实窗口      | 同提交 Windows/macOS 开发态扩展矩阵覆盖成功、修复/失败、两周期、再次到限、未确认保存、取消、冲突和重启；两平台最终包均直接启动并完成 Goal Engine 与既有旅程。                                                    |
| 17 本机真实 Provider | Windows 最终包 Renderer 使用应用 Key Vault 中已保存的 `deepseek-v4-flash` 完成 11 次调用和 B 保存；Key 未进入命令、脚本、环境、日志、截图或 Git。                                                                |
| 18 治理              | 本地 `pnpm check`、Electron E2E 6/6、当前源码 package/packaged E2E、`git diff --check` 通过；CI run `31295696426` 双平台全绿；Windows artifact `9032913454`、macOS artifact `9032899167`；用户人工 UI 验收通过。 |

Windows artifact digest 为 `sha256:e4472ec29a61d28f786dded17e8b4c9fb4d38b524079e663c298bc3722482556`；macOS artifact digest 为 `sha256:9f3c383aac52e45bf2f4f702d827c88a4f8661659e682212a91c38359f652604`。本地 Windows NSIS SHA-256 为 `1DA3C15A1075A18880B6F276F9D9EA9FA3102C4337FD8E6B635C87EC7F20250A`。P0/P1 为 0，未执行必检项为 0。

## 11. 完成规则

只有 18 项验收断言按输出/修复 × 周期/续期/取消 × 版本/恢复 × 开发态/最终包 × Windows/macOS 展开并全部取得当前提交直接证据，本机真实 Provider smoke 通过且凭据仍只由应用 Key Vault 管理，资源清理通过，P0/P1 与未执行必检项为 0，方可标记完成。本任务不代表 Planner、Task Graph、Organization、Plan Review、执行或 Milestone 2 完成。
