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
  permissionMode?: "READ_ONLY" | "READ_WRITE";
}
```

`canonicalRootPath`、`canonicalPath` 和 `pathIdentity` 都属于可信边界数据。

`permissionMode` 是同一 major 内新增的可选字段。Native Core 支持权限探测时必须返回当前真实能力：根目录可读取且受控写探针可创建并清理时返回 `READ_WRITE`；根目录可读取但写入被操作系统拒绝时返回 `READ_ONLY`。探针文件使用不可预测名称、`create_new` 语义并在同一调用内清理；探针创建失败与清理失败必须区分，清理失败不得伪装为只读。

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
- `PERMISSION_PROBE_FAILED`
- `PERMISSION_PROBE_CLEANUP_FAILED`

错误消息和 `data` 不得包含 canonical path、路径身份元数据或用户文件内容。认证失败、无效参数和不支持的 Schema 版本继续使用 Native RPC 通用错误，不得伪装为路径拒绝。

## 6. 版本与兼容

- v1 同 major 只允许新增可选字段；
- 改变字段含义、泄露边界或错误 reason 需要新 Schema 版本；
- TypeScript runtime Schema、Rust 序列化结果、SQLite 映射和本文必须同步；
- Windows 与 macOS 的真实文件系统攻击测试分别提供证据。

## 7. Workspace Repository 语义

持久化层只向可信服务返回 `WorkspaceTrustedRecord`，向 Renderer 返回前必须投影为 `WorkspacePublic`。Repository 至少提供以下能力：

- 以 Workspace ID 读取可信记录；
- 按稳定顺序列出公开记录；
- 保存由可信选择流程产生的新授权；
- 原子更新 `permissionMode`、`accessStatus` 和 `lastVerifiedAt`。

重新打开数据库后必须恢复已提交记录。不存在的 Workspace ID 不得被当作空列表或新记录；唯一 canonical root 冲突不得覆盖已有授权。

重新验证规则：

1. 使用已保存的 `canonicalRootPath` 调用 `workspace.canonicalize`，候选相对路径为空；
2. 当前 `pathIdentity` 与已保存身份相同且根可访问时，更新真实 `permissionMode`、置 `AVAILABLE` 并记录 `lastVerifiedAt`；
3. 根不存在时置 `MISSING`，权限被拒绝时置 `PERMISSION_DENIED`；
4. 身份不同、返回身份无法比较或验证结果不完整时置 `UNVERIFIED`；
5. 身份变化不得覆盖已保存的 `canonicalRootPath` 或 `pathIdentity`，只有新的用户授权流程可以替换授权边界；
6. 每次验证尝试只更新该 Workspace，不得改变其他记录。

`permissionMode` 表示最近一次成功验证的真实能力；当 `accessStatus` 不是 `AVAILABLE` 时，不得把该字段解释为当前可执行授权。

## 8. Desktop IPC

Renderer 只通过 typed preload 使用以下 allowlisted channel：

| Channel                | 请求                                                | 成功值               |
| ---------------------- | --------------------------------------------------- | -------------------- |
| `workspace:list`       | 无参数                                              | `WorkspacePublic[]`  |
| `workspace:revalidate` | `{ workspaceId: string }`，strict UUID v7 runtime Schema | `WorkspacePublic`    |
| `workspace:select`     | 无参数                                              | `WorkspaceSelection` |

列表按 `created_at`、`id` 稳定排序。`workspace:revalidate` 只接受 Workspace ID，不接受 Renderer 提供路径、身份、权限或访问状态。

`workspace:select` 只能由 Electron Main 调用系统原生单目录选择器取得授权路径。Renderer 不得提交路径、权限、身份或 Workspace ID。选择结果为 strict 联合：

```ts
type WorkspaceSelection =
  | {
      status: "SELECTED";
      workspace: WorkspacePublic;
    }
  | {
      status: "CANCELLED";
    };
```

用户取消时不得生成 ID 或写入数据库。选择成功后 Main 使用所选目录调用 `workspace.canonicalize` 的空候选，要求返回 `permissionMode`，在可信边界生成 UUID v7 并持久化 `AVAILABLE` 记录。同一 canonical root 与身份重复选择时返回并重新验证已有记录；canonical root 相同但身份不一致时不得覆盖原授权。

IPC 使用显式结果联合，避免把 Electron 异常字符串当作产品协议：

```ts
type WorkspaceIpcErrorCode =
  | "WORKSPACE_NOT_FOUND"
  | "NATIVE_CORE_UNAVAILABLE"
  | "STORAGE_UNAVAILABLE"
  | "VERIFICATION_FAILED"
  | "SELECTION_UNAVAILABLE"
  | "IPC_UNAUTHORIZED"
  | "INVALID_REQUEST";

type WorkspaceIpcResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      error: {
        code: WorkspaceIpcErrorCode;
        message: "Workspace operation failed";
      };
    };
```

Main 必须验证调用窗口来源、请求 Schema 和 channel allowlist；Preload 必须验证响应 Schema。失败结果不得包含 canonical path、路径身份、数据库错误、用户文件内容或 Native Core 原始错误。

生产默认只能使用 Electron 原生目录选择器。跨平台 E2E 可以由 Main 在显式测试环境中消费一次性的可信目录 fixture，以验证 Renderer → Main → Native Core → SQLite → Renderer 重载链路；该 fixture 不通过 preload 暴露、不能由 Renderer 修改，且不能替代原生目录选择适配器的独立合同测试。
