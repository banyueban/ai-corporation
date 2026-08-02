# AI Corporation Desktop 项目进度

| 属性 | 当前值 |
|---|---|
| 当前产品版本 | v0.1 MVP |
| 当前阶段 | M2-TU-04 已收口；下一任务合同准备 |
| 当前 Milestone | Milestone 2：Provider 与 Goal/Plan |
| 当前任务单元 | M2-TU-04（完成） |
| 总体状态 | 进行中 |
| 最近更新 | 2026-08-02 |
| 下一检查点 | 审阅 Goal Engine 权威文档，先向用户提交歧义与可执行决策方案，再建立下一任务合同 |

## 1. 当前结论

Milestone 0、Milestone 1 已完成，Milestone 1 已经用户人工安装验收。当前没有已知未解决 P0/P1。

[M2-TU-02 应用自管 Provider Key Vault](docs/06-engineering/task-units/M2-TU-02-application-key-vault.md)、[M2-TU-03 Provider 连接测试](docs/06-engineering/task-units/M2-TU-03-provider-connection-test.md)和[M2-TU-04 Provider 非流式生成与 usage](docs/06-engineering/task-units/M2-TU-04-provider-generation-usage.md)均已完成。M2-TU-04 在候选提交 `4822e9939536bd858bdd7a82be3045151e882773` 上通过本地工程检查、Windows 开发态与最终包真实窗口、Windows/macOS 同提交 CI、真实 Provider 生成和泄密扫描。

M2-TU-04 交付 Chat Completions 非流式 Adapter、dialect-neutral 通用协议、精确模型选择、标准 usage、5–300 秒可配置超时、Settings 测试生成、取消/迟到/恢复保护，以及可独立验证的 dialect Adapter registry。registry 证明未来 Responses Adapter 可与 Chat Adapter 并存且不能替换已有 Adapter。Responses、所有 streaming、Goal Engine、Planner、Task Graph 和 Plan Review 不属于该任务；Milestone 2 尚未完成。

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

当前无产品、架构、仓库或外部资源阻塞。下一任务合同尚未建立，不能开始 Goal Engine 实现；必须先按文档路由识别歧义，并把原文、影响、2–3 个方案、推荐理由和决策项提交用户选择。

已知条件：

- 系统 PATH 未提供 Node.js，工程验证使用 Codex bundled Node.js；
- 真实 Key 由用户在正式 Renderer 中保存并由应用自管 Key Vault 管理，未进入命令、脚本、环境变量、Git 或截图；
- 应用自管 Key Vault 的已知限制是：同时取得 SQLite 和应用本地主密钥的攻击者可以解密，SQLite 单独备份不能恢复 Key；
- 真实 Provider 首次请求在 60 秒观察窗口边缘完成；把应用内可配置超时调整为 120 秒后重新发起的独立请求直接成功。该外部延迟未形成 P0/P1；
- 应用签名与 macOS notarization 不属于 M2-TU-04，但属于公开发布前置条件。

## 6. 当前验证摘要

- 候选提交 `4822e9939536bd858bdd7a82be3045151e882773` 的 `pnpm check` 全量通过：Protocol 31、Provider 27、Storage 72、Desktop 85、Native Core 7、workspace Rust 7，format/lint/typecheck、Rust fmt/clippy 和 secret scan 均成功；Windows 开发态 Electron E2E 4/4 通过；
- Provider registry 的 2 项专门测试覆盖 Chat/未来 Responses dialect 同时注册与精确路由、禁止重复替换以及未知 dialect 拒绝；通用协议和持久化没有 Chat 专属 DTO；
- 下载的同提交 Windows artifact 已按 GitHub digest `ce53385389c7abdcaa8d79c34faa09730784e9bc6716b72f42eabff4e3085a8d` 校验；最终包旅程直接通过生成成功/usage、取消保留旧结果、5 秒配置超时、429 限流、恢复成功和进程重启不自动重放；
- Windows NSIS SHA-256 为 `8E6AE2D731B078787CCFF4672C41A586F4A8F0427E8670C74B106D71A2BCFE8E`，包内 Native Core SHA-256 为 `9063A461DA75BF124C28BB596FFA75CA3128334D6ADF34B13B7447DF193BBB9D`，generation 截图 SHA-256 为 `DEADCA6C26E3FDD92032D7CC04EA55BA0084428621D928F45CE7936E73693525`；
- GitHub Actions run `30738607539` 完整成功；Windows job `91471838105`、macOS job `91471838083` 的工程检查、开发态 E2E、最终包构建、最终包 E2E 和上传步骤全部成功；
- Windows artifact ID `8830535933`、SHA-256 `ce53385389c7abdcaa8d79c34faa09730784e9bc6716b72f42eabff4e3085a8d`；macOS artifact ID `8830517482`、SHA-256 `19b3de62bd4e8220591d3d193b52cf528e2c89c2583d7db997a14fa286286694`；
- 同一 Windows 候选最终包的正式 Renderer 显示真实 Provider 为 `Verified`，精确模型为 `deepseek-v4-flash`；独立生成于 2026-08-02 16:07:03（Asia/Shanghai）成功，完成时间前移，stop reason 为 `OUTPUT_LIMIT`，usage 为 input 94、output 32、cached input 0、reasoning 27，cost 为 UNKNOWN；未记录输出正文或 Key；
- 应用正常关闭后，对正式 userData 的 SQLite 与两个浏览器存储日志共 3 个当前持久化文件定向扫描：Key 形态和 Authorization Bearer 明文发现均为 0，应用主密钥文件为 32 字节；P0/P1 为 0，未执行必检项为 0。

## 7. 下一步

只进行下一任务的合同准备：按文档中心路由审阅 Goal Engine 直接涉及的产品、协议、模块、数据、安全与 UI 权威文档；如存在任何歧义，先提交详细决策方案由用户选择。用户完成决策、权威文档同步且新合同达到“就绪”前，不实施 Goal Engine。

## 8. 更新规则

- 只记录当前事实，不追加时间线或已失效结论；历史变化由 Git 和 CI 保存；
- 功能、任务或 Milestone 只有通过全部适用验收后才能标记“完成”；
- 设计文档存在或合同就绪不等于功能已经实现；
- 当前任务状态必须与对应任务合同一致；
- 任务通过只关闭自身，不自动推动相邻任务或 Milestone；
- 新阻塞只进入“活跃阻塞”，解除后直接删除；
- 每次完成任务后更新当前结论、验证摘要、阻塞和下一步。
