# Tool Runtime 详细设计

## 1. 目标

Tool Runtime 为 Agent 提供受控、可审计、可取消、可恢复的本地能力。模型只能提出 Tool Call，不能直接访问文件、进程、网络或凭据。

## 2. Tool 接口

```ts
interface Tool<I, O> {
  descriptor(): ToolDescriptor;
  validate(input: unknown): I;
  assess(input: I, context: ToolContext): RiskAssessment;
  execute(input: I, context: ToolContext, signal: AbortSignal): Promise<ToolResult<O>>;
}
```

```ts
type ToolDescriptor = {
  id: string;
  version: string;
  description: string;
  inputSchemaRef: string;
  outputSchemaRef: string;
  sideEffect: "NONE" | "REVERSIBLE" | "IRREVERSIBLE" | "CONDITIONAL";
  capabilities: string[];
};
```

## 3. v0.1 内置工具

### 3.1 `workspace.list`

- 列举授权目录；
- 默认忽略 `.git` 内部、依赖缓存、密钥文件；
- 限制深度和结果数量；
- 只读，低风险。

### 3.2 `workspace.read_text`

- 仅文本；
- 限制单次字节数；
- 支持行范围；
- 二进制或超大文件返回元数据，不自动读取；
- 只读，低风险。

### 3.3 `workspace.search_text`

- 在工作区内搜索；
- 使用参数化模式；
- 限制文件数、大小和超时；
- 不跟随越界符号链接。

### 3.4 `workspace.propose_write`

- 不直接覆盖文件；
- 生成 Change Set 与 diff；
- 经过 Policy/审批后由 Artifact Service 提交；
- 创建通常中风险，更新视策略而定。

### 3.5 `process.run_profile`

- 只运行预定义命令配置；
- 不允许模型提供任意 shell 字符串；
- 参数按 profile Schema 验证；
- 工作目录固定在工作区；
- 输出、时间和资源有限制。

### 3.6 `project.run_checks`

- 调用用户或项目批准的测试/检查 profile；
- 本质复用 process runner；
- 输出测试报告 Artifact。

## 4. 命令 Profile

```ts
type ProcessProfile = {
  id: string;
  executable: string;
  fixedArgs: string[];
  allowedDynamicArgs: DynamicArgRule[];
  workingDirectory: "WORKSPACE_ROOT" | string;
  environmentAllowlist: string[];
  timeoutMs: number;
  maxOutputBytes: number;
  networkPolicy: "INHERIT" | "DENY";
  riskLevel: "MEDIUM" | "HIGH";
};
```

禁止：

- `shell: true`；
- 字符串拼接命令；
- 任意重定向和管道；
- 从模型输出直接生成可执行路径；
- 继承全部环境变量；
- 未审批的包安装、发布、Git push。

## 5. 原生执行边界

Rust Native Core 负责：

- canonical path；
- 符号链接/目录联接检查；
- 文件描述符级读写；
- 原子替换；
- 子进程组管理；
- 超时终止；
- stdout/stderr 限流；
- 平台错误标准化。

TypeScript 负责 Tool 语义、Schema、Policy 请求和 Artifact 转换。

## 6. 调用流程

```text
Agent Tool Call
  → Schema Validation
  → Capability Intersection
  → Risk Assessment
  → Policy Decision
  → Approval（如需）
  → Budget Reservation
  → Native Execution
  → Result Normalization
  → Artifact / Event / Ledger
```

每一步失败都有结构化状态。

## 7. 幂等性与副作用

- 只读工具天然可重试；
- 写文件通过 Change Set ID 幂等；
- 命令默认不可假设幂等；
- Tool Invocation 在执行前记录 `STARTING`；
- 成功后记录 commit/effect evidence；
- 崩溃后无法确定命令结果时返回 `UNKNOWN` 并请求人工；
- 不自动重放 irreversible 或 unknown 副作用。

## 8. 输出处理

```ts
type ToolResult<T> = {
  status: "SUCCEEDED" | "FAILED" | "CANCELLED" | "UNKNOWN";
  value?: T;
  artifactRefs?: ArtifactRef[];
  stdoutSummary?: string;
  stderrSummary?: string;
  exitCode?: number;
  sideEffectEvidence?: EvidenceRef[];
  error?: ProtocolError;
};
```

完整大输出写 Artifact；Prompt 只注入摘要与引用。

## 9. 资源控制

- 并发进程上限；
- 每个进程超时；
- 输出字节上限；
- 工作目录限制；
- 环境变量 allowlist；
- 可用磁盘空间检查；
- 取消时终止整个子进程组；
- v0.1 不承诺强容器级 CPU/内存隔离，UI 和文档必须明确。

## 10. Tool Registry

Registry 只加载：

- 内置签名 Tool；
- 通过 Plugin 安装且用户启用的 Tool；
- 与当前平台兼容的版本。

同一 Tool ID/version 不得被静默替换。插件 Tool 不能绕过统一 Policy 与 Native Core。

## 11. 测试重点

- 路径穿越、符号链接逃逸、Windows 盘符/UNC；
- 命令参数注入；
- 环境变量泄露；
- 超时与进程树终止；
- 输出爆炸；
- 崩溃后的 UNKNOWN；
- Change Set 幂等；
- 取消竞态；
- 插件 Tool 权限收敛。

## 12. v0.1 完成标准

- 内置 6 类工具可运行；
- 所有调用经过 Schema、Policy 和事件记录；
- 模型无法调用任意 shell；
- 写文件有 Change Set、diff、冲突检测；
- 进程可超时和取消；
- 未知副作用不自动重试。

