# AI Corporation Desktop 项目进度

| 属性           | 当前值                                                      |
| -------------- | ----------------------------------------------------------- |
| 当前产品版本   | v0.1 MVP                                                    |
| 当前阶段       | M2-TU-05 Goal Engine 实施                                   |
| 当前 Milestone | Milestone 2：Provider 与 Goal/Plan                          |
| 当前任务单元   | M2-TU-05（进行中）                                          |
| 总体状态       | 进行中                                                      |
| 最近更新       | 2026-08-09                                                  |
| 下一检查点     | 用户人工验收 Goal Engine UI；新增尺寸证据形成并验证最终候选 |

## 1. 当前结论

Milestone 0、Milestone 1 已完成，Milestone 1 已经用户人工安装验收。M2-TU-05 此前确认的结构化输出/输出额度 P1 已按用户方案 A 修复：Goal 使用 dialect-neutral `JSON_OBJECT`、65,536 token 上限、完整非空 Schema 示例以及不含正文的安全诊断。新 Windows 最终包真实 Renderer 已连续完成初始生成和两个各 5 轮的澄清周期，共 11 次真实 Provider 调用，所有调用和严格输出 Schema 均成功；用户按 8A 选择保存后，operation 已成为 `GOAL_SAVED`，原子保存 version 1、`PROVIDER` 来源的 DRAFT，剩余问题转为 6 条未确认 HIGH assumptions。当前本地全量工程检查、开发态和最终包真实窗口、产物哈希与正式 userData 泄密扫描均通过；尚待同一候选提交的 Windows/macOS CI 与 artifact 证据，因此尚未关闭 M2-TU-05。此前暴露的 GitHub CLI 凭据已经用户处置并重新认证，仓库文件、commit、CI artifact 与泄密扫描均未发现该凭据；该安全阻断已解除。

[M2-TU-02 应用自管 Provider Key Vault](docs/06-engineering/task-units/M2-TU-02-application-key-vault.md)、[M2-TU-03 Provider 连接测试](docs/06-engineering/task-units/M2-TU-03-provider-connection-test.md)和[M2-TU-04 Provider 非流式生成与 usage](docs/06-engineering/task-units/M2-TU-04-provider-generation-usage.md)均已完成。M2-TU-04 在候选提交 `4822e9939536bd858bdd7a82be3045151e882773` 上通过本地工程检查、Windows 开发态与最终包真实窗口、Windows/macOS 同提交 CI、真实 Provider 生成和泄密扫描。

M2-TU-04 交付 Chat Completions 非流式 Adapter、dialect-neutral 通用协议、精确模型选择、标准 usage、5–300 秒可配置超时、Settings 测试生成、取消/迟到/恢复保护，以及可独立验证的 dialect Adapter registry。registry 证明未来 Responses Adapter 可与 Chat Adapter 并存且不能替换已有 Adapter。Responses、所有 streaming、Goal Engine、Planner、Task Graph 和 Plan Review 不属于该任务；Milestone 2 尚未完成。

[M2-TU-05 Goal Engine 真实生成与有界澄清](docs/06-engineering/task-units/M2-TU-05-goal-engine-generation.md) 已根据用户决策达到“就绪”：真实生成成功后自动保存 `PROVIDER` DRAFT；允许多轮澄清，每周期最多 5 轮且每次续期必须由用户明确选择；每个生成阶段非法 JSON 最多修复一次；用户明确选择 Provider/模型；规划前 model call 使用 corporation/operation/purpose 而不伪造 Task/Run；只发送 Corporation 名称及用户 Goal 字段，不发送 Workspace 路径或文件。达到周期上限后，用户可继续下一个 5 轮周期，或选择保存含未确认 HIGH 假设的草稿/取消。

## 2. 已完成基线

- Milestone 0：跨平台工程、Native Core health、SQLite migration runner、CI 和最终包 E2E；
- Milestone 1：Workspace、Corporation CRUD、Goal Contract、最小时间线、暂停/继续和应用重启恢复；
- M1-TU-01 至 M1-TU-06、M2-TU-02 至 M2-TU-04 均为“完成”，未执行必检项为 0，P0/P1 为 0；
- M2-TU-01 完成“不得依赖 OS 安全存储”的边界决策；应用自管 Key Vault 由 M2-TU-02 交付。

## 3. Milestone 2 范围状态

- [x] AI Corporation Desktop 应用自管 Key Vault；
- [x] OpenAI 风格 Provider + 测试专用 Mock Provider；
- [x] 连接测试、错误归一化和用量；
- [ ] Goal Engine；
- [ ] Planner 结构化输出与最多一次 JSON 修复；
- [ ] DAG、输入输出和验收验证；
- [ ] Plan Review 编辑与批准 UI；
- [ ] Windows/macOS Milestone 级真实窗口与最终包验收。

这些是 Milestone 范围，不是单个任务单元的完成清单。M2-TU-04 只关闭 Provider 非流式生成与标准 usage 基础，不自动关闭后续 Goal/Plan 能力或 Milestone 2。

## 4. 最近完成任务边界

M2-TU-04 已关闭：

- dialect-neutral 非流式生成协议、Chat Completions Adapter 与测试专用 Mock；
- 精确模型选择、默认 60 秒且 5–300 秒可配置超时、固定低风险测试生成；
- 标准 usage 与最近生成测试投影、取消/并发/版本变化/迟到保护；
- Settings 结果/错误/恢复 UI、Windows/macOS 自动真实窗口与最终包矩阵；
- 本机正式应用通过 Renderer 使用已保存资源完成低输出上限的真实 Provider smoke；
- Responses 前向兼容门禁：通用协议无 Chat DTO，Adapter registry 支持多 dialect 并存，Responses 后续新增而不替换 Chat，streaming 另建独立规范化事件协议。

非范围：Responses 实现、任何 streaming、Goal/Plan、JSON Schema/修复、Tool Call、费用估算/预算、Provider runtime health/熔断/回退、正式可选 Mock 类型。

## 5. 活跃阻塞与外部条件

当前无已知产品 P0/P1。M2-TU-05 自动化逐项审计补齐了修复再次失败、第二周期再次到限、版本冲突、中断/重启以及 Goal Engine 1024×700/200% 和 1440×900 专项窗口证据；剩余门禁是用户人工 UI 验收，以及把新增尺寸证据形成新候选后取得同提交 Windows/macOS CI 与 artifacts。两项都通过前不得标记任务完成。

已知条件：

- 系统 PATH 未提供 Node.js，工程验证使用 Codex bundled Node.js；
- 真实 Key 由用户在正式 Renderer 中保存并由应用自管 Key Vault 管理，未进入命令、脚本、环境变量、Git 或截图；
- 应用自管 Key Vault 的已知限制是：同时取得 SQLite 和应用本地主密钥的攻击者可以解密，SQLite 单独备份不能恢复 Key；
- 真实 Provider 首次请求在 60 秒观察窗口边缘完成；应用内可配置超时已调整为 120 秒。当前失败耗时约 38–42 秒，不应归因于 120 秒超时；
- 应用签名与 macOS notarization 不属于 M2-TU-04，但属于公开发布前置条件。

## 6. 当前验证摘要

- 当前工作区 `pnpm check` 完整通过：Protocol 36、Provider 28、Storage 78、Desktop 95、Native Core 7、workspace Rust 7，status/task-unit、format/lint/typecheck、Rust fmt/clippy 和 secret scan 均成功；Windows 开发态 Electron E2E 6/6 通过，Goal Engine 窗口直接覆盖成功、一次修复、修复再次失败、取消、版本冲突、两个完整 5 轮周期、续期再次到限、保存未确认草稿以及异常退出/重启 `INTERRUPTED` 且不重放；实际 Goal HTTP 请求断言 `response_format: json_object`、`max_tokens: 65536` 和非流式；当前源码重新构建的 Windows 最终包 E2E 通过 Native Core、Workspace、Goal、Goal Engine、恢复、Key Vault、Provider 连接/生成及外部请求隔离；
- 前一候选提交 `7d905aba6a3b2933da8ecd0f5ada53a19cd9598f` 的 GitHub Actions run `31292263033` 在 Windows/macOS 完整成功，但逐项验收审计随后发现真实窗口矩阵缺口并补充场景，且新场景发现并修复 EXTENSION_REQUIRED 取消误报 `STORAGE_UNAVAILABLE` 的缺陷；因此该 run 不能作为当前未提交修复的最终同提交证据，必须重跑；
- 最新 Windows 最终包正式 Renderer 使用应用 Key Vault 中已保存的 `deepseek-v4-flash` 完成两个澄清周期：初始生成加 10 轮澄清共 11 次调用全部 `SUCCEEDED`，没有 Provider failure、failure reason 或 model-output diagnostic；用户选择保存后 operation 为 `GOAL_SAVED`，version 1 DRAFT 来源为 `PROVIDER`，7 条 assumptions 中 6 条为未确认 HIGH，聚合 usage 为 input 21,704、output 50,775、cached input 17,792、reasoning 44,701、cost UNKNOWN；
- 当前 Windows NSIS SHA-256 为 `1DA3C15A1075A18880B6F276F9D9EA9FA3102C4337FD8E6B635C87EC7F20250A`，包内 Native Core SHA-256 为 `ACDBD55FF932A593D2796E670C77F8423E35BB093C83F9624139DF79B2F186AF`，Goal Engine 截图 SHA-256 为 `BA9E2A3F21C633568F49B34179C31810A606934E79CB5D7DD566156E27D1957C`；正式应用目录 55 个文件的 Key 形态和 Authorization Bearer 明文扫描命中均为 0；

- 候选提交 `4822e9939536bd858bdd7a82be3045151e882773` 的 `pnpm check` 全量通过：Protocol 31、Provider 27、Storage 72、Desktop 85、Native Core 7、workspace Rust 7，format/lint/typecheck、Rust fmt/clippy 和 secret scan 均成功；Windows 开发态 Electron E2E 4/4 通过；
- Provider registry 的 2 项专门测试覆盖 Chat/未来 Responses dialect 同时注册与精确路由、禁止重复替换以及未知 dialect 拒绝；通用协议和持久化没有 Chat 专属 DTO；
- 下载的同提交 Windows artifact 已按 GitHub digest `ce53385389c7abdcaa8d79c34faa09730784e9bc6716b72f42eabff4e3085a8d` 校验；最终包旅程直接通过生成成功/usage、取消保留旧结果、5 秒配置超时、429 限流、恢复成功和进程重启不自动重放；
- Windows NSIS SHA-256 为 `8E6AE2D731B078787CCFF4672C41A586F4A8F0427E8670C74B106D71A2BCFE8E`，包内 Native Core SHA-256 为 `9063A461DA75BF124C28BB596FFA75CA3128334D6ADF34B13B7447DF193BBB9D`，generation 截图 SHA-256 为 `DEADCA6C26E3FDD92032D7CC04EA55BA0084428621D928F45CE7936E73693525`；
- GitHub Actions run `30738607539` 完整成功；Windows job `91471838105`、macOS job `91471838083` 的工程检查、开发态 E2E、最终包构建、最终包 E2E 和上传步骤全部成功；
- Windows artifact ID `8830535933`、SHA-256 `ce53385389c7abdcaa8d79c34faa09730784e9bc6716b72f42eabff4e3085a8d`；macOS artifact ID `8830517482`、SHA-256 `19b3de62bd4e8220591d3d193b52cf528e2c89c2583d7db997a14fa286286694`；
- 同一 Windows 候选最终包的正式 Renderer 显示真实 Provider 为 `Verified`，精确模型为 `deepseek-v4-flash`；独立生成于 2026-08-02 16:07:03（Asia/Shanghai）成功，完成时间前移，stop reason 为 `OUTPUT_LIMIT`，usage 为 input 94、output 32、cached input 0、reasoning 27，cost 为 UNKNOWN；未记录输出正文或 Key；
- 应用正常关闭后，对正式 userData 的 SQLite 与两个浏览器存储日志共 3 个当前持久化文件定向扫描：Key 形态和 Authorization Bearer 明文发现均为 0，应用主密钥文件为 32 字节；P0/P1 为 0，未执行必检项为 0。

## 7. 下一步

等待用户人工验收 Goal Engine 的信息层级、风险文案、键盘全流程、200% 缩放和 Windows 原生窗口行为；同时提交新增尺寸证据并重跑同提交 Windows/macOS CI 与 artifacts。两项通过后才能勾选任务合同、更新本状态为完成并运行最终状态/合同检查。任务关闭只代表 Goal Engine 任务单元完成，不关闭 Planner、Task Graph、Plan Review 或 Milestone 2。

## 8. 更新规则

- 只记录当前事实，不追加时间线或已失效结论；历史变化由 Git 和 CI 保存；
- 功能、任务或 Milestone 只有通过全部适用验收后才能标记“完成”；
- 设计文档存在或合同就绪不等于功能已经实现；
- 当前任务状态必须与对应任务合同一致；
- 任务通过只关闭自身，不自动推动相邻任务或 Milestone；
- 新阻塞只进入“活跃阻塞”，解除后直接删除；
- 每次完成任务后更新当前结论、验证摘要、阻塞和下一步。
