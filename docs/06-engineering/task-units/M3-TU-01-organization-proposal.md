# M3-TU-01 团队草案生成与展示

| 字段 | 内容 |
|---|---|
| 任务单元 ID | M3-TU-01 |
| 状态 | 完成 |
| 所属 Milestone | Milestone 3：最小 Agent 闭环 |
| 主要结果 | 用户可从已批准 Plan 明确点击“开始组队”，获得可恢复的确定性团队草案并查看 Task 分工、职责分离和能力缺口，但不会激活团队或开始执行。 |
| 基线提交 | `17734f408653c990c5b4500641a8d8d7bb5b2535` |

## 1. 需求与设计引用

- 用户决策 `1A + 2A + 3A + 4A + 5A + 6A` 的实际行为：批准 Plan 不自动组队；用户明确点击后只生成并展示草案；草案使用内置且有版本号的 Planner、Executor、Judge 模板和固定规则，不调用模型；草案只记录模型策略，精确 Provider/模型留到真正运行 Agent 时选择；需要用户决定的 Task 由用户负责，不分配给 Executor；Executor 固定分为分析与文档、软件实现、质量验收三类，按实际需要创建；
- [MVP Plan Milestone 3](../MVP-Plan.md#6-milestone-3最小-agent-闭环)；
- [PRD](../../01-product/PRD.md)、[Organization Engine](../../03-core/Organization-Engine.md)与 [Agent Protocol](../../04-protocols/Agent-Protocol.md)；
- [Task Protocol](../../04-protocols/Task-Protocol.md)、[Data Model](../../05-infrastructure/Data-Model.md)与 [SQLite Schema](../../05-infrastructure/SQLite-Schema.md)；
- [Core User Flows](../../07-ui/Core-User-Flows.md)、[Wireframes](../../07-ui/Wireframes.md)、[Screen State Matrix](../../07-ui/Screen-State-Matrix.md)与 [UI Acceptance](../../07-ui/UI-Acceptance.md)。

## 2. 前置条件

- `codex/chinese-ui` 位于基线提交且开始实施时工作区干净；
- M2-TU-08 已提供 `APPROVED/VALID` Plan、不可变 Plan/Task 身份和启动恢复；
- Corporation 在本任务全过程保持 `DRAFT`；
- 工程使用 bundled Node.js；Windows 本地执行真实窗口测试，macOS 由 CI 补验；
- 公开仓库的 GitHub Actions 和安装包 artifact 当前可用。

## 3. 包含范围

- 团队草案 strict 协议、公开 DTO、固定错误和 Main 信任边界；
- 用户从当前 `APPROVED/VALID` Plan 明确发起组队，未批准、无效或历史 Plan 被拒绝；
- 内置且有版本号的 Planner、Executor、Judge 模板；
- 确定性最小团队：1 个 Planner、按实际机器 Task 创建 0–3 个 Executor、1 个独立 Judge，总数不超过 5；存在非 `HUMAN_DECISION` Task 时至少有 1 个 Executor；
- 每个非 `HUMAN_DECISION` Task 恰好分配给 1 个 Executor；`HUMAN_DECISION` Task 的责任人明确为用户；Judge 与所有 Executor 分离，因此同时满足关键 Task 的生产/验收分离；
- Executor 固定分为分析与文档、软件实现、质量验收三类，按 Task 类型、能力路径和工具要求映射；无法覆盖的要求如实形成结构化能力缺口；
- 草案只记录模型策略，不绑定精确 Provider/model，不调用 Provider；
- `organization_version` 的 `DRAFT` 快照、递增版本、命令幂等、事务一致性和重载/重启恢复；
- 中文 UI 的未生成、生成中、草案就绪、能力缺口、失败和恢复状态。

本单元贡献 Milestone 3 的 Organization Engine 最小团队草案；Milestone 3 的激活、调度、运行、Artifact、Judge 执行与修订仍由后续任务交付。

## 4. 非范围

- 自动组队、批准/激活团队、创建 Agent Instance 或 Agent Run；
- 改变 Corporation 状态、开始 Task 或任何后台执行；
- Provider/model 精确选择、真实模型请求、模型生成角色或临时 Definition；
- 插件 Agent、Specialist、工具安装、权限授予或预算账本；
- Scheduler、Runtime、Artifact、Evaluation、修订和 Milestone 3 关闭。

## 5. 依赖与接口

- 新增 `organization-proposal:*` IPC；所有请求和响应由 `@ai-corporation/protocols` strict Schema 验证；
- Renderer 只提交命令 ID 和 Corporation ID；Main 从可信数据库读取当前批准 Plan、Task、能力、工具、风险和预算信息；
- 固定模板由应用代码定义并带模板 ID/版本；草案快照保存生成时使用的完整模板和分配结果；
- 相同有效输入得到相同成员角色、聚类、分工、职责分离和缺口；记录时间、草案 UUID 和命令 ID 不参与确定性比较；
- 同一命令重试返回原结果，不新建版本；新的明确命令创建下一 `DRAFT` 版本；事务失败不留下半条版本；
- 固定错误至少区分 `PLAN_NOT_APPROVED`、`CURRENT_PLAN_CHANGED`、`COMMAND_CONFLICT`、`ORGANIZATION_NOT_FOUND`、`VALIDATION_FAILED` 和 `STORAGE_FAILURE`；
- 本任务只写 `organization_version` 草案及命令记录，不写 `agent_instance`、`agent_run`，不调用 Provider。

## 6. 交付物与所有权

专属修改区：Organization Proposal protocol、固定模板与分配器、repository/service/IPC、团队草案 UI 及对应测试。

共享冲突区：Task/Plan 公开 DTO、SQLite Schema 与迁移、Storage/Main/Preload/Desktop API、Plan Review UI、UI 权威文档和 `PROJECT_STATUS.md`。本任务串行修改这些文件。

## 7. 验收合同

- [x] 01 只有当前 `APPROVED/VALID` Plan 显示并允许“开始组队”，批准动作本身不生成草案；
- [x] 02 Renderer 不能伪造 Plan、Task、能力、工具、模板、角色、分配、Provider 或模型输入；
- [x] 03 每次成功草案包含 1 个 Planner、按实际机器 Task 创建 0–3 个 Executor 和 1 个独立 Judge，总数不超过 5；存在非 `HUMAN_DECISION` Task 时至少有 1 个 Executor；
- [x] 04 每个非 `HUMAN_DECISION` Task 恰好有一个 Executor 责任人；`HUMAN_DECISION` Task 恰好由用户负责；Judge 不与任何 Executor 共用身份；
- [x] 05 相同业务输入重复计算得到相同模板、聚类、分工、职责分离和能力缺口；
- [x] 06 内置模板具有稳定 ID 和版本，未知或不受信模板不能进入草案；
- [x] 07 无法覆盖的能力形成含受影响 Task 和原因的结构化缺口，不虚构 Agent 或能力；
- [x] 08 草案只含模型策略，不含精确 Provider/model 绑定，生成过程 Provider 调用次数为 0；
- [x] 09 成功结果保存为递增的 `DRAFT` organization version，完整快照可审计；
- [x] 10 相同命令重试返回原结果；命令内容冲突、当前 Plan 已变化或并发版本竞争被安全拒绝；
- [x] 11 事务故障不留下半条草案或命令记录；Renderer 重载和应用重启后恢复当前草案；
- [x] 12 生成成功、缺口或失败均不改变 Corporation `DRAFT`，不创建 Agent Instance/Run，不开始 Task；
- [x] 13 Renderer/Main/Preload IPC allowlist、strict Schema 和固定安全错误一致；
- [x] 14 中文 UI 清楚显示模板版本、角色、Task 分工、职责分离、能力缺口、模型策略以及“未激活、未执行”；
- [x] 15 生成中禁止重复点击；失败不自动重试，保留已批准 Plan 并允许用户明确重试；
- [x] 16 键盘、焦点、1024×700、1440×900 和 200% 缩放下可发起并查看完整草案；
- [x] 17 Protocol、Storage、Desktop 单元/组件测试和迁移测试通过；
- [x] 18 Windows 开发态真实 Electron 窗口完成批准 Plan 后主动组队、查看草案和重启恢复旅程；
- [x] 19 当前提交 Windows/macOS CI 与最终包真实窗口检查通过，用户人工验收通过后方可关闭。

## 8. 隔离与干扰控制

- 测试使用 `M3-TU-01` 独立临时目录、SQLite、Corporation/Plan/Task UUID 和命令 ID；
- 每个测试自行建立已批准 Plan 前置数据，不依赖本机真实 Provider、其他任务数据或执行顺序；
- Provider fake 记录调用次数，直接证明草案生成零次 Provider 调用；
- 固定时钟与 UUID 只用于审计字段，确定性算法断言排除这些非业务字段；
- Electron E2E 使用独立 userData，测试结束等待进程退出；开发态与最终包证据分开记录。

## 9. 证据计划

- `pnpm check:status`、`pnpm check:task-units`、`pnpm check`、`git diff --check`；
- Protocol、Storage、Desktop 定向测试摘要和 Provider 零调用断言；
- SQLite 迁移、幂等、并发、事务回滚和重启恢复测试；
- Windows `pnpm test:e2e` 的真实窗口、键盘、重启和截图证据；
- Windows/macOS GitHub Actions job、最终包真实窗口矩阵和 artifact；
- 用户对当前最终包的人工团队草案验收结论。

## 10. 完成规则

只有 19 项断言全部具备当前提交的直接证据、P0/P1 为 0、文档/协议/Schema/迁移/实现一致，并且用户完成最终包人工验收后，M3-TU-01 才可标记“完成”。本任务完成不自动激活团队、不开始执行，也不自动关闭 Milestone 3。
