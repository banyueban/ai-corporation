# AI Corporation Desktop 项目进度

| 属性 | 当前值 |
|---|---|
| 当前产品版本 | v0.1 MVP |
| 当前阶段 | Milestone 0 已完成，准备进入 Milestone 1 |
| 当前 Milestone | Milestone 1：本地项目骨架（尚未开始） |
| 总体状态 | 进行中 |
| 最近更新 | 2026-07-29 |
| 下一检查点 | Milestone 1 验收 |

## 1. 当前结论

产品范围、总体架构、核心引擎、协议、数据、基础设施和低保真 UI/UX 已经形成开发基线。Milestone 0 的 Rust Sidecar、typed health RPC、SQLite migration runner、安全 Electron 壳、自动化测试、CI 和打包配置均已实现；本地 Windows 检查、真实 Electron → Rust E2E、NSIS 打包以及 GitHub Actions 的 Windows x64/macOS Apple Silicon 全流程均已通过，两个平台的未签名开发安装包 artifact 已生成，因此 Milestone 0 完成。当前 Renderer 是工程壳，不代表产品 UI 已实现；下一步按计划进入 Milestone 1。

## 2. 已完成内容

### 2.1 产品与架构

- [x] AI Corporation Desktop v0.1 PRD；
- [x] 总体技术设计；
- [x] 领域模型与系统不变量；
- [x] Local-first、Electron + React + TypeScript + Rust Sidecar + SQLite 技术路线；
- [x] v0.1 范围、非目标和产品验收场景。

### 2.2 核心引擎

- [x] Agent Runtime 设计；
- [x] Task Engine 设计；
- [x] Organization Engine 设计；
- [x] Scheduler 设计；
- [x] Evaluation Engine 设计；
- [x] Artifact System 设计；
- [x] Memory System 设计。

### 2.3 协议与基础设施

- [x] Agent、Task、Artifact、Event Protocol；
- [x] 数据模型与 SQLite Schema；
- [x] Tool Runtime 与 Policy Engine；
- [x] Model Provider；
- [x] Electron/TypeScript/Rust 工程架构；
- [x] Plugin System；
- [x] Observability。

### 2.4 工程治理

- [x] MVP 开发计划；
- [x] 工程与编码规范；
- [x] 测试方案；
- [x] 安全威胁模型；
- [x] 架构决策记录；
- [x] 统一验收标准；
- [x] Codex 仓库工作规则。

### 2.5 UI/UX 设计

- [x] UI/UX 总体规范与桌面窗口基线；
- [x] 全局与 Corporation 内信息架构；
- [x] 9 条核心用户流程；
- [x] 11 个关键屏幕低保真线框；
- [x] 页面、Task、Approval、Artifact、Evaluation、预算和 Provider 状态矩阵；
- [x] 基础设计系统、组件、可访问性和跨平台适配规范；
- [x] UI 专项验收标准 UI-AC-01 至 UI-AC-07；
- [x] UI 规范已接入 AGENTS、统一验收标准、工程规范和 MVP 开发计划。

## 3. Milestone 0 实施状态

- [x] pnpm workspace；
- [x] Cargo workspace；
- [x] Electron Main、Preload、React Renderer；
- [x] Rust Native Core Sidecar；
- [x] Electron ↔ Rust 健康检查；
- [x] SQLite migration runner；
- [x] 自动化测试与 CI 配置；
- [x] Windows/macOS 构建；

## 4. 下一步任务

### Milestone 1：本地项目骨架

目标：用户可创建并恢复 Corporation，不接真实模型。

任务顺序：

1. 实现 Workspace 选择与权限边界；
2. 实现 Corporation CRUD（删除除外）；
3. 实现 Goal Contract 手工录入与 Mock 生成；
4. 建立 SQLite 核心表；
5. 实现 Domain Event 与时间线；
6. 实现暂停/恢复基础状态机；
7. 按 `docs/07-ui/` 实现对应用户可见流程并执行 UI 专项验收。

Milestone 1 不接入真实模型，不实现后续 Milestone 的 Agent 执行、审批或验收闭环。

验收依据：

- [MVP 开发计划：Milestone 1](docs/06-engineering/MVP-Plan.md)
- [统一验收标准](docs/06-engineering/Acceptance-Standard.md)
- [Electron、TypeScript 与 Rust 工程架构](docs/05-infrastructure/Desktop-and-Rust-Architecture.md)
- [工程与编码规范](docs/06-engineering/Engineering-Standards.md)
- [安全威胁模型](docs/06-engineering/Threat-Model.md)
- [UI/UX 文档中心](docs/07-ui/README.md)

## 5. 当前阻塞项

无产品或架构决策阻塞。

当前环境阻塞与外部条件：

- 系统 PATH 未提供 Node.js；本次使用 Codex bundled Node.js 24.14.0 完成 pnpm 验证；
- Codex 的外层 Windows 沙箱与 Chromium 子进程沙箱存在嵌套冲突；应用自身保持 `sandbox: true`，Electron 启动与 E2E 需在外层沙箱之外验证；
- 应用签名与 notarization 凭据不属于早期开发阻塞项，但属于公开发布前置条件。

## 6. 当前验证记录

### 2026-07-29：Milestone 0 实现与本地 Windows 验收

- Rust Native Core 已实现 stdin/stdout JSON-RPC `health`，包含随机会话令牌、常量时间校验、64 KiB 请求上限和安全错误；
- Renderer → Typed Preload → Electron Main → Rust Sidecar 的真实 E2E：1 个场景通过；
- SQLite migration runner：4 个测试通过，覆盖幂等、历史迁移变更拒绝、失败回滚和重复版本；
- 协议 Schema：3 个测试通过；Electron 安全与路径配置：4 个测试通过；Rust：5 个测试通过；
- `pnpm check`：通过，包含状态结构、format、lint、typecheck、全部单元测试、Rust test/fmt/clippy 与 secret scan；
- CSP 已禁止对象、表单和任意 base URI；`contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`、`webSecurity: true` 自动测试通过；
- Windows x64 unpacked 应用构建通过，主进程持续运行 5 秒未退出，`resources/native-core.exe` 存在；
- Windows x64 NSIS 未签名安装包生成通过，大小 99,715,029 字节，SHA-256 为 `69378E7F536E7BA82902711A7DA7B5C4B77E6A84093A5D2EF6ED1D12C3C1A149`；
- Electron 在 Codex 外层沙箱内复现 `0xC0000135` 子进程退出；在外层沙箱外、应用自身仍启用 Chromium sandbox 时启动与 E2E 通过，未采用 `--no-sandbox` 降级；
- GitHub Actions CI #1（run `30411410625`）：Windows 因未覆盖 `.mjs`/`.css` 的 CRLF 格式检查失败，macOS 因干净环境不存在 `packages/protocols/dist` 而构建失败；
- CI #1 的两个根因已分别通过全仓库 LF 规则和协议包源码导出修复；删除本地 `packages/protocols/dist` 后，`pnpm check` 与真实 Electron E2E 均通过；
- GitHub Actions CI #2（run `30411656548`）：Windows x64 与 macOS Apple Silicon 的工程检查、真实 Electron E2E、未签名安装包构建和 artifact 上传全部通过；
- Windows artifact `ai-corporation-windows-x64`：247,686,996 字节，SHA-256 `54025488ec33a3610be6e64d16b165cda63f6326f2012125660a16f49671ec10`；
- macOS artifact `ai-corporation-macos-arm64`：488,860,737 字节，SHA-256 `24c39a430e95ff5a6d601110122db7c0f21d3bef7e666bc02a6f1afbd06e0372`；
- Milestone 0 的全部适用验收项已通过，无未解决 P0/P1 缺陷。

### 2026-07-29：低保真 UI/UX 设计基线

- `docs/07-ui/` 已包含 8 份 UI 文档；
- 信息架构、9 条核心用户流程、11 个关键屏幕线框、交互状态矩阵、基础设计系统和 UI 专项验收标准已完成；
- UI 文档内部 Markdown 链接检查：0 个缺失；
- AGENTS、Acceptance Standard、Engineering Standards 和 MVP Plan 已引用 UI 基线；
- `pnpm check:status`：通过；
- `pnpm test`：通过，3 个项目状态结构测试通过，现有 workspace 测试无失败；
- `git diff --check`：通过；
- 本次只完成设计与规范接入，未将当前 Renderer 工程壳误标记为产品 UI 完成。

### 2026-07-29：项目状态结构纠正

- “尚未开始”章节已改为“Milestone 0 实施状态”，并移除不属于 Milestone 0 的产品功能条目；
- `pnpm check:status`：通过；
- `pnpm test`：通过，新增 3 个状态文档结构检查测试；
- `pnpm typecheck`：通过；
- `AGENTS.md` 已要求每次状态更新后运行结构检查。

### 2026-07-29：Rust workspace 与 Electron 桌面壳

- rustup 1.29.0 安装器 SHA-256：与 Rust 官方发布值 `86478E53F769379D7F0EBFA7C9AA97CB76CA92233F79AA2CC0DBEE2EFAAC73C7` 一致；
- Rust stable：`rustc 1.97.1`、`cargo 1.97.1`；
- Visual Studio Build Tools 2022：已添加 `Microsoft.VisualStudio.Workload.VCTools`；
- `cargo metadata --format-version 1 --no-deps`：通过；
- `cargo fmt --all --check`：通过；
- `cargo clippy --workspace --all-targets -- -D warnings`：通过；
- `cargo test --workspace`：通过，1 个测试通过；
- `pnpm typecheck`：通过；
- `pnpm test`：通过，当前为 0 个 TypeScript 测试的工程基线；
- `pnpm build`：通过，Electron Main、Preload 与 Vite Renderer 产物已生成；
- Electron 隐藏启动冒烟：通过，主进程持续运行 5 秒并创建 3 个子进程，stderr 为空；
- Electron 安全基线已在实现中设置 `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`、`webSecurity: true`，自动化安全测试仍待后续任务补齐。

### 2026-07-29：Milestone 0 workspace 初始化

- `git init -b main`：通过，本地仓库位于 `E:\ai_dev\ai-corporation`；
- `ssh-keygen -t ed25519 -a 100`：通过，GitHub deploy key 私钥仅存放于 `.git/auth`，公钥指纹为 `SHA256:6AyyQ4AzerTTe4fJZeB+azVaR1qyn/gee7/dYj+wAAM`；
- `pnpm install --frozen-lockfile=false`：通过，生成 `pnpm-lock.yaml`；
- `pnpm typecheck`：通过；
- `pnpm test`：通过，当前为 0 个测试的工程初始化基线；
- `pnpm build`：通过；
- Rust 检查：未执行，因为当前环境没有 `rustc`/`cargo`；
- GitHub SSH 身份验证：通过，GitHub 返回 `Hi banyueban! You've successfully authenticated`；
- GitHub 远程仓库：`git@github.com:banyueban/ai-corporation.git`，SSH 访问验证通过；
- `git push --set-upstream origin main`：通过，本地 `main` 已创建并跟踪 `origin/main`。

### 2026-07-29：设计文档基线

- Markdown 文档均可使用 UTF-8 读取；
- 文档索引不存在“待创建”标记；
- 内部 Markdown 文件链接检查通过；
- 未发现空文档；
- 设计文档已覆盖产品、架构、核心引擎、协议、基础设施和工程实施。

该验证只说明文档基线完整，不代表任何应用代码或构建已经通过。

## 7. 进度更新规则

每次开发任务结束必须更新：

1. 顶部当前阶段、Milestone、总体状态和日期；
2. “已完成内容”；
3. “下一步任务”；
4. “当前阻塞项”；
5. “当前验证记录”中的实际命令与结果。
6. 运行 `pnpm check:status`，确认状态文档结构一致。

规则：

- 只记录已经发生且有证据的进度；
- 当前 Milestone 的实施状态只列该 Milestone 的交付物，不混入后续里程碑任务；
- 章节标题必须与内容状态一致，标题含“尚未开始”的章节不得出现已完成项；
- 更新任务顺序或 Milestone 边界前，必须与 `docs/06-engineering/MVP-Plan.md` 对照；
- 设计完成与代码完成分开；
- 代码生成不等于功能完成；
- 验收未通过时标记“部分完成”或“阻塞”；
- 已完成项如因回归失效，应重新打开并说明原因；
- 本文档不复制详细需求或测试标准，只引用其唯一来源。
