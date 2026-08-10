# Planner Protocol v1.0

## 1. 目的与阶段边界

Planner Protocol 定义把当前已批准 Goal Contract 发送给用户明确选择的 Provider/精确模型，生成结构化计划草稿并持久化为 `DRAFT` 的跨模块合同。

本阶段只证明模型输出可以被严格解析、规范化并安全保存，不证明计划已经通过 DAG、输入输出、验收、预算或权限验证。后续 [Plan Validation Protocol](Plan-Validation-Protocol.md) 使用本地确定性验证器，把通过验证的草稿转换为正式 `TaskContract`；[Plan Review Protocol](Plan-Review-Protocol.md) 再负责有限编辑、版本保存和批准。批准不开始执行或组队。

Planner 使用非流式、dialect-neutral `JSON_OBJECT` 生成。通用协议禁止出现 Chat Completions 专属 DTO；未来 Responses Adapter 以新增方式并存。任何 streaming 使用独立规范化事件协议，不以 Chat streaming 为基础。

## 2. 模型候选输出

模型只能生成语义内容和局部引用，不能生成 Corporation ID、Plan ID、Plan version 或正式 Task ID：

```ts
type PlannerTaskCandidate = {
  localId: string;
  title: string;
  objective: string;
  description?: string;
  kind:
    | "ANALYSIS"
    | "GENERATION"
    | "TRANSFORMATION"
    | "VALIDATION"
    | "HUMAN_DECISION";
  priority: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  suggestedRole: string;
  requiredCapabilities: {
    path: string;
    minimumLevel: number;
    mandatory: boolean;
  }[];
  requiredTools: string[];
  inputs: {
    source: "GOAL_CONTRACT" | "TASK_OUTPUT";
    taskLocalId?: string;
    logicalName: string;
    mediaType?: string;
    required: boolean;
  }[];
  expectedOutputs: {
    logicalName: string;
    mediaType: string;
    required: boolean;
    description: string;
  }[];
  acceptanceCriteria: {
    localId: string;
    description: string;
    severity: "REQUIRED" | "RECOMMENDED";
    evidenceRequired: string[];
  }[];
  budget: {
    maxInputTokens?: number;
    maxOutputTokens?: number;
    maxCostMicros?: string;
    maxDurationMs?: number;
  };
  retryPolicy: {
    maxAttempts: number;
    maxEvaluationRevisions: number;
    retryableCategories: string[];
  };
  permissionHints: {
    workspaceRead: boolean;
    workspaceWrite: string[];
    processProfiles: string[];
  };
  assumptions: string[];
  nonGoals: string[];
};

type PlannerDraftCandidate = {
  schemaVersion: "1.0";
  summary: string;
  tasks: PlannerTaskCandidate[];
  dependencies: {
    upstreamLocalId: string;
    downstreamLocalId: string;
    condition: "ON_SUCCESS";
  }[];
  milestones: {
    title: string;
    taskLocalIds: string[];
  }[];
  assumptions: string[];
  risks: {
    description: string;
    level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    mitigation: string;
  }[];
};
```

Schema 负责类型、必填字段、受限枚举、字符串/数组/正文大小和额外字段拒绝。Schema 接受 1–50 个候选 Task 以安全保存模型输出；计划验证只允许 1–20 个，21–50 个固定失败且不自动压缩。局部 ID 唯一性、引用存在、DAG、入口/终点、输入输出闭合、逐 Task 验收、叶子输出、预算与权限是否合理属于后续计划验证，不得在本阶段伪装为已通过。

## 3. 可信规范化与公开草稿

AI Corporation Desktop 为每个 schema-valid 候选创建正式 Plan ID、Plan version 和每个候选 Task 的稳定 UUID。模型 `localId` 作为未验证来源引用保留；依赖边在后续验证通过前不解析为正式 Task 依赖。

```ts
type PlannerDraftPublic = {
  schemaVersion: "1.0";
  planId: string;
  corporationId: string;
  planVersion: number;
  goalVersion: number;
  status: "DRAFT" | "VALIDATED" | "APPROVED" | "SUPERSEDED";
  validationStatus: "PENDING" | "VALID" | "INVALID";
  validationReport?: PlanValidationReport;
  summary: string;
  tasks: (PlannerTaskCandidate & { id: string })[];
  dependencies: PlannerDraftCandidate["dependencies"];
  milestones: PlannerDraftCandidate["milestones"];
  assumptions: string[];
  risks: PlannerDraftCandidate["risks"];
  provider: {
    providerId: string;
    providerVersion: number;
    model: string;
  };
  usage: NormalizedUsage;
  supersedesPlanId?: string;
  approvedAt?: string;
  createdAt: string;
};
```

Planner 生成提交时固定为 `DRAFT/PENDING`。M2-TU-07 可按 Plan Validation Protocol 原子转为 `VALIDATED/VALID` 或 `DRAFT/INVALID` 并附带公开 report。Plan Review 可产生 `APPROVED/VALID` 或保留最后验证事实的 `SUPERSEDED`。`PENDING` 不得显示为已验证；`VALID` 仍不表示已组队或可执行；`INVALID` 不创建正式 Task。

## 4. 命令、查询与状态

Allowlist IPC：

```text
planner:start
planner:cancel
planner:get-current
```

`start` 固定包含 `schemaVersion: "1.0"`、UUID v7 `operationId`、`corporationId`、`expectedCorporationVersion`、已批准的 `goalVersion`、`providerId`、`expectedProviderVersion` 和精确 `model`。所有请求使用 strict runtime Schema，拒绝未知字段。

Operation 状态：

```ts
type PlannerOperationStatus =
  "GENERATING" | "PLAN_SAVED" | "FAILED" | "CANCELLED" | "INTERRUPTED";
```

同一 Corporation 同时只允许一个非终态 Planner operation。相同 `operationId` 与规范化请求幂等；不同请求固定冲突。应用启动把遗留 `GENERATING` 转为 `INTERRUPTED`，不得自动重发 Provider 请求。

M2-TU-06 只创建第一个活动 Plan DRAFT。Corporation 已存在非 `SUPERSEDED` Plan 时，新的 start 返回状态冲突；有限编辑、新版本和旧版本 supersede 由 Plan Review Protocol 定义，Provider 重新规划仍由后续独立任务定义。

## 5. Provider 与输入披露

- 只有用户在本次规划前明确选择的 ENABLED、已保存 Key、VERIFIED Provider 和当前模型列表中的精确模型可以调用；
- 不自动沿用 Goal Provider，不读取尚未实现的默认 Planner 路由，不自动回退；
- Provider 输入只包含当前已批准 Goal Contract 的公开内容，以及应用内置、版本化的能力路径、工具名和输出媒体类型白名单；
- Workspace display/canonical path、路径身份、目录、文件内容、Key、Header、其他 Goal 版本和用户未批准草稿均不得进入 Provider 请求；
- Planner 只生成 `suggestedRole` 和能力要求，不创建 Agent Definition、Agent Instance 或 Organization；UI 必须标注“尚未组队”。

若上述 allowlist 输入超过通用 Provider 请求的 65,536 UTF-8 bytes 上限，系统必须在发网前以固定 `INPUT_TOO_LARGE` 失败并保持 Goal/Plan 不变，不得截断后假装生成成功。

## 6. JSON/Schema 修复

首次生成不计为修复。首次输出不是单个合法 JSON 对象或不符合 `PlannerDraftCandidate` strict Schema 时，只允许使用相同 Provider/version/model 再调用一次修复。

修复输入把受限的无效输出作为不可信 `USER` 数据，并附带最多 20 条只含 Schema 字段路径、Zod issue code 和权威受限枚举合法值的安全提示；提示不包含字段值、模型正文片段或自由文本错误。不得构造 `ASSISTANT` 历史，也不得携带 Chat/Provider 私有 continuation 或 reasoning 字段。第二次仍失败则 operation 为 `FAILED`，不创建 `task_plan`。正常成功不得额外调用。

局部 ID、引用、DAG、输入输出、验收、预算和权限错误不属于本阶段 JSON/Schema 修复；它们由本地计划验证器返回结构化错误，不调用 Provider，也不消耗本阶段修复次数。

## 7. 持久化、审计与取消

- 网络调用不得位于 SQLite 事务内；调用前写 operation/model_call 检查点，返回后按 operation、Corporation、Goal 与 Provider 版本条件提交；
- schema-valid 候选、可信 ID 映射、`task_plan DRAFT`、operation `PLAN_SAVED` 和 usage 在短事务中提交；operation/model_call 形成审计记录；
- 每次正常或修复调用分别记录 `PLAN_GENERATION` model_call，规划前不得伪造 Task/Run；
- 不持久化完整 Prompt、Goal 正文副本、模型原始正文、无效 JSON、隐藏推理、远端错误正文/request ID、Key 或 Authorization；
- 取消传播到 Provider；迟到结果不能覆盖 CANCELLED/INTERRUPTED、更新后的 Goal/Provider/Corporation 或新 operation；
- 公开错误使用固定类别和安全文案，不包含输入、模型正文、路径、SQL 或堆栈。

## 8. 非范围

- DAG、局部引用、输入输出闭合、叶子验收、预算、权限和任务数语义验证；
- 把 Planner 草稿转换为正式 `TaskContract` 或写入可执行 `task`/`task_dependency`；
- 计划编辑、重新规划、批准、开始执行和 Corporation 状态迁移；
- Organization Engine、真实 Agent/团队、模型路由策略或自动 Provider 回退；
- Workspace 文件读取、RAG、附件、Responses Adapter、任何 streaming 或 Tool Call。
