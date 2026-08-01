# AI Corporation Desktop 项目进度

| 属性 | 当前值 |
|---|---|
| 当前产品版本 | v0.1 MVP |
| 当前阶段 | Milestone 2 下一任务单元定义 |
| 当前 Milestone | Milestone 2：Provider 与 Goal/Plan |
| 当前任务单元 | M2-TU-01（完成） |
| 总体状态 | 进行中 |
| 最近更新 | 2026-08-01 |
| 下一检查点 | 用户明确选择 Key Vault 的静态保护、解锁与恢复方案 |

## 1. 当前结论

Milestone 1 已完成并经用户人工安装验收；当前没有已知未解决 P0/P1。[M2-TU-01 OS 安全存储边界](docs/06-engineering/task-units/M2-TU-01-os-secure-store-boundary.md) 已在实现提交 `66b466f60f7a5d16d31605cd6494db65a3820781` 上通过当时合同的全部验收，状态为“完成”，但用户随后明确废弃其产品存储方案：Provider Key 改由 AI Corporation Desktop 应用自管 Key Vault 保存和管理，Renderer 默认遮挡且可由用户主动查看明文。因此 M2-TU-01 不再计入当前 Milestone 2 的 Key 管理完成状态。当前尚无新的就绪任务合同，不得提前实施替代方案。

本任务只建立 Windows Credential Manager/macOS Keychain → Native Core → Electron Main 的密钥边界。Provider 配置、连接测试、模型调用、Renderer Key 表单、Goal Engine、Planner、Task Graph 和 Plan Review 不属于当前任务，Milestone 2 尚未完成。

## 2. 已完成基线

- Milestone 0：跨平台工程、Native Core health、SQLite migration runner、CI 和最终包 E2E；
- Milestone 1：Workspace、Corporation CRUD、Goal Contract、最小时间线、暂停/继续和应用重启恢复；
- M1-TU-01 至 M1-TU-06 全部完成，未执行必检项为 0，P0/P1 为 0；
- 收口提交 `926c1a5d5d9664a901e79b6b0035f7bc43e76583` 的 GitHub Actions run `30696494722` 在 Windows/macOS 完整通过；
- 本地 Windows NSIS 安装包已从该提交重新构建，同源最终应用真实窗口重启恢复旅程通过，并由用户完成人工验收。

## 3. Milestone 2 范围状态

- [ ] AI Corporation Desktop 应用自管 Key Vault；
- [ ] OpenAI 风格 Provider + Mock Provider；
- [ ] 连接测试、错误归一化和用量；
- [ ] Goal Engine；
- [ ] Planner 结构化输出与最多一次 JSON 修复；
- [ ] DAG、输入输出和验收验证；
- [ ] Plan Review 编辑与批准 UI；
- [ ] Windows/macOS Milestone 级真实窗口与最终包验收。

这些是 Milestone 范围，不是一个任务单元的完成清单。M2-TU-01 只关闭 OS 安全存储；相邻能力必须另建合同并达到“就绪”。

## 4. 最近完成任务边界

M2-TU-01 已交付，但用户随后纠正了产品存储方案；该 OS secure-store 能力不再计入当前 Milestone 2 的 Key 管理交付：

- 独立 Rust `secure-store` 平台适配；
- 版本化、鉴权、严格的 `secure_store.status/set/get/delete` Native RPC；
- 仅 Electron Main 可用的 typed 客户端方法；
- Windows Credential Manager 与 macOS Keychain 真实生命周期、重启、隔离、清理和最终包证据；
- Key 不进入 SQLite、Renderer、日志、错误、截图或诊断文本。

非范围：Provider 表/迁移、Provider HTTP/连接测试、Onboarding/Settings UI、Goal/Plan 和真实模型调用。

## 5. 活跃阻塞与外部条件

当前存在产品设计阻塞：用户已明确 Key 由 AI Corporation Desktop 应用存储和管理，Key 可以进入 Renderer、默认遮挡且可由用户主动查看明文；但 Key Vault 的静态保护、解锁与恢复方式尚未定义。不同选择会改变数据库结构、启动与查看流程、备份可移植性、安全边界和验收断言。依照歧义决策门禁，在用户明确选择方案并同步权威文档前，不得创建“就绪”的 M2-TU-02 合同或开始实现。

已知条件：

- 系统 PATH 未提供 Node.js，工程验证使用 Codex bundled Node.js；
- Windows Credential Manager 已在本地和 CI 验证；macOS Keychain 已由 macOS CI 验证；
- 应用签名与 macOS notarization 不属于当前任务，但属于公开发布前置条件。

## 6. 当前验证摘要

- M1-TU-01 至 M1-TU-06 合同均为“完成”；M2-TU-01 就绪合同提交为 `57cb9f6c94611ade1f21a6a1bb54fd7cb2326f14`；
- `pnpm check`、Rust fmt/clippy、secret scan、协议/Native/Main 单元与故障测试通过；协议 28 项、Desktop 67 项、Native Core 10 项、Workspace Rust 7 项通过；
- 本地 Windows Credential Manager 真实 lifecycle 与引用隔离测试通过；开发态及最终包均通过 status → set → get → rotate → 进程重启 → get → delete → 进程重启 → NOT_FOUND，并确认测试凭据无残留；
- 最新本地 Windows NSIS 安装包 SHA-256 为 `63B5B0901641AD1E6A437CB7BC811F7F9384E9B9E6BE9282FB6B91BEB2FD042F`，包内 Native Core SHA-256 为 `CD11F54ABEAF10FC5011EFB85B224058C3C0AE1261DB237C382937D778C400BE`；真实窗口、Workspace、Goal、暂停/继续与重启恢复回归通过；
- GitHub Actions run `30699032779` 在实现提交 `66b466f60f7a5d16d31605cd6494db65a3820781` 上完成；Windows job `91366656485` 与 macOS job `91366656507` 均成功，工程检查、开发态 E2E、最终包构建、最终包 E2E 和 artifact 上传步骤全部通过；
- Artifacts `ai-corporation-windows-x64`（ID `8818236752`）与 `ai-corporation-macos-arm64`（ID `8818217904`）可用；Renderer bundle 定向暴露扫描与 Credential Manager 残留扫描通过；P0/P1 为 0，未执行必检项为 0。

## 7. 下一步

先由用户明确选择 AI Corporation Desktop 自管 Key Vault 的静态保护、解锁与恢复方案。决策后，先同步产品、安全、数据和 UI 权威文档，再建立 M2-TU-02 合同；合同必须定义 Provider/Key Vault 一致性、失败补偿及废弃 OS secure-store 路径的处理，达到“就绪”并单独提交后再实施。

## 8. 更新规则

- 只记录当前事实，不追加时间线或已失效结论；历史变化由 Git 和 CI 保存；
- 功能、任务或 Milestone 只有通过全部适用验收后才能标记“完成”；
- 设计文档存在或合同就绪不等于功能已经实现；
- 当前任务状态必须与对应任务合同一致；
- 任务通过只关闭自身，不自动推动相邻任务或 Milestone；
- 新阻塞只进入“活跃阻塞”，解除后直接删除；
- 每次完成任务后更新当前结论、验证摘要、阻塞和下一步。
