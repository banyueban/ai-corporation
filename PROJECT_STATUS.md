# AI Corporation Desktop 项目进度

| 属性 | 当前值 |
|---|---|
| 当前产品版本 | v0.1 MVP |
| 当前阶段 | Milestone 2 下一任务边界决策 |
| 当前 Milestone | Milestone 2：Provider 与 Goal/Plan |
| 当前任务单元 | M2-TU-02（完成） |
| 总体状态 | 进行中 |
| 最近更新 | 2026-08-02 |
| 下一检查点 | 用户确认 M2-TU-03 Provider 运行切片边界后建立就绪合同 |

## 1. 当前结论

Milestone 1 已完成并经用户人工安装验收；当前没有已知未解决 P0/P1。[M2-TU-02 应用自管 Provider Key Vault](docs/06-engineering/task-units/M2-TU-02-application-key-vault.md) 已基于用户确认的 `1B + 2B + 3A` 设计完成，验收提交 `b85670dd3a65159729390dc019a3971fe014176c` 的 16 项合同断言、Windows/macOS 开发态与最终包真实窗口、双平台 artifacts 和回归门禁全部通过。

本任务只交付应用自管 SQLite Provider Key Vault、应用本地加密密钥和 Settings / Providers 管理界面。Provider 网络连接、模型调用、Goal Engine、Planner、Task Graph 和 Plan Review 不属于当前任务，Milestone 2 尚未完成。

## 2. 已完成基线

- Milestone 0：跨平台工程、Native Core health、SQLite migration runner、CI 和最终包 E2E；
- Milestone 1：Workspace、Corporation CRUD、Goal Contract、最小时间线、暂停/继续和应用重启恢复；
- M1-TU-01 至 M1-TU-06 全部完成，未执行必检项为 0，P0/P1 为 0；
- 收口提交 `926c1a5d5d9664a901e79b6b0035f7bc43e76583` 的 GitHub Actions run `30696494722` 在 Windows/macOS 完整通过；
- 本地 Windows NSIS 安装包已从该提交重新构建，同源最终应用真实窗口重启恢复旅程通过，并由用户完成人工验收。

## 3. Milestone 2 范围状态

- [x] AI Corporation Desktop 应用自管 Key Vault；
- [ ] OpenAI 风格 Provider + Mock Provider；
- [ ] 连接测试、错误归一化和用量；
- [ ] Goal Engine；
- [ ] Planner 结构化输出与最多一次 JSON 修复；
- [ ] DAG、输入输出和验收验证；
- [ ] Plan Review 编辑与批准 UI；
- [ ] Windows/macOS Milestone 级真实窗口与最终包验收。

这些是 Milestone 范围，不是一个任务单元的完成清单。M2-TU-01 只关闭 OS 安全存储；相邻能力必须另建合同并达到“就绪”。

## 4. 最近完成任务边界

M2-TU-02 已交付应用自管 Provider 配置/Key Vault 垂直切片：

- `0006` Provider/Vault/command Schema、AES-256-GCM 应用自管密文和原子本地主密钥；
- `provider.list/save/revealKey/deleteKey` typed IPC、事务、幂等、乐观并发和失败关闭；
- Settings / Providers 的新增、保存、替换、删除、默认遮挡和用户主动显示；
- Renderer reload、应用重启与 SQLite 恢复，Windows/macOS 开发态和最终包真实窗口证据；
- legacy OS secure-store 产品运行路径、平台依赖与最终包内容移除。

非范围：Provider HTTP/连接测试、错误归一化、用量、Goal/Plan 和真实模型调用。

## 5. 活跃阻塞与外部条件

M2-TU-02 当前无产品、架构、验收或仓库阻塞。下一任务存在需要用户决策的范围歧义：MVP Plan 将“OpenAI 风格 Provider + Mock Provider”与“连接测试、错误归一化和用量”列为相邻交付，但没有规定它们应合并为一个任务单元还是拆分为两个可独立验收切片；未决策前不建立 M2-TU-03 就绪合同。

已知条件：

- 系统 PATH 未提供 Node.js，工程验证使用 Codex bundled Node.js；
- 应用自管 Key Vault 的已知限制是：同时取得 SQLite 和应用本地主密钥的攻击者可以解密，SQLite 单独备份不能恢复 Key；
- 应用签名与 macOS notarization 不属于当前任务，但属于公开发布前置条件。

## 6. 当前验证摘要

- M1-TU-01 至 M1-TU-06、M2-TU-02 合同均为“完成”；M2-TU-02 的 16 项验收断言全部通过；
- 最新 `pnpm check` 全量通过：状态/任务合同、format、lint、typecheck、协议 24 项、Storage 67 项、Desktop 77 项、Native Core 7 项、Workspace Rust 7 项、Rust fmt/clippy 与 secret scan 均成功；
- 本地 Windows 开发态真实窗口 E2E 2/2 通过；Key Vault 旅程覆盖保存、默认遮挡、主动显示/隐藏、SQLite/WAL/SHM 明文扫描、Renderer reload、进程重启、替换、再次显示、删除与无障碍检查，既有 Workspace/Goal/暂停恢复旅程同步通过；
- 最新本地 Windows NSIS 安装包 SHA-256 为 `B1DA707528526A23E181263AEA22501D4A7B366A288B097182F2D00ED70B1AA1`，包内 Native Core SHA-256 为 `ACDBD55FF932A593D2796E670C77F8423E35BB093C83F9624139DF79B2F186AF`；最终包真实窗口完成 Key Vault、Workspace、Goal 故障重试、暂停/继续和两次进程重启恢复旅程；
- 活跃产品源码与 Windows 最终包的 legacy `secure_store.*`/`secure-store` 定向扫描通过，打包诊断与 SQLite/WAL/SHM 定向 Key 泄漏扫描通过；P0/P1 为 0；
- GitHub Actions run `30710176795` 在验收提交 `b85670dd3a65159729390dc019a3971fe014176c` 上完整成功；Windows job `91396134173`、macOS job `91396134182` 的工程检查、开发态 E2E、最终包构建、最终包 E2E 和上传步骤全部成功；
- Artifacts `ai-corporation-windows-x64`（ID `8821644524`，SHA-256 `9c4d49519f570310692d49367dd84bf2bc578728a6614dbe6ddb65deaa506d96`）与 `ai-corporation-macos-arm64`（ID `8821630948`，SHA-256 `93bec8cb0a61a9766dee99cb9b045a080d3d41dd4c6683afa9252bbdc872acd2`）可用；P0/P1 为 0，未执行必检项为 0。

## 7. 下一步

向用户说明 M2-TU-03 范围歧义与拆分方案；仅在用户确认后建立对应任务合同并推进到“就绪”。

## 8. 更新规则

- 只记录当前事实，不追加时间线或已失效结论；历史变化由 Git 和 CI 保存；
- 功能、任务或 Milestone 只有通过全部适用验收后才能标记“完成”；
- 设计文档存在或合同就绪不等于功能已经实现；
- 当前任务状态必须与对应任务合同一致；
- 任务通过只关闭自身，不自动推动相邻任务或 Milestone；
- 新阻塞只进入“活跃阻塞”，解除后直接删除；
- 每次完成任务后更新当前结论、验证摘要、阻塞和下一步。
