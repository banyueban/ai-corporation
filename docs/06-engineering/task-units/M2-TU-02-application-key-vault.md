# M2-TU-02 应用自管 Provider Key Vault

| 属性 | 值 |
|---|---|
| 任务单元 ID | M2-TU-02 |
| 状态 | 就绪 |
| 所属 Milestone | Milestone 2：Provider 与 Goal/Plan |
| 主要结果 | 用户可在 AI Corporation Desktop 的 Provider 设置中保存、替换、删除和主动查看 API Key；完整 Key 仅以应用自管密文进入 SQLite，重启后默认遮挡恢复 |
| 基线提交 | `a4810ef6f0bd6ce4368c80a45e40116943838592` |

## 1. 需求与设计引用

- 用户决策：Key 在输入框录入，由 AI Corporation Desktop 存储和管理；Key 可以进入 Renderer，默认不展示明文，用户可主动查看；静态保护、物理存储和查看行为选择 `1B + 2B + 3A`；
- [MVP Plan：Milestone 2](../MVP-Plan.md)；
- [PRD 首次设置、FR-002 与安全隐私](../../01-product/PRD.md)；
- [Provider Key Vault Protocol](../../04-protocols/Provider-Key-Vault-Protocol.md)；
- [Model Provider：凭据](../../05-infrastructure/Model-Provider.md)；
- [SQLite Schema：Provider 与 Key Vault](../../05-infrastructure/SQLite-Schema.md)和[Data Model](../../05-infrastructure/Data-Model.md)；
- [Technical Design](../../02-architecture/Technical-Design.md)与[Desktop/Rust Architecture](../../05-infrastructure/Desktop-and-Rust-Architecture.md)；
- [Threat Model T-04、T-07](../Threat-Model.md)；
- [Core User Flow 01](../../07-ui/Core-User-Flows.md)、[Wireframes UI-01/UI-11](../../07-ui/Wireframes.md)、[Screen State Matrix](../../07-ui/Screen-State-Matrix.md)与[UI Acceptance UI-AC-01](../../07-ui/UI-Acceptance.md)。

本合同只承诺 Provider 配置与应用自管 Key Vault 的可独立验收垂直切片。其静态保护只防止 SQLite 被单独读取时直接暴露 Key；同时取得数据库与应用本地加密密钥的攻击者可以解密，此限制必须在实现、测试和用户文案中保持准确。

## 2. 前置条件

- Milestone 1 已完成，SQLite migration runner、Main/Preload/Renderer typed IPC、真实 Electron 窗口 E2E、最终包和双平台 CI 可用；
- `main` 与 `origin/main` 的设计基线为 `a4810ef6f0bd6ce4368c80a45e40116943838592`，开始实施时工作区无其他源代码改动；
- `0001`–`0005` migration 不可修改；本任务独占 `0006_provider_key_vault.sql`；
- 测试只使用每例随机生成、无真实价值且带 `M2-TU-02` 标记的 Key，不读取或修改用户现有应用数据；
- Windows 本地可完成实现与最终包验收；macOS Apple Silicon 由同一提交的 CI job 提供对应证据；
- 不需要真实 Provider 网络、真实 API Key 或付费模型调用。

## 3. 包含范围

- `0006_provider_key_vault.sql`：建立 `key_vault_entry`、`provider` 和 `provider_command`，实现外键、唯一性、版本、约束和幂等回执；
- Application Service 使用 Node `crypto` 的 AES-256-GCM v1；每次保存生成新 nonce，SQLite 只保存密文、nonce、authentication tag 和版本；
- 首次保存时在注入的应用数据目录原子创建 32-byte 本地加密密钥文件；已有文件禁止覆盖，缺失、权限、长度或读取错误固定失败；
- `provider.list/save/revealKey/deleteKey` 严格 Schema、公开 DTO、乐观版本和命令幂等；
- Provider 创建/编辑与 Key Vault 新建、替换、解除引用/删除分别使用短事务，故障注入下不产生错误关联或明文降级；
- Preload 与 `DesktopApi` 只暴露专用 typed Provider API；普通结果只有 `hasKey`，只有用户明确触发的 `revealKey` 成功结果携带明文；
- Global Settings / Providers 用户界面：新增、编辑、保存、替换、删除、默认遮挡、主动显示、错误和并发冲突状态；
- 页面离开、Renderer reload 和应用重启清除显示状态；重启后 Provider 与 `hasKey` 从 SQLite 恢复，用户再次主动显示可读取明文；
- 停用并移除产品运行路径中的 legacy `secure_store.*`、Main 客户端方法、Native dispatcher handler、测试脚本和 `secure-store` crate/workspace 依赖；历史协议与 M2-TU-01 合同只保留废弃说明；
- migration、Repository/Service、协议、IPC、组件、开发态真实窗口、最终包、Secret 泄漏、故障、跨平台和回归测试。

本任务对 Milestone 2 只交付 Provider 配置持久化与 Key 管理切片；Provider 网络连接和 Goal/Plan 能力仍未完成。

## 4. 非范围

- OpenAI 风格或 Mock Provider HTTP Adapter、连接测试、模型列表、错误归一化、usage 或费用；
- 默认 Planner/Executor/Judge 路由和 Provider 健康/熔断；
- Goal Engine、Planner、JSON 修复、DAG、Plan Review 或真实模型调用；
- 用户主密码、OS Keychain/Credential Manager、Native Core 加解密或任何自动明文回退；
- 本地加密密钥导出、备份、跨设备同步、云同步、恢复码或主密钥轮换；
- 自动捕获系统截图中的主动显示明文；测试和诊断产物必须在遮挡状态采集且不得保存 Key；
- 完整 Onboarding 三步流程、模型策略和预算偏好；本任务只提供可从现有应用导航到达的 Settings / Providers 切片。

## 5. 依赖与接口

- 唯一跨进程合同为 `Provider-Key-Vault-Protocol.md` 与 `packages/protocols` 对应 Schema；不得复制不兼容 DTO；
- `provider.save` 创建时必须包含 Key；编辑时 Key 缺省表示保持，非空表示替换；所有 Key 最大 16 KiB UTF-8；
- `provider.revealKey` 仅接受 Provider ID，服务从关联 Vault 记录解密；不存在、未知版本、tag 篡改和本地加密密钥不可用使用固定脱敏错误；
- `provider.deleteKey` 保留 Provider、设置 `hasKey=false` 并删除无引用 Vault 记录；即使旧密文无法解密也可删除；
- commandId + 规范化请求 SHA-256 提供 `save/deleteKey` 幂等；同 ID 不同请求冲突；expectedVersion 防止覆盖较新配置；
- Provider/Vault Repository 只接受参数化 SQL，不返回原始 SQLite 行或明文给普通查询；
- 本地加密密钥路径由 Application Service 构造并可在测试中注入；不得使用用户 HOME、环境变量或全局真实应用目录作为测试目标；
- Renderer 不获得 Node、数据库、文件、加密原语、Native RPC 或 legacy secure-store 通道；
- 既有 Workspace、Corporation、Goal、pause/resume、health 与打包接口保持兼容。

## 6. 交付物与所有权

- 专属修改区：`0006_provider_key_vault.sql`、Provider/Key Vault protocol 与 repository/service/IPC、Settings Providers UI、M2-TU-02 fixture/E2E/secret scan；
- 移除区：`crates/secure-store/`、Native `secure_store.*` handler、TypeScript legacy secure-store Schema/客户端/脚本及只为该路径存在的依赖；
- 共享冲突区：workspace manifests/lockfiles、migration exports/tests、protocol exports、Main/Preload/DesktopApi、Native dispatcher、Renderer routes/styles、打包脚本、CI、权威设计和 `PROJECT_STATUS.md`；
- `0001`–`0005`、M1 领域协议和已完成合同不可修改；legacy 文档只可更新为当前移除状态，不改写历史验收证据；
- 共享冲突区由本任务串行集成，相邻 Provider、协议、migration、Renderer navigation 或 Native Core 任务不得并行修改。

## 7. 验收合同

- [ ] 协议：四个 Provider 方法的 v1 Schema/DTO 严格拒绝额外字段、错误版本、非法 UUID、非法 Endpoint、空/超限 Key 和非法状态，错误不回显输入；
- [ ] 迁移：空库和 `0001`–`0005` 升级到 `0006` 成功；表、列、STRICT、CHECK、UNIQUE、FK、索引和 foreign key check 与权威 Schema 一致，中断后可重试；
- [ ] 加密：AES-256-GCM v1 每次保存使用不同 nonce；SQLite/WAL/SHM 中没有测试 Key 明文，篡改 ciphertext/tag/nonce 或未知版本固定返回 `VAULT_INTEGRITY_FAILED`；
- [ ] 本地加密密钥：首次保存原子创建 32-byte 文件，后续不覆盖；错误长度、缺失、权限/读取/创建失败返回 `VAULT_KEY_UNAVAILABLE` 且 SQLite 不提交 Key 变更；
- [ ] Provider 生命周期：真实服务完成 create → list(masked) → reveal → replace → reveal → deleteKey → list(hasKey=false) → reveal(NOT_FOUND)，公开普通结果无明文；
- [ ] 事务与补偿：Provider/Vault 创建、替换和删除在各故障注入点保持引用一致、无孤立凭据、无部分成功；删除不可解密记录仍可安全完成；
- [ ] 幂等与并发：相同 commandId/请求返回相同公开结果且不重复写入；同 ID 不同请求冲突；错误 expectedVersion 不覆盖新值；两个 Provider/并发操作隔离；
- [ ] IPC 安全：未注册 channel、非法 payload、伪造 reveal、底层错误和异常固定拒绝；Preload/普通 DTO/事件不暴露密文、nonce、tag、本地加密密钥或通用数据库/文件/Native 方法；
- [ ] 用户界面：可从现有应用进入 Settings / Providers，键盘完成新增、保存、编辑、替换、删除；输入和已存 Key 默认遮挡，只有明确“显示”动作展示明文，再次点击可遮挡；
- [ ] UI 状态：Loading、Empty、Saving、Normal、Conflict、Vault key unavailable、Integrity failed、Storage failed 和删除确认展示准确影响与恢复动作；失败时保留可恢复输入且不显示成功；
- [ ] 显示生命周期：离开 Provider 编辑页、Renderer reload 和应用重启后明文显示状态消失；Provider 与 `hasKey` 恢复，重新主动显示可取回正确 Key；
- [ ] Legacy 移除：产品构建、Native allowlist、Main/Preload/Renderer bundle、workspace/Cargo manifests 和打包产物不再包含可调用 `secure_store.*` 路径或 `secure-store` 平台依赖；历史文档保持明确废弃说明；
- [ ] Secret 泄漏：日志、错误、事件、command receipt、SQLite 非 Vault 列、普通 DTO、HTML、截图、trace、测试报告、stdout/stderr 和诊断文本均不含随机测试 Key；只允许测试内存与明确 reveal 成功值出现；
- [ ] 桌面适配：1024 × 700、1440 × 900 和 200% 缩放下关键表单、显示/遮挡、错误与删除确认可见；键盘、焦点、label、状态公告和窗口控制区通过 UI 专项验收；
- [ ] 最终包与双平台：Windows/macOS 同一提交的开发态及最终包真实窗口分别完成保存 → 默认遮挡 → 显示 → 替换 → reload/restart 默认遮挡 → 再显示 → 删除，fixture 与应用数据清理独立通过；
- [ ] 回归与治理：`pnpm check`、`pnpm check:status`、`pnpm check:task-units`、`git diff --check`、Rust fmt/clippy、既有 Workspace/Corporation/Goal/pause/restart E2E 全部通过；P0/P1 为 0，未执行必检项为 0。

## 8. 隔离与干扰控制

- 每例使用 `M2-TU-02-<random>` user data directory、SQLite、Provider ID、command ID、本地加密密钥文件和随机无价值 Key；
- 测试自行从空目录或声明的 `0005` fixture 建立数据，不读取本机真实应用数据库、Key 文件、构建缓存或其他任务 fixture；
- 数据库、WAL/SHM、日志、stdout/stderr、截图和打包测试目录分别扫描；扫描结果只报告 Key 的 SHA-256 标识，不输出 Key；
- 时间与 UUID 注入；事务和文件故障使用受控 fake，不以 sleep、进程存活或 mock UI 代替真实生命周期；
- Renderer reload、应用进程重启、SQLite 重开和最终包是独立变量；功能断言与 fixture 清理分别报告；
- 测试结束只删除已解析并验证位于任务临时根目录内的资源；清理失败独立失败，不隐藏功能结果；
- Windows/macOS 使用相同协议与数据库断言；平台权限差异单独记录，不用一个平台结果替代另一个。

## 9. 证据计划

- `pnpm check:status`、`pnpm check:task-units`、`pnpm check`、`git diff --check`、Rust fmt/clippy；
- Protocol 严格 Schema 单测，migration 空库/升级/约束测试，Repository/Service 加密、事务、幂等、并发与故障注入测试；
- Main/Preload typed IPC 和 Renderer 组件/可访问性测试；
- 开发态与最终包 Playwright Electron 真实窗口旅程、reload/restart 矩阵和三种尺寸/缩放证据；
- SQLite/WAL/SHM、日志、错误、receipt、Renderer bundle、HTML、截图、trace、stdout/stderr 与最终 artifacts 定向 Secret 扫描；
- legacy `secure_store.*`/平台依赖的源码、依赖图、Native allowlist 和最终包移除扫描；
- 同一验收提交的 GitHub Actions run、Windows/macOS job、最终包 artifact ID、哈希与步骤级结果。

## 10. 完成规则

只有 16 项验收断言的状态 × 平台 × Renderer/进程/数据库生命周期 × 开发态/最终包证据矩阵全部通过，测试 fixture 和本地加密密钥文件清理完成，P0/P1 为 0、未执行必检项为 0，方可标记本任务完成。本任务只关闭应用自管 Provider 配置/Key Vault 切片，不代表 Provider 网络连接、UI-AC-01 完整 Onboarding、Goal/Plan、Milestone 2 或发布完成。

## 11. 收口证据

任务尚未实施。本节只在同一验收提交的全部适用断言通过后填写；不得以设计、构建成功、进程存活、旧 M2-TU-01 OS secure-store 证据或单平台结果提前勾选。
