# Third-Party Notices

## pi-coding-agent

AI Corporation 的编码 Skill 与命令工具借鉴了 `pi-coding-agent v0.84.1` 的通用工具设计，包括系统命令启动、流式输出、超时、进程树终止和输出裁剪。

- Source: https://github.com/earendil-works/pi
- Fixed source commit: `53fa77ccd8a279eb87e92294ef3687b03ff80112`
- License: MIT
- Copyright: the pi project contributors

AI Corporation 没有引入 `pi-coding-agent` 运行时，也没有复制其 TUI、凭据、会话或扩展加载入口。实际实现已经按 AI Corporation 的任务授权、事件记录和恢复方式改写。

## uv

AI Corporation Desktop 随安装包提供固定版本 `uv 0.11.15`，仅用于在软件自管目录下载 CPython、创建 Skill 独立环境和安装已获用户批准的 Python 包。

- Source: https://github.com/astral-sh/uv/releases/tag/0.11.15
- License: Apache-2.0 OR MIT
- Copyright: the uv project contributors

## npm CLI

AI Corporation Desktop 随安装包提供固定版本 `npm 11.6.2`，仅用于在 Skill 独立环境安装已获用户批准的普通 npm registry 包，不使用用户的全局 npm。

- Source: https://registry.npmjs.org/npm/-/npm-11.6.2.tgz
- License: Artistic-2.0
- Copyright: npm, Inc. and npm CLI contributors

## Noto Sans SC

AI Corporation Desktop 随安装包提供 `@fontsource-variable/noto-sans-sc 5.3.0`，生成 PDF 时只嵌入当前文档实际用到的字体片段，避免依赖操作系统字体。

- Source: https://fontsource.org/fonts/noto-sans-sc
- Package: https://www.npmjs.com/package/@fontsource-variable/noto-sans-sc/v/5.3.0
- License: SIL Open Font License 1.1
- Copyright: Google Inc.
