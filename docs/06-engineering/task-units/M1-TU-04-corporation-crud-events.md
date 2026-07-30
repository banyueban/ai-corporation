# M1-TU-04 Corporation CRUD 与事务事件

| 属性           | 值                                                                                   |
| -------------- | ------------------------------------------------------------------------------------ |
| 任务单元 ID    | M1-TU-04                                                                             |
| 状态           | 未开始                                                                               |
| 所属 Milestone | Milestone 1：本地项目骨架                                                            |
| 主要结果       | Corporation 可通过窄 IPC 创建、读取、重命名和归档，且每次命令与 Domain Event 原子提交 |
| 基线提交       | 合同审查提交后冻结                                                                   |

## 1. 需求与设计引用

- [MVP Plan：Milestone 1](../MVP-Plan.md)；
- [PRD FR-003、FR-011、FR-013](../../01-product/PRD.md)；
- [领域模型：Corporation、Event 与领域不变量](../../02-architecture/Domain-Model.md)；
- [Corporation Protocol](../../04-protocols/Corporation-Protocol.md)；
- [Event Protocol](../../04-protocols/Event-Protocol.md)；
- [数据模型](../../05-infrastructure/Data-Model.md)；
- [SQLite Schema](../../05-infrastructure/SQLite-Schema.md)；
- [Electron、TypeScript 与 Rust 工程架构](../../05-infrastructure/Desktop-and-Rust-Architecture.md)；
- [安全威胁模型 T-05、T-07、T-12](../Threat-Model.md)；
- [测试方案](../Testing-Strategy.md)。

## 2. 前置条件

实施就绪条件：

- `M1-TU-01` 至 `M1-TU-03` 已完成，Workspace 可信记录、重新验证 service、原生选择和公开 DTO 已冻结；
- Corporation v1 的 DTO、命令、幂等、乐观锁、归档规则、固定错误和事件 payload 已由 Corporation Protocol 定义；
- 仓库、`main`、Windows x64/macOS Apple Silicon CI 和 SQLite migration runner 可用；
- 基线提交、共享迁移编号、协议、Main/Preload 和数据库冲突区已确认；
- 本任务不依赖 Goal、Task、Provider 或 Corporation UI，可用独立可信 Workspace fixture 验收后端垂直切片。

验收环境条件：

- 每个测试使用带 `M1-TU-04` 和随机后缀的临时 SQLite、user data 与空 Workspace；
- 两个平台分别运行 migration、repository/service、开发态 Electron 公共 API 和最终打包应用 API E2E；
- 事务故障使用可控 fault fixture 注入在 Corporation、Event 和命令回执写入边界，不依赖磁盘损坏或杀死真实用户进程。

## 3. 包含范围

- Corporation Protocol strict runtime Schema 与公共导出；
- `0003` 迁移：
  - `corporation` 当前状态表；
  - append-only `domain_event` 表、索引和更新/删除拒绝；
  - 内部 `corporation_command` 幂等回执表；
  - 外键、状态、版本、归档形状和稳定列表索引；
- Corporation Repository：
  - 创建 DRAFT；
  - 按 ID 读取与按 Workspace 稳定列表；
  - 乐观锁重命名；
  - 仅终态归档；
  - 命令回执同请求重放与冲突检测；
- Corporation application service：
  - 创建前通过已冻结 Workspace service 重新验证；
  - 在可信 Main 生成 Corporation/Event UUID v7、UTC 时间和 actor；
  - 状态、事件、回执同一短事务；
  - 固定错误映射与公开投影；
- allowlisted Corporation Main/Preload IPC 与调用方、请求、响应 runtime 校验；
- migration、协议、事务、并发、幂等、安全、恢复和最终打包应用回归测试。

本任务完成 Milestone 1 的 Corporation 核心表、CRUD 后端和状态/Event 事务一致性基础。Goal、状态机、时间线和完整创建旅程仍由后续任务完成，因此不得关闭 Corporation 完整功能或 Milestone 1。

## 4. 非范围

- Dashboard/Create Corporation 表单、Corporation Workspace 页面或任何新 UI；
- Goal Contract 录入、Mock 生成、确认、版本化或 active Goal 指针变更；
- PLANNING 至 CANCELLED 的状态迁移、暂停/恢复、应用重启恢复；
- Task、Plan、Organization、Agent、Artifact、Evaluation 或预算表；
- Event Dispatcher、Renderer 订阅、cursor 补发或最小时间线；
- Corporation 删除、Workspace 更换、复制、导入/导出或跨设备同步；
- 工作区文件读写、目录创建、Tool/Policy/Approval；
- Provider、模型、密钥、签名、notarization 或发布级备份恢复。

`M1-TU-05` 只能消费本任务冻结的 Corporation ID、版本和公开命令，不能绕过 Repository 直接写 Corporation 或 Domain Event。`M1-TU-06` 独占状态机与恢复语义。

## 5. 依赖与接口

- Corporation Protocol 是 DTO、命令、错误、幂等和事件 payload 的唯一来源；
- Event Protocol 是事件信封、append-only 和 state + outbox 原子语义的唯一来源；
- Corporation 创建只接受公开 Workspace ID 与名称；canonical root、路径身份和权限判定仍属于 Workspace 可信边界；
- Workspace 必须在事务前重新验证为 `AVAILABLE`；事务内禁止 Native Core 或文件系统调用；
- create/update/archive 每个成功命令恰好产生一个同版本事件和一个回执；
- 同 command + 同规范化请求返回首次公开结果；同 command + 不同请求返回 `COMMAND_CONFLICT`；
- 所有可变写入使用 expected version 或新建语义；影响行数不符必须回滚；
- 归档只允许 `COMPLETED`、`FAILED`、`CANCELLED` → `ARCHIVED`，DRAFT 归档必须拒绝；
- 读取与列表不返回事件、命令回执、Policy 内部字段或 Workspace 敏感字段；
- migration `0001`/`0002` 不可修改，新增 `0003`；权威 Data Model 与 SQLite Schema 必须同步。

## 6. 交付物与所有权

专属修改区：

- Corporation Protocol、Schema、DTO、错误和测试；
- `0003_corporation_events.sql` 及 migration/constraint 测试；
- Corporation Repository、application service 和 fault fixture；
- Corporation IPC handler 与安全测试。

共享冲突区：

- 协议包公共导出；
- Data Model、SQLite Schema、Event Protocol；
- storage 数据库连接与公共导出；
- Electron Main/Preload 与 `DesktopApi`；
- Workspace service 调用；
- 开发态/最终打包应用 E2E、CI artifact；
- `PROJECT_STATUS.md`。

共享冲突区由本任务串行集成。相邻任务不得同时占用 `0003`、Corporation 状态、Domain Event 写入或 Main/Preload channel；接口变化必须先更新本合同并重新审查。

## 7. 验收合同

- [ ] 迁移：空库和仅含 `0001`/`0002` 的数据库均成功升级到 `0003`，checksum 锁定、foreign key check、表/索引/trigger 与权威 Schema 一致；
- [ ] 创建：AVAILABLE Workspace 上创建严格 DRAFT 记录，UUID v7、名称、版本与 UTC 时间正确，公开结果不含内部字段；
- [ ] Workspace 拒绝：不存在、MISSING、PERMISSION_DENIED、UNVERIFIED 或验证服务不可用时不创建 Corporation、事件或回执；
- [ ] 读取与列表：按 ID 读取和按 Workspace 的稳定排序、归档过滤正确，不跨 Workspace 返回记录；
- [ ] 更新：非归档 Corporation 可用 expected version 重命名；旧版本、非法名称和归档后更新均无部分写入；
- [ ] 归档：仅 COMPLETED/FAILED/CANCELLED 可归档，archivedAt/状态/版本一致；DRAFT 和其他非终态返回 `STATE_CONFLICT`；
- [ ] 原子事件：create/update/archive 的 Corporation、Domain Event 和命令回执全部提交或全部回滚，事件 aggregateVersion 等于提交后版本；
- [ ] 事件不可变：业务 API 与 SQLite trigger 均拒绝 Domain Event 更新/删除，失败不改变当前状态；
- [ ] 幂等：同 command 同请求重放返回首次结果且只有一个状态变化/事件/回执；同 command 不同请求返回 `COMMAND_CONFLICT`；
- [ ] 并发：两个相同 expected version 写入只有一个成功，失败方返回 `VERSION_CONFLICT` 且不覆盖成功结果；
- [ ] IPC 安全：非法来源、未知 channel、额外字段、伪造状态/事件/actor/版本和非法 UUID v7 均被拒绝；
- [ ] 字段边界：Renderer、DOM、错误、普通日志和公开 API 不含 canonical root、路径身份、SQL、命令 hash、回执或内部事件字段；
- [ ] 恢复：关闭并重开 SQLite 后 Corporation、版本、归档、事件和回执一致，重复命令仍幂等；
- [ ] E2E：开发态真实 Electron 窗口通过 typed API 完成 create → get/list → update → reload → restore；这只验收后端 API，不冒充尚未实现的 Corporation UI；
- [ ] 打包应用：Windows x64 与 macOS Apple Silicon 最终包完成同一 API 旅程、Native Core health 和临时数据清理；
- [ ] 回归：Workspace 选择/恢复、权限/路径攻击、Milestone 0 health、旧迁移和全部工程检查继续通过；
- [ ] 跨平台：同一验收提交的双平台 jobs 完成工程检查、开发态 E2E、最终包 E2E 和制品上传。

## 8. 隔离与干扰控制

- 每个用例自行迁移、建立 Workspace/Corporation、关闭数据库并清理，不依赖测试顺序；
- command ID、Corporation ID、Event ID、数据库和 user data 均由当前 fixture 独占；
- 并发测试使用可控 barrier，不用 sleep 推测提交顺序；
- fault fixture 分别在状态、事件、回执写入点失败，功能失败和回滚失败分别报告；
- 终态归档测试只由 repository fixture 建立合同允许的前置状态，不开放生产状态伪造 API；
- IPC handler 每例独立注册并移除，Electron/Native Core 子进程等待退出；
- 跨平台最终包只读写任务临时 user data 和 Workspace，不读取开发者或其他任务数据；
- artifact、截图、临时数据库和命令回执清理失败单独报告。

## 9. 证据计划

至少保存：

- Corporation Protocol strict Schema、错误、事件 payload 和额外字段拒绝测试；
- `0003` 空库/升级、checksum、foreign key、索引、约束与 append-only trigger 测试；
- Repository/service 正常、状态拒绝、乐观锁、幂等、fault rollback 和关闭重开摘要；
- IPC 来源、伪造字段与敏感信息泄露测试；
- 开发态和最终包 typed API create/update/reload/restore 旅程及临时资源清理结果；
- Windows x64 与 macOS Apple Silicon CI run/job 和 artifact；
- `pnpm check`、`pnpm check:status`、`pnpm check:task-units`、`git diff --check`；
- 验收提交完整 SHA。

Repository 单测、构建成功、进程存活、旧 Workspace E2E 或单平台结果不能替代事务事件、幂等、并发、恢复和最终包 API 旅程。

## 10. 完成规则

仅当第 7 节 17 项全部通过、证据对应同一提交、P0/P1 为 0、临时数据和进程已清理、权威协议/Schema/迁移/实现一致，且 `PROJECT_STATUS.md` 只记录当前事实时，才可标记“完成”。

本任务完成只证明 Corporation CRUD 后端、事务事件、幂等和公开 API 通过；不代表 Corporation 创建 UI、Goal、状态机、时间线、应用级恢复、Milestone 1 或发布候选完成。
