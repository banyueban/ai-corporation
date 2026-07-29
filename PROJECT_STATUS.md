# AI Corporation Desktop 项目进度

| 属性 | 当前值 |
|---|---|
| 当前产品版本 | v0.1 MVP |
| 当前阶段 | Milestone 1 实施前文档基线优化完成，待确认 |
| 当前 Milestone | Milestone 1：本地项目骨架 |
| 当前任务单元 | M1-TU-01（未开始，待文档优化验收并记录实施基线） |
| 总体状态 | 进行中 |
| 最近更新 | 2026-07-29 |
| 下一检查点 | 用户确认文档优化结果并冻结 M1-TU-01 实施基线 |

## 1. 当前结论

Milestone 0 已通过全部适用验收；当前没有已知未解决的 P0/P1 缺陷。Milestone 1 尚未实现任何产品功能。

文档基线已按单一权威来源原则完成优化：规则优先级和状态词已统一，Workspace 路径信任边界已明确，领域/UI 状态已分层，逻辑实体到 SQLite 的映射已补齐，首个 M1 任务单元已缩小。Milestone 1 的 Workspace、Corporation、Goal Contract、SQLite、Domain Event/时间线和暂停/恢复范围已映射到当前及后续建议任务；任务合同必须直接引用 MVP Plan 对应 Milestone，并说明本单元覆盖与非范围。适用文档和工程检查已经通过；用户确认并形成干净实施基线前，`M1-TU-01` 保持“未开始”。

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

当前只允许推进：

- [M1-TU-01 Workspace 路径边界基础](docs/06-engineering/task-units/M1-TU-01-workspace-boundary.md)；
- 当前状态：未开始；
- 进入“就绪”前必须完成本轮文档验收、记录干净基线提交并确认共享冲突区无人占用；
- 主要结果：冻结 Workspace DTO/Schema 和 SQLite 边界，由 Rust 拒绝工作区外路径；
- 对应 Milestone 1 范围：Workspace 选择与权限的路径/Schema 基础、SQLite Workspace 表，以及“工作区外路径被 Rust 拒绝”验收；
- 非范围：原生目录选择器、Workspace Repository/IPC、Renderer UI、Electron E2E 和 Corporation CRUD。

Milestone 1 任务覆盖地图：

| 建议任务单元 | 主要结果 | 对应 Milestone 1 范围 |
|---|---|---|
| `M1-TU-01` | Workspace Schema、migration、Rust 路径边界 | Workspace 选择与权限的路径/Schema 基础、SQLite Workspace 表、工作区外路径拒绝 |
| `M1-TU-02` | Workspace Repository、IPC、权限重新验证 | Workspace 选择与权限的 Repository/IPC 和权限重新验证、Workspace 持久化 |
| `M1-TU-03` | 原生目录选择 UI、Renderer 重载、跨平台 Electron E2E | Workspace 选择与权限的完整用户流程、Renderer 重载不丢失 Workspace 状态 |
| `M1-TU-04` | Corporation 核心表与 CRUD，状态和 Domain Event 同事务写入 | Corporation CRUD、Corporation/Event 表、状态与事件事务一致、Domain Event 后端基础 |
| `M1-TU-05` | Goal Contract 手工/Mock、版本保存和最小时间线；不接真实模型 | Goal Contract 手工/Mock 与版本保存、Goal 表、最小时间线 |
| `M1-TU-06` | 暂停/恢复状态机、应用重启恢复和 Milestone 演示 | 暂停/恢复、应用重启、不丢失已持久化状态和 Milestone 演示 |

该表只证明计划覆盖，不代表后续合同已经建立或功能已经实现。后续单元不在前置接口冻结前建立“就绪”合同；每个合同必须重新核对其内容属于 MVP Plan 的 Milestone 1，禁止遗漏或静默移动 Milestone 范围。

## 5. 活跃阻塞与外部条件

当前无产品或架构决策阻塞。

已知环境与发布条件：

- 系统 PATH 未提供 Node.js；当前工程验证使用 Codex bundled Node.js；
- Codex 外层 Windows 沙箱与 Chromium 子进程沙箱存在嵌套冲突；应用自身必须保持 `sandbox: true`，Electron 启动类 E2E 在允许启动 GUI 的验收环境执行；
- 应用签名与 macOS notarization 不是当前开发阻塞项，但属于公开发布前置条件。

## 6. 当前验证摘要

本轮文档优化的当前有效验证：

- Markdown 内部链接检查：0 个失效；
- 规则优先级、状态词、Workspace 信任边界、领域/UI 状态和数据映射交叉检查：通过；
- MVP Plan、项目状态与 M1-TU-01 的范围交叉检查：通过；任务合同检查器强制要求直接引用 MVP Plan；
- `pnpm check`：通过，包含状态/任务合同、格式、lint、TypeScript、全部 workspace 测试、Rust test/fmt/clippy 和 secret scan；
- `pnpm check:status`：通过；
- `pnpm check:task-units`：通过，1 份任务合同；
- `git diff --check`：通过；
- 项目内独立历史/复盘文档：0 份。

本节只保留当前有效验证摘要，不记录被替代的过程结论。

## 7. 更新规则

- 只记录当前事实，不追加时间线或已失效结论；历史变化由 Git 保存；
- 功能、任务或 Milestone 只有通过全部适用验收后才能标记“完成”；
- 设计文档存在不等于功能已经实现；
- 当前任务状态必须与对应任务合同一致；
- 任务通过只关闭自身，不自动推动相邻任务或 Milestone；
- 新阻塞只进入“活跃阻塞”，已解除后直接删除；
- 每次完成任务后更新当前结论、验证摘要、阻塞和下一步。
