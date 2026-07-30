# AI Corporation Desktop 项目进度

| 属性           | 当前值                                    |
| -------------- | ----------------------------------------- |
| 当前产品版本   | v0.1 MVP                                  |
| 当前阶段       | Milestone 1 第三个任务单元合同审查中      |
| 当前 Milestone | Milestone 1：本地项目骨架                 |
| 当前任务单元   | M1-TU-03（未开始）                        |
| 总体状态       | 进行中                                    |
| 最近更新       | 2026-07-30                                |
| 下一检查点     | M1-TU-03 接口、隔离与就绪审查             |

## 1. 当前结论

Milestone 0 已通过全部适用验收；当前没有已知未解决的 P0/P1 缺陷。Milestone 1 已完成 `M1-TU-01` 与 `M1-TU-02`，形成 Workspace 路径/Schema/SQLite、Repository、窄 IPC、持久化恢复和权限重新验证基础，尚未形成完整 Workspace 用户流程。

`M1-TU-02` 的验收提交 `948e975a1a82977bf14ed3bc4eceb3ed1f8b1e8a` 已通过 Windows x64 与 macOS Apple Silicon 的真实权限 fixture、工程检查、开发态窗口 E2E、最终打包应用 E2E 和制品上传，合同 12 项全部通过。该结论只关闭 `M1-TU-02`；原生目录选择、Workspace UI、Corporation 和其他 Milestone 1 功能仍未实现。

## 2. 已完成基线

- 产品：v0.1 PRD、桌面端范围、非目标和产品验收场景；
- 架构：Electron + React + TypeScript + Rust Sidecar + SQLite、Local-first 和最小权限边界；
- 核心设计：Goal、Task、Organization、Agent、Scheduler、Evaluation、Artifact 和 Memory；
- 协议与基础设施：Agent、Task、Artifact、Event、Native Health、数据模型、SQLite、Tool、Policy、Provider 和 Observability；
- UI/UX：信息架构、核心流程、低保真线框、状态矩阵、设计系统和 UI 专项验收；
- 工程治理：统一验收、任务单元、工程、测试、安全、决策和 MVP 计划；
- Milestone 0：跨平台空应用、Rust health、SQLite migration runner、工程检查、CI 和最终打包应用 E2E。

## 3. Milestone 0 实施状态

- [x] pnpm workspace；
- [x] Cargo workspace；
- [x] Electron Main、Preload、React Renderer；
- [x] Rust Native Core Sidecar；
- [x] Electron → Rust 健康检查；
- [x] SQLite migration runner；
- [x] 自动化测试与 CI；
- [x] Windows/macOS 构建；
- [x] Windows/macOS 打包产物启动与 Rust health E2E。

最终有效证据：

- 验收提交：`55ba7de203463ebcae6c14f97e663adff3e36296`；
- GitHub Actions：run `30415519753`；
- Windows x64 与 macOS Apple Silicon 最终打包应用均显示 `Native Core ready · v0.1.0`；
- 对应 CI job 完成工程检查、开发态 E2E、未签名安装包构建、最终应用 E2E 和 artifact 上传。

## 4. 下一步任务

当前已关闭：

- [M1-TU-02 Workspace Repository、IPC 与权限重新验证](docs/06-engineering/task-units/M1-TU-02-workspace-repository-ipc.md)；
- 当前状态：完成；
- 验收提交：`948e975a1a82977bf14ed3bc4eceb3ed1f8b1e8a`；
- GitHub Actions：run `30472788800`，Windows x64 与 macOS Apple Silicon jobs 均成功。

当前只允许审查 [M1-TU-03 原生 Workspace 选择与恢复 UI](docs/06-engineering/task-units/M1-TU-03-workspace-selection-ui.md) 的范围、接口、所有权、隔离及验收标准；合同达到“就绪”前不得实施。

Milestone 1 任务覆盖地图：

| 建议任务单元 | 主要结果                                                    | 对应 Milestone 1 范围                                                             |
| ------------ | ----------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `M1-TU-01`   | Workspace Schema、migration、Rust 路径边界                  | Workspace 选择与权限的路径/Schema 基础、SQLite Workspace 表、工作区外路径拒绝     |
| `M1-TU-02`   | Workspace Repository、IPC、权限重新验证                     | Workspace 选择与权限的 Repository/IPC 和权限重新验证、Workspace 持久化            |
| `M1-TU-03`   | 原生目录选择 UI、Renderer 重载、跨平台 Electron E2E         | Workspace 选择与权限的完整用户流程、Renderer 重载不丢失 Workspace 状态            |
| `M1-TU-04`   | Corporation 核心表与 CRUD，状态和 Domain Event 同事务写入   | Corporation CRUD、Corporation/Event 表、状态与事件事务一致、Domain Event 后端基础 |
| `M1-TU-05`   | Goal Contract 手工/Mock、版本保存和最小时间线；不接真实模型 | Goal Contract 手工/Mock 与版本保存、Goal 表、最小时间线                           |
| `M1-TU-06`   | 暂停/恢复状态机、应用重启恢复和 Milestone 演示              | 暂停/恢复、应用重启、不丢失已持久化状态和 Milestone 演示                          |

该表只证明计划覆盖，不代表后续合同已经建立或功能已经实现。后续单元不在前置接口冻结前建立“就绪”合同；每个合同必须重新核对其内容属于 MVP Plan 的 Milestone 1，禁止遗漏或静默移动 Milestone 范围。

## 5. 活跃阻塞与外部条件

当前无产品或架构决策阻塞。

已知环境与发布条件：

- 系统 PATH 未提供 Node.js；当前工程验证使用 Codex bundled Node.js；
- Codex 外层 Windows 沙箱与 Chromium 子进程沙箱存在嵌套冲突；应用自身必须保持 `sandbox: true`，Electron 启动类 E2E 在允许启动 GUI 的验收环境执行；
- 应用签名与 macOS notarization 不是当前开发阻塞项，但属于公开发布前置条件。

## 6. 当前验证摘要

当前有效验证：

- Markdown 内部链接检查：0 个失效；
- M1-TU-01 验收提交：`de00200c3c4a63274274f6769fea19d33ce540a0`；
- GitHub Actions：run `30467936772`；
- Windows x64 job `90630475452`：真实 junction、盘符和 UNC 越界测试通过，工程检查、开发态 E2E、打包应用 E2E 和制品上传均成功；
- macOS Apple Silicon job `90630475318`：真实 symlink 越界测试通过，工程检查、开发态 E2E、打包应用 E2E 和制品上传均成功；
- Workspace 协议测试 7 项、SQLite migration 测试 6 项、Native Core 测试 7 项、Workspace Rust 路径边界测试 4 项通过；
- `pnpm check`：通过，包含状态/任务合同、格式、lint、TypeScript、全部 workspace 测试、Rust test/fmt/clippy 和 secret scan；
- `pnpm check:status`：通过；
- `pnpm check:task-units`：通过，2 份任务合同；
- `git diff --check`：通过；
- 项目内独立历史/复盘文档：0 份；
- M1-TU-02 合同范围、接口、所有权、隔离和验收内容审查：通过，实施基线 `274f41d993eeb09fab5a2166a48cad9ae2cc67f5`；
- M1-TU-02 本地工程检查：Workspace 协议 9 项、Repository/迁移 9 项、Desktop service/IPC/path 14 项、Native Core 7 项及 Workspace Rust 权限/路径 7 项测试通过；
- M1-TU-02 本地真实窗口 E2E：可见 Electron 窗口、Native Core health 与 `workspace:list` 公共 IPC 通过；
- M1-TU-02 验收提交：`948e975a1a82977bf14ed3bc4eceb3ed1f8b1e8a`；
- GitHub Actions：run `30472788800`；
- Windows x64 job `90646928059`：真实 ACL 可写/只读/不可读权限 fixture、工程检查、开发态窗口 E2E、最终打包应用 health 与 Workspace IPC E2E、制品上传均成功；
- macOS Apple Silicon job `90646928030`：真实权限位可写/只读/不可读 fixture、工程检查、开发态窗口 E2E、最终打包应用 health 与 Workspace IPC E2E、制品上传均成功；
- M1-TU-02 合同 12 项全部通过，P0/P1 为 0；该结论不代表 `M1-TU-03`、完整 Workspace 用户流程或 Milestone 1 完成；
- 文档优化提交 `f1ae2096ed3fc96e86f2019e051f0c01b28d25eb` 已推送。

本节只保留当前有效验证摘要，不记录被替代的过程结论。

## 7. 更新规则

- 只记录当前事实，不追加时间线或已失效结论；历史变化由 Git 保存；
- 功能、任务或 Milestone 只有通过全部适用验收后才能标记“完成”；
- 设计文档存在不等于功能已经实现；
- 当前任务状态必须与对应任务合同一致；
- 任务通过只关闭自身，不自动推动相邻任务或 Milestone；
- 新阻塞只进入“活跃阻塞”，已解除后直接删除；
- 每次完成任务后更新当前结论、验证摘要、阻塞和下一步。
