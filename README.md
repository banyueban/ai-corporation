# AI Corporation Desktop

AI Corporation Desktop 是一款本地优先、跨平台的自主任务执行桌面软件。用户给出目标后，系统负责澄清成功条件、生成任务图、组建最小 AI 团队、执行任务、验收产物，并在必要时请求用户决策。

当前仓库处于 **v0.1 设计与 MVP 实现准备阶段**。

## 开发环境

- Node.js 24+
- pnpm 11.9+
- Rust stable（包含 `rustfmt` 与 `clippy`）
- Git 2.49+

初始化与基础检查：

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

当前 pnpm workspace 包含 `apps/*` 和 `packages/*`，Cargo workspace 包含
`crates/*`。Electron Main、Typed Preload 和 React Renderer 位于
`apps/desktop`；Rust Sidecar RPC 将按 Milestone 0 的任务顺序加入。

构建并启动当前桌面壳：

```bash
pnpm --filter @ai-corporation/desktop start
```

## 开发入口

- Codex 工作规则：[AGENTS.md](AGENTS.md)
- 当前项目进度：[PROJECT_STATUS.md](PROJECT_STATUS.md)
- 唯一验收入口：[docs/06-engineering/Acceptance-Standard.md](docs/06-engineering/Acceptance-Standard.md)

开始任何编码任务前，先确认当前进度与验收要求。完成任务后必须更新项目进度并附实际验证证据。

## v0.1 核心闭环

```text
用户目标
  → Goal Contract
  → Task Graph
  → Agent 分配
  → 执行与产物
  → 独立验收
  → 修订或交付
```

## 推荐技术栈

- 桌面外壳：Electron
- 用户界面：React + TypeScript
- 桌面与编排层：TypeScript
- 安全敏感、本地系统能力：Rust
- 本地数据：SQLite
- 模型接入：Provider Adapter（首版兼容 OpenAI 风格接口，并允许原生适配器）
- 构建与分发：pnpm workspace、Cargo workspace、electron-builder

> v0.1 不以“所有逻辑必须用 Rust”为目标。优先用 TypeScript 快速验证编排闭环，只把进程管理、权限边界、凭据与本地系统调用等安全或性能敏感能力放入 Rust。这样仍是一套跨平台工程，不需要为 Windows 与 macOS 分别维护业务代码。

## 文档入口

完整文档目录、阅读顺序和状态见 [docs/README.md](docs/README.md)。
