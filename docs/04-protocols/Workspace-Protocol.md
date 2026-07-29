# Workspace Protocol

| 属性        | 值                                                                             |
| ----------- | ------------------------------------------------------------------------------ |
| 文档角色    | 规范性                                                                         |
| 权威范围    | Workspace DTO、可信路径元数据、枚举、Native Core canonicalize RPC 与结构化错误 |
| Schema 版本 | 1                                                                              |

## 1. 边界

Workspace 协议分为两个不可混用的视图：

- **Renderer DTO**：只包含用户主动授权、允许展示的信息；
- **可信边界记录**：只在 Electron Main、Rust Native Core 和持久化层之间使用。

Renderer 不得获得 `canonicalRootPath`、`pathIdentity`、原始文件句柄或任意文件系统能力。`displayPath` 只用于展示，不参与安全判断。

## 2. Renderer DTO

```ts
interface WorkspacePublic {
  workspaceId: string; // UUID v7
  displayPath: string;
  permissionMode: "READ_ONLY" | "READ_WRITE";
  accessStatus: "UNVERIFIED" | "AVAILABLE" | "MISSING" | "PERMISSION_DENIED";
}
```

该对象使用 strict runtime Schema；出现额外字段时必须拒绝。

## 3. 可信边界记录

```ts
interface WorkspaceTrustedRecord extends WorkspacePublic {
  canonicalRootPath: string;
  pathIdentity: WorkspacePathIdentity;
  lastVerifiedAt: string | null; // ISO-8601
}
```

`WorkspacePathIdentity` 的 v1 形状：

```ts
type WorkspacePathIdentity =
  | {
      platform: "windows";
      volumeRoot: string;
      rootCreationTime: string;
    }
  | {
      platform: "macos";
      deviceId: string;
      inode: string;
    };
```

- Windows 使用 canonical volume root 与根目录创建时间形成最小重新验证元数据；每次文件操作前仍必须重新 canonicalize，不得把身份快照当作永久授权；
- macOS 使用文件系统 device ID 与 inode；
- 数值元数据使用十进制字符串，避免 JavaScript 安全整数截断；
- `pathIdentity` 与 `canonicalRootPath` 视为敏感路径元数据，不进入 Renderer、普通日志或错误消息。

## 4. `workspace.canonicalize`

该方法只允许 Electron Main 通过已认证的 Native Core RPC 调用，Renderer 不直接调用。

请求：

```json
{
  "jsonrpc": "2.0",
  "id": "workspace-1",
  "method": "workspace.canonicalize",
  "params": {
    "schemaVersion": 1,
    "sessionToken": "<32-256 characters>",
    "rootPath": "<authorized root>",
    "candidateRelativePath": "docs/README.md"
  }
}
```

约束：

- `rootPath` 由可信进程提供；
- `candidateRelativePath` 必须是相对路径；
- `..`、绝对路径、盘符/卷越界和解析到根目录外的链接必须拒绝；
- 对不存在目标，只允许在最近存在父目录仍位于授权根内时返回规范化结果。

成功结果：

```ts
interface WorkspaceCanonicalizeResult {
  schemaVersion: 1;
  canonicalRootPath: string;
  canonicalPath: string;
  relativePath: string;
  targetExists: boolean;
  pathIdentity: WorkspacePathIdentity;
}
```

`canonicalRootPath`、`canonicalPath` 和 `pathIdentity` 都属于可信边界数据。

## 5. 结构化错误

路径拒绝固定使用：

```json
{
  "code": -32010,
  "message": "Workspace path rejected",
  "data": {
    "reason": "OUTSIDE_ROOT"
  }
}
```

`reason` 只能是：

- `INVALID_PATH`
- `ROOT_NOT_FOUND`
- `PERMISSION_DENIED`
- `OUTSIDE_ROOT`
- `LINK_ESCAPE`
- `PATH_IDENTITY_UNAVAILABLE`

错误消息和 `data` 不得包含 canonical path、路径身份元数据或用户文件内容。认证失败、无效参数和不支持的 Schema 版本继续使用 Native RPC 通用错误，不得伪装为路径拒绝。

## 6. 版本与兼容

- v1 同 major 只允许新增可选字段；
- 改变字段含义、泄露边界或错误 reason 需要新 Schema 版本；
- TypeScript runtime Schema、Rust 序列化结果、SQLite 映射和本文必须同步；
- Windows 与 macOS 的真实文件系统攻击测试分别提供证据。
