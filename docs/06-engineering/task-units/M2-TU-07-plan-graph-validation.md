# M2-TU-07 计划图本地验证与正式 Task 物化

| 属性           | 值                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| 任务单元 ID    | M2-TU-07                                                                                                       |
| 状态           | 进行中                                                                                                         |
| 所属 Milestone | Milestone 2：Provider 与 Goal/Plan                                                                             |
| 主要结果       | Planner 草稿在本地确定性验证 DAG、引用、验收、预算和权限描述，通过时原子创建正式 Task/依赖，失败时展示精确问题 |
| 基线提交       | `96f05ec0760302fd81dd351bebea6f6f52324652`                                                                     |

## 1. 需求与设计引用

- 用户决策：`1A + 2A + 3A + 4A + 5A + 6A + 7A + 8A`；
- [MVP Plan：Milestone 2](../MVP-Plan.md)、[PRD 自动规划](../../01-product/PRD.md)；
- [Plan Validation Protocol](../../04-protocols/Plan-Validation-Protocol.md)、[Planner Protocol](../../04-protocols/Planner-Protocol.md)、[Task Protocol](../../04-protocols/Task-Protocol.md)、[Artifact Protocol](../../04-protocols/Artifact-Protocol.md)；
- [Task Engine](../../03-core/Task-Engine.md)、[Domain Model](../../02-architecture/Domain-Model.md)、[Artifact System](../../03-core/Artifact-System.md)；
- [Data Model](../../05-infrastructure/Data-Model.md)、[SQLite Schema](../../05-infrastructure/SQLite-Schema.md)、[Policy Engine](../../05-infrastructure/Policy-Engine.md)；
- [Threat Model T-02/T-07/T-09](../Threat-Model.md)、[Testing Strategy](../Testing-Strategy.md)；
- [Screen State Matrix Plan Review](../../07-ui/Screen-State-Matrix.md)、[UI Acceptance UI-AC-02](../../07-ui/UI-Acceptance.md)。

## 2. 前置条件

- M2-TU-02 至 M2-TU-06 已完成；当前 Planner 可保存带可信 Plan/Task UUID 映射的 `DRAFT/PENDING` 严格草稿；
- 基线提交为 `96f05ec0760302fd81dd351bebea6f6f52324652`，建立合同时工作区无既有修改；
- `0001`–`0010` 不可修改，本任务独占 `0011_plan_validation.sql`；
- 当前内置 capability、tool、media type 和 process profile catalog 可由 Main 单一模块提供，验证器不得复制不同版本；
- 验证完全本地执行，不需要 Provider、网络或真实 Key；本地已保存 Provider 资源不属于本任务输入或测试数据。

## 3. 包含范围

- Plan Validation v1 strict Schema、固定 issue/warning code、受限公开 report 与中文显示映射；
- Planner 草稿公开状态扩展为 `PENDING | VALID | INVALID`，Plan 状态只允许 `DRAFT/PENDING`、`DRAFT/INVALID`、`VALIDATED/VALID` 合法组合；
- Planner 保存后自动本地验证；启动恢复时只扫描并验证遗留 `PENDING`，不调用 Provider；
- 1–20 个 Task 有效，21–50 固定失败且不自动压缩；单 Task 是合法 DAG；
- Task/acceptance local ID 唯一、引用存在、自依赖/重复边/环、milestone 引用、入口/叶子事实验证；
- 每个 Task 至少一条 REQUIRED 验收，叶子至少一个必需输出；证据标签只做受限字符串验证，不猜测 evaluator/expected；
- `TASK_OUTPUT` 生产者、logical name、可选 media type 和依赖路径闭合；`GOAL_CONTRACT` 固定绑定 Goal version；
- `text/plain → TEXT`、`text/markdown → DOCUMENT`、`application/json → JSON`、`application/octet-stream → FILE`；未知值失败；
- Goal 费用总和、DAG 最长路径时长、全图修订次数硬限制；Goal 有上限而 Task 缺对应上限时失败；
- capability/tool catalog、Workspace 相对路径攻击和 process profile allowlist 验证；通过不代表授权；
- 固定结构阈值的单 Run warning，不调用模型进行主观判断；
- `0011` 验证报告字段、正式 `task`/`task_dependency`、同 Plan 外键与原子物化；
- Planner 页面显示本地验证中、失败问题、已验证与 warning，并继续标注尚未组队、未批准、不可执行；生成失败、取消或中断后保留原因并重新提供模型服务商/模型选择和明确重试入口，不自动调用 Provider；软件自定义文字使用中文，外部标准称呼保持原样。

本任务只关闭 Milestone 2 的 DAG、输入输出和验收验证，不关闭 Plan Review 编辑/批准或 Milestone 2。

## 4. 非范围

- 任何 Provider 调用、DAG 自动修复、模型重写、重新规划或新增 JSON/Schema 修复次数；
- Plan 编辑、删除 Task、修改依赖、保存新 Plan version、批准、开始执行或旧 Plan supersede；
- Corporation 状态迁移、Organization、Agent Definition/Instance、Run、Scheduler 或 Artifact 实例；
- 真实 PolicyDecision、Approval、Workspace 文件访问、路径 canonicalization 或工具调用；
- 预算 reservation/ledger、Provider 费用估算或实际执行预算扣减；
- Evaluation evaluator、expected value、Judge、Evidence 实例或验收执行；
- Responses Adapter、streaming、Tool Call、RAG、附件或外部网络动作。

## 5. 依赖与接口

- 唯一跨模块合同为 Plan Validation/Planner/Task/Artifact Protocol 与 `packages/protocols` Schema；Renderer 不复制 DTO；
- 验证器输入只接受持久化后重新解析的 `PlannerDraftPublic` 语义投影、当前 APPROVED Goal budget 和同版本内置 catalog；
- 语义 draft hash 排除动态状态、report 和时间；相同 Plan/version/validator/hash 幂等；
- `TaskInputRef` 在计划期保存 Goal 或上游 Task logical output，Run 开始前才解析为精确 ArtifactRef；
- M2-TU-06 已分配的 Task UUID 必须原样复用；模型 local ID 不成为全局身份；
- `VALID` 事务写 Task/依赖/report/Plan 状态；`INVALID` 事务只写 report/Plan 状态；任一失败全部回滚；
- 后续 Plan Review 复用验证器，但拥有编辑、版本、批准和开始执行命令。

## 6. 交付物与所有权

- 专属修改区：Plan Validation Protocol/Schema/validator/repository、`0011_plan_validation.sql`、M2-TU-07 fixtures/tests；
- 共享冲突区：protocol/storage exports、Planner public Schema/repository/service、Main 启动恢复、Preload/Desktop API、Planner UI、Task/Artifact/Data/SQLite/Threat/UI 文档和 `PROJECT_STATUS.md`；
- `0001`–`0010`、Provider Adapter、Goal Engine、Key Vault、Corporation 状态机和已完成任务合同不得修改；
- 本任务串行拥有 Plan validation、首次正式 Task 物化和 Planner 验证状态；Plan Review 不得并行修改这些边界。

## 7. 验收合同

- [ ] 协议：Plan report、finding、正式 Task/Input/Output/Acceptance strict Schema 拒绝额外字段、非法 UUID/version/status/code/path/数量；
- [ ] 任务数量：1 和 20 个 Task 可验证；21 与 50 固定 INVALID；不得自动删除、合并或调用 Provider；
- [ ] 图：合法顺序/并行/单 Task 通过；重复 local ID、未知引用、自依赖、重复边和多种环安全失败；
- [ ] milestone：未知 Task 和跨 milestone 重复 Task 失败；未归 milestone 的 Task 不被伪造归属；
- [ ] 验收与叶子：每个 Task 必须有 REQUIRED criterion；叶子必须有 required output；证据标签受限、去重且不被当成输出引用或评价结论；
- [ ] 输入输出：TASK_OUTPUT 的 Task、logical name、media type 与依赖上游路径全部闭合；Goal 输入绑定当前 goalVersion；跨 Plan/Corporation 不可表达；
- [ ] 产物类型：四种允许 media type 精确映射到 TEXT/DOCUMENT/JSON/FILE；未知类型失败且不物化；
- [ ] 费用预算：Goal 有费用上限时缺 Task 上限、非整数/溢出或总和超限失败；等于上限通过；Goal 未设置时不伪造上限；
- [ ] 时长预算：使用 DAG 最长路径而非全图简单求和；缺上限、溢出和超限失败；并行分支及等于上限正确；
- [ ] 修订预算：全图 maxEvaluationRevisions 求和；缺上限和超限失败；Goal 未设置时只保留 Task Schema；
- [ ] 权限描述：未知 capability/tool/profile、绝对/盘符/UNC/`.`/`..`/NUL/反斜杠混淆路径失败；安全相对路径通过但 UI 不显示为已授权；
- [ ] 单 Run warning：固定 80%/10 项阈值稳定产生 warning，不阻止其他方面有效的 Plan，不显示为已证明可完成；
- [ ] INVALID 原子性：保存受限 report 与 `DRAFT/INVALID`，正式 task/task_dependency 为 0；故障注入不留下半份状态；
- [ ] VALID 原子性：复用可信 Task UUID，Task/依赖/contract/report 与 `VALIDATED/VALID` 同事务；合同逐字段映射且不创建 Artifact/Run/Agent/Approval；
- [ ] 幂等与竞态：相同 hash 重复验证不重复 Task/依赖/report 时间；Plan/Goal/draft/version 变化或并发验证条件失败且不覆盖新事实；
- [ ] 恢复：Planner 保存后自动验证；Renderer reload、应用重启和 SQLite 重开恢复同一结果；遗留 PENDING 只本地重试，不产生 model_call 或网络请求；
- [ ] UI：中文显示正在本地验证、固定问题、预算/权限/warning 与已验证事实；生成失败、取消或中断后可重新选择模型并明确重试，恢复页面不会自动调用 Provider；INVALID/VALID 都继续明确尚未组队、未批准、不可执行；键盘、焦点、1024×700、1440×900 和 200% 可完成；
- [ ] 安全：report、错误、日志、trace、截图和诊断不含 Goal/模型正文、绝对路径、Key、Authorization、SQL 或堆栈；路径攻击集通过；
- [ ] 治理：协议/设计/Schema/迁移/实现/测试一致；适用 `pnpm check`、开发态与最终包真实窗口、Windows/macOS CI、artifact 和人工 UI 验收通过；P0/P1 与未执行必检项为 0。

## 8. 隔离与干扰控制

- 每例使用 `M2-TU-07-<random>` userData/SQLite、Corporation/Goal/operation/plan/task ID 和自有时钟；
- fixture 自行创建 Workspace、Corporation、APPROVED Goal 和 `DRAFT/PENDING` Planner 草稿，不读取正式 userData、真实 Provider 或其他任务残留；
- 图 property tests 使用固定 seed 并在失败时输出 seed，不输出模型/Goal 正文；
- 路径攻击只验证字符串策略，不访问真实 Workspace；正式 Rust canonicalization 和 Policy 授权不在本任务伪测；
- Renderer reload、应用重启、SQLite 重开、开发态/最终包和 Windows/macOS 分别形成证据；
- 清理只删除已解析并确认位于任务临时根内的数据库、userData 和窗口产物；功能与清理结果分别报告。

## 9. 证据计划

- `pnpm check:status`、`pnpm check:task-units`、`pnpm check`、`git diff --check`；
- Protocol strict/攻击集、DAG property、预算最长路径、路径规则、media map、warning 和正式合同逐字段单元测试；
- `0011` 空库与 `0001`–`0010` 升级、STRICT/CHECK/FK、foreign key check、原子失败注入、幂等/竞态/恢复 Repository 测试；
- Main/Preload/Renderer 组件、键盘、axe、尺寸/缩放及开发态 Electron E2E；
- Windows/macOS 同提交 CI 的工程检查、开发态窗口、最终包构建、最终包复合矩阵和 artifact；
- 用户对当前 Windows 候选的人工 UI 验收。

## 10. 完成规则

只有 19 项验收断言逐项获得当前提交直接证据，Windows/macOS 当前提交 CI 与最终包成功，用户人工 UI 验收通过，资源清理通过，P0/P1 与未执行必检项为 0，才可标记完成。本任务通过只关闭 DAG/输入输出/验收验证，不代表 Plan Review、Organization、执行或 Milestone 2 完成。
