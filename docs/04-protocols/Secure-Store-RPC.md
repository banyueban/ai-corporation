# Legacy Native Core Secure Store RPC

> **已废弃：** 该协议由 M2-TU-01 实现并完成当时验收，但后续用户明确决定 Provider Key
> 由 AI Corporation Desktop 应用自管 Key Vault 存储和管理。它不再是产品权威存储，新的
> Provider/Key Vault 任务必须停用并移除该调用路径；本页只保留对现有代码的兼容说明。

## 1. 用途与信任边界

该协议由受信 Electron Main 通过 Native Core 调用，用于在 Windows Credential Manager
或 macOS Keychain 中保存、读取、轮换和删除 Provider secret。它不提供 Renderer、Preload、
SQLite、文件、环境变量或命令行回退接口。

固定 service namespace 为 `com.aicorporation.desktop.provider`。`secretRef` 是 UUID，仅作为
不透明引用；调用方不得从引用推导或编码 secret。只有成功的 `secure_store.get` 响应可携带
secret，其他成功响应、错误和诊断均不得包含 secret 或底层平台错误文本。

## 2. 共同信封与验证

四个方法均使用 JSON-RPC 2.0 和 `schemaVersion: 1`，并复用
[Native Core Health RPC](Native-Health-RPC.md) 的 Sidecar 会话令牌、64 KiB 单请求上限、
方法 allowlist 与一行一消息传输。对象 Schema 均为严格模式，额外字段必须拒绝。

共同参数：

```json
{
  "schemaVersion": 1,
  "sessionToken": "<current sidecar session token>"
}
```

引用型方法额外携带 `secretRef`。`secure_store.set` 还携带非空 UTF-8 `secret`；secret 最大
2048 字节且不得包含 Unicode 控制字符。同一引用再次 `set` 表示显式轮换。

## 3. 方法与结果

| 方法 | 额外参数 | 成功结果 |
|---|---|---|
| `secure_store.status` | 无 | `{ "schemaVersion": 1, "available": true }` |
| `secure_store.set` | `secretRef`, `secret` | `{ "schemaVersion": 1, "stored": true }` |
| `secure_store.get` | `secretRef` | `{ "schemaVersion": 1, "secret": "<secret>" }` |
| `secure_store.delete` | `secretRef` | `{ "schemaVersion": 1, "deleted": true }` |

`set` 与 `delete` 的成功结果不得回显输入。删除后以及引用不存在时，`get` 返回固定
`NOT_FOUND`，不得创建占位凭据或明文降级。

## 4. 固定错误

OS 安全存储操作失败使用固定错误代码 `-32020`：

```json
{
  "code": -32020,
  "message": "Secure store operation failed",
  "data": { "reason": "UNAVAILABLE" }
}
```

`reason` 只允许 `UNAVAILABLE`、`NOT_FOUND`、`REJECTED`、`INTERNAL`。认证失败、版本错误、
非法 UUID、空 secret、控制字符、超限或额外字段继续使用 Native Core 的固定协议错误；任何
错误不得回显请求正文、secret、系统账户名或平台诊断文本。

## 5. 暴露与持久化限制

- Main 的 typed `NativeCoreClient` 是唯一 TypeScript 调用边界；
- Preload、`DesktopApi`、Renderer bundle 和公开 DTO 不暴露原始 secure-store 方法、`secretRef`
  或已存 secret；后续 Provider 提交协议可单向携带用户在专用密码输入框中的本次输入，但不得提供读取或回填路径；
- SQLite 未来只能保存 `secret_ref`，本协议不写数据库；
- Native Core 不通过 shell 或系统 CLI 调用凭据存储；
- 安全存储不可用时必须失败关闭，不得回退到文件、SQLite、环境变量或自定义可逆加密。

## 6. 实现与验收

- TypeScript Schema：[packages/protocols/src/secure-store.ts](../../packages/protocols/src/secure-store.ts)
- OS Adapter：[crates/secure-store/src/lib.rs](../../crates/secure-store/src/lib.rs)
- Rust Server：[crates/native-core/src/lib.rs](../../crates/native-core/src/lib.rs)
- Main Client：[apps/desktop/src/main/native-core-client.ts](../../apps/desktop/src/main/native-core-client.ts)

必须分别在真实 Windows Credential Manager 与 macOS Keychain 上覆盖 status、set、get、轮换、
进程重启、delete、NOT_FOUND、引用隔离和清理，并扫描 stdout、stderr、错误与最终包，确认除
受信 `get` 成功结果外没有 secret。
