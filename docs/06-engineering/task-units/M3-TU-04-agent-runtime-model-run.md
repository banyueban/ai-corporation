# M3-TU-04 Agent Runtime 非工具模型运行

| 字段           | 内容                                                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 任务单元 ID    | M3-TU-04                                                                                                                                                           |
| 状态           | 部分完成                                                                                                                                                           |
| 所属 Milestone | Milestone 3：最小 Agent 闭环                                                                                                                                       |
| 主要结果       | 用户点击“开始执行”后首个普通 Run 立即调用已激活团队的真实模型；已有 `CREATED` Run 可由用户继续，成功结果保存为可查看的可信候选内容，失败不会自动重试或伪装成完成；任务声明的工具本阶段只作为后续工作说明，不会被调用。 |
| 基线提交       | `65cc1adeb196bd783bfddc4df5750a31cda80beb`                                                                                                                         |

## 1. 需求与设计引用

- 用户决策 `1A + 2A + 3A + 4A + 5A + 6A` 的实际行为：点击“开始执行”同时授权首次模型调用；历史 `CREATED` Run 显示“继续执行”；模型结果先保存为候选内容，不创建正式 Artifact；模型返回正文等语义内容，由软件生成可信引用；格式错误最多调用模型修复一次；Provider 失败不自动重试，Task 进入等待重试，用户明确重试时创建下一 attempt；本任务不读取 Workspace、上游 Task 输出、Memory 或工具结果；
- [MVP Plan Milestone 3](../MVP-Plan.md#6-milestone-3最小-agent-闭环)；
- [Agent Runtime](../../03-core/Agent-Runtime.md)、[Task Engine](../../03-core/Task-Engine.md)；
- [Agent Protocol](../../04-protocols/Agent-Protocol.md)、[Provider Generation Protocol](../../04-protocols/Provider-Generation-Protocol.md)；
- [Data Model](../../05-infrastructure/Data-Model.md)、[SQLite Schema](../../05-infrastructure/SQLite-Schema.md)；
- [Core User Flows](../../07-ui/Core-User-Flows.md)、[Screen State Matrix](../../07-ui/Screen-State-Matrix.md)、[UI Acceptance](../../07-ui/UI-Acceptance.md)。

## 2. 前置条件

- M3-TU-03 已完成，普通首任务已是 `RUNNING`，唯一 Agent 为 `BUSY`，唯一 Run 为 `CREATED`；人工首任务路径不创建 Run，不进入本任务；
- 激活团队保存了该 Agent 的 Provider ID、Provider 版本、精确模型、API dialect 和模板快照；
- Provider 当前仍启用、Key 存在、连接已验证且精确模型仍在当前列表；
- 任务无 `TASK_OUTPUT` 输入且不请求 Workspace 读取/写入或进程权限；不满足时发网前拒绝；任务可声明 `requiredTools`，但本阶段只生成候选内容，工具不可用且不会执行；
- 本机真实 Provider 仅由应用自管 Key Vault 使用，自动测试使用 loopback/Mock；Windows 本地真实窗口，macOS 由 CI 补验。

## 3. 包含范围

- strict 的 `agent-run:get-current`、`agent-run:continue`、`agent-run:retry` 和 `agent-run:cancel` 协议、固定错误与可信 Main 边界；
- 新 Corporation 点击“开始执行”成功创建 `CREATED` Run 后，由 Main 自动继续同一 Run；旧 `CREATED` Run 只在用户点击“继续执行”后调用；
- Run 原子经过 `CREATED → PREPARING → READY → RUNNING`，模型成功且候选内容保存后进入 `PRODUCED`；
- 版本化 Executor Prompt：安全规则、Goal 摘要、完整 Task 合同、Agent 角色说明、期望输出和“工具不可用、不得声称执行工具或读写文件”的硬限制；不含 Workspace 路径/文件、上游输出、Memory、工具结果或历史对话；
- 模型候选输出 strict Schema：摘要、一个或多个与 `expectedOutputs` 对齐的正文输出、声明、未解决问题和后续请求；模型不得提交可信引用、路径、权限、Provider 或 Agent 身份；
- 第一次输出格式无效时使用同一 Provider/模型做一次受限格式修复；修复输入把原输出标记为不可信数据；最多两次模型调用；
- 应用为候选正文生成可信引用，正文与受限元数据持久化；不写正式 `artifact`/`artifact_version`；Run 使用量聚合并记录每次 `model_call`；
- Provider/输出失败时 Run `FAILED`、Task `RETRY_PENDING`、Agent `READY`；不自动重试。用户明确重试创建 attempt+1 的新 Run 并调用；旧 Run/候选只读保留；
- 用户取消使当前 Run `CANCELLED`、Task `RETRY_PENDING`、Agent `READY`；迟到结果不得覆盖；
- 中文 UI 显示准备中、运行中、正在修复、候选内容、usage、失败原因、继续/重试/取消，以及“尚未成为正式交付物”。
- 带 `requiredTools` 的任务仍可生成候选正文；UI 持续说明工具尚未执行，Run 不调用工具、不读取或写入文件，候选内容不得被表示为工具执行结果。

本任务贡献 Milestone 3 的 Agent Runtime 非工具真实模型切片。正式 Artifact、Evaluation、修订、持续调度和完整评分仍未交付。

## 4. 非范围

- 正式 Artifact/Artifact Version、Task `VERIFYING/COMPLETED` 或 Run `SUCCEEDED`；
- 上游 `TASK_OUTPUT`、Workspace 文件、Memory、网页、图像或其他外部内容；
- Tool Call、审批、Policy Engine、文件读取/写入或命令执行；`requiredTools` 仅作为后续工作说明进入 Task 合同；
- streaming、Responses Adapter、自动 Provider/model 回退、自动重试、熔断或费用预算账本；
- Judge、Evaluation、修订、后续 Task 调度、人工决定提交或 Milestone 3 关闭。

## 5. 简化与后续增强

- `DE-008`：候选内容转正式 Artifact、Run `SUCCEEDED` 和 Task `VERIFYING` 由后续 Artifact 任务补齐；
- `DE-009`：上游 Artifact 输入、Workspace 内容和提示注入隔离由后续输入接入任务补齐；
- `DE-010`：Task 声明的工具本阶段只允许模型生成候选内容；实际工具调用、审批、结果回填和失败恢复由后续工具运行任务补齐；
- `DE-005`、`DE-006` 仍未认领，本任务不会顺带实现持续调度或完整评分。

## 6. 依赖与接口

- Renderer 只提交 `schemaVersion`、命令 ID、Corporation ID、Run ID 和期望 Run/Task attempt；不得提交 Prompt、Task 内容、Agent、Provider、model、Key、输出、状态或时间；
- Main 从可信 SQLite 读取当前 Corporation、Run、Task/Goal 合同、Agent/Definition/路由快照，并从 Key Vault 解密 Key；
- 模型请求复用 dialect-neutral `NormalizedGenerationRequest` 和现有 Chat Adapter，固定非流式 `JSON_OBJECT`；Chat 专属 DTO 不跨 Adapter；
- 每次 `model_call` 必须关联真实 Corporation/Task/Run，保存安全请求元数据、usage、固定结果或诊断，不保存 Prompt、候选正文、原始响应、Key、Header、远端 request ID 或自由文本错误；
- 候选正文每个输出最多 1 MiB、合计最多 2 MiB；逻辑名、类型和 media type 必须与 Task `expectedOutputs` 一一对应，必需输出不可缺失，不接受额外输出；
- 同一运行命令幂等；同一活跃 Run 不可并发调用；旧 attempt、取消或版本变化后的迟到结果只完成自身调用记录，不写候选或当前状态；
- 固定错误至少包含 `VALIDATION_FAILED`、`UNAUTHORIZED_CALLER`、`RUN_NOT_FOUND`、`RUN_CHANGED`、`RUN_NOT_CONTINUABLE`、`TASK_INPUT_UNSUPPORTED`、`PROVIDER_NOT_READY`、`PROVIDER_FAILURE`、`INVALID_MODEL_OUTPUT`、`COMMAND_CONFLICT`、`CANCELLED` 和 `STORAGE_FAILURE`。

## 7. 交付物与所有权

专属修改区：Agent Run protocol、`0016_agent_runtime_model_run.sql`、候选输出 Schema/Prompt、repository/service/IPC、Run UI 与专项测试。

共享冲突区：Agent/Task 状态、`model_call`、Storage/Main/Preload/Desktop API、Execution Start 调用链、Agent Runtime/Data/SQLite/UI 文档、`PROJECT_STATUS.md`。本任务串行修改这些文件。

## 8. 验收合同

- [ ] 01 新 Corporation 点击一次“开始执行”只创建并运行一个首 Run；历史 `CREATED` Run 不自动调用，明确点击“继续执行”后运行；
- [ ] 02 Renderer 不能伪造 Prompt、Task/Goal、Agent、Provider/model、Key、输出、状态、attempt、usage 或时间；
- [ ] 03 发网前重新验证 Corporation/Task/Run/Agent、激活快照、Provider 版本、Key、连接和模型；失效时无模型调用、无部分状态；
- [ ] 04 有 `TASK_OUTPUT`、Workspace 读写或进程需求的 Task 在发网前以 `TASK_INPUT_UNSUPPORTED` 停止；只有 `requiredTools` 的 Task 可生成候选内容，但不调用工具、不读写文件，UI 明示工具尚未执行；
- [ ] 05 Prompt 只含安全规则、Goal 摘要、Task 合同、Agent 角色、输出 Schema 和候选内容限制；不含 Workspace 路径/文件、Memory、工具结果、Key 或历史对话，并明确禁止声称已调用工具或读写文件；
- [ ] 06 Run 状态按 `CREATED → PREPARING → READY → RUNNING → PRODUCED` 迁移，状态/检查点/事件一致且可恢复；
- [ ] 07 合法模型候选输出与 Task `expectedOutputs` 一一对应，应用生成可信引用并保存正文；模型提供的引用、路径、权限或身份字段被拒绝；
- [ ] 08 候选内容可完整查看并明确标注“尚未成为正式交付物”；不创建 `artifact`/`artifact_version`，Task 保持 `RUNNING`；
- [ ] 09 首次非法 JSON/Schema 只修复一次；修复成功保存候选，第二次仍非法则固定失败；总调用最多 2 次；
- [ ] 10 每次调用有独立 `model_call`，关联 Corporation/Task/Run/attempt；usage 正确聚合，费用未知时保持 `UNKNOWN`；
- [ ] 11 Provider 失败不自动重试；Run `FAILED`、Task `RETRY_PENDING`、Agent `READY`，UI 显示准确原因和“重新尝试”；
- [ ] 12 用户明确重试创建 attempt+1 的新 Run；旧 Run/调用/候选只读保留，不覆盖、不重复 attempt；
- [ ] 13 用户取消只取消当前 Run；迟到响应不保存候选，Run `CANCELLED`、Task `RETRY_PENDING`、Agent `READY`；
- [ ] 14 同一命令重试不重复调用；并发继续/重试只有一个获胜；命令复用不同输入返回 `COMMAND_CONFLICT`；
- [ ] 15 任一候选、usage、状态、事件或回执写入失败时不显示成功；数据库保持可解释且可重试的状态；
- [ ] 16 Renderer 重载和应用重启恢复当前 Run、候选、usage、失败原因和可用动作；不自动重发模型请求；
- [ ] 17 Prompt、候选正文、Key、Authorization、原始响应和自由文本远端错误不进入日志、错误、事件、model_call 元数据、截图或 CI artifact；
- [ ] 18 中文 UI 在键盘、焦点、1024×700、1440×900 和 200% 缩放下可继续、取消、重试和查看候选；
- [ ] 19 Protocol、Provider、Storage、Desktop 单元/组件、迁移和 loopback 矩阵通过；覆盖成功、修复、Provider 失败、取消、竞争和重启；
- [ ] 20 Windows 本机使用应用内已保存真实 Provider 完成一次非敏感首任务运行；只记录脱敏状态、模型、usage、时间和泄密扫描；
- [ ] 21 当前提交 Windows/macOS 完整 CI、开发态真实窗口、最终包真实窗口和制品上传通过；用户人工验收通过后方可关闭。

## 9. 隔离与干扰控制

- 自动测试使用 `M3-TU-04-<random>` userData、SQLite、Corporation/Task/Run/model call/command UUID、随机假 Key和动态 loopback 端口；
- 每例自行创建完整 Plan、团队、Provider 和 `CREATED` Run，不依赖本机正式数据或测试顺序；
- Mock/loopback 记录调用数、请求哈希和取消，不打印 Prompt、Key 或正文；结束等待 socket、timer、进程和端口释放；
- 候选正文只保存在任务隔离 SQLite；截图使用固定无敏感测试内容；真实 Provider 正文不写验收文档或日志；
- Electron 开发态与最终包使用独立 userData；清理只处理已验证位于任务临时根内的 fixture。

## 10. 证据计划

- `pnpm check:status`、`pnpm check:task-units`、`pnpm check`、`pnpm test:e2e`、`git diff --check`；
- strict 协议、模型候选 Schema、Prompt 边界、伪造字段拒绝和错误映射测试；
- `0016` 空库/逐版本升级、状态迁移、幂等、并发、迟到、回滚、候选恢复和 model_call 关联测试；
- loopback/Mock 成功、一次修复、双失败、Provider 失败、取消、超时和资源清理矩阵；
- Windows 开发态与最终包真实窗口的继续/运行/候选/失败/重试/重启/键盘/缩放截图；
- 本机正式应用真实 Provider 脱敏 smoke；同一提交 Windows/macOS GitHub Actions run/job 与 artifact ID/digest；
- 用户对当前 Windows 安装包的人工验收结论。

## 11. 完成规则

只有 21 项断言全部具有当前提交直接证据、P0/P1 为 0、未执行必检项为 0、文档/协议/Schema/迁移/实现一致，并且用户完成最终包人工验收后，M3-TU-04 才可标记“完成”。候选正文、模型调用成功、构建或窗口打开不能单独证明正式 Artifact、Task 验收或 Milestone 3 完成。

本任务于 2026-08-14 随产品转向 Pi 路线停止继续推进。已有代码、自动检查和 CI 证据保留，但真实使用曾出现超时、`INVALID_MODEL_OUTPUT` 和用户无法看到模型调用过程，且没有取得最终人工验收，所以状态保持“部分完成”，不得改成“完成”。新路线由 M7-TU-01 独立验收，不继承本任务的完成结论。
