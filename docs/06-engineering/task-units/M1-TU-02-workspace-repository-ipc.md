# M1-TU-02 Workspace Repository、IPC 与权限重新验证

| 属性           | 值                                                                                     |
| -------------- | -------------------------------------------------------------------------------------- |
| 任务单元 ID    | M1-TU-02                                                                               |
| 状态           | 完成                                                                                   |
| 所属 Milestone | Milestone 1：本地项目骨架                                                              |
| 主要结果       | 已授权 Workspace 可持久化恢复，并通过窄 IPC 返回重新验证后的公开权限状态               |
| 基线提交       | `274f41d993eeb09fab5a2166a48cad9ae2cc67f5`                                             |

## 1. 需求与设计引用

- [MVP Plan：Milestone 1](../MVP-Plan.md)；
- [PRD FR-001](../../01-product/PRD.md)；
- [领域模型与术语](../../02-architecture/Domain-Model.md)；
- [Workspace Protocol](../../04-protocols/Workspace-Protocol.md)；
- [数据模型](../../05-infrastructure/Data-Model.md)；
- [SQLite Schema](../../05-infrastructure/SQLite-Schema.md)；
- [Electron、TypeScript 与 Rust 工程架构](../../05-infrastructure/Desktop-and-Rust-Architecture.md)；
- [安全威胁模型 T-02、T-07](../Threat-Model.md)；
- [测试方案](../Testing-Strategy.md)。

## 2. 前置条件

实施就绪条件：

- `M1-TU-01` 已完成，Workspace v1 DTO、可信记录、SQLite 表和 `workspace.canonicalize` 接口已冻结；
- 仓库 `banyueban/ai-corporation`、`main` 分支和 Windows x64/macOS Apple Silicon CI 可用；
- 基线提交已记录，工作区中的已有修改和共享冲突区占用已检查；
- Repository、重新验证、身份变化、IPC 成功/失败联合和 Renderer 字段边界已由 Workspace Protocol 定义；
- 本任务不依赖原生目录选择器或 Workspace UI，可通过可信服务 fixture 建立已授权记录。

验收环境条件：

- 本地使用独立临时 SQLite 文件和临时 Workspace 根；
- Windows x64 与 macOS Apple Silicon 分别执行真实权限、身份和路径验证；
- Electron IPC 集成测试使用独立窗口/调用方 fixture，不复用开发态应用残留进程。

## 3. 包含范围

- `@ai-corporation/storage` 中的 Workspace Repository：
  - 保存可信授权记录；
  - 按 ID 读取可信记录；
  - 稳定排序列出 Renderer 公开投影；
  - 原子更新单个 Workspace 的权限、访问状态和验证时间；
  - 关闭并重新打开数据库后恢复已提交记录；
- Electron Main 中的 Workspace application service：
  - 接收未来原生选择流程提供的可信授权结果并持久化；
  - 使用已保存的 canonical root 调用 Native Core 重新验证；
  - 比较已保存与当前 `pathIdentity`，身份变化时置 `UNVERIFIED` 且不覆盖原授权；
  - 将缺失、权限拒绝和 Native Core 不可用映射为协议规定的状态或安全错误；
- Native Core 权限探测：
  - 在 canonical root 内读取目录并使用不可预测、独占创建、立即清理的写探针判断 `READ_ONLY`/`READ_WRITE`；
  - 探针创建失败与清理失败返回可区分的稳定内部结果，不泄露探针路径；
- typed preload 与 Electron Main IPC：
  - `workspace:list`；
  - `workspace:revalidate`；
  - 调用方来源、请求和响应 runtime Schema 校验；
- Repository、service、RPC/IPC 兼容、安全、恢复和双平台权限测试。

本任务覆盖 Milestone 1 的 Workspace 持久化、Repository/IPC 和权限重新验证基础。原生选择与展示由后续任务完成；Corporation、Goal、Event 和恢复状态机仍未覆盖，因此本任务不得关闭完整 Workspace 功能或 Milestone 1。

## 4. 非范围

- 原生目录选择器和操作系统授权对话框；
- Workspace 选择、列表或错误状态的 Renderer UI；
- 用户可见首次配置、重载和打包应用 Workspace E2E；
- 修改或删除已有 Workspace 授权；
- 自动接受身份变化后的新目录；
- 文件读取、搜索、写入、Change Set 和任意路径型 Renderer IPC；
- Corporation CRUD、Goal Contract、Domain Event 和暂停/恢复状态机；
- 数据库备份/恢复产品流程；
- Provider、模型调用、Tool Runtime、Policy Engine、签名和 notarization。

后续 `M1-TU-03` 只能调用本单元冻结的可信授权 service 和公开 IPC，不得把路径、身份或权限判定下放给 Renderer。

## 5. 依赖与接口

- Workspace Protocol 是公开 DTO、可信记录、重新验证语义、IPC channel 和安全错误的唯一来源；
- Repository 接收和返回可信记录，但公开列表必须在可信边界内投影并通过 `workspacePublicSchema`；
- 新授权只接受 Native Core 已 canonicalize 的结果；Renderer 不能通过本单元创建或修改授权；
- `workspace:revalidate` 请求只能包含 Workspace ID，canonical root 和身份从 Repository 读取；
- 当前身份与保存身份不一致时只写入 `UNVERIFIED` 和验证时间，不覆盖原 canonical root 或身份；
- `MISSING`、`PERMISSION_DENIED` 是已持久化的可观察状态，不通过异常字符串传递；
- Native Core、数据库或未知验证失败使用固定 IPC 错误联合，错误正文不得包含路径、身份、SQL 或文件内容；
- 每次重新验证只允许更新目标 Workspace，事务失败时保留调用前记录。

## 6. 交付物与所有权

专属修改区：

- Workspace Repository、数据库打开/关闭与 Repository 测试；
- Workspace application service、重新验证映射和独立 service fixture；
- Workspace IPC Schema、typed preload API 和 IPC 安全测试；
- Native Core Client 的 Workspace 请求支持；
- Rust 权限探测及 Windows/macOS fixture。

共享冲突区：

- Workspace Protocol v1；
- 协议包公共导出；
- Electron Main/Preload 注册与 `DesktopApi`；
- Native Core RPC envelope；
- SQLite 连接生命周期；
- CI workflow；
- `PROJECT_STATUS.md`。

共享冲突区由本任务串行集成。其他任务若需修改相同 IPC、数据库生命周期、协议或 RPC envelope，必须等待本任务接口冻结或重新建立基线。

## 7. 验收合同

- [x] Repository 正常：可信授权写入后可按 ID 读取，并以稳定顺序返回严格的 `WorkspacePublic[]`；
- [x] Repository 恢复：关闭并重新打开独立 SQLite 文件后，已提交 Workspace 保持一致且 migration checksum 仍有效；
- [x] Repository 隔离：更新一个 Workspace 的验证状态不改变其他 Workspace，事务失败不产生部分更新；
- [x] IPC 正常：授权窗口可通过 `workspace:list` 和 `workspace:revalidate` 获得 runtime Schema 验证后的公开 DTO；
- [x] IPC 越权：非法窗口来源、额外请求字段、非 UUID v7 ID 和未知 channel 被拒绝；
- [x] 字段边界：Renderer API、IPC 成功值、失败值和日志均不包含 canonical root、路径身份、SQL 或用户文件内容；
- [x] 权限：Windows 与 macOS 上真实可写根返回 `READ_WRITE`，可读但写探针被拒绝时返回 `READ_ONLY`，根不可读时持久化为 `PERMISSION_DENIED`；
- [x] 身份变化：替换根目录或身份不匹配后状态为 `UNVERIFIED`，原 canonical root 与 `pathIdentity` 不被覆盖；
- [x] 状态：根缺失持久化为 `MISSING`，权限拒绝持久化为 `PERMISSION_DENIED`，Native Core/存储不可用返回固定安全错误；
- [x] 探针清理：权限探针正常和失败路径均无残留；创建失败与清理失败分别断言；
- [x] 回归：M1-TU-01 路径攻击、Milestone 0 health、SQLite migration runner、协议兼容和工程检查继续通过；
- [x] 跨平台：同一验收提交的 Windows x64 与 macOS Apple Silicon CI job 均通过适用 Repository、权限、IPC 和回归测试。

## 8. 隔离与干扰控制

- 每个测试使用带 `M1-TU-02` 和随机标识的临时数据库、Workspace 根和权限探针名；
- Repository 测试自行迁移、建数、关闭连接并清理，不依赖测试顺序或其他任务数据库；
- 权限测试只操作任务专属临时根，不修改用户真实项目或全局 ACL；
- Windows 与 macOS 使用各自真实文件系统权限/身份 fixture，不用字符串或 mock 代替平台断言；
- IPC 测试为每个用例创建独立调用方身份，结束后移除 handler 并关闭资源；
- Native Core 子进程由 fixture 独占，等待退出后再清理；
- 功能失败、事务回滚失败、探针清理失败和 fixture 清理失败分别报告。

## 9. 证据计划

至少保存：

- Workspace Protocol/IPC runtime Schema 测试摘要；
- Repository 空库迁移、CRUD 边界、事务隔离和关闭/重开测试摘要；
- Workspace service 正常、缺失、拒绝、身份变化和不可用测试摘要；
- Electron IPC 来源与字段泄露攻击测试摘要；
- Rust 权限探针和 M1-TU-01 路径边界回归摘要；
- Windows x64 与 macOS Apple Silicon CI run/job；
- `pnpm check`、`pnpm check:status`、`pnpm check:task-units` 和 `git diff --check`；
- 验收提交完整 SHA。

构建成功、进程存活、旧任务证据或单平台结果不能代替本合同的 Repository、IPC、恢复、权限和身份变化断言。

## 10. 完成规则

仅当第 7 节全部适用条目通过、证据对应同一验收提交、P0/P1 为 0、探针和测试资源已清理、共享接口回归通过，且 `PROJECT_STATUS.md` 只记录本任务真实状态时，才可标记“完成”。

本任务完成只证明 Workspace Repository、窄 IPC、持久化恢复和权限重新验证基础通过；不代表原生目录选择或 Renderer 展示完成，不代表 Corporation、Goal、恢复状态机、Milestone 1 或发布候选完成。
