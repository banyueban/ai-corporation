# AI Corporation Desktop 项目进度

| 属性           | 当前值                                |
| -------------- | ------------------------------------- |
| 当前产品版本   | v0.1 MVP                              |
| 当前阶段       | Milestone 3 开发中                    |
| 当前 Milestone | Milestone 3：最小 Agent 闭环          |
| 当前任务单元   | M3-TU-04（进行中）                    |
| 总体状态       | M3-TU-04 已修复真实任务阻断，正在重新交付验收 |
| 最近更新       | 2026-08-13                            |
| 下一检查点     | 安装包、真实 Provider、CI 与人工验收  |

## 1. 当前结论

Milestone 0、Milestone 1 和 Milestone 2 已完成。Milestone 3 的 M3-TU-01、M3-TU-02 和 M3-TU-03 均已完成并经用户人工验收。当前 M3-TU-04 已实现用户确认的 `1A + 2A + 3A + 4A + 5A + 6A` 及后续方案 A：点击“开始执行”同时授权首个模型调用，旧 `CREATED` Run 可继续；模型结果保存为候选内容，软件生成可信引用；格式最多修复一次；Provider 失败不自动重试；本任务不读取 Workspace、上游 Artifact、Memory 或工具结果。Task 可声明后续所需工具，但本阶段只生成候选内容，不调用工具、不读写文件，UI 明示工具尚未执行。任务仍处于进行中，尚缺修复版最终安装包、真实 Provider、CI 和用户人工验收。

M2-TU-09 已按用户选择的方案 B 完成 L3 汇总验收：M2-TU-02 至 M2-TU-08 的直接证据组成交付物和验收矩阵，当前提交的 Windows/macOS 完整工程检查、开发态真实窗口、最终包真实窗口与制品上传全部通过。该结论不声称存在一条未实际执行的连续端到端测试。

Milestone 2 阶段复盘已把有效改进直接落入现行规则和自动检查：纯收尾提交只有在直接父提交完整 CI 成功且文件范围仅包含当前状态、当前合同和验收证据时才能复用产品证据；夹带产品、测试、CI、依赖、协议、Schema、迁移、安全或设计变更会被拒绝。任务决策必须同时写出中文大白话行为，Milestone 最终验收必须预先明确演示方式和双平台/人工边界，CI 重跑与 artifact 前置条件也已固定。

项目现使用[简化与后续增强清单](docs/06-engineering/Deferred-Enhancements.md)集中管理为加快交付而主动保留的未来能力。M3-TU-03 的“只认领一个首任务”和“使用简化稳定排序”已分别登记为 `DE-005`、`DE-006`；当前任务通过不代表这些增强已经补齐。

## 2. 已完成基线

- Milestone 0：跨平台工程、Native Core health、SQLite migration runner、CI 和最终包 E2E；
- Milestone 1：Workspace、Corporation CRUD、Goal Contract、最小时间线、暂停/继续和应用重启恢复；
- M2-TU-02：AI Corporation Desktop 应用自管 Provider Key Vault；
- M2-TU-03：Provider 连接测试、错误归一化和精确模型列表；
- M2-TU-04：dialect-neutral 非流式生成、Chat Completions Adapter、usage、超时/取消与 Responses 前向兼容门禁；
- M2-TU-05：Goal Engine 真实生成、每周期 5 轮有界澄清、一次 JSON 修复和 APPROVED Goal 前置能力。
- M2-TU-06：Planner 结构化生成、最多一次 JSON 修复、草稿持久化和正式 Renderer 真实 Provider 验证；
- M2-TU-07：Plan DAG/引用/输入输出/验收/预算/权限描述本地验证与正式 Task 原子物化。
- M2-TU-08：Plan Review 有限编辑、不可变版本、无效恢复、批准冻结和历史只读。
- M2-TU-09：Milestone 2 证据矩阵、双平台最终包回归与 L3 关闭验收。

## 3. Milestone 2 范围状态

- [x] AI Corporation Desktop 应用自管 Key Vault；
- [x] OpenAI 风格 Provider + 测试专用 Mock Provider；
- [x] 连接测试、错误归一化和用量；
- [x] Goal Engine；
- [x] Planner 结构化输出与最多一次 JSON 修复；
- [x] DAG、输入输出和验收验证；
- [x] Plan Review 编辑与批准 UI；
- [x] Windows/macOS Milestone 级真实窗口与最终包验收。

Milestone 2 的七项交付、四项验收、全部必需任务单元、Windows/macOS 回归、最终包真实窗口、制品上传和 Windows 人工验收均已通过，P0/P1 为 0。Milestone 2 已关闭；Organization 和执行属于 Milestone 3。

## 4. 当前任务边界

M3-TU-04 只交付：

- 首个普通 Run 的真实非流式模型调用和状态推进；
- 严格模型候选输出、最多一次格式修复、可信候选引用和正文持久化；
- Provider 失败不自动重试，用户明确重试创建新 attempt；
- 取消、竞争、迟到响应、重载和重启恢复；
- 中文运行状态、候选内容、usage、失败与恢复界面。

不包含正式 Artifact/Artifact Version、上游输出或 Workspace 内容、工具、Evaluation、修订、持续调度、完整评分或 Milestone 3 关闭。

## 5. 活跃阻塞与外部条件

当前 P0/P1、P2/P3 均为 0，无产品实现阻塞。旧安装包对声明 `workspace.propose_write` 的真实首任务错误返回 `RUN_CHANGED`，并曾把未成功的 Run 临时显示为“运行中”；修复版已允许该 Task 生成候选内容、禁止真实工具与文件操作、移除乐观成功状态并提供中文错误说明。真实 Run `019ffb79-8dbd-7f0a-a6b1-79799b3462b4` 只读检查确认仍为 `CREATED` attempt 1，可由修复版继续。M3-TU-04 当前仍需修复版真实 Provider 脱敏运行、CI 和用户人工验收，任务未完成。M3-TU-03 功能提交 `97d2425c74a83a612d7a4454b67871304f57f78c` 及后续治理提交 `3ae6a0fee5218da2595ee757b430996a96463778` 均通过 Windows/macOS 完整 CI、开发态真实窗口、最终包真实窗口和制品上传；用户已于 2026-08-13 确认 M3-TU-03 Windows 安装包人工验收通过。`DE-005` 持续调度与 `DE-006` 完整评分仍为待安排增强，不属于阻塞或已完成能力。`banyueban/ai-corporation` 为公开仓库；CI 上传范围仅包含安装包、blockmap 和验收截图。不清理其他仓库制品。

已知条件：系统 PATH 未提供 Node.js，工程验证使用 Codex bundled Node.js；正式 Key 仍只由应用自管 Key Vault 使用，未进入命令、脚本、环境变量、Git、日志或截图；费用无法从当前 Provider 响应可靠取得时保持 `UNKNOWN`。方案 B 使用分任务证据汇总，不声称存在单条未中断端到端测试。GitHub 提示两个 Action 的 Node.js 20 声明被 runner 强制切换到 Node.js 24；当前 CI 成功，该提示属于后续 CI 维护项，不是产品缺陷。

## 6. 当前验证摘要

- M3-TU-01 当前本地 `pnpm check` 完整通过：Protocol 49、Provider 28、Storage 90、Desktop 130，Native Core 7、Workspace Rust 7；status/task-unit、format、lint、typecheck、Rust fmt/clippy 和 secret scan 均成功；
- 团队草案固定分配器测试证明：用户决定 Task 归用户、三类 Executor 按需创建、Judge 与 Executor 分离、未知强制能力形成阻断缺口、草案不含精确 Provider/model，且相同输入得到相同业务结果；
- SQLite 迁移、幂等、递增版本、命令冲突、版本冲突、事务回滚、当前草案恢复和 Corporation 保持 `DRAFT` 的测试通过；未创建 `agent_instance` 或 `agent_run`；
- Windows 开发态真实 Electron 7 条旅程全部通过；M3-TU-01 直接覆盖批准 Plan 后明确点击“开始组队”、团队草案展示、Provider 调用次数不增加、页面重载恢复和 1440×900 截图；
- 提交 `c472165256aacfe7b8aeb15d3919980496dd2992` 的 GitHub Actions 运行 `31608146504` 完整成功：Windows x64 与 macOS Apple Silicon 的工程检查、开发态真实 Electron、未签名安装包构建、最终包真实窗口和制品上传均通过；
- Windows 安装包已从该运行下载到本地并由用户完成人工验收，M3-TU-01 的 19 项验收全部通过。
- M3-TU-02 本地 `pnpm check` 完整通过：Protocol 51、Provider 28、Storage 97、Desktop 131，Native Core 7、Workspace Rust 7；状态/合同、格式、lint、类型、Rust fmt/clippy、敏感信息扫描和 `git diff --check` 均成功；
- 激活存储测试覆盖三组独立路由、Provider 默认模型不变、零模型调用、阻断/可降级缺口、未验证/版本变化/模型缺失、命令幂等与冲突、故障注入整体回滚、不可变快照及执行前失效检测；
- Windows 开发态真实 Electron 7 条旅程全部通过；M3-TU-02 直接覆盖 200% 缩放与键盘选模、确认激活、Corporation 保持 `DRAFT`、恰好 3 个 `READY` 成员、零执行副作用、页面重载恢复、无横向溢出及 1024×700/1440×900 截图。
- 提交 `c0601b0d81e6e92811c3b3c48bd385037cc25db8` 的 GitHub Actions 运行 `31630350081` 第 2 次尝试完整成功：Windows x64 与 macOS Apple Silicon 的工程检查、开发态真实 Electron、未签名安装包构建、最终包真实窗口和制品上传均通过；
- 当前 Windows 安装器已下载到本地 `release/m3-tu02-windows-c0601b0-retry/AI Corporation Desktop Setup 0.1.0.exe`，大小 `99800513` 字节，SHA-256 为 `E07A9417D3AE733C0A164717C5D28EF29CC895C9D7225EFC7B12E0F06366316B`；用户于 2026-08-13 确认人工验收通过，M3-TU-02 的 21 项验收全部通过。
- M3-TU-03 功能提交 `97d2425c74a83a612d7a4454b67871304f57f78c` 本地完整工程检查、开发态真实窗口和最终包矩阵通过；本地安装器大小 `99804738` 字节，SHA-256 为 `7E6EF66F6E23A0D937700961FDBB463CEB41876C3A989F3EC8CC16FC44CD962B`；
- 当前父提交 `3ae6a0fee5218da2595ee757b430996a96463778` 的 GitHub Actions 运行 `31685382573` 完整成功：Windows job `94400136174`、macOS job `94400136192` 的工程检查、开发态真实窗口、最终包真实窗口和制品上传全部通过；Windows/macOS artifact ID 分别为 `9175321683`、`9175275254`；
- 用户于 2026-08-13 确认 M3-TU-03 人工验收通过，20 项验收全部关闭；该结论不包含 Provider 模型调用、持续调度、完整评分、Artifact、Evaluation 或修订。
- M3-TU-04 最终功能提交 `99b2084b4f2ab731993b562ea21ef39f7065a281` 本地 `pnpm check` 完整通过：Protocol 55、Provider 28、Storage 99、Desktop 134，Native Core 7、Workspace Rust 7；Windows 开发态真实 Electron 7 条旅程全部通过；
- Agent Run 真实窗口旅程覆盖：点击“开始执行”立即调用 loopback 模型、保存并完整显示候选正文和 usage、明确标注“尚未成为正式交付物”、页面重载恢复且不重复调用；伪造 Renderer 字段被 strict IPC 拒绝；
- 当前提交的 GitHub Actions 运行 `31703862379` 完整成功：Windows job `94459406571`、macOS job `94459406500` 的工程检查、开发态真实窗口、最终包真实窗口和制品上传全部通过；Windows/macOS artifact ID 分别为 `9182501113`、`9182459724`；
- 方案 A 修复版 Windows 安装器已在本地生成：`release/AI Corporation Desktop Setup 0.1.0.exe`，大小 `99810492` 字节，SHA-256 为 `26AF85F66A775A7E6525A5DCA84EEDAD07983C214EADC83E902FC252BEB747FA`；同一构建的解包程序真实窗口健康与最终包矩阵通过。尚未执行修复版的正式真实 Provider 运行，尚未取得用户人工验收结论。
- 方案 A 修复版本地 `pnpm check` 完整通过：Protocol 55、Provider 28、Storage 99、Desktop 135，Native Core 7、Workspace Rust 7；状态/合同、格式、lint、类型、Rust fmt/clippy 和 secret scan 均成功；Windows 开发态真实 Electron 7 条旅程全部通过；
- 带 `workspace.propose_write` 的真实窗口回归证明：Run 完成一次模型调用并保存候选正文；请求包含工具名称和“工具不可用、不得声称执行工具或读写文件”的限制；UI 显示工具仍未执行。修复代码对正式数据库中的原 Run 只读检查返回可继续，Run 仍为 `CREATED` attempt 1。
- 修复提交 `ec7b2bc57c406a8df87a9ea6cdae9a979a4c1a16` 的 GitHub Actions 运行 `31716082990` 完整成功：Windows job `94501102183`、macOS job `94501102194` 的工程检查、开发态真实 Electron、未签名安装包构建、最终包真实窗口和制品上传全部通过；Windows/macOS artifact ID 分别为 `9187486721`、`9187455350`。当前剩余验证只有修复版正式真实 Provider 运行和用户人工验收。

## 7. 下一步

生成并提交方案 A 修复版 Windows 安装包，等待当前提交 Windows/macOS CI；使用应用内已保存 Provider 继续原 `CREATED` Run 完成脱敏真实模型运行，并由用户人工验收。全部通过后补齐合同证据并关闭任务。

## 8. 更新规则

- 只记录当前事实，不追加历史时间线；历史变化由 Git 和 CI 保存；
- 功能、任务或 Milestone 只有通过全部适用验收后才能标记“完成”；
- 设计文档存在、代码生成、构建成功或进程存活均不能代替对应层级验收；
- 当前任务状态必须与任务合同一致，任务通过只关闭自身；
- 复合断言只有全部平台、状态和产物子项均有直接证据时才能勾选；
- 发现文档、设计、协议、Schema、安全、UI 或验收歧义时，先提交用户决策，不推测实施。
- 为快速交付而采用、未来仍需补齐的简化必须登记 `DE-xxx` 并由后续任务明确认领；不得只留在聊天记录或任务“非范围”中。
