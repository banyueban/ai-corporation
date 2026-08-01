# AI Corporation Desktop 项目进度

| 属性 | 当前值 |
|---|---|
| 当前产品版本 | v0.1 MVP |
| 当前阶段 | Milestone 2 首个任务单元实施与验收 |
| 当前 Milestone | Milestone 2：Provider 与 Goal/Plan |
| 当前任务单元 | M2-TU-01（进行中） |
| 总体状态 | 进行中 |
| 最近更新 | 2026-08-01 |
| 下一检查点 | M2-TU-01 同源 Windows/macOS CI 与最终包验收 |

## 1. 当前结论

Milestone 1 已完成并经用户人工安装验收；当前没有已知未解决 P0/P1。Milestone 2 已进入首个解耦任务单元：[M2-TU-01 OS 安全存储边界](docs/06-engineering/task-units/M2-TU-01-os-secure-store-boundary.md)。合同范围、依赖、接口、所有权、隔离和 14 项验收断言已明确，就绪合同提交为 `57cb9f6c94611ade1f21a6a1bb54fd7cb2326f14`，当前状态为“进行中”。

本任务只建立 Windows Credential Manager/macOS Keychain → Native Core → Electron Main 的密钥边界。Provider 配置、连接测试、模型调用、Renderer Key 表单、Goal Engine、Planner、Task Graph 和 Plan Review 不属于当前任务，Milestone 2 尚未完成。

## 2. 已完成基线

- Milestone 0：跨平台工程、Native Core health、SQLite migration runner、CI 和最终包 E2E；
- Milestone 1：Workspace、Corporation CRUD、Goal Contract、最小时间线、暂停/继续和应用重启恢复；
- M1-TU-01 至 M1-TU-06 全部完成，未执行必检项为 0，P0/P1 为 0；
- 收口提交 `926c1a5d5d9664a901e79b6b0035f7bc43e76583` 的 GitHub Actions run `30696494722` 在 Windows/macOS 完整通过；
- 本地 Windows NSIS 安装包已从该提交重新构建，同源最终应用真实窗口重启恢复旅程通过，并由用户完成人工验收。

## 3. Milestone 2 范围状态

- [ ] OS 安全存储；
- [ ] OpenAI 风格 Provider + Mock Provider；
- [ ] 连接测试、错误归一化和用量；
- [ ] Goal Engine；
- [ ] Planner 结构化输出与最多一次 JSON 修复；
- [ ] DAG、输入输出和验收验证；
- [ ] Plan Review 编辑与批准 UI；
- [ ] Windows/macOS Milestone 级真实窗口与最终包验收。

这些是 Milestone 范围，不是一个任务单元的完成清单。当前只允许实施 M2-TU-01；相邻能力必须另建合同并达到“就绪”。

## 4. 当前任务边界

M2-TU-01 交付：

- 独立 Rust `secure-store` 平台适配；
- 版本化、鉴权、严格的 `secure_store.status/set/get/delete` Native RPC；
- 仅 Electron Main 可用的 typed 客户端方法；
- Windows Credential Manager 与 macOS Keychain 真实生命周期、重启、隔离、清理和最终包证据；
- Key 不进入 SQLite、Renderer、日志、错误、截图或诊断文本。

非范围：Provider 表/迁移、Provider HTTP/连接测试、Onboarding/Settings UI、Goal/Plan 和真实模型调用。

## 5. 活跃阻塞与外部条件

当前无产品、架构、验收或仓库阻塞。

已知条件：

- 系统 PATH 未提供 Node.js，工程验证使用 Codex bundled Node.js；
- Windows 本地可验证 Credential Manager；macOS Keychain 必须由 macOS CI 提供真实平台证据；
- 应用签名与 macOS notarization 不属于当前任务，但属于公开发布前置条件。

## 6. 当前验证摘要

- M1-TU-01 至 M1-TU-06 合同均为“完成”；M2-TU-01 就绪合同提交为 `57cb9f6c94611ade1f21a6a1bb54fd7cb2326f14`；
- `pnpm check`、Rust fmt/clippy、secret scan、协议/Native/Main 单元与故障测试通过；协议 28 项、Desktop 67 项、Native Core 10 项、Workspace Rust 7 项通过；
- 本地 Windows Credential Manager 真实 lifecycle 与引用隔离测试通过；开发态及最终包均通过 status → set → get → rotate → 进程重启 → get → delete → 进程重启 → NOT_FOUND，并确认测试凭据无残留；
- 最新本地 Windows NSIS 安装包 SHA-256 为 `63B5B0901641AD1E6A437CB7BC811F7F9384E9B9E6BE9282FB6B91BEB2FD042F`，包内 Native Core SHA-256 为 `CD11F54ABEAF10FC5011EFB85B224058C3C0AE1261DB237C382937D778C400BE`；真实窗口、Workspace、Goal、暂停/继续与重启恢复回归通过；
- Renderer bundle 定向暴露扫描与 Credential Manager 残留扫描通过；macOS Keychain、macOS 最终包及同源双平台 CI 尚未取得，因此 M2-TU-01 仍为“进行中”。

## 7. 下一步

提交并推送当前实现，取得同一提交的 Windows/macOS CI、真实 OS 安全存储和最终包证据；全部通过后才关闭 M2-TU-01，并为下一解耦任务建立就绪合同。

## 8. 更新规则

- 只记录当前事实，不追加时间线或已失效结论；历史变化由 Git 和 CI 保存；
- 功能、任务或 Milestone 只有通过全部适用验收后才能标记“完成”；
- 设计文档存在或合同就绪不等于功能已经实现；
- 当前任务状态必须与对应任务合同一致；
- 任务通过只关闭自身，不自动推动相邻任务或 Milestone；
- 新阻塞只进入“活跃阻塞”，解除后直接删除；
- 每次完成任务后更新当前结论、验证摘要、阻塞和下一步。
