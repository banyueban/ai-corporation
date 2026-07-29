# M1-TU-01 Workspace 路径边界基础

| 属性           | 值                                                                  |
| -------------- | ------------------------------------------------------------------- |
| 任务单元 ID    | M1-TU-01                                                            |
| 状态           | 就绪                                                                |
| 所属 Milestone | Milestone 1：本地项目骨架                                           |
| 主要结果       | 冻结 Workspace 数据合同，并由 Rust 在独立测试中可靠拒绝工作区外路径 |
| 基线提交       | `f1ae2096ed3fc96e86f2019e051f0c01b28d25eb`                          |

## 1. 需求与设计引用

- [MVP Plan：Milestone 1](../MVP-Plan.md)；
- [PRD FR-001](../../01-product/PRD.md)；
- [领域模型与术语](../../02-architecture/Domain-Model.md)；
- [数据模型](../../05-infrastructure/Data-Model.md)；
- [SQLite Schema](../../05-infrastructure/SQLite-Schema.md)；
- [Electron、TypeScript 与 Rust 工程架构](../../05-infrastructure/Desktop-and-Rust-Architecture.md)；
- [安全威胁模型](../Threat-Model.md)。

## 2. 前置条件

实施就绪条件：

- Milestone 0 的 Rust Sidecar、协议包、SQLite migration runner 和跨平台 CI 基线仍通过；
- Workspace DTO、路径字段和结构化错误在上述设计文档中无歧义；
- 实施前记录完整基线提交并检查用户或其他任务的未提交改动；
- 本任务专属修改区和共享迁移/RPC 冲突区无人并发占用。

验收环境条件：

- Windows x64 与 macOS Apple Silicon CI 可运行；
- 无法在当前平台执行的另一平台断言必须由对应 CI job 提供直接证据。

## 3. 包含范围

- Workspace DTO 与运行时 Schema：
  - Renderer 可见：`workspaceId`、`displayPath`、`permissionMode`、`accessStatus`；
  - 可信边界专用：`canonicalRootPath`、`pathIdentity`、`lastVerifiedAt`；
- Workspace SQLite migration 与约束，不实现完整 Repository CRUD；
- Rust canonical path 解析、平台路径身份和工作区内/外边界判定；
- `..`、外部绝对路径、盘符/卷越界、符号链接和 Windows 重解析点防护；
- 工作区不存在、权限拒绝和无效路径的结构化错误；
- 独立 Rust、Schema、migration 和安全测试。

## 4. 非范围

- 原生目录选择器；
- Renderer、Preload 与 Electron Main 的 Workspace 业务 IPC；
- Workspace Repository CRUD 和应用重启恢复；
- Workspace 选择 UI、页面状态和 Electron E2E；
- Corporation CRUD、Goal Contract 和 Domain Event 时间线；
- `workspace.list`、`read_text`、`search`、写入和 Change Set；
- Provider、模型调用、Tool Runtime 和 Policy Engine；
- 安装包签名与 macOS notarization。

后续建议顺序是“Workspace Repository 与 IPC”再到“目录选择 UI 与跨平台 E2E”。前一单元接口冻结并验收前，不建立后续就绪合同。

本任务只覆盖 Milestone 1 中 Workspace 选择与权限的路径/Schema 基础、SQLite Workspace 部分，以及“工作区外路径被 Rust 拒绝”验收；完整用户选择、持久化恢复和其他核心表仍由后续任务完成，不得据此关闭整个 Milestone 1。

## 5. 依赖与接口

- 协议层是 Workspace DTO、枚举和结构化错误的唯一来源；
- Rust 接收可信进程传入的授权根和候选相对路径，返回规范化边界结果，不承载 Corporation 业务；
- `displayPath` 仅表示用户主动授权、允许展示的路径，不参与安全判断；
- `canonicalRootPath` 和 `pathIdentity` 不得进入 Renderer DTO、普通日志或错误消息；
- SQLite 保存授权边界所需元数据，不把原始数据库行暴露给 Renderer；
- 后续单元只能依赖本单元冻结的 Workspace ID、权限状态、访问状态和路径边界接口。

## 6. 交付物与所有权

专属修改区：

- Workspace 协议类型、运行时 Schema 和兼容测试；
- Workspace SQLite migration 及迁移测试；
- Rust workspace path boundary 模块与安全测试；
- 本任务专属路径 fixture。

共享冲突区：

- SQLite migration 编号；
- Rust RPC envelope；
- 协议包公共导出；
- CI workflow；
- `PROJECT_STATUS.md`。

共享冲突区由本任务串行修改；其他任务需要同时修改时，必须先冻结接口或暂停其中一个任务。

## 7. 验收合同

- [ ] Schema：Renderer DTO 不包含 `canonicalRootPath`、`pathIdentity` 或任意文件系统能力；
- [ ] Migration：空库可迁移到 Workspace Schema，约束、回滚和迁移校验通过；
- [ ] 正常：工作区内相对路径被规范化并允许；
- [ ] 越界：`..`、外部绝对路径和盘符/卷越界被 Rust 拒绝；
- [ ] 链接：指向工作区外的符号链接或 Windows 重解析点被拒绝；
- [ ] 状态：目录不存在、权限拒绝和无效路径返回稳定结构化错误；
- [ ] 隐私：错误和日志不包含 `canonicalRootPath`、路径身份元数据或用户文件内容；
- [ ] 隔离：测试使用专属临时目录和数据库，不依赖执行顺序或用户真实目录；
- [ ] 跨平台：Windows x64 与 macOS Apple Silicon 的适用路径边界测试均通过；
- [ ] 回归：Milestone 0 health、协议兼容、SQLite migration runner 和工程检查继续通过。

## 8. 隔离与干扰控制

- 每个测试创建独立临时根目录、外部目录、链接 fixture 和 SQLite 数据库；
- Windows 与 macOS 平台 fixture 分开，不能用字符串替代真实文件系统断言；
- 测试不得读取或写入用户真实项目目录；
- 测试结束后先关闭数据库和文件句柄，再清理临时资源；
- 功能断言失败和清理失败分别报告；
- 不使用其他任务生成的数据库、端口、缓存或进程作为本任务证据。

## 9. 证据计划

至少保存：

- Workspace Schema/协议测试报告；
- SQLite migration 测试报告；
- Rust 路径边界和安全测试报告；
- Windows x64 与 macOS Apple Silicon 对应 CI job；
- `pnpm check` 与适用的 Rust 检查结果；
- 验收提交完整 SHA。

每条证据必须直接对应第 7 节断言；构建成功不能替代真实路径边界测试。

## 10. 完成规则

仅当第 7 节全部适用条目通过、证据对应同一验收提交、P0/P1 为 0、共享接口回归通过且 `PROJECT_STATUS.md` 只更新本任务真实状态时，才可标记“完成”。

本任务完成只证明工作区外路径拒绝及其 Workspace/SQLite 基础已通过；不代表完整 Workspace 选择、SQLite 核心表、IPC、Repository、UI、Corporation CRUD 或 Milestone 1 完成。
