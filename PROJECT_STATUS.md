# AI Corporation Desktop 项目进度

| 属性 | 当前值 |
|---|---|
| 当前产品版本 | v0.1 MVP |
| 当前阶段 | Milestone 0 进行中：工程 workspace 已初始化 |
| 当前 Milestone | Milestone 0：工程基线 |
| 总体状态 | 进行中 |
| 最近更新 | 2026-07-29 |
| 下一检查点 | Milestone 0 验收 |

## 1. 当前结论

产品范围、总体架构、核心引擎、协议、数据与基础设施设计已经形成开发基线。项目尚未初始化 Electron、TypeScript、Rust、SQLite 或测试工程，因此不能标记为“开发进行中”或“工程基线完成”。

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

## 3. 尚未开始

- [x] pnpm workspace；
- [ ] Cargo workspace（配置已创建，等待 Rust 工具链验证）；
- [ ] Electron Main、Preload、React Renderer；
- [ ] Rust Native Core Sidecar；
- [ ] Electron ↔ Rust 健康检查；
- [ ] SQLite migration runner；
- [ ] 自动化测试与 CI；
- [ ] Windows/macOS 构建；
- [ ] 任何产品功能实现。

## 4. 下一步任务

### Milestone 0：工程基线

目标：建立可重复构建、可测试、符合安全基线的空应用。

任务顺序：

1. 安装 Rust stable 工具链并验证 Cargo workspace；
2. 创建 Electron Main、Typed Preload 和 React Renderer；
3. 创建 Rust Sidecar；
4. 实现 Main 与 Sidecar 的 typed health RPC；
5. 配置 TypeScript strict、format、lint、Vitest；
6. 配置 Rust fmt、clippy 和测试；
7. 建立 SQLite migration runner 骨架；
8. 落实 CSP、contextIsolation、sandbox 和禁用 nodeIntegration；
9. 配置 Windows/macOS CI 构建；
10. 更新 README 中的启动、测试和构建命令。

验收依据：

- [MVP 开发计划：Milestone 0](docs/06-engineering/MVP-Plan.md)
- [统一验收标准](docs/06-engineering/Acceptance-Standard.md)
- [Electron、TypeScript 与 Rust 工程架构](docs/05-infrastructure/Desktop-and-Rust-Architecture.md)
- [工程与编码规范](docs/06-engineering/Engineering-Standards.md)
- [安全威胁模型](docs/06-engineering/Threat-Model.md)

## 5. 当前阻塞项

无产品或架构决策阻塞。

当前环境阻塞与外部条件：

- Rust toolchain 未安装，`cargo fmt`、`cargo clippy`、`cargo test` 和 Cargo metadata 尚无法执行；
- 系统 PATH 未提供 Node.js；本次使用 Codex bundled Node.js 24.14.0 完成 pnpm 验证；
- Windows/macOS 构建执行环境；
- 应用签名与 notarization 凭据不属于早期开发阻塞项，但属于公开发布前置条件。

## 6. 当前验证记录

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
- `git push --set-upstream origin main`：待本状态更新提交后执行。

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

规则：

- 只记录已经发生且有证据的进度；
- 设计完成与代码完成分开；
- 代码生成不等于功能完成；
- 验收未通过时标记“部分完成”或“阻塞”；
- 已完成项如因回归失效，应重新打开并说明原因；
- 本文档不复制详细需求或测试标准，只引用其唯一来源。
