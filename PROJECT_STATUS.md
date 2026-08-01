# AI Corporation Desktop 项目进度

| 属性 | 当前值 |
|---|---|
| 当前产品版本 | v0.1 MVP |
| 当前阶段 | Milestone 2 Provider/Key Vault 实施与验收 |
| 当前 Milestone | Milestone 2：Provider 与 Goal/Plan |
| 当前任务单元 | M2-TU-02（进行中） |
| 总体状态 | 进行中 |
| 最近更新 | 2026-08-02 |
| 下一检查点 | M2-TU-02 完成开发态与 Windows 最终包真实窗口验收 |

## 1. 当前结论

Milestone 1 已完成并经用户人工安装验收；当前没有已知未解决 P0/P1。[M2-TU-01 OS 安全存储边界](docs/06-engineering/task-units/M2-TU-01-os-secure-store-boundary.md) 已在实现提交 `66b466f60f7a5d16d31605cd6494db65a3820781` 上通过当时合同的全部验收，状态为“完成”，但用户随后明确废弃其产品存储方案，故不再计入当前 Milestone 2 的 Key 管理完成状态。[M2-TU-02 应用自管 Provider Key Vault](docs/06-engineering/task-units/M2-TU-02-application-key-vault.md) 已基于用户确认的 `1B + 2B + 3A` 设计进入实现与验收；当前仅记录已执行的工程检查结果，验收项在对应直接证据完整前保持未勾选。

本任务只交付应用自管 SQLite Provider Key Vault、应用本地加密密钥和 Settings / Providers 管理界面。Provider 网络连接、模型调用、Goal Engine、Planner、Task Graph 和 Plan Review 不属于当前任务，Milestone 2 尚未完成。

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

当前无产品、架构、验收或仓库阻塞。用户已明确选择 `1B + 2B + 3A`：应用自行生成并保存本地加密密钥；Key Vault 密文及加密元数据进入 SQLite；当前会话中用户主动点击即可查看明文，离开页面、Renderer 重载或应用重启后重新遮挡。该决策的已知限制是：同时取得 SQLite 和应用本地加密密钥的攻击者可以解密，SQLite 单独备份不能恢复 Key。

已知条件：

- 系统 PATH 未提供 Node.js，工程验证使用 Codex bundled Node.js；
- M2-TU-02 的 macOS 开发态、最终包和 artifact 证据必须由待推送实现提交的 macOS CI job 提供，旧 M2-TU-01 Keychain 证据不能替代；
- 应用签名与 macOS notarization 不属于当前任务，但属于公开发布前置条件。

## 6. 当前验证摘要

- M1-TU-01 至 M1-TU-06 合同均为“完成”；M2-TU-02 当前为“进行中”，16 项验收断言尚未在跨平台同提交证据完成前勾选；
- 最新 `pnpm check` 全量通过：状态/任务合同、format、lint、typecheck、协议 24 项、Storage 67 项、Desktop 77 项、Native Core 7 项、Workspace Rust 7 项、Rust fmt/clippy 与 secret scan 均成功；
- 本地 Windows 开发态真实窗口 E2E 2/2 通过；Key Vault 旅程覆盖保存、默认遮挡、主动显示/隐藏、SQLite/WAL/SHM 明文扫描、Renderer reload、进程重启、替换、再次显示、删除与无障碍检查，既有 Workspace/Goal/暂停恢复旅程同步通过；
- 最新本地 Windows NSIS 安装包 SHA-256 为 `B1DA707528526A23E181263AEA22501D4A7B366A288B097182F2D00ED70B1AA1`，包内 Native Core SHA-256 为 `ACDBD55FF932A593D2796E670C77F8423E35BB093C83F9624139DF79B2F186AF`；最终包真实窗口完成 Key Vault、Workspace、Goal 故障重试、暂停/继续和两次进程重启恢复旅程；
- 活跃产品源码与 Windows 最终包的 legacy `secure_store.*`/`secure-store` 定向扫描通过，打包诊断与 SQLite/WAL/SHM 定向 Key 泄漏扫描通过；P0/P1 为 0；
- 尚未执行的必检项为 1 组：待推送实现提交的 Windows/macOS GitHub Actions 全部步骤、macOS 最终包旅程与双平台 artifacts。该项完成前不得标记 M2-TU-02 完成。

## 7. 下一步

提交并推送 M2-TU-02 实现候选，等待同一提交的 Windows/macOS GitHub Actions；如全部适用步骤和 artifacts 通过，再更新合同断言与收口状态。任何新歧义先请求用户决策。

## 8. 更新规则

- 只记录当前事实，不追加时间线或已失效结论；历史变化由 Git 和 CI 保存；
- 功能、任务或 Milestone 只有通过全部适用验收后才能标记“完成”；
- 设计文档存在或合同就绪不等于功能已经实现；
- 当前任务状态必须与对应任务合同一致；
- 任务通过只关闭自身，不自动推动相邻任务或 Milestone；
- 新阻塞只进入“活跃阻塞”，解除后直接删除；
- 每次完成任务后更新当前结论、验证摘要、阻塞和下一步。
