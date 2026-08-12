# M3-TU-02 团队模型配置与激活

| 字段 | 内容 |
|---|---|
| 任务单元 ID | M3-TU-02 |
| 状态 | 进行中 |
| 所属 Milestone | Milestone 3：最小 Agent 闭环 |
| 主要结果 | 用户可为团队的 Planner、全部 Executor、Judge 分别选择已验证 Provider/精确模型并确认激活；应用创建可恢复的 Agent 成员，但不调用模型、不创建 Run、不开始 Task。 |
| 基线提交 | `e241022063e065123b8ede51dc126d09c2959859` |

## 1. 需求与设计引用

- 用户决策 `1A + 2B + 3A + 4A + 5A + 6A + 7A` 的实际行为：确认团队只激活、不执行；Planner、全部 Executor、Judge 使用三组独立模型配置；Corporation 仍为 `DRAFT`；阻断缺口禁止激活，可降级缺口必须明确接受；每组可从连接验证返回的模型列表独立选模，不修改 Provider 默认模型；激活不要求生成测试、不调用模型；激活后 Provider 变化不改写快照，后续执行必须阻断失效配置；
- [MVP Plan Milestone 3](../MVP-Plan.md#6-milestone-3最小-agent-闭环)；
- [Organization Engine](../../03-core/Organization-Engine.md)、[Agent Runtime](../../03-core/Agent-Runtime.md)与 [Scheduler](../../03-core/Scheduler.md)；
- [Organization Proposal Protocol](../../04-protocols/Organization-Proposal-Protocol.md)、[Agent Protocol](../../04-protocols/Agent-Protocol.md)与 [Corporation State Protocol](../../04-protocols/Corporation-State-Protocol.md)；
- [Data Model](../../05-infrastructure/Data-Model.md)、[SQLite Schema](../../05-infrastructure/SQLite-Schema.md)与 [Model Provider](../../05-infrastructure/Model-Provider.md)；
- [Core User Flows](../../07-ui/Core-User-Flows.md)、[Screen State Matrix](../../07-ui/Screen-State-Matrix.md)、[Wireframes](../../07-ui/Wireframes.md)与 [UI Acceptance](../../07-ui/UI-Acceptance.md)。

## 2. 前置条件

- `codex/chinese-ui` 位于基线提交且开始实施时除本合同和对应权威文档更新外无其他修改；
- M3-TU-01 已提供当前 `DRAFT` organization proposal、固定模板成员、Task 分工和能力缺口；
- 至少一个正式 Provider 为 `ENABLED`、具有 Key，且当前版本连接测试为 `VERIFIED` 并返回非空模型列表；
- 工程使用 bundled Node.js；Windows 本地执行真实窗口测试，macOS 由 CI 补验；
- 公开仓库的 GitHub Actions 和安装包 artifact 可用。

## 3. 包含范围

- 团队激活 strict 协议、公开 DTO、固定错误和 Main 信任边界；
- Planner、全部 Executor、Judge 三组 Provider/精确模型选择；三组可相同或不同；
- 只接受当前 `ENABLED`、Key 存在、连接验证与当前版本一致且模型仍在验证列表中的 Provider；
- 角色选择不修改 Provider `selectedModelId`，不要求生成测试，不调用 Provider；
- `BLOCKING` 缺口禁止激活；`DEGRADED` 缺口必须由用户明确接受；
- 当前 organization version 从 `DRAFT` 原子转为 `APPROVED`，设置 Corporation 当前团队指针并创建对应 `READY` Agent Instance；
- 三组模型路由、Definition、工具和策略快照持久化；不复制或暴露 Key；
- 命令幂等、版本竞争、事务回滚、Renderer 重载与应用重启恢复；
- 中文 UI 的配置、激活中、已激活、缺口阻断、配置失效和固定失败状态。

本单元贡献 Milestone 3 的 Agent Definition/Instance 与团队激活基础。Scheduler、Agent Run、模型调用、Task 启动、Artifact、Evaluation 和修订仍由后续任务交付。

## 4. 非范围

- “开始执行”按钮或自动执行；Task 状态变化、调度决策、Agent Run 或模型请求；
- Provider 生成测试、多模型生成测试记录、Provider 默认模型修改或自动回退；
- 激活后原地编辑团队或自动跟随 Provider 变化；
- Tool Runtime、Approval、Artifact、Evaluation、Judge 执行、修订或 Milestone 3 关闭；
- 新增 Corporation “准备就绪”状态；激活后 Corporation 保持 `DRAFT`。

## 5. 依赖与接口

- 新增 `organization-activation:get-current` 与 `organization-activation:activate` IPC；请求和响应由 `@ai-corporation/protocols` strict Schema 验证；
- Renderer 只提交命令 ID、Corporation ID、organization ID/版本、三组 `providerId/providerVersion/modelId` 和 `acceptDegradedGaps`；成员、Definition、工具、能力、任务和快照从可信 SQLite 读取；
- Main 在同一事务重新验证当前草案、缺口、Provider 状态/版本/Key、当前连接验证和模型列表；
- 激活保存 Provider ID、Provider 版本、模型 ID、API dialect、角色策略、Definition 与工具快照，不保存 Key；
- 同一命令和相同输入重试返回原结果；同一命令不同输入为 `COMMAND_CONFLICT`；当前团队或 Provider 竞争变化固定拒绝；
- 固定错误至少包含 `VALIDATION_FAILED`、`UNAUTHORIZED_CALLER`、`ORGANIZATION_NOT_FOUND`、`ORGANIZATION_NOT_DRAFT`、`ORGANIZATION_CHANGED`、`BLOCKING_CAPABILITY_GAP`、`DEGRADED_GAP_ACCEPTANCE_REQUIRED`、`PROVIDER_NOT_READY`、`PROVIDER_CHANGED`、`MODEL_NOT_AVAILABLE`、`COMMAND_CONFLICT` 和 `STORAGE_FAILURE`；
- 成功不创建 `agent_run`、`model_call` 或 Task 执行记录，不改变 Corporation `DRAFT`，不调用 Provider。

## 6. 交付物与所有权

专属修改区：Organization Activation protocol、repository/service/IPC、激活 UI 和对应测试、`0014_organization_activation.sql`。

共享冲突区：Organization Proposal 公开 DTO、Provider 读取接口、Corporation 指针、Agent Definition/Instance Schema、Storage/Main/Preload/Desktop API、Plan Review UI、UI 权威文档和 `PROJECT_STATUS.md`。本任务串行修改这些文件。

## 7. 验收合同

- [ ] 01 只有当前 `DRAFT` 团队草案且没有 `BLOCKING` 缺口时显示并允许“配置并确认团队”；已激活、历史或阻断草案不能激活；
- [ ] 02 Planner、全部 Executor、Judge 三组可分别选择 Provider 和精确模型，三组既可相同也可不同；
- [ ] 03 选择来源只包含当前 `ENABLED`、Key 存在、连接验证对当前 Provider 版本为 `VERIFIED` 且模型列表非空的 Provider；
- [ ] 04 每个所选 model ID 必须仍在对应 Provider 的当前已验证模型列表中；任一 Provider/模型失效时整个激活拒绝；
- [ ] 05 角色选择不修改 Provider 默认模型、连接测试或生成测试记录，激活过程 Provider 调用次数为 0；
- [ ] 06 存在 `BLOCKING` 缺口时固定拒绝；存在 `DEGRADED` 缺口时必须由用户明确接受且默认未接受；接受事实绑定当前 organization version；
- [ ] 07 Renderer 不能伪造成员、Task 分工、Definition、能力、工具、API dialect、策略快照、Provider 状态或模型列表；
- [ ] 08 成功将当前 organization version 从 `DRAFT` 转为 `APPROVED`，设置 Corporation 当前团队指针并按草案成员恰好创建一个 `READY` Agent Instance；
- [ ] 09 每个 Agent Instance 保存 Definition/版本、有效工具和对应角色的 Provider/版本/model/dialect/策略快照，不保存 Key；
- [ ] 10 Planner、Executor、Judge 身份与职责分离保持不变，所有 Executor 共用 Executor 组配置；
- [ ] 11 激活成功不创建 Agent Run、model call 或执行事件，不开始 Task，不改变 Corporation `DRAFT`；
- [ ] 12 相同命令重试返回原结果；命令内容冲突、团队版本变化、Provider 版本竞争或重复激活被安全拒绝；
- [ ] 13 任一持久化步骤失败时 organization、当前指针、激活记录和 Agent Instance 全部回滚，不留下半激活团队；
- [ ] 14 激活后的 Provider 修改、禁用、删除 Key或模型列表变化不改写历史快照；执行前校验接口能明确报告失效配置并要求新团队版本；
- [ ] 15 Renderer/Main/Preload IPC allowlist、strict Schema 和固定安全错误一致，错误不包含 Key、远端正文或未受控数据库内容；
- [ ] 16 中文 UI 清楚显示三组配置、可降级缺口后果、激活中禁止重复点击、固定失败原因及“团队已激活，等待开始执行”；
- [ ] 17 Renderer 重载和应用重启后恢复已激活团队、三组配置和成员；失败不自动重试，已填选择在当前界面保留；
- [ ] 18 键盘、焦点、1024×700、1440×900 和 200% 缩放下可完成配置并查看激活结果；
- [ ] 19 Protocol、Storage、Desktop 单元/组件测试和迁移测试通过；
- [ ] 20 Windows 开发态真实 Electron 窗口完成三组选择、确认激活、零执行副作用和重启恢复旅程；
- [ ] 21 当前提交 Windows/macOS CI、最终包真实窗口和制品上传通过，用户人工验收通过后方可关闭。

## 8. 隔离与干扰控制

- 测试使用 `M3-TU-02` 独立临时目录、SQLite、Corporation/Plan/organization/Provider UUID 和命令 ID；
- 每个测试自行建立当前草案和 Provider 验证前置数据，不依赖本机真实 Key、其他任务数据或执行顺序；
- Provider fake 记录调用次数，直接证明激活零次 Provider 调用；默认模型和验证投影在激活前后做数据库对比；
- 故障注入分别覆盖状态更新、指针、激活记录和 Agent Instance 创建，并在新连接中检查完整回滚；
- Electron E2E 使用独立 userData 和测试 Provider fixture，测试结束等待进程退出；开发态与最终包证据分开记录。

## 9. 证据计划

- `pnpm check:status`、`pnpm check:task-units`、`pnpm check`、`git diff --check`；
- Protocol strict Schema、固定错误和 Renderer 伪造输入拒绝测试；
- SQLite 迁移、三组路由、幂等、并发、重复激活、事务回滚、无 Run/调用/Task 状态副作用和重启恢复测试；
- Provider 默认模型/验证投影不变、激活零调用和执行前配置失效校验测试；
- Windows `pnpm test:e2e` 的真实窗口、键盘、重启和截图证据；
- Windows/macOS GitHub Actions job、最终包真实窗口矩阵和 artifact；
- 用户对当前最终包的人工团队配置与激活验收结论。

## 10. 完成规则

只有 21 项断言全部具备当前提交的直接证据、P0/P1 为 0、文档/协议/Schema/迁移/实现一致，并且用户完成最终包人工验收后，M3-TU-02 才可标记“完成”。本任务完成不开始执行、不调用模型，也不自动关闭 Milestone 3。
