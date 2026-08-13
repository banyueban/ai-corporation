# M3-TU-03 开始执行与首个任务调度

| 字段 | 内容 |
|---|---|
| 任务单元 ID | M3-TU-03 |
| 状态 | 进行中 |
| 所属 Milestone | Milestone 3：最小 Agent 闭环 |
| 主要结果 | 用户明确点击“开始执行”后，应用原子计算全部任务状态，并且只认领一个确定的首任务；普通任务创建一个尚未调用模型的 Run，人工任务则进入等待人工处理。 |
| 基线提交 | `322e5ff187ca1b464b86a8966a11a74ba42fcd95` |

## 1. 需求与设计引用

- 用户决策 `1A + 2A + 3A + 4A + 5A + 6A + 7A`：必须明确点击开始；本单元只完成启动、任务状态计算、唯一首任务选择/认领和 `CREATED` Run；不调用模型；按任务优先级降序、同级人工任务优先、再按稳定任务顺序选择；所有任务同步成为真实的 `READY/BLOCKED` 状态；若首任务是人工决定，则 Corporation 与该任务进入 `WAITING_HUMAN` 且不创建 Run；
- [MVP Plan Milestone 3](../MVP-Plan.md#6-milestone-3最小-agent-闭环)；
- [Task Engine](../../03-core/Task-Engine.md)、[Scheduler](../../03-core/Scheduler.md)与 [Agent Runtime](../../03-core/Agent-Runtime.md)；
- [Task Protocol](../../04-protocols/Task-Protocol.md)、[Agent Protocol](../../04-protocols/Agent-Protocol.md)、[Corporation State Protocol](../../04-protocols/Corporation-State-Protocol.md)；
- [Data Model](../../05-infrastructure/Data-Model.md)与 [SQLite Schema](../../05-infrastructure/SQLite-Schema.md)；
- [Core User Flows](../../07-ui/Core-User-Flows.md)、[Screen State Matrix](../../07-ui/Screen-State-Matrix.md)与 [UI Acceptance](../../07-ui/UI-Acceptance.md)。

## 2. 前置条件

- `codex/chinese-ui` 位于基线提交且开始实施时工作区无未提交修改；
- 当前 Plan 为 `APPROVED/VALID`，正式 Task 与依赖已物化；
- 当前 Organization 为 `APPROVED`，Corporation 指向该版本，Agent Instance 为 `READY`；
- Corporation 为 `DRAFT`，Workspace 为 `AVAILABLE`；
- Windows 本地真实窗口可验证，macOS 由 CI 补验。

## 3. 包含范围

- `execution-start:get-current` 与 `execution-start:start` strict 协议、固定错误和可信 Main 边界；
- 用户明确点击“开始执行”，Main 在事务中重新检查 Corporation、Workspace、Plan、团队、任务分工、Agent 和 Provider 快照；
- 所有无依赖任务转 `READY`，有依赖任务转 `BLOCKED`；
- 候选按 `priority DESC`、`HUMAN_DECISION` 优先、`created_at ASC`、`task.id ASC` 稳定排序；完整关键路径、解锁数、等待时间等评分留给后续调度任务；
- 一次只选择一个首任务；机器任务绑定草案中唯一 Executor 和对应 Agent Instance，Task 转 `RUNNING`、Agent 转 `BUSY`，创建一个 `CREATED` Agent Run；
- 人工任务转 `WAITING_HUMAN`，Corporation 转 `WAITING_HUMAN`，不创建 Run；其余无依赖任务保持 `READY`，但本单元不继续调度；
- 命令幂等、版本竞争、完整回滚、Renderer 重载和应用重启只读恢复；
- 中文 UI 显示开始中、执行已开始、等待人工、首任务、其他任务状态和固定失败原因。

本单元贡献 Milestone 3 的 Scheduler 基础硬约束、稳定首任务选择和 Agent Run 骨架。模型循环、Artifact、Evaluation、修订、并发调度与完整评分仍由后续任务交付。

## 4. 非范围

- 任何 Provider 请求、Prompt、模型输出、streaming 或 Tool 调用；
- Run 从 `CREATED` 进入 `PREPARING/READY/RUNNING`；
- Artifact、Evaluation、Judge、修订、人工决定提交或后续任务自动调度；
- 关键路径、解锁数、等待时间、风险惩罚、候选评分、预算预留、熔断或并发槽位；
- 新增或编辑 Plan、团队、Provider、预算或任务优先级。

## 5. 依赖与接口

- Renderer 只提交 `schemaVersion`、`commandId`、`corporationId` 和 `expectedCorporationVersion`；不得提交任务、优先级、负责人、Agent、状态、租约、Run 或时间；
- Main 从当前批准 Plan、激活团队和可信 SQLite 读取任务、依赖和分工；
- 普通任务的 owner 必须为当前团队的 `AGENT` 分工且能映射到唯一 `READY` Agent Instance；人工任务必须为 `HUMAN/human.user`；不一致则整个操作拒绝；
- 团队激活公开快照在执行前为 `READY`；首任务被认领后，对应成员公开为 `BUSY`，其余成员仍为 `READY`，因此重载恢复不得把合法的 `BUSY` 成员误报为团队损坏；
- 启动前重新验证激活快照中的 Provider 仍可用；失效时不改变任何状态；
- 成功结果公开 Corporation 状态/版本、所有任务的公开状态、选中任务、可选 Run 及开始时间，不公开 Key、数据库内部内容或完整 Provider 响应；
- 固定错误至少包含 `VALIDATION_FAILED`、`UNAUTHORIZED_CALLER`、`CORPORATION_NOT_FOUND`、`CORPORATION_CHANGED`、`STATE_CONFLICT`、`WORKSPACE_UNAVAILABLE`、`PLAN_NOT_READY`、`ORGANIZATION_NOT_READY`、`PROVIDER_NOT_READY`、`ASSIGNMENT_INVALID`、`NO_ENTRY_TASK`、`COMMAND_CONFLICT` 和 `STORAGE_FAILURE`。

## 6. 交付物与所有权

专属修改区：Execution Start protocol、repository/service/IPC、`0015_execution_start.sql`、开始执行 UI 与专项测试。

共享冲突区：Corporation/Task/Agent 状态、事件表、Storage/Main/Preload/Desktop API、Plan Review UI、核心与 UI 权威文档、`PROJECT_STATUS.md`。本任务串行修改这些文件。

## 7. 验收合同

- [ ] 01 只有当前批准 Plan、当前激活团队、可用 Workspace 和 `DRAFT` Corporation 显示并允许“开始执行”；
- [ ] 02 点击前不改变 Corporation/Task/Agent/Run，不调用 Provider；启动中禁止重复点击；
- [ ] 03 Renderer 不能指定或伪造 Task、排序、owner、Agent、Run、状态、时间或租约；
- [ ] 04 Main 在事务内重新验证 Corporation 版本、当前批准 Plan、团队版本、Agent 和 Provider 快照；竞争或失效时无部分写入；
- [ ] 05 所有无依赖任务变为 `READY`，有未完成依赖任务变为 `BLOCKED`，状态与当前 DAG 一致；
- [ ] 06 首任务只从无依赖候选中选择，按 priority 降序、同级人工优先、created_at 和 task.id 稳定排序；相同输入每次结果一致；
- [ ] 07 普通首任务只映射到草案分配的唯一 Executor/Agent Instance，Task 转 `RUNNING`、attempt 增加为 1、Agent 转 `BUSY`；
- [ ] 08 普通首任务只创建一个 `CREATED` Run，Run 绑定 Corporation/Task/Agent/attempt 和快照限制；Provider/model/tool 调用数均为 0；
- [ ] 09 普通路径 Corporation 原子从 `DRAFT` 转 `EXECUTING` 并写入同版本事件；其余入口任务保持 `READY`，下游保持 `BLOCKED`；
- [ ] 10 若最高优先级首任务为 `HUMAN_DECISION`，该 Task 与 Corporation 原子转 `WAITING_HUMAN`，不创建 Run、不占用 Agent；同级普通任务保持 `READY`；
- [ ] 11 一次启动最多认领一个 Task；不继续调度第二个任务；
- [ ] 12 同 command 和相同输入重试返回原结果，不重复状态、事件、attempt 或 Run；同 command 不同输入返回 `COMMAND_CONFLICT`；
- [ ] 13 任一状态、事件、Run、Agent 或回执写入失败时全部回滚，Corporation 保持 `DRAFT`、Task 保持 `DRAFT`、Agent 保持 `READY`；
- [ ] 14 启动后 Renderer 重载和应用重启恢复相同 Corporation、任务、Agent 和 Run；启动时不自动创建新 Run或调用模型；
- [ ] 15 中文 UI 明确显示首任务、全部任务真实状态、普通路径“已创建运行记录但尚未调用模型”或人工路径“等待你的决定”；
- [ ] 16 固定失败 UI 说明未开始、影响和恢复动作；不把失败显示为执行中；
- [ ] 17 键盘、焦点、1024×700、1440×900 和 200% 缩放下可开始并查看结果；
- [ ] 18 Protocol、Storage、Desktop 单元/组件测试和迁移测试通过；
- [ ] 19 Windows 开发态真实 Electron 窗口覆盖普通首任务、人工首任务、刷新恢复和零模型调用；
- [ ] 20 当前提交 Windows/macOS CI、最终包真实窗口和制品上传通过，用户人工验收通过后方可关闭。

## 8. 隔离与干扰控制

- 测试使用 `M3-TU-03` 独立临时目录、SQLite、Corporation/Plan/Organization/Task/Agent/Run/command UUID；
- 每项测试自行建立 Plan、DAG、团队分工、Agent 和 Provider 前置数据，不依赖其他任务残留；
- Provider fake 记录调用次数，证明启动为零调用；数据库前后快照证明失败整体回滚；
- 排序 fixture 同时覆盖优先级、人工同级优先和稳定顺序；
- Electron E2E 使用独立 userData，开发态与最终包证据分开记录。

## 9. 证据计划

- `pnpm check:status`、`pnpm check:task-units`、`pnpm check`、`git diff --check`；
- Protocol strict Schema、固定错误和 Renderer 伪造拒绝测试；
- SQLite 迁移、全部状态计算、稳定排序、唯一认领、分工映射、幂等、竞争、回滚、零调用和重启恢复测试；
- Desktop 组件/IPC 测试与 Windows `pnpm test:e2e` 真实窗口、键盘、缩放和截图；
- Windows/macOS GitHub Actions、最终包真实窗口和 artifact；
- 用户对当前最终包的人工开始执行验收结论。

## 10. 完成规则

只有 20 项断言全部具备当前提交的直接证据、P0/P1 为 0、文档/协议/Schema/迁移/实现一致，并且用户完成最终包人工验收后，M3-TU-03 才可标记“完成”。代码、单元测试、构建、进程存活或窗口打开均不能单独关闭任务。
