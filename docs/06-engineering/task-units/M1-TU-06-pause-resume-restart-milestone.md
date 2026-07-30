# M1-TU-06 暂停/继续、重启恢复与 Milestone 1 演示

| 属性 | 值 |
|---|---|
| 任务单元 ID | M1-TU-06 |
| 状态 | 进行中 |
| 所属 Milestone | Milestone 1：本地项目骨架 |
| 主要结果 | 用户可暂停并继续本地 Corporation，重启应用后从持久化状态恢复，且不重复已提交状态、事件或命令副作用 |
| 基线提交 | `b31784c72e8876d294cd0d30b39e3e3c44dcec98` |

## 1. 需求与设计引用

- [MVP Plan：Milestone 1](../MVP-Plan.md)
- [PRD FR-003、FR-013 与 AC-01](../../01-product/PRD.md)
- [Domain Model：Corporation 生命周期与 Event](../../02-architecture/Domain-Model.md)
- [Corporation Protocol](../../04-protocols/Corporation-Protocol.md)
- [Corporation State Protocol](../../04-protocols/Corporation-State-Protocol.md)
- [Goal Contract Protocol](../../04-protocols/Goal-Contract-Protocol.md)
- [Event Protocol](../../04-protocols/Event-Protocol.md)
- [Data Model](../../05-infrastructure/Data-Model.md)与[SQLite Schema](../../05-infrastructure/SQLite-Schema.md)
- [Core User Flow 04、07](../../07-ui/Core-User-Flows.md)
- [Screen State Matrix：Dashboard、Corporation Workspace](../../07-ui/Screen-State-Matrix.md)
- [UI Acceptance：UI-AC-03、UI-AC-06 的 Milestone 1 适用子集](../../07-ui/UI-Acceptance.md)
- [Threat Model T-07](../Threat-Model.md)

## 2. 前置条件

- `M1-TU-01` 至 `M1-TU-05` 完成，Workspace、Corporation、Goal、Event、命令幂等和真实 UI 恢复接口已冻结；
- 基线 `b31784c72e8876d294cd0d30b39e3e3c44dcec98` 已推送，工作区无未识别修改；
- `0005`、Corporation 状态协议/Repository、Event allowlist、Main/Preload、Dashboard/Review、E2E/CI 和 `PROJECT_STATUS.md` 由本任务串行占用；
- Windows x64 与 macOS Apple Silicon 可执行开发态和最终包真实窗口 E2E；
- 本任务不依赖 Provider、Plan、Task、Agent Run、Tool、Artifact 或 Scheduler。

## 3. 包含范围

- 新增 Corporation 状态协议：strict pause/resume 命令、固定错误、公开暂停来源/时间和 allowlisted IPC；
- `0005_corporation_pause_resume.sql`：暂停来源/时间、状态命令回执、paused/resumed 事件与物理约束；
- `DRAFT`、`PLANNING`、`ORGANIZING`、`EXECUTING`、`VERIFYING`、`WAITING_HUMAN` 可暂停为 `PAUSED`；继续时精确回到持久化的来源状态；
- `PAUSING` 只作为 IPC pending 的 Renderer 过渡状态，不写入领域状态或 SQLite；
- pause/resume 的 Corporation、Domain Event 和命令回执短事务、幂等、乐观锁、并发和 fault rollback；
- Dashboard/Goal Review 展示真实状态、暂停来源/时间、暂停与继续操作、pending/error/conflict/restored 状态；
- Renderer reload、应用进程重启与 SQLite 重开后保持 Workspace、Corporation、Goal、暂停元数据、事件和回执一致；
- Milestone 1 最终演示：选择 Workspace → 创建 Corporation → 保存/确认 Goal → 暂停 → 重启应用 → 恢复 → 继续；
- Windows/macOS 开发态与最终包真实窗口 E2E、响应布局、键盘、axe、清理和 artifacts。

## 4. 非范围

- 进入 `PLANNING`、生成 Plan/Task Graph、开始执行或真实模型调用；
- Task/Agent Run/Tool/Artifact 的检查点、租约、进程终止或未知外部副作用裁决；
- 取消、失败、完成、归档以外的新状态迁移；
- 自动暂停活跃执行、恢复扫描器、阻断式未知副作用 Recovery Detail 和完整 UI-AC-03/UI-AC-06；
- Provider、预算、审批、事件订阅、文件写入或网络调用；
- Milestone 2 及 Milestone 5 的执行恢复语义。

本任务中的“安全”只指当前 Milestone 已存在的本地 SQLite 状态、Goal、Event 和命令回执：暂停、继续或重启不得重复已提交事务。没有 Task/Run/Tool 时不得用测试假数据冒充外部副作用恢复已完成。

## 5. 依赖与接口

- Corporation 状态协议是 pause/resume DTO、状态转换、错误和公开暂停元数据的唯一来源；
- `CorporationPublic` 在 `status === "PAUSED"` 时必须同时提供 `pausedFrom` 与 `pausedAt`，其他状态不得提供；
- pause 请求包含 `schemaVersion`、`commandId`、`corporationId`、`expectedVersion`；暂停原因固定为可信 Main 生成的 `USER`，Renderer 不提供 actor、目标状态或时间；
- resume 请求字段相同；目标状态只能读取持久化 `pausedFrom`，不得由 Renderer 指定；
- pause 成功写 `corporation.paused`，resume 成功写 `corporation.resumed`；事件 `aggregateVersion` 等于提交后的 Corporation version；
- 同 command + 同规范化请求返回首次公开结果；同 command + 不同请求拒绝；旧 expected version 无写入；
- Workspace 不存在或不为 `AVAILABLE`、终态/ARCHIVED pause、非 `PAUSED` resume、暂停元数据损坏均固定拒绝；
- pause/resume 事务内不得调用文件系统、Native Core、模型、工具或网络；
- 应用启动只读取并显示持久化状态，不自动 resume、不生成事件、不重放命令。

## 6. 交付物与所有权

- 专属修改区：Corporation 状态协议/测试、`0005`、状态 Repository/service/tests、暂停/继续 UI 状态；
- 共享冲突区：Corporation/Event exports 与权威文档、Data Model/SQLite Schema、Main/Preload/DesktopApi、Dashboard/Review、E2E/CI、`PROJECT_STATUS.md`；
- `0001`–`0004` 不可修改；`corporation_command` 的既有语义不改，pause/resume 使用独立状态命令回执；
- 共享冲突区由本任务串行集成，相邻任务不得同时改变 Corporation 状态、版本、事件或恢复行为。

## 7. 验收合同

- [ ] 协议：pause/resume 请求和公开暂停形状严格拒绝额外字段、非法 UUID/版本、非法状态组合与 Renderer 伪造目标/原因/时间；
- [ ] 迁移：空库与 `0001`–`0004` 库均升级到 `0005`，checksum、FK、CHECK、索引、trigger 和权威 Schema 一致，旧 Corporation/Goal/Event 不变；
- [ ] 状态机：六个允许来源均可 pause，resume 精确返回 `pausedFrom`；终态、ARCHIVED、重复新命令、错误来源和损坏元数据拒绝；
- [ ] Workspace 门禁：不存在、MISSING、PERMISSION_DENIED 或 UNVERIFIED Workspace 不允许 pause/resume，且无部分写入；
- [ ] 原子性：pause/resume 的 Corporation、Event、receipt 全部提交或全部回滚，fault fixture 覆盖三个写入边界；
- [ ] 幂等与并发：同 command 重放不重复版本/事件；冲突复用拒绝；双连接 barrier 下同 expected version 仅一方成功；
- [ ] 事件与时间线：paused/resumed 事实 append-only、同版本、脱敏且按 canonical cursor 可恢复，不泄露内部暂停字段或回执；
- [ ] IPC 安全：非法来源、未知 channel、额外/伪造字段和非法标识固定拒绝；Preload 只暴露 allowlist；
- [ ] UI 状态：真实 DRAFT/PAUSING/PAUSED/restored/error/conflict 驱动展示，pending 禁止重复提交，迟到响应不覆盖新版本；
- [ ] UI 语义：暂停页明确“没有开始 Plan/Task/执行”，继续只恢复暂停前状态，不暗示外部副作用已检查或执行已开始；
- [ ] UI 可访问性与布局：纯键盘完成暂停/继续，焦点、错误关联、reduced motion、axe 严重关键项、200%、1024 × 700 与 1440 × 900 通过；
- [ ] 重启恢复：PAUSED 与 DRAFT 在 Renderer reload、应用进程重启和 SQLite 重开后精确恢复；启动不自动 resume、不新增事件/回执；
- [ ] Milestone 演示：真实窗口完成 Workspace → Corporation → Goal → pause → 应用重启 → restore → resume，Goal/版本/时间线与 Workspace 均保留；
- [ ] 最终包与跨平台：同一提交的 Windows/macOS 工程检查、开发态 E2E、最终包 E2E、清理和 artifact 上传通过；
- [ ] 回归与 L3：`M1-TU-01` 至 `M1-TU-05`、工作区外路径拒绝、旧迁移、Native Core health 全部通过；Milestone 1 交付物、演示和退出条件逐项审查通过，P0/P1 为 0。

## 8. 隔离与干扰控制

- 每例使用独立 `M1-TU-06` 临时 DB、user data、Workspace、command/event ID；
- 状态来源 fixture 直接写独立测试 DB，不通过生产通用状态更新接口；
- 并发使用 barrier，不用 sleep 推测顺序；
- fault fixture 分别注入 Corporation、Event 和 receipt 边界；
- 重启测试复用本例 user data，但在断言前后记录事件/回执数量，证明启动只读；
- 每例独立注册/移除 IPC，Electron/Native Core 子进程等待退出；
- 截图、artifact、临时资源清理失败单独报告，不用功能成功掩盖。

## 9. 证据计划

- `pnpm check:status`、`pnpm check:task-units`、`pnpm check`、`git diff --check`；
- 协议、空库/升级迁移、状态转换矩阵、事务 fault、幂等/并发、恢复和 timeline 脱敏测试；
- 开发态真实 Electron 窗口的暂停/应用重启/继续全旅程、键盘、axe、网络 0、三种布局截图；
- Windows/macOS 同一提交的最终包真实窗口 Milestone 演示、清理结果、run/job/artifact ID；
- Milestone 1 L3 逐项映射到 `M1-TU-01` 至 `M1-TU-06` 和最终演示的当前证据。

## 10. 完成规则

只有 15 项全部通过、同一验收提交证据齐全、P0/P1 为 0、未执行必检项为 0 且临时资源清理后才可标记本任务完成。随后还必须单独执行 Milestone 1 L3 关闭与阶段复盘；本任务不代表 Provider、Plan、Task、Agent、Tool、未知副作用恢复、完整 UI-AC-03/UI-AC-06、Milestone 2 或发布完成。
