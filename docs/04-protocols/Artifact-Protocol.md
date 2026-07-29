# Artifact Protocol v1.0

## 1. 目的

Artifact Protocol 定义成果物的身份、版本、内容定位、来源和状态，使 Agent 协作不依赖隐式聊天上下文。

## 2. Artifact Manifest

```ts
type ArtifactStatus = "DRAFT" | "CANDIDATE" | "APPROVED" | "REJECTED" | "SUPERSEDED";
type ArtifactIntegrityStatus = "VALID" | "CORRUPTED" | "MISSING";

type ArtifactManifest = {
  schemaVersion: "1.0";
  id: string;
  corporationId: string;
  taskId: string;
  logicalName: string;
  type: ArtifactType;
  status: ArtifactStatus;
  integrityStatus: ArtifactIntegrityStatus;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
};
```

## 3. Artifact Version

```ts
type ArtifactVersionManifest = {
  artifactId: string;
  version: number;
  creatorRunId: string;
  mediaType: string;
  sizeBytes: number;
  sha256: string;
  storage: {
    kind: "INLINE_JSON" | "MANAGED_FILE" | "WORKSPACE_REF";
    ref: string;
  };
  sourceRefs: ArtifactRef[];
  provenance: ProvenanceRef[];
  baseVersion?: number;
  createdAt: string;
};
```

`storage.ref` 是内部引用或工作区相对路径，不是任意绝对路径。

## 4. 引用

```ts
type ArtifactRef = {
  artifactId: string;
  version?: number;
  sha256?: string;
  selector?: {
    jsonPointer?: string;
    lineStart?: number;
    lineEnd?: number;
    section?: string;
  };
};
```

Task 开始前必须解析到精确版本和哈希。

## 5. 来源

```ts
type ProvenanceRef =
  | { kind: "MODEL_CALL"; id: string }
  | { kind: "TOOL_CALL"; id: string }
  | { kind: "USER_INPUT"; id: string }
  | { kind: "ARTIFACT"; id: string; version: number }
  | { kind: "EVALUATION"; id: string };
```

## 6. 内容传递

- 小 JSON 可内联；
- 文档、代码和大输出使用内容引用；
- IPC 不传输任意大文件；
- UI 通过受控读取 API 分页或分块获取；
- Provider 输入由 main/orchestration 层加载并脱敏。

## 7. Change Set

```ts
type ChangeSetProtocol = {
  id: string;
  corporationId: string;
  taskId: string;
  baseSnapshotId: string;
  operations: (
    | { op: "CREATE"; path: string; contentRef: string }
    | { op: "UPDATE"; path: string; baseSha256: string; contentRef: string }
    | { op: "DELETE"; path: string; baseSha256: string }
  )[];
  risk: "LOW" | "MEDIUM" | "HIGH";
};
```

v0.1 的 `DELETE` 默认需要人工审批，即使路径在工作区内。

## 8. 状态事件

- `artifact.created`
- `artifact.version.committed`
- `artifact.approved`
- `artifact.rejected`
- `artifact.superseded`
- `changeset.proposed`
- `changeset.approved`
- `changeset.committed`
- `changeset.conflict`

## 9. 完整性

- 每个 Version 有 SHA-256；
- 数据库元数据与文件提交使用恢复记录协调；
- 读取时可按策略重新验证哈希；
- 哈希不匹配即标记损坏，不向 Agent 提供为可信输入；
- 工作区外部修改产生 Conflict。

## 10. 安全

- 路径规范化在 Native Core 完成；
- 拒绝 `..`、符号链接逃逸和盘符切换；
- HTML/Markdown 预览禁止任意脚本；
- Secret 内容标记敏感，不自动发送远程 Provider；
- 删除操作不通过“新版本为空”伪装。

## 11. 验收

- Artifact 可被精确版本引用；
- 内容和元数据可校验；
- 来源链完整；
- Change Set 可检测冲突并防越界；
- 大内容不经 IPC 一次性复制。
