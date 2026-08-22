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
- 经过 Policy 后由 Artifact Service 提交；当前 Pi 任务已经由用户明确选择可写工作区时，普通文本创建和基线未变化的文本修改可以按任务级授权自动提交，其他情况仍要求审批或拒绝；
- 创建通常中风险，更新视策略而定。

### 3.5 `workspace.run_command`

- 为当前任务在用户选择的工作区运行系统原生命令；Windows 使用系统原生命令解释器，macOS 使用系统原生 shell；
- 接受完整命令文本，支持用户平时使用的管道、串联和重定向，不强迫用户改写成某一种 shell 的语法；
- 每个任务第一次执行命令前，必须向用户说明真实边界并取得一次仅对本任务有效的命令授权；授权后，普通查看、检查、测试和构建命令不再反复打断用户；
- 依赖安装、删除、Git 写操作、发布以及其他明显可能造成较大损失的命令仍单独确认；不能可靠判断风险时按高风险处理；
- 命令以用户的 OS 账户运行，项目脚本可能访问工作区外内容；v0.1 没有 OS 级强隔离，UI 不得把它宣传成绝对安全的沙箱；
- 工作目录默认为当前任务工作区；API Key、Key Vault 内容和应用认证秘密不得进入命令环境；
- stdout、stderr、退出码和耗时实时可见；取消或超时必须终止整个进程树，不允许留下后台子进程。

### 3.6 `workspace.register_deliverable`

- 只接受当前任务 Workspace 内的相对文件路径；
- 用于登记由完整命令生成、但没有经过 `workspace.write_text` 的交付文件；受控文本写入成功后由软件自动登记，不要求模型重复调用；
- 在可信文件边界重新核对路径、越界链接、敏感文件、普通文件、大小和 SHA-256；只登记，不修改文件；
- 不存在、目录、越界、敏感或超限文件固定拒绝；模型文字、命令输出和 Skill 内容不能代替真实核对；
- 同一任务同一路径重复登记更新为最新交付状态，不产生重复成果卡；
- 本工具不扫描整个工作区，未登记的命令产物不会被软件猜测为正式交付。

### 3.7 `process.run_profile`

- 保留给无需完整 shell 的固定检查和内部流程；
- 参数按 profile Schema 验证；
- 工作目录固定在工作区；
- 输出、时间和资源有限制。

### 3.8 `project.run_checks`

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

完整命令不复用 Profile 的“程序 + 参数”协议。它使用独立、版本化的命令输入和输出协议，并受以下限制：

- 没有当前任务命令授权时不得启动；
- 不继承 API Key、Key Vault 内容、应用会话令牌或其他认证秘密；
- 不得静默执行未单独批准的依赖安装、删除、Git 写操作、发布或其他明显高风险动作；
- 不得把模型或项目文件中的文字当成用户授权；
- 不得脱离当前可见任务在后台持续运行；
- 取消、超时或应用退出时必须终止整个进程树；
- 恢复时不得自动重放结果未知的命令。

## 5. 原生执行边界

Rust Native Core 负责工作区文件副作用：

- canonical path；
- 符号链接/目录联接检查；
- 文件描述符级读写；
- 原子替换；
- 平台错误标准化。

Electron Main 的可信命令 Runner 负责完整系统命令的启动、stdout/stderr 流、输出裁剪、超时和整个进程树终止。它不把命令执行下放给 Renderer，也不向命令环境提供应用秘密。TypeScript 还负责 Tool 语义、Schema、Policy 请求、事件、持久化和 Artifact 转换。

## 6. 调用流程

```text
Agent Tool Call
  → Schema Validation
  → Capability Intersection
  → Risk Assessment
  → Policy Decision
  → Approval（如需）
  → Budget Reservation
  → Trusted Main / Native Execution
  → Result Normalization
  → Artifact / Event / Ledger
```

每一步失败都有结构化状态。

## 7. 幂等性与副作用

- 只读工具天然可重试；
- 写文件通过 Change Set ID 幂等；
- 当前 Pi 任务的写入使用工具调用 ID 作为幂等键，并在执行前记录目标相对路径、基线哈希和目标哈希；
- 当前 Pi 任务的成果以任务和相对路径为唯一归属；受控写入自动登记，命令产物经真实文件核对后登记；
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
- 默认工作目录固定为任务工作区，但不宣称能阻止命令主动访问工作区外路径；
- 环境变量 allowlist；
- 可用磁盘空间检查；
- 取消时终止整个子进程组；
- v0.1 不承诺强容器级 CPU/内存隔离，UI 和文档必须明确。

## 10. Tool Registry

Registry 只加载：

- 内置签名 Tool；
- 通过 Plugin 安装且用户启用的 Tool；
- 与当前平台兼容的版本。

同一 Tool ID/version 不得被静默替换。插件 Tool 不能绕过统一 Policy、Electron Main 命令 Runner 或 Native Core 文件边界。

## 11. 测试重点

- 路径穿越、符号链接逃逸、Windows 盘符/UNC；
- 未授权命令启动、完整命令风险提示和高风险命令二次确认；
- 环境变量泄露；
- 超时与进程树终止；
- 输出爆炸；
- 崩溃后的 UNKNOWN；
- Change Set 幂等；
- 取消竞态；
- 插件 Tool 权限收敛。

## 12. v0.1 模块验收断言

- 工作区文本工具、任务级完整命令工具和固定检查工具可运行；
- 所有调用经过 Schema、Policy 和事件记录；
- 模型只有在用户授予当前任务命令权限后才能调用完整命令，授权不跨任务继承；
- 写文件有 Change Set、diff、冲突检测；
- 进程可超时和取消；
- 未知副作用不自动重试。
