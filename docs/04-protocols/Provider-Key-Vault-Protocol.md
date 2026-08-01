# Provider Key Vault Protocol

## 1. 范围

本协议定义 Renderer、Preload 与 Electron Main/Application Service 之间的 Provider 配置及 Key Vault v1 合同。Key Vault 由 AI Corporation Desktop 管理：完整 Key 认证加密后存入 SQLite；应用本地加密密钥保存在应用数据目录，不使用 Native Core、Windows Credential Manager 或 macOS Keychain。

本协议不定义 Provider HTTP 请求、连接测试、模型列表、Planner 或真实模型调用。

## 2. 信任边界

- Renderer 不可信，只能调用本协议列出的 typed IPC；
- `list`、`save`、`deleteKey` 和状态事件不得返回 Key、密文、nonce、认证标签或本地加密密钥；
- 只有用户主动触发的 `revealKey` 成功结果可以把完整 Key 返回 Renderer；
- Renderer 中的明文只用于当前输入框显示，不进入持久化状态、URL、日志、错误、事件、截图或诊断 UI；
- Main 负责运行时 Schema 验证、加解密、事务和固定错误映射。

## 3. 公开 DTO

```ts
type ProviderConfigStatus = "ENABLED" | "DISABLED";

type ProviderPublic = {
  schemaVersion: 1;
  id: string;
  type: "OPENAI_COMPATIBLE";
  name: string;
  endpoint: string;
  configStatus: ProviderConfigStatus;
  hasKey: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

type SaveProviderInput = {
  schemaVersion: 1;
  commandId: string;
  providerId?: string;
  expectedVersion?: number;
  name: string;
  endpoint: string;
  configStatus: ProviderConfigStatus;
  key?: string;
};
```

`key` 缺省表示保持已有 Key；创建 Provider 时必须提供非空 Key。`key` 最大 16 KiB，按 UTF-8 字节数计算。公开 Provider DTO 只用 `hasKey` 表示是否存在凭据。

## 4. IPC 方法

| 方法 | 输入 | 成功结果 |
|---|---|---|
| `provider.list` | `{ schemaVersion: 1 }` | `{ schemaVersion: 1, providers: ProviderPublic[] }` |
| `provider.save` | `SaveProviderInput` | `{ schemaVersion: 1, provider: ProviderPublic }` |
| `provider.revealKey` | `{ schemaVersion: 1, providerId: string }` | `{ schemaVersion: 1, providerId: string, key: string }` |
| `provider.deleteKey` | `{ schemaVersion: 1, commandId: string, providerId: string, expectedVersion: number }` | `{ schemaVersion: 1, provider: ProviderPublic }` |

`provider.revealKey` 必须由当前 Provider 编辑界面的明确“显示”动作触发；Preload 不暴露通用数据库、文件、加密或 legacy `secure_store.*` 方法。

## 5. 持久化与加密

- AES-256-GCM v1：每次保存/替换生成新的 12-byte nonce，保存 16-byte authentication tag；
- 应用首次保存 Key 时原子创建 32-byte 本地加密密钥文件，禁止覆盖已有文件；Windows/macOS 均使用当前用户可访问的最小文件权限；
- Provider 与新 Key Vault 记录在同一 `BEGIN IMMEDIATE` 事务关联；替换 Key 只更新既有 Vault 记录并递增 Provider/Vault version；
- 删除 Key 在同一事务中解除 Provider 引用并删除 Vault 记录；Provider 保留且 `hasKey=false`；
- `commandId` 对保存和删除提供幂等回执；相同 commandId、不同规范化请求返回 `IDEMPOTENCY_CONFLICT`；
- `expectedVersion` 不匹配返回 `CONFLICT`，不得覆盖较新值。

## 6. 固定错误

| 错误码 | 含义 |
|---|---|
| `INVALID_REQUEST` | Schema、长度、Endpoint 或字段非法 |
| `UNAUTHORIZED_CALLER` | IPC 调用方不是已授权的应用 Renderer |
| `NOT_FOUND` | Provider 或 Key 不存在 |
| `CONFLICT` | 乐观版本冲突 |
| `IDEMPOTENCY_CONFLICT` | commandId 已用于不同请求 |
| `VAULT_KEY_UNAVAILABLE` | 本地加密密钥缺失、权限拒绝或不可读 |
| `VAULT_INTEGRITY_FAILED` | 加密版本未知、密文损坏或认证失败 |
| `STORAGE_UNAVAILABLE` | SQLite 打开、迁移或事务失败 |
| `INTERNAL` | 未分类内部错误；公开消息不得包含 Key 或底层敏感详情 |

任何失败不得回退为 SQLite 明文、环境变量、命令行参数、OS 安全存储或 Native Core；失败结果必须明确说明保存是否提交以及用户可以重试、删除不可恢复记录或重新录入。

## 7. 生命周期与恢复

- 列表、页面重开、Renderer 重载和应用重启只恢复 `ProviderPublic` 与 `hasKey`，默认遮挡；
- 当前应用会话不需要用户解锁；用户每次主动点击“显示”后才读取明文；离开 Provider 编辑页面、Renderer 重载或应用重启立即丢弃显示状态；
- SQLite 单独备份不保证 Key 可恢复；本任务不提供本地加密密钥导出、跨设备同步或主密钥轮换；
- 本地加密密钥丢失或完整性校验失败时不得返回猜测值。用户可以删除不可恢复的 Vault 记录并重新录入 Provider Key。

## 8. 验收要求

- 空库迁移、旧库升级、外键、约束、幂等、并发、事务故障和重启恢复有直接测试；
- SQLite、WAL/SHM、日志、错误、事件、普通 DTO、Renderer 持久化状态和诊断文本均无明文测试 Key；
- 数据库单独复制后不能解密；数据库与正确本地加密密钥组合可在应用重启后解密；
- 本地加密密钥缺失、权限错误、篡改密文/tag、未知版本均失败关闭；
- 真实 Electron 窗口覆盖保存、默认遮挡、主动显示、替换、删除、页面离开、Renderer 重载和应用重启；
- Windows/macOS 最终包分别验证应用自管 Key Vault，不以 legacy OS secure-store 测试代替。
