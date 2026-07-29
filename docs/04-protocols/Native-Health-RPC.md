# Native Core Health RPC

## 1. 用途与边界

该协议是 Milestone 0 的最小本地健康检查，用于证明以下完整调用链可用：

```text
Sandboxed Renderer → Typed Preload → Electron Main → Rust Native Core
```

它不承载产品功能，也不开放网络端口。Electron Main 以绝对路径、`shell: false`
启动 Sidecar，并通过 stdin/stdout 交换一行一条的 JSON-RPC 消息。

## 2. 会话认证

- Main 每次启动 Sidecar 时生成 32 字节随机值，以十六进制编码；
- 令牌只通过 `AI_CORPORATION_SESSION_TOKEN` 子进程环境变量传递；
- 每个请求都携带令牌，Rust 使用常量时间比较验证；
- 令牌不得进入参数列表、日志、错误响应或 Renderer；
- Sidecar 只继承该令牌，不继承 Main 的完整环境。

## 3. 请求

固定方法名为 `health`，协议版本为 `1`：

```json
{
  "jsonrpc": "2.0",
  "id": "7ec1c20d-e52d-4b30-8f3f-67d737cf6916",
  "method": "health",
  "params": {
    "schemaVersion": 1,
    "sessionToken": "<64-character hex token>"
  }
}
```

单条请求上限为 64 KiB。超限、JSON 无效、参数无效、方法未知或认证失败均返回结构化错误，
不得回显令牌或原始请求内容。

## 4. 成功响应

```json
{
  "jsonrpc": "2.0",
  "id": "7ec1c20d-e52d-4b30-8f3f-67d737cf6916",
  "result": {
    "schemaVersion": 1,
    "status": "ok",
    "version": "0.1.0",
    "pid": 1234
  }
}
```

响应必须且只能包含 `result` 或 `error` 之一。Main 使用 Zod 再次验证响应；请求在 5 秒内
未完成即超时，并清理挂起状态。

## 5. Electron IPC 映射

- 固定 channel：`native:health`；
- Preload 只暴露 `window.desktop.health(): Promise<HealthResult>`，不暴露原始
  `ipcRenderer`；
- Main 同时校验 `webContents` ID 与 `senderFrame` URL；
- Sidecar 不可用时，Renderer 显示降级状态并明确系统操作不可用。

## 6. 实现与验收

- TypeScript Schema：[packages/protocols/src/health.ts](../../packages/protocols/src/health.ts)
- Rust Server：[crates/native-core/src/lib.rs](../../crates/native-core/src/lib.rs)
- Main Client：[apps/desktop/src/main/native-core-client.ts](../../apps/desktop/src/main/native-core-client.ts)

必须覆盖成功、错误令牌、未知方法、畸形 JSON、超大请求、Schema 校验和
Renderer → Rust 真实端到端路径。
