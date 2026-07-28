# Artifact System 详细设计

## 1. 目标

Artifact System 管理 AI Corporation 中所有可交付、可引用、可验证、可版本化的成果物。Artifact 是 Agent 间协作与任务恢复的稳定边界。

## 2. Artifact 类型

- `TEXT`：短文本、摘要；
- `JSON`：结构化结果；
- `DOCUMENT`：Markdown 等文档；
- `SOURCE_CODE`：源代码；
- `PATCH`：对工作区的变更集；
- `TEST_REPORT`：测试/构建结果；
- `DECISION_RECORD`：决策与理由；
- `EVALUATION_REPORT`：验收报告；
- `TOOL_OUTPUT`：大型工具输出；
- `MEMORY_CANDIDATE`：待审核经验。

## 3. 元数据与版本

```ts
type Artifact = {
  id: string;
  corporationId: string;
  taskId: string;
  type: ArtifactType;
  logicalName: string;
  status: "DRAFT" | "CANDIDATE" | "APPROVED" | "REJECTED" | "SUPERSEDED";
  currentVersion: number;
  createdAt: string;
};

type ArtifactVersion = {
  artifactId: string;
  version: number;
  creatorRunId: string;
  mediaType: string;
  storageKind: "INLINE_JSON" | "MANAGED_FILE" | "WORKSPACE_REF";
  storageRef: string;
  sha256: string;
  sizeBytes: number;
  sourceRefs: ArtifactRef[];
  baseVersion?: number;
  createdAt: string;
};
```

版本不可变。修订创建新版本。

## 4. 存储策略

- 小型 JSON/文本可存 SQLite；
- 文件和大型输出存 Managed Artifact Store；
- 用户工作区中的文件保存路径、哈希和授权快照；
- Artifact 路径始终使用相对受管路径；
- 存储前计算 SHA-256；
- 临时文件必须与正式存储位于可原子重命名的同一卷。

## 5. 工作区变更

工作区写入采用 Change Set：

```ts
type ChangeSet = {
  id: string;
  taskId: string;
  operations: FileOperation[];
  baseHashes: Record<string, string | null>;
  risk: "LOW" | "MEDIUM" | "HIGH";
  status: "PROPOSED" | "APPROVED" | "COMMITTED" | "CONFLICT" | "REJECTED";
};
```

提交步骤：

1. 解析并规范化路径；
2. 验证在工作区内；
3. 比较基线哈希，检测外部修改；
4. 展示 diff 并执行策略审批；
5. 写临时文件；
6. 原子替换；
7. 记录新哈希与 commit record；
8. 创建 Artifact Version 和事件。

冲突时禁止静默覆盖。

## 6. 来源与可追溯性

Artifact Version 必须记录：

- 创建 Run；
- 输入 Artifact；
- Tool Invocation；
- Model Call；
- Prompt 模板版本；
- 评价报告；
- 用户审批（如有）。

最终交付物可沿引用图追溯到原始 Goal Contract。

## 7. 引用与读取

Agent 通过 `ArtifactRef` 读取：

```ts
type ArtifactRef = {
  artifactId: string;
  version?: number;
  selector?: {
    jsonPointer?: string;
    lineRange?: [number, number];
    section?: string;
  };
};
```

未指定版本时，在 Task 开始时解析为固定版本并写入 Run 快照，防止运行中内容漂移。

## 8. 生命周期

```text
DRAFT → CANDIDATE → APPROVED
                  ↘ REJECTED
APPROVED → SUPERSEDED
```

- `REJECTED` 版本保留用于复盘；
- Corporation 归档后 Artifact 只读；
- 删除 Corporation 时按保留策略处理内部 Artifact，不默认删除用户工作区文件；
- 垃圾回收只清理无引用的临时内容。

## 9. 接口

```ts
interface ArtifactService {
  createDraft(input: CreateArtifactInput): Promise<ArtifactVersion>;
  commitCandidate(input: CommitArtifactInput): Promise<ArtifactVersion>;
  approve(ref: ArtifactRef, evaluationId: string): Promise<void>;
  reject(ref: ArtifactRef, evaluationId: string): Promise<void>;
  resolve(ref: ArtifactRef): Promise<ResolvedArtifact>;
  proposeChangeSet(input: ChangeSetInput): Promise<ChangeSet>;
  commitChangeSet(id: string): Promise<CommitResult>;
  traceLineage(ref: ArtifactRef): Promise<LineageGraph>;
}
```

## 10. 安全

- HTML Artifact 默认按纯文本或严格消毒后预览；
- 禁止加载 Artifact 内远程脚本；
- 文件名不作为可信路径；
- MIME 类型由内容与扩展名共同判断；
- 超大文件限制预览和上下文注入；
- Secret Scanner 在展示与日志前运行；
- 二进制文件默认不发送给远程模型。

## 11. 测试重点

- 不可变版本；
- 原子提交；
- 基线哈希冲突；
- 路径逃逸；
- 引用固定版本；
- 来源图完整；
- 崩溃后临时文件清理；
- Artifact 内容注入不获得权限；
- 用户工作区文件不随 Corporation 内部清理误删。

## 12. v0.1 完成标准

- 文本、JSON、文件、补丁、测试与评价报告可登记；
- 修订保留历史；
- 工作区变更有 diff、审批、原子提交和冲突检测；
- 最终 Artifact 可追溯；
- 大输出不污染 SQLite 与模型上下文。

