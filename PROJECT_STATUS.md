# AI Corporation Desktop 项目进度

| 属性           | 当前值                                   |
| -------------- | ---------------------------------------- |
| 当前产品版本   | v0.1 MVP                                 |
| 当前阶段       | Milestone 0 已验收，准备进入本地项目骨架 |
| 当前 Milestone | Milestone 1：本地项目骨架（尚未开始）    |
| 总体状态       | 进行中                                   |
| 最近更新       | 2026-07-29                               |
| 下一检查点     | Workspace 选择、Corporation 持久化与恢复 |

## 1. 当前结论

Milestone 0 的工程基线及全部适用验收项已通过。提交 `55ba7de` 对应的 GitHub Actions CI #5（run `30415519753`）在 Windows x64 与 macOS Apple Silicon 上均完成工程检查、开发态 Electron E2E、未签名安装包构建、最终打包应用窗口与 Rust `health` E2E，以及 artifact 上传。两个最终应用均直接显示 `Native Core ready · v0.1.0`。当前没有已知未解决的 P0/P1 缺陷；项目准备进入 Milestone 1，但尚未将任何 Milestone 1 产品功能标记为完成。

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
- [x] Windows/macOS 打包产物启动与 Rust health E2E；

## 4. 下一步任务

### Milestone 1：本地项目骨架

目标：用户可创建并恢复 Corporation，不接真实模型。

实施顺序：

1. 实现 Workspace 选择、权限授予与 Rust 路径边界；
2. 实现 Corporation CRUD（删除除外）及 SQLite 核心表；
3. 实现 Goal Contract 手工录入与 Mock 生成；
4. 实现 Domain Event、时间线与事务一致性；
5. 实现暂停/恢复基础状态机与应用重启恢复；
6. 按 UI/UX 规范完成相关页面、交互状态和专项验收。

演示路径：选择工作区 → 创建 Corporation → 保存目标 → 重启应用 → 恢复。

验收依据：

- [MVP 开发计划：Milestone 1](docs/06-engineering/MVP-Plan.md)
- [统一验收标准](docs/06-engineering/Acceptance-Standard.md)
- [工程与编码规范](docs/06-engineering/Engineering-Standards.md)
- [UI/UX 文档中心](docs/07-ui/README.md)
- [安全威胁模型](docs/06-engineering/Threat-Model.md)

## 5. 当前阻塞项

无产品或架构决策阻塞。

当前环境阻塞与外部条件：

- 系统 PATH 未提供 Node.js；本次使用 Codex bundled Node.js 24.14.0 完成 pnpm 验证；
- Codex 的外层 Windows 沙箱与 Chromium 子进程沙箱存在嵌套冲突；应用自身保持 `sandbox: true`，Electron 启动与 E2E 需在外层沙箱之外验证；
- 应用签名与 notarization 凭据不属于早期开发阻塞项，但属于公开发布前置条件。

## 6. 当前验证记录

### 2026-07-29：Milestone 0 打包产物补验完成

- 验收提交：`55ba7de203463ebcae6c14f97e663adff3e36296`；
- GitHub Actions CI #5：run `30415519753`，Windows x64 job `90461072074` 与 macOS Apple Silicon job `90461072105` 均为 `success`；
- 两个平台的工程检查、开发态 Electron E2E、未签名安装包构建、最终打包应用 health E2E 和 artifact 上传均成功；
- Windows 最终 `AI Corporation Desktop.exe` 直接启动后显示 `Native Core ready · v0.1.0`，CI 截图为 `release/packaged-health-win32-x64.png`；
- macOS 最终 `AI Corporation Desktop.app` 直接启动后显示 `Native Core ready · v0.1.0`，CI 截图为 `release/packaged-health-darwin-arm64.png`；
- Windows artifact `ai-corporation-windows-x64`：247,794,673 字节，SHA-256 `d6b6c1fe255123310e7a1af28610fe0b69fb54619b04ef6ad5a99259772afc5d`；
- macOS artifact `ai-corporation-macos-arm64`：488,967,135 字节，SHA-256 `ad9437c1a832045e598e7739eecd60be347a830fff6da8f91d38c48126842cb0`；
- 本地 Windows 最终 unpacked 产物也已独立通过同一窗口与 Rust health 测试，截图经人工核对，退出后无残留应用进程；
- 基于以上直接证据，Milestone 0 关闭；这些证据不代表 Milestone 1 的任何产品功能已经实现或验收。

### 2026-07-29：Milestone 0 完成标记撤销

- 此前的开发态 Electron E2E 证明了源码构建后的 Renderer → Main → Rust 路径，但没有启动 electron-builder 生成的最终应用；
- 此前的 Windows unpacked 冒烟只证明进程曾存活，没有读取窗口内容或确认 `Native Core ready`；
- CI #2/#3 证明双平台检查、开发态 E2E、安装包构建和 artifact 上传通过，但没有在打包后启动产物；
- 因证据层级不足，撤销“Milestone 0 全部适用验收项已通过”和“无未解决 P0/P1 缺陷”的结论；
- 当前未确认存在 P0/P1，但打包产物可运行性属于未完成的 Milestone 必检项，完成状态恢复为验收中。
- Windows 本地最终 unpacked 产物已由打包产物测试直接启动，真实窗口显示 `Native Core ready · v0.1.0`，截图位于 `release/packaged-health-win32-x64.png`；
- GitHub Actions CI #4（run `30415144622`）：macOS 最终 `.app` 的窗口与 Rust health E2E 通过；Windows 同样读到 `Native Core ready · v0.1.0`，但测试在清理临时 profile 时因 `EPERM` 退出 1，因此 Windows job 仍记为失败且 artifact 上传被阻断；
- Windows 清理时序已修正；修正后的本地打包产物测试退出 0，截图再次人工核对通过，测试退出后未发现残留应用进程；
- Windows 清理失败不否定已观察到的窗口/health 结果，但在 CI job 整体重新通过前，Milestone 0 仍不标记完成。

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
- 上述记录只证明开发态 E2E、构建和 artifact 生成，不再作为打包产物启动验收依据。

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
