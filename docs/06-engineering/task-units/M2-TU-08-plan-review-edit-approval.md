# M2-TU-08 Plan Review 编辑与批准

| 字段 | 内容 |
|---|---|
| 任务单元 ID | M2-TU-08 |
| 状态 | 进行中 |
| 所属 Milestone | Milestone 2：Provider 与 Goal/Plan |
| 主要结果 | 用户可在中文 Plan Review 中有限编辑计划、保存不可变新版本并批准有效版本，但不会开始执行或组队。 |
| 基线提交 | `a1956e83d9d96f07ffeefd21be00332a92ad8d8a` |

## 1. 需求与设计引用

- 用户决策：`1A + 2A + 3A + 4A + 5A + 6A + 7A`；
- [MVP Plan Milestone 2](../MVP-Plan.md#5-milestone-2provider-与-goalplan)；
- [PRD 规划与 Task Graph](../../01-product/PRD.md)；
- [Plan Review Protocol](../../04-protocols/Plan-Review-Protocol.md)；
- [Planner Protocol](../../04-protocols/Planner-Protocol.md)与 [Plan Validation Protocol](../../04-protocols/Plan-Validation-Protocol.md)；
- [Data Model](../../05-infrastructure/Data-Model.md)与 [SQLite Schema](../../05-infrastructure/SQLite-Schema.md)；
- [Core User Flows](../../07-ui/Core-User-Flows.md)、[Wireframes](../../07-ui/Wireframes.md)、[Screen State Matrix](../../07-ui/Screen-State-Matrix.md)与 [UI Acceptance](../../07-ui/UI-Acceptance.md)。

## 2. 前置条件

- `codex/chinese-ui` 位于基线提交且工作区干净；
- M2-TU-06 已提供结构化 Plan，M2-TU-07 已提供确定性验证、正式 Task 物化和启动恢复；
- 当前 Corporation 保持 `DRAFT`，当前 Goal 为 `APPROVED`；
- 工程使用 bundled Node.js；Windows 本地可执行真实窗口测试，macOS 由 CI 补验。

## 3. 包含范围

- Plan Review strict IPC、公开 DTO、固定错误和 Main 信任边界；
- 当前版本和历史版本查询；
- 标题、目标、说明、优先级、验收标准、依赖的有限编辑；
- 删除 Task，自动清理普通依赖和里程碑引用，输出仍被使用时阻止并显示受影响 Task；
- 每次保存创建新 Plan/Task UUID、递增版本、取代旧版本并自动本地验证；
- 无效版本持久化、重载/重启恢复和继续修改；
- 仅 `VALIDATED/VALID` 可批准，批准后冻结；
- 中文 Plan Review 的正常、编辑、验证中、无效、历史、批准中和已批准状态。

本单元完成后贡献 Milestone 2 的“用户可修改并批准计划”；Milestone 2 仍需 Windows/macOS Milestone 级最终包真实窗口验收才能关闭。

## 4. 非范围

- 新增 Task、编辑输入/输出/能力/工具/预算/权限/里程碑或风险；
- Provider 重新规划、修改已批准 Plan、Responses Adapter 或 streaming；
- Organization、Agent、Scheduler、执行、Artifact、预算账本、真实权限授予；
- Corporation 状态迁移、团队创建或开始执行；
- Milestone 2 自动关闭。

## 5. 依赖与接口

- 新增 `plan-review:*` IPC；所有请求/响应由 `@ai-corporation/protocols` strict Schema 验证；
- Main 从可信源 Plan 复制不可编辑字段，只接受允许字段并生成新 Plan/Task UUID；
- 保存复用 `PlanValidationService`，不调用 Provider；
- 数据迁移新增版本来源、批准时间、当前版本唯一约束和命令幂等记录；
- `APPROVED/VALID` 不改变 Corporation `DRAFT`，正式 Task 继续保持 `DRAFT`。

## 6. 交付物与所有权

专属修改区：Plan Review protocol、repository/service/IPC、Renderer 编辑界面及其测试。

共享冲突区：Planner/Plan Validation 公开 DTO、`task_plan` Schema 与迁移、Main/Preload/Desktop API、UI 权威文档、`PROJECT_STATUS.md`。本任务串行修改这些文件。

## 7. 验收合同

- [x] 01 当前有效 Plan 可读取，历史版本按版本倒序只读展示；
- [x] 02 只允许修改已决定的 Task 字段，未知字段、伪造身份和来源外 Task 被拒绝；
- [x] 03 验收标准可新增、修改、删除，并由 Main 分配或保留安全局部身份；
- [x] 04 删除无输出消费者的 Task 会清理普通依赖和里程碑引用；
- [x] 05 删除仍被其他 Task 输入引用的 Task 被阻止，UI 列出受影响 Task；
- [x] 06 每次保存创建新 Plan UUID、全部新 Task UUID、递增版本和正确 `supersedesPlanId`；
- [x] 07 保存与旧版本 `SUPERSEDED` 在同一事务，故障不会产生两个当前版本；
- [x] 08 新版本自动本地验证且不调用 Provider；VALID 创建新正式 Task，INVALID 不创建正式 Task；
- [x] 09 INVALID 版本在 Renderer 重载和应用重启后可继续修改并保存下一版本；
- [x] 10 只有 `VALIDATED/VALID` 可以批准，PENDING、INVALID、SUPERSEDED 均拒绝；
- [x] 11 批准后 Plan 为 `APPROVED/VALID` 且有批准时间，再次修改或批准被拒绝；
- [x] 12 批准不改变 Corporation、Task 状态，不创建 Organization、Agent 或 Run；
- [x] 13 保存和批准命令幂等，迟到或旧版本请求不能覆盖当前版本；
- [x] 14 Renderer/Main/Preload IPC allowlist、Schema 和固定安全错误一致；
- [x] 15 中文 UI 清楚显示版本、验证结果、尚未组队、未开始执行和保存/批准后果；
- [x] 16 编辑、保存、批准支持键盘操作、焦点可见，1024×700、1440×900 和 200% 缩放可完成；
- [x] 17 Protocol、Storage、Desktop 单元/组件测试和迁移测试通过；
- [x] 18 Windows 开发态真实 Electron 窗口完成编辑、无效恢复、版本历史和批准旅程；
- [ ] 19 当前提交的 Windows/macOS CI 与最终包真实窗口检查通过，用户人工验收通过后方可关闭。

## 8. 隔离与干扰控制

- 测试使用 `M2-TU-08` 独立临时目录、SQLite、Corporation/Plan/Task UUID 和命令 ID；
- 每个测试自行建立 Goal、Provider、Plan 和验证前置数据，不依赖本机真实 Provider 或其他任务残留；
- Provider fake 记录调用次数，证明编辑、验证和批准均为零次 Provider 调用；
- Electron E2E 使用独立 userData，测试结束等待进程退出；开发态与最终包证据分开记录。

## 9. 证据计划

- `pnpm check:status`、`pnpm check:task-units`、`pnpm check`、`git diff --check`；
- Protocol、Storage、Desktop 定向测试摘要；
- Windows `pnpm test:e2e` 的真实窗口、键盘、重载/重启和截图证据；
- Windows/macOS GitHub Actions job、最终包真实窗口矩阵和 artifact；
- 用户对当前最终包的人工 Plan Review 验收结论。

## 10. 完成规则

只有 19 项断言全部具备当前提交的直接证据、P0/P1 为 0、文档/协议/Schema/迁移/实现一致，并且用户完成最终包人工验收后，M2-TU-08 才可标记“完成”。本任务完成不自动关闭 Milestone 2。
