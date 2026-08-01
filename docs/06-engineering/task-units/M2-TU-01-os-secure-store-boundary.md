# M2-TU-01 OS 安全存储边界

| 属性 | 值 |
|---|---|
| 任务单元 ID | M2-TU-01 |
| 状态 | 完成 |
| 所属 Milestone | Milestone 2：Provider 与 Goal/Plan |
| 主要结果 | Native Core 可在 Windows Credential Manager 与 macOS Keychain 中安全保存、读取、轮换和删除 Provider 密钥，已存密钥不进入 SQLite、Renderer、日志或错误 |
| 基线提交 | `926c1a5d5d9664a901e79b6b0035f7bc43e76583` |

## 1. 需求与设计引用

- 用户要求：继续 Milestone 1 之后的下一阶段任务；
- [MVP Plan：Milestone 2](../MVP-Plan.md)；
- [PRD 首次设置、FR-002 与安全隐私](../../01-product/PRD.md)；
- [Model Provider：凭据与测试重点](../../05-infrastructure/Model-Provider.md)；
- [Desktop/Rust Architecture：Native Core 与 `secure_store.*`](../../05-infrastructure/Desktop-and-Rust-Architecture.md)；
- [Data Model：Provider 与敏感数据分类](../../05-infrastructure/Data-Model.md)；
- [Threat Model T-04、T-07](../Threat-Model.md)；
- [Core User Flow 01](../../07-ui/Core-User-Flows.md)与[UI Acceptance UI-AC-01](../../07-ui/UI-Acceptance.md)。

本任务完成后，用户进一步纠正产品方案：完整 Key 改由 AI Corporation Desktop 应用自管 Key Vault 存储和管理，Renderer 默认遮挡但可在用户主动查看时取得明文。因此本合同只证明实现提交当时的 OS adapter 能力，不再代表当前产品方向，也不计入 Milestone 2 的 Key 管理完成状态；替代任务负责停用和移除该路径。

## 2. 前置条件

- Milestone 1 已完成，Native Core 会话令牌、stdin/stdout JSON-RPC、Main 客户端、双平台 CI 和最终包链路可用；
- 当前分支 `main` 与 `origin/main` 均位于基线提交，工作区无源代码改动；
- Windows x64 可使用 Credential Manager，macOS Apple Silicon 可使用 Keychain；不可用时必须返回固定错误并禁止明文降级；
- 不需要真实 Provider、API Key、外部模型网络或 SQLite migration；测试使用随机生成、无真实价值的密钥；
- Rust 依赖必须使用维护中的原生平台适配，禁止通过 shell 或把密钥放入进程参数调用系统 CLI。

## 3. 包含范围

- 新增独立 `secure-store` Rust crate，以固定应用 service namespace 封装 Windows Credential Manager 与 macOS Keychain；
- 定义版本化、严格的 `secure_store.status/set/get/delete` Native RPC 参数、结果和固定错误；
- `secretRef` 使用受控 UUID，secret 非空且有明确字节上限；拒绝控制字符、额外字段、错误版本和非法引用；
- `set` 支持同一引用的显式轮换，`get` 只向受信 Electron Main 返回 secret，`delete` 删除指定引用；不存在引用返回固定 `NOT_FOUND`；
- Native Core 会话鉴权、方法 allowlist、请求上限和固定错误继续适用；
- Main `NativeCoreClient` 增加仅 Main 可调用的 typed secure-store 方法和固定错误映射；
- Preload、`DesktopApi` 与 Renderer 不新增任何 secure-store/secret channel；
- 单元测试、真实 OS 安全存储集成测试、脱敏攻击测试、双平台 CI 和最终包 Native Core 回归。

本任务对 Milestone 2 只交付 OS 安全存储基础边界；Provider 配置、连接测试、模型调用、Goal Engine、Planner、Task Graph 与 Plan UI 仍未完成。

## 4. 非范围

- Renderer/Onboarding/Settings 的 Key 输入、显示、复制或读取；
- Provider 表、`secret_ref` SQLite migration、Provider CRUD、启用/禁用和默认路由；
- OpenAI 风格或 Mock Provider Adapter、HTTP、连接测试、模型列表、错误归一化和用量；
- Goal Engine、Planner、JSON 自动修复、DAG 验证、Plan Review 或批准；
- Key 导入/导出、跨设备同步、备份恢复、组织级共享和公开发布签名；
- 用文件、SQLite、环境变量、命令行参数或可逆自定义加密作为安全存储回退。

## 5. 依赖与接口

- `secure-store` crate 只暴露 `availability`、`set`、`get`、`delete` 的最小接口和不含 secret 的结构化错误；
- Native RPC 使用 `schemaVersion: 1`、会话令牌、`secretRef` 和按方法限定的字段；只有 `set` 请求与成功的 `get` 结果携带 secret；
- service namespace 固定为应用拥有的 Provider credential 空间，测试使用 `M2-TU-01` 随机引用并在 finally/drop 清理；
- `set` 对同一引用执行替换；不同引用严格隔离；`delete` 后 `get` 必须为 `NOT_FOUND`；
- Main 客户端不得记录请求/响应正文，错误对象不得携带 secret、系统账户名或底层平台诊断文本；
- 既有 health/workspace RPC、Sidecar 会话与打包路径保持兼容；
- SQLite、Domain、Provider、Preload 和 Renderer 依赖方向不改变。

## 6. 交付物与所有权

- 专属修改区：`crates/secure-store/`、secure-store RPC 协议/测试、Native Core secure-store handler、Main NativeCoreClient secure-store 方法/测试；
- 共享冲突区：Cargo workspace/lock、protocol exports、Native Core RPC dispatcher、Desktop/Rust Architecture、Model Provider、Threat Model、打包/E2E、`PROJECT_STATUS.md`；
- `0001`–`0005` 不可修改，本任务不占用 migration 编号；
- 共享冲突区由本任务串行集成；相邻任务不得同时增加 Provider credential、Native RPC 或 Preload secret 接口。

## 7. 验收合同

- [x] 协议：四个方法的 Schema/DTO 严格拒绝额外字段、错误版本、非法 UUID、控制字符、空 secret 和超限 secret，错误响应不回显输入；
- [x] 会话与 allowlist：错误会话、未知方法和伪造字段固定拒绝，既有请求大小上限继续生效；
- [x] Windows：真实 Credential Manager 完成 status → set → get → rotate → get → delete → NOT_FOUND，测试后无残留；
- [x] macOS：真实 Keychain 完成同一生命周期，测试后无残留；
- [x] 不可用处理：OS 安全存储不可用或平台调用失败时固定失败，不写文件/SQLite/环境变量且不明文降级；
- [x] 引用隔离：两个随机 `secretRef` 互不读取/覆盖/删除，固定应用 namespace 之外不可访问；
- [x] 机密性：除受信 `get` 成功结果外，stdout/stderr、错误、测试报告、截图和诊断文本均不出现 secret；
- [x] Main 边界：`NativeCoreClient` 可 typed set/get/delete/status，超时、Sidecar 退出、非法响应和固定 Native 错误安全映射；
- [x] Renderer 边界：本任务交付时 Preload、`DesktopApi`、Renderer bundle 和公开 DTO 无 secure-store getter/setter、原始 RPC 或已存 Key 值；后续专用 Provider 单向提交接口不属于本任务；
- [x] 持久化边界：全部 SQLite migration/Schema/数据库内容不含 secret，且本任务不新增 migration；
- [x] 并发与生命周期：不同引用并发操作隔离；Sidecar/应用重启后可读取已保存 secret，删除后重启仍为 NOT_FOUND；
- [x] 最终包：Windows/macOS 同一提交的最终包包含相应 Native Core，health 与安全存储生命周期通过并完成清理；
- [x] 回归：`pnpm check`、`pnpm check:status`、`pnpm check:task-units`、Rust fmt/clippy、既有 Workspace/Corporation/Goal/恢复 E2E 全部通过；
- [x] 安全审计：secret scan 与定向源码/构建产物扫描通过，P0/P1 为 0，未执行必检项为 0。

## 8. 隔离与干扰控制

- 每例使用 `M2-TU-01` + 随机 UUID 的 secretRef 和随机无价值 secret，不读取用户已有凭据；
- 测试 service/account namespace 与生产引用可区分，但走同一平台实现；
- 每例在 finally/drop 中删除凭据；清理失败单独失败并报告精确引用哈希，不输出引用关联的 secret；
- 真实 OS 集成测试串行执行同一引用，不用 sleep 推测完成；并发测试只使用不同引用；
- Fake adapter 只覆盖故障与协议分支，不代替 Windows Credential Manager/macOS Keychain 真实测试；
- 子进程等待退出，stdout/stderr 分别扫描；构建缓存、数据库和 E2E user data 不依赖前序任务残留。

## 9. 证据计划

- `pnpm check:status`、`pnpm check:task-units`、`pnpm check`、`git diff --check`；
- Rust adapter 单元测试和 Windows/macOS 真实 OS lifecycle/隔离/清理测试；
- Native RPC 协议、鉴权、错误、超限、重启、并发和脱敏测试；
- Main 客户端 typed 请求/响应、超时/退出/非法响应测试，以及 Preload/Renderer 无暴露静态断言；
- 定向 SQLite、日志、stderr、Renderer bundle、截图和 artifact secret 扫描；
- 同一提交 Windows/macOS 工程检查、开发态/最终包 Native Core E2E、run/job/artifact ID。

## 10. 完成规则

只有 14 项验收断言的状态 × 平台 × 进程生命周期 × 产物形态证据矩阵全部通过，真实 OS 凭据清理完成，P0/P1 为 0、未执行必检项为 0，方可标记本任务完成。本任务只关闭 OS 安全存储边界，不代表 Provider 配置/连接可用、UI-AC-01、Goal/Plan、Milestone 2 或发布完成。

## 11. 收口证据

- 实现提交：`66b466f60f7a5d16d31605cd6494db65a3820781`；
- GitHub Actions run `30699032779`：Windows x64 job `91366656485`、macOS Apple Silicon job `91366656507` 均成功；两端工程检查、开发态 E2E、最终包构建、最终包 E2E 和 artifact 上传步骤全部成功；
- Artifacts：`ai-corporation-windows-x64`（ID `8818236752`）、`ai-corporation-macos-arm64`（ID `8818217904`），均未过期；
- 本地 Windows 最终包：NSIS SHA-256 `63B5B0901641AD1E6A437CB7BC811F7F9384E9B9E6BE9282FB6B91BEB2FD042F`，包内 Native Core SHA-256 `CD11F54ABEAF10FC5011EFB85B224058C3C0AE1261DB237C382937D778C400BE`；
- Windows/macOS 均完成真实 OS lifecycle、重启与最终包回归；本地 Renderer bundle 暴露扫描和 Windows Credential Manager 残留扫描通过；P0/P1 为 0，未执行必检项为 0。
