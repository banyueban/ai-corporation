# AI Corporation Desktop 项目进度

| 属性 | 当前值 |
|---|---|
| 当前产品版本 | v0.1 MVP |
| 当前阶段 | M2-TU-04 Provider 非流式生成与 usage 合同就绪 |
| 当前 Milestone | Milestone 2：Provider 与 Goal/Plan |
| 当前任务单元 | M2-TU-04（就绪） |
| 总体状态 | 进行中 |
| 最近更新 | 2026-08-02 |
| 下一检查点 | M2-TU-04 权威文档与合同门禁通过后进入实施 |

## 1. 当前结论

Milestone 1 已完成并经用户人工安装验收；当前没有已知未解决 P0/P1。[M2-TU-02 应用自管 Provider Key Vault](docs/06-engineering/task-units/M2-TU-02-application-key-vault.md) 与 [M2-TU-03 Provider 连接测试](docs/06-engineering/task-units/M2-TU-03-provider-connection-test.md) 均已完成。M2-TU-03 根据用户确认的范围 A、`1A + 2A + 3A + 4A` 和固定 15 秒超时决策交付，并由同一提交的 Windows/macOS 工程检查、开发态真实窗口、最终包真实应用 E2E 和制品门禁直接验收。

[M2-TU-04 Provider 非流式生成与 usage](docs/06-engineering/task-units/M2-TU-04-provider-generation-usage.md) 已按用户确认的 `1A + 2A + 3A + 4A + 5A + 6A` 与 Responses 前向兼容门禁达到“就绪”。当前只承诺 Chat Completions 非流式 Adapter、dialect-neutral 通用协议、精确模型选择、标准 usage、可配置超时、Settings 测试生成和本机真实 Provider smoke；Responses、所有 streaming、Goal Engine、Planner、Task Graph 和 Plan Review 不属于本任务，Milestone 2 尚未完成。

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

这些是 Milestone 范围，不是一个任务单元的完成清单。M2-TU-01 只关闭“不得依赖 OS 安全存储”的边界决策，应用自管 Key Vault 由 M2-TU-02 交付；相邻能力必须另建合同并达到“就绪”。

## 4. 当前任务边界

M2-TU-04 就绪合同只包含：

- dialect-neutral 非流式生成协议、Chat Completions Adapter 与测试专用 Mock；
- 精确模型选择、默认 60 秒且 5–300 秒可配置超时、固定低风险测试生成；
- 标准 usage 与最近生成测试投影、取消/并发/版本变化/迟到保护；
- Settings 结果/错误/恢复 UI、Windows/macOS 自动真实窗口与最终包矩阵；
- 本机正式应用通过 Renderer 保存用户提供资源，并完成一次低输出上限的真实 Provider smoke。

非范围：Responses、streaming、Goal/Plan、JSON Schema/修复、Tool Call、费用估算/预算、Provider runtime health/熔断/回退、正式 Mock 类型。

## 5. 活跃阻塞与外部条件

当前无产品、架构、验收或仓库阻塞。M2-TU-04 的交付范围、API dialect、模型选择、usage、超时、真实资源验收和 Responses/streaming 前向兼容边界均已由用户明确决策；合同就绪不表示实现或验收已经完成。

已知条件：

- 系统 PATH 未提供 Node.js，工程验证使用 Codex bundled Node.js；
- 应用自管 Key Vault 的已知限制是：同时取得 SQLite 和应用本地主密钥的攻击者可以解密，SQLite 单独备份不能恢复 Key；
- 应用签名与 macOS notarization 不属于当前任务，但属于公开发布前置条件。

## 6. 当前验证摘要

- M1-TU-01 至 M1-TU-06、M2-TU-02、M2-TU-03 合同均为“完成”；M2-TU-03 的 16 项验收断言全部通过；
- 最新 `pnpm check` 全量通过：状态/任务合同、format、lint、typecheck、Protocol 27 项、Provider 23 项、Storage 70 项、Desktop 81 项、Native Core 7 项、workspace Rust 7 项、Rust fmt/clippy 与 secret scan 均成功；
- 本地 Windows 开发态真实窗口 E2E 3/3 通过；连接测试覆盖成功、认证失败、取消、10 秒诊断、15 秒超时、Renderer reload、进程重启、配置变化重置、模型列表、键盘/缩放/无障碍和 SQLite/WAL/SHM 泄密扫描，既有 Workspace/Goal/Key Vault 旅程同步通过；
- 最新本地 Windows NSIS 安装包 SHA-256 为 `90BBB52BBD4AF594426AC624F2A8DF477869F7131888AEB020DE39ECC51CE318`，包内 Native Core SHA-256 为 `ACDBD55FF932A593D2796E670C77F8423E35BB093C83F9624139DF79B2F186AF`；同源最终包真实窗口完成连接成功、认证失败、诊断、超时、取消、重启恢复与配置变化重置；
- GitHub Actions run `30714081834` 在验收提交 `a785a483bc150a44bc1be837fc357eb59e376263` 上完整成功；Windows job `91406552961`、macOS job `91406552943` 的工程检查、开发态 E2E、最终包构建、最终包 E2E 和上传步骤全部成功；
- Artifacts `ai-corporation-windows-x64`（ID `8822822844`，SHA-256 `e82c8fe8aa9389354e9f9081d63463ec69a72e64b8f16ce2e55deb0a0ec7450d`）与 `ai-corporation-macos-arm64`（ID `8822808350`，SHA-256 `bb095e11b3db0735ce9a2bc6a2785f75d3caebf68f5de5ed68ebc5f2c4d021b1`）可用；P0/P1 为 0，未执行必检项为 0。

## 7. 下一步

先同步 Provider Generation、Model Provider、数据、安全和 UI 权威文档并运行合同门禁；通过后将 M2-TU-04 标记“进行中”，串行实现协议、`0008`、Adapter、Service/IPC、Settings 与隔离测试。真实 Key 只在自动矩阵通过后由正式 Renderer 写入本机应用自管 Key Vault。

## 8. 更新规则

- 只记录当前事实，不追加时间线或已失效结论；历史变化由 Git 和 CI 保存；
- 功能、任务或 Milestone 只有通过全部适用验收后才能标记“完成”；
- 设计文档存在或合同就绪不等于功能已经实现；
- 当前任务状态必须与对应任务合同一致；
- 任务通过只关闭自身，不自动推动相邻任务或 Milestone；
- 新阻塞只进入“活跃阻塞”，解除后直接删除；
- 每次完成任务后更新当前结论、验证摘要、阻塞和下一步。
