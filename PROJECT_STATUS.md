# AI Corporation Desktop 项目进度

| 属性           | 当前值                                    |
| -------------- | ----------------------------------------- |
| 当前产品版本   | v0.1 MVP                                  |
| 当前阶段       | Milestone 1 第六个任务单元合同建立        |
| 当前 Milestone | Milestone 1：本地项目骨架                 |
| 当前任务单元   | M1-TU-05（完成）                          |
| 总体状态       | 进行中                                    |
| 最近更新       | 2026-07-30                                |
| 下一检查点     | 建立并审查 M1-TU-06 任务合同              |

## 1. 当前结论

Milestone 0 已通过全部适用验收；当前没有已知未解决的 P0/P1 缺陷。Milestone 1 的 `M1-TU-01` 至 `M1-TU-05` 已完成。`M1-TU-05` 在验收前审计中补齐不可用 Workspace 的事务内写入拒绝，验收提交 `0952ea9b2353e465aba14a6c6d368e46a494ffd0` 的协议、迁移、Repository、typed IPC、真实 UI 故障恢复/冲突恢复、可访问性、响应布局、开发态 E2E、Windows/macOS 最终包 E2E 和制品上传全部通过，合同 18 项关闭。

该结论只关闭 Goal Contract 手工/本地 Mock、版本保存、确认和最小时间线切片，不代表暂停/恢复状态机、完整 UI-AC-02、`M1-TU-06` 或 Milestone 1 已完成。下一步必须先建立并审查 `M1-TU-06` 合同，再按就绪门禁实施。

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

当前已关闭 [M1-TU-05 Goal Contract 版本与最小时间线 UI](docs/06-engineering/task-units/M1-TU-05-goal-contract-timeline-ui.md)：

- 当前状态：完成；
- 实施基线：`ebda8cf5b028c35f1d85a190c59ded14b5011637`；
- 验收提交：`0952ea9b2353e465aba14a6c6d368e46a494ffd0`；
- GitHub Actions：run `30513008388`，Windows x64 job `90776878422` 与 macOS Apple Silicon job `90776878406` 均成功；
- artifacts：Windows x64 `8747866273`，macOS Apple Silicon `8747850786`；
- 关闭范围：Goal Contract 手工/本地确定性 Mock、版本/确认、最小时间线、真实 UI 故障与冲突恢复；
- 非范围：真实 Provider、Task Graph、Plan、运行状态机、暂停/恢复和完整 Milestone 1 演示。

当前只允许建立和审查 `M1-TU-06` 合同；合同达到“就绪”并记录基线前不得实施暂停/恢复或 Milestone 演示。

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
- M1-TU-05 当前实现验证：Goal Contract strict runtime Schema 与固定公开错误测试 5 项通过；存储测试 39 项通过，覆盖空库/已填充 `0003` 升级到 `0004`、旧事件保留、Goal 内容不可变、不可用 Workspace/不存在或非 DRAFT/ARCHIVED Corporation 的无部分写入拒绝、save/approve 四个写入边界回滚、命令重放/冲突、HIGH 假设门禁、版本取代、canonical cursor 脱敏分页、双连接同版本竞争和 SQLite 重开恢复；`pnpm check` 全量通过；
- M1-TU-05 Desktop service/IPC 验证：Desktop 测试 47 项通过，覆盖规范化请求 hash、可信 Clock/UUID、固定错误映射、非法来源/额外字段拒绝和五个 allowlisted Goal/Timeline channel；Main、Preload 与 `DesktopApi` 类型检查及 `pnpm check` 全量通过；
- M1-TU-05 Windows 开发态真实窗口：纯键盘完成 Workspace 授权、Corporation 创建、一次性 Goal 事务失败、保留输入且不重复创建 Corporation 的重试、本地确定性 Mock Goal v1、未确认 HIGH 假设拒绝、真实竞争版本触发 `VERSION_CONFLICT`、reload 恢复后确认 Goal v3、approve、版本/时间线与 SQLite 恢复；Create/Review 页 axe 严重/关键违规为 0，Mock 外部网络请求为 0，1024 × 700、1440 × 900 与 200% 截图已人工检查，临时 Workspace/user data 清理通过；
- M1-TU-05 本地 Windows x64 最终目录包：Native Core health、Workspace 授权/重载恢复、一次性 Goal 保存故障/恢复重试、Review/假设门禁、approve、版本/时间线与 Renderer reload/SQLite 恢复的真实 UI 旅程通过；最终包截图已人工检查，Mock 外部网络请求为 0，临时 Workspace/user data 清理通过。该证据不代替同一提交的 macOS 或双平台 CI 验收；
- M1-TU-05 验收提交：`0952ea9b2353e465aba14a6c6d368e46a494ffd0`；GitHub Actions run `30513008388`；Windows x64 job `90776878422` 与 macOS Apple Silicon job `90776878406` 的工程检查、开发态真实窗口、最终包 Goal UI E2E、清理和 artifact 上传均成功；artifacts 为 `8747866273` 与 `8747850786`；合同 18 项全部通过，P0/P1 为 0，未执行的合同必检项为 0；
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
