# AI Corporation Desktop 项目进度

| 属性 | 当前值 |
|---|---|
| 当前产品版本 | v0.1 MVP |
| 当前阶段 | M2-TU-03 Provider 连接测试实施 |
| 当前 Milestone | Milestone 2：Provider 与 Goal/Plan |
| 当前任务单元 | M2-TU-03（就绪） |
| 总体状态 | 进行中 |
| 最近更新 | 2026-08-02 |
| 下一检查点 | M2-TU-03 实现候选通过本地合同矩阵后提交双平台 CI |

## 1. 当前结论

Milestone 1 已完成并经用户人工安装验收；当前没有已知未解决 P0/P1。[M2-TU-02 应用自管 Provider Key Vault](docs/06-engineering/task-units/M2-TU-02-application-key-vault.md) 已完成。[M2-TU-03 Provider 连接测试](docs/06-engineering/task-units/M2-TU-03-provider-connection-test.md) 已根据用户确认的范围 A、`1A + 2A + 3A + 4A` 和固定 15 秒超时决策建立就绪合同，尚未开始功能实现或验收。

M2-TU-03 只承诺 OpenAI-compatible/测试专用 Mock Adapter、非生成连接测试、固定错误归一化、持久化测试结果/模型列表和 Settings 测试交互。真实模型生成、usage、运行时健康/熔断、完整 Onboarding、Goal Engine、Planner、Task Graph 和 Plan Review 不属于本任务，Milestone 2 尚未完成。

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

## 4. 当前任务边界

M2-TU-03 就绪合同包含：

- OpenAI-compatible `GET <base>/models` 与同接口 Deterministic Mock Adapter；
- 远程 HTTPS、loopback HTTP、禁止 redirect/URL 凭据/query/fragment、15 秒截止和可取消；
- 固定错误归一化、`0007` 持久化测试结果/模型列表及配置版本失效保护；
- `provider.testConnection/cancelConnectionTest` typed IPC 和 Settings 真实状态；
- Windows/macOS 开发态与最终包的成功、失败、取消、超时、重启恢复和泄密矩阵。

非范围：真实模型生成、usage/费用、Provider runtime health/熔断/回退、正式 Mock 类型、完整 Onboarding、Goal/Plan。

## 5. 活跃阻塞与外部条件

M2-TU-03 当前无产品、架构、验收或仓库阻塞。任务范围、连接方式、Mock 形态、Endpoint 安全、结果持久化和超时策略均已由用户明确决策；合同就绪不表示功能已实现或通过验收。

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

按 M2-TU-03 就绪合同串行实施协议、migration、Adapter、Service/IPC、Settings UI 和隔离测试；只有当前提交的本地合同矩阵通过后才提交双平台 CI。

## 8. 更新规则

- 只记录当前事实，不追加时间线或已失效结论；历史变化由 Git 和 CI 保存；
- 功能、任务或 Milestone 只有通过全部适用验收后才能标记“完成”；
- 设计文档存在或合同就绪不等于功能已经实现；
- 当前任务状态必须与对应任务合同一致；
- 任务通过只关闭自身，不自动推动相邻任务或 Milestone；
- 新阻塞只进入“活跃阻塞”，解除后直接删除；
- 每次完成任务后更新当前结论、验证摘要、阻塞和下一步。
