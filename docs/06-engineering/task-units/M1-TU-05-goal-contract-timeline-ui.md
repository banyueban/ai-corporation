# M1-TU-05 Goal Contract 版本与最小时间线 UI

| 属性 | 值 |
|---|---|
| 任务单元 ID | M1-TU-05 |
| 状态 | 完成 |
| 所属 Milestone | Milestone 1：本地项目骨架 |
| 主要结果 | 用户可创建 DRAFT Corporation，手工或 Mock 保存/确认版本化 Goal Contract，并查看最小真实时间线 |
| 基线提交 | `ebda8cf5b028c35f1d85a190c59ded14b5011637` |

## 1. 需求与设计引用

- [MVP Plan：Milestone 1](../MVP-Plan.md)
- [PRD FR-003、FR-004](../../01-product/PRD.md)
- [Domain Model](../../02-architecture/Domain-Model.md)
- [Corporation Protocol](../../04-protocols/Corporation-Protocol.md)
- [Goal Contract Protocol](../../04-protocols/Goal-Contract-Protocol.md)
- [Event Protocol](../../04-protocols/Event-Protocol.md)
- [Data Model](../../05-infrastructure/Data-Model.md)与[SQLite Schema](../../05-infrastructure/SQLite-Schema.md)
- [Core User Flow 02](../../07-ui/Core-User-Flows.md)
- [UI-03/UI-04 Wireframes](../../07-ui/Wireframes.md)
- [Screen State Matrix](../../07-ui/Screen-State-Matrix.md)
- [UI Acceptance](../../07-ui/UI-Acceptance.md)
- [Threat Model T-05、T-07](../Threat-Model.md)

## 2. 前置条件

- `M1-TU-01` 至 `M1-TU-04` 完成，Workspace、Corporation CRUD、事务事件、命令幂等和 typed IPC 已冻结；
- `0004`、Goal/Corporation/Event/Preload/Renderer 共享冲突区无人并行占用；
- 不依赖 Provider、Task、Plan、Organization 或状态机；
- Windows x64 与 macOS Apple Silicon 可运行开发态和最终包真实窗口 E2E。

## 3. 包含范围

- Goal Contract strict Schema、DTO、固定错误、命令和查询；
- `0004_goal_contract.sql`：`active_goal_version`、不可变内容版本、状态约束、Goal command 回执、索引与 trigger；
- save/get/list/approve Repository 与 application service；
- Corporation + Goal + Domain Event + receipt 的短事务、幂等和乐观锁；
- 最小、分页、脱敏的 Corporation timeline 查询；
- allowlisted Main/Preload API；
- Dashboard/Create/Goal Review 用户旅程：选择 AVAILABLE Workspace，输入 Corporation/Goal，手工或 Mock 保存，审阅/确认高影响假设并 approve，查看版本/时间线，reload 后恢复；
- clean、dirty、saving、error、version conflict、assumption required 和 restored 状态；
- 键盘、焦点、200% 缩放、1024 × 700/1440 × 900、axe、双平台最终包 E2E。

## 4. 非范围

- Provider、真实模型、网络调用和结构化澄清循环；
- Task Graph、Plan Review、Organization、Agent 或启动执行；
- Corporation PLANNING/EXECUTING 等状态迁移、暂停/恢复/取消；
- Budget Ledger、事件订阅/实时推送、完整诊断时间线和 10,000 条性能目标；
- Goal 删除、跨设备同步和 Workspace 文件读写。

Review 主操作使用“确认目标合同”，不得使用“确认并规划/开始执行”。UI-AC-02 本任务只覆盖步骤 1–4，不冒充步骤 5–6或完整场景通过。

## 5. 依赖与接口

- Goal Contract Protocol 是 DTO、版本、错误、Mock 和时间线投影的唯一来源；
- Corporation Protocol 的 ID、状态、version 和命令边界保持兼容；
- Event Protocol 继续定义 append-only 事实事件；
- migration `0001`–`0003` 不可修改，只新增 `0004`；
- Workspace 只使用公开 ID/display/permission/access；
- Corporation create 与 Goal save 是两个独立事务；前者成功而后者失败时保留已创建的 DRAFT Corporation 与 Goal 表单输入，重新读取版本后重试，不执行隐式补偿删除或重复创建；

## 6. 交付物与所有权

- 专属修改区：Goal 协议/Schema、`0004`、Goal Repository/service/tests、Goal UI 状态组件；
- 共享冲突区：exports、Corporation repository、Data Model/SQLite Schema/Event Protocol、Main/Preload/DesktopApi、Dashboard/Create UI、E2E/CI、`PROJECT_STATUS.md`；
- 共享冲突区由本任务串行集成，相邻任务不得同时修改 Goal 版本、active pointer、Goal events 或相关 IPC。

## 7. 验收合同

- [x] 迁移：空库与 `0001`–`0003` 库均升级到 `0004`，checksum、FK、表/索引/trigger 与权威 Schema 一致；
- [x] Schema：Goal DTO/命令严格拒绝额外字段、非法 UUID/版本、控制字符、重复/超长列表和错误 approved 形状；
- [x] 创建旅程：AVAILABLE Workspace 上从真实 UI 创建 DRAFT Corporation 并保存 Goal v1；Goal 保存失败时明确显示已创建 Corporation、保留可恢复输入且不重复创建；
- [x] 拒绝：不可用 Workspace、不存在/非 DRAFT/ARCHIVED Corporation 均无 Goal、事件或回执部分写入；
- [x] 版本：后续保存创建新不可变内容版本，旧的当前 DRAFT 或 APPROVED 变 SUPERSEDED，active pointer、Corporation version 和排序一致；
- [x] Mock：本地确定性 Mock 不调用网络/Provider，不猜测隐藏事实，相同输入产生相同规范化内容；
- [x] 确认：仅当前 DRAFT 可 approve，所有 HIGH 假设必须确认；Corporation 保持 DRAFT 且版本递增；
- [x] 原子性：save/approve 的 Corporation、Goal、Event、receipt 全部提交或全部回滚，fault fixture 覆盖写入边界；
- [x] 幂等与并发：同 command 重放不重复版本/事件；冲突复用拒绝；双连接 barrier 下相同 expected version 仅一方成功；
- [x] 时间线：只返回目标 Corporation 的 allowlisted 脱敏事实，canonical cursor 稳定分页无重复/遗漏，非法/跨 Corporation cursor 拒绝且不泄露 payload/actor/correlation/内部字段；
- [x] IPC 安全：非法来源、未知 channel、额外/伪造字段和非法标识均固定拒绝；
- [x] UI 状态：clean/dirty/saving/error/conflict/assumption-required/restored 由真实状态驱动，重复提交与迟到响应受控；
- [x] UI 可访问性：纯键盘完成创建与确认，焦点/错误关联/对比度/reduced motion/axe 严重关键项通过；
- [x] 响应布局：200% 缩放、1024 × 700、1440 × 900 可完成核心旅程，长内容不隐藏主操作；
- [x] 恢复：Renderer reload 与 SQLite 重开后 Corporation、Goal 当前/历史版本、确认、事件和回执一致；
- [x] 开发态 E2E：真实 Electron 窗口完成 Workspace → Corporation/Goal → Review/approve → timeline → reload/restore；
- [x] 最终包与跨平台：同一提交的 Windows/macOS 工程检查、开发态 E2E、最终包 E2E、清理和 artifact 上传通过；
- [x] 回归：M1-TU-01 至 M1-TU-04、安全路径、旧迁移、Native Core health 和全部工程检查继续通过。

## 8. 隔离与干扰控制

- 每例使用独立 `M1-TU-05` 临时 DB、user data、Workspace、command/Goal/Event ID；
- 并发使用 barrier，不用 sleep 推测顺序；
- fault fixture 分别注入 Corporation pointer、Goal row/status、Event 和 receipt 边界；
- UI 网络监控断言 Mock 旅程无 Provider/外部请求；
- 每例独立注册/移除 IPC，Electron/Native Core 子进程等待退出；
- 截图、artifact、临时资源清理失败单独报告。

## 9. 证据计划

保存协议、迁移、事务/幂等/并发/恢复、timeline 脱敏、UI 状态/可访问性、开发态/最终包 E2E、双平台 run/job/artifact、`pnpm check`、治理检查、`git diff --check` 和验收提交 SHA。

## 10. 完成规则

只有 18 项全部通过、同一验收提交证据齐全、P0/P1 为 0 且临时资源清理后才可标记完成。本任务只关闭 Goal Contract 与最小时间线用户切片，不代表 Plan、状态机、完整 UI-AC-02、Milestone 1 或发布完成。
