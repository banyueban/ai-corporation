# AI Corporation Desktop

AI Corporation Desktop 是一款本地优先、跨平台的自主任务执行桌面软件。用户给出目标后，系统负责澄清成功条件、生成任务图、组建最小 AI 团队、执行任务、验收产物，并在必要时请求用户决策。

当前仓库处于 **v0.1 MVP 实现阶段**。

## 开发环境

- Node.js 24+
- pnpm 11.9+
- Rust stable（包含 `rustfmt` 与 `clippy`）
- Git 2.49+

初始化与基础检查：

```bash
pnpm install
pnpm check
```

当前 pnpm workspace 包含 `apps/*` 和 `packages/*`，Cargo workspace 包含
`crates/*`。Electron Main、Typed Preload 和 React Renderer 位于
`apps/desktop`；Rust Native Core Sidecar 位于 `crates/native-core`。

常用命令：

```bash
# 构建 TypeScript/Electron 与 Rust
pnpm build

# 启动桌面应用（先构建 Sidecar）
pnpm --filter @ai-corporation/desktop start

# 运行 Renderer → IPC → Rust health 端到端测试
pnpm test:e2e

# 生成当前平台的未签名开发安装包
pnpm --filter @ai-corporation/desktop package
```

Windows 构建 Rust 需要 Visual Studio Build Tools 2022 的 C++ 工具链；
macOS 构建需要 Xcode Command Line Tools。安装包默认输出到 `release/`。
开发安装包未签名，不用于公开发布。

## 开发入口

- Codex 工作规则：[AGENTS.md](AGENTS.md)
- 当前项目进度：[PROJECT_STATUS.md](PROJECT_STATUS.md)
- 唯一验收入口：[docs/06-engineering/Acceptance-Standard.md](docs/06-engineering/Acceptance-Standard.md)
- UI/UX 设计入口：[docs/07-ui/README.md](docs/07-ui/README.md)

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
