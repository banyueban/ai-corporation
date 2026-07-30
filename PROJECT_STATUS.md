# AI Corporation Desktop 项目进度

| 属性           | 当前值                                    |
| -------------- | ----------------------------------------- |
| 当前产品版本   | v0.1 MVP                                  |
| 当前阶段       | Milestone 1 第五个任务单元实施中          |
| 当前 Milestone | Milestone 1：本地项目骨架                 |
| 当前任务单元   | M1-TU-05（进行中）                        |
| 总体状态       | 进行中                                    |
| 最近更新       | 2026-07-30                                |
| 下一检查点     | M1-TU-05 最终包 UI 旅程与双平台验收       |

## 1. 当前结论

Milestone 0 已通过全部适用验收；当前没有已知未解决的 P0/P1 缺陷。Milestone 1 已完成 `M1-TU-01`、`M1-TU-02` 与 `M1-TU-03`。`M1-TU-03` 已形成原生目录选择、可信授权、公开状态展示、Renderer 重载恢复和重新验证用户切片；验收提交 `20cc3b089424ab0405e64d5880609fbcaf011923` 的 Windows x64 与 macOS Apple Silicon 工程检查、开发态真实窗口 E2E、最终打包应用 E2E 和制品上传全部通过，合同 14 项全部关闭。`M1-TU-05` 的范围、协议、接口、跨事务失败边界、所有权、隔离和 18 项验收合同已完成内容审查，实施基线为 `ebda8cf5b028c35f1d85a190c59ded14b5011637`；当前正在实现，协议、迁移、Repository 和 typed Main/Preload API 已形成阶段性结果，但不表示 Goal 用户旅程或任务验收完成。

该结论关闭 Workspace 选择/恢复和 Corporation CRUD 事务事件两个解耦切片，不代表 Goal、Corporation UI、状态机、事件时间线、Provider、完整 UI-AC-02 或 Milestone 1 已完成。[M1-TU-04 Corporation CRUD 与事务事件](docs/06-engineering/task-units/M1-TU-04-corporation-crud-events.md) 的 17 项验收均已通过；验收提交 `aaff4f5e20579869738655206e784029b8ab1cbd` 的 Windows x64 与 macOS Apple Silicon 工程检查、开发态真实窗口 E2E、最终打包应用 API E2E 和制品上传全部成功。

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

当前已关闭 [M1-TU-03 原生 Workspace 选择与恢复 UI](docs/06-engineering/task-units/M1-TU-03-workspace-selection-ui.md)：

- 当前状态：完成；
- 实施基线：`3ced71a5e3273fd9270193c7ed94309e8123e6b7`；
- 验收提交：`20cc3b089424ab0405e64d5880609fbcaf011923`；
- GitHub Actions：run `30504173197`，Windows x64 job `90750204571` 与 macOS Apple Silicon job `90750204635` 均成功；
- 关闭范围：原生 Workspace 选择、可信授权、公开展示、重新验证和 Renderer 重载恢复；
- 非范围：Goal 表单提交、Corporation CRUD、Provider 配置、文件操作和完整 Milestone 1 演示。

当前已关闭 [M1-TU-04 Corporation CRUD 与事务事件](docs/06-engineering/task-units/M1-TU-04-corporation-crud-events.md)：

- 当前状态：完成；
- 实施基线：`5468ea9131f145026279bb95045124b8c6400295`；
- 验收提交：`aaff4f5e20579869738655206e784029b8ab1cbd`；
- GitHub Actions：run `30506278040`，Windows x64 job `90756640497` 与 macOS Apple Silicon job `90756640490` 均成功；
- 主要结果：Corporation 通过窄 IPC 创建、读取、重命名和归档，每次命令与 Domain Event 原子提交；
- 合同边界：不包含 UI、Goal、运行状态机、事件订阅、删除或工作区文件操作；
- 关闭范围：Corporation CRUD 后端、事务事件、命令幂等、乐观锁、恢复和 typed API；
- 非范围：Corporation UI、Goal、运行状态机、事件订阅、删除和工作区文件操作。

当前只允许实施和验收 [M1-TU-05 Goal Contract 版本与最小时间线 UI](docs/06-engineering/task-units/M1-TU-05-goal-contract-timeline-ui.md)，状态为“进行中”，实施基线为 `ebda8cf5b028c35f1d85a190c59ded14b5011637`；不得同时启动相邻任务或把阶段性实现表述为功能完成。

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
- M1-TU-03 合同范围、接口、所有权、隔离和 14 项验收内容审查：通过，实施基线 `3ced71a5e3273fd9270193c7ed94309e8123e6b7`；
- M1-TU-03 本地工程检查：`pnpm check` 通过；治理测试 15 项、Workspace 协议 10 项、Storage 9 项、Desktop 30 项、Native Core 7 项与 Workspace Rust 7 项通过，Rust fmt/clippy、TypeScript、lint、格式与 secret scan 通过；
- M1-TU-03 本地开发态真实窗口 E2E：在 200% 缩放下以纯键盘完成空状态 → 创建入口 → Workspace 选择 → 授权展示 → Renderer 重载 → SQLite 恢复与重新验证；1024 × 700、1440 × 900 和 200% 原生窗口截图已人工检查，严重/关键 axe 违规为 0，临时 Workspace 无探针残留；
- M1-TU-03 本地 Windows x64 最终目录包：release Native Core health 与 Workspace 选择 → 授权 → Renderer 重载 → 恢复旅程通过，窗口截图已人工检查，临时 user data 与 Workspace 已清理；
- M1-TU-03 验收提交：`20cc3b089424ab0405e64d5880609fbcaf011923`；GitHub Actions run `30504173197`；
- Windows x64 job `90750204571`：工程检查、开发态真实窗口 Workspace 旅程、NSIS/最终包构建、最终包 `select · authorize · reload · restore` 旅程、Native Core health、截图与 artifact `8744713866` 上传全部成功；
- macOS Apple Silicon job `90750204635`：工程检查、开发态真实窗口 Workspace 旅程、DMG/最终包构建、最终包 `select · authorize · reload · restore` 旅程、Native Core health、截图与 artifact `8744698135` 上传全部成功；
- M1-TU-03 合同 14 项全部通过，P0/P1 为 0；未执行的合同必需验证为 0。该结论不代表 Corporation、Goal、完整 UI-AC-02 或 Milestone 1 完成；
- M1-TU-04 Corporation Protocol 与任务合同的 Milestone 归属、CRUD/事务事件边界、命令幂等、乐观锁、归档状态、固定错误、所有权、隔离和 17 项验收内容审查：通过，实施基线 `5468ea9131f145026279bb95045124b8c6400295`；
- M1-TU-04 本地协议/存储/Desktop 测试：Corporation Protocol 4 项、Storage 13 项新增覆盖、Desktop service/IPC 8 项新增覆盖通过；包含 `0003`、Workspace 拒绝、稳定列表、事务 fault rollback、append-only、幂等、双连接 barrier 乐观锁并发、归档与 SQLite 重开恢复；
- M1-TU-04 本地开发态真实 Electron 窗口：typed API `create → get/list → update → Renderer reload → restore` 通过，并继续通过 Native Core health、Workspace 选择/恢复、200% 缩放和 axe 严重/关键违规为 0 的既有旅程；
- M1-TU-04 本地 Windows x64 最终目录包：Native Core health、Workspace `select → authorize → reload → restore` 与 Corporation API `create → get/list → update → reload → restore` 全部通过，临时 user data 与 Workspace 已清理；
- M1-TU-04 验收提交：`aaff4f5e20579869738655206e784029b8ab1cbd`；GitHub Actions run `30506278040`；
- Windows x64 job `90756640497`：工程检查（含双连接 barrier 并发）、开发态真实窗口 API 旅程、NSIS/最终包构建、最终包 Corporation API `create · get/list · update · reload · restore`、Native Core health、临时数据清理与 artifact `8745505379` 上传全部成功；
- macOS Apple Silicon job `90756640490`：工程检查（含双连接 barrier 并发）、开发态真实窗口 API 旅程、DMG/最终包构建、最终包 Corporation API `create · get/list · update · reload · restore`、Native Core health、临时数据清理与 artifact `8745462304` 上传全部成功；
- M1-TU-04 合同 17 项全部通过，P0/P1 为 0，未执行的合同必需验证为 0；该结论不代表 Corporation UI、Goal、状态机、时间线或 Milestone 1 完成；
- M1-TU-05 合同的 Milestone 归属、请求/响应 DTO、版本/事务/幂等、确定性 Mock、canonical timeline cursor、跨服务失败边界、所有权、隔离和 18 项验收内容审查通过，实施基线为 `ebda8cf5b028c35f1d85a190c59ded14b5011637`；
- M1-TU-05 当前实现验证：Goal Contract strict runtime Schema 与固定公开错误测试 5 项通过；存储测试 38 项通过，覆盖空库/已填充 `0003` 升级到 `0004`、旧事件保留、Goal 内容不可变、save/approve 四个写入边界回滚、命令重放/冲突、HIGH 假设门禁、版本取代、canonical cursor 脱敏分页、双连接同版本竞争和 SQLite 重开恢复；`pnpm check` 全量通过。该证据只对应协议、迁移和 Repository 阶段，不关闭合同验收项；
- M1-TU-05 Desktop service/IPC 验证：Desktop 测试 47 项通过，覆盖规范化请求 hash、可信 Clock/UUID、固定错误映射、非法来源/额外字段拒绝和五个 allowlisted Goal/Timeline channel；Main、Preload 与 `DesktopApi` 类型检查及 `pnpm check` 全量通过；
- M1-TU-05 Windows 开发态真实窗口：纯键盘完成 Workspace 授权、Corporation 创建、一次性 Goal 事务失败、保留输入且不重复创建 Corporation 的重试、本地确定性 Mock Goal v1、未确认 HIGH 假设拒绝、确认后 Goal v2、approve、版本/时间线、Renderer reload 与 SQLite 恢复；Create/Review 页 axe 严重/关键违规为 0，Mock 外部网络请求为 0，1024 × 700、1440 × 900 与 200% 截图已人工检查，临时 Workspace/user data 清理通过；
- M1-TU-05 本地 Windows x64 最终目录包：Native Core health、Workspace 授权/重载恢复、一次性 Goal 保存故障/恢复重试、Review/假设门禁、approve、版本/时间线与 Renderer reload/SQLite 恢复的真实 UI 旅程通过；最终包截图已人工检查，Mock 外部网络请求为 0，临时 Workspace/user data 清理通过。该证据不代替同一提交的 macOS 或双平台 CI 验收；
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
