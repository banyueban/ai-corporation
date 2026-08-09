# AI Corporation Desktop v0.1 核心用户流程

## 1. Flow 01：首次设置

### 目标

让用户在不暴露密钥的前提下完成一个可用 Provider 配置。

```mermaid
flowchart TD
    A["欢迎"] --> B["选择 Provider 类型"]
    B --> C["填写 Endpoint / API Key / Model"]
    C --> D["保存 Key 到 AI Corporation Desktop Key Vault"]
    D --> E["连接测试"]
    E -->|成功| F["选择默认 Planner / Executor / Judge 策略"]
    F --> G["设置默认预算与审批偏好"]
    G --> H["进入 Dashboard"]
    E -->|失败| I["显示错误类别与修复建议"]
    I --> C
```

### 关键交互

- API Key 在专用密码输入框录入，默认遮挡，只能由用户主动短暂显示；
- 提交期间禁用重复提交；重新打开页面默认显示遮挡值，用户主动选择“查看”后可以显示已存 Key 明文；
- 保存前说明存储位置；
- 连接测试显示步骤，不输出 Authorization；
- 连接测试固定 15 秒超时，测试期间可取消；超过 10 秒显示安全诊断提示，不显示原始 Provider 正文；
- Provider 返回并验证模型列表后只能精确选择其中一个模型；不允许手工模型 ID，也不自动回退到其他模型；
- 模型选择后可执行一次固定、无用户资料、最多 32 output tokens 的非流式测试生成；显示受限输出、stop reason 和 Provider 返回的 token usage；无可靠价格时明确显示费用未知；
- 生成超时默认 60 秒，可在 5–300 秒内配置，测试生成始终可取消；
- 用户可跳过非必需个性化，但不能跳过至少一个可用 Provider。

### 异常

- 应用 Key Vault 数据库或本地加密密钥不可用：阻断保存，说明未保存/未修改，并提供重试或重新录入路径，不能降级明文；
- 网络不可用：允许保存未验证配置，但 Dashboard 显示“需验证”，不能启动 Corporation；
- 认证失败：不盲目重试；
- Endpoint 格式错误：字段级提示。
- 远程 Endpoint 只允许 HTTPS；HTTP 仅用于本机 loopback；不允许 redirect、URL 凭据、query 或 fragment；
- Endpoint 或 Key 变化后显示“未验证”，成功/失败结果与模型列表在重启后恢复；该结果不冒充运行时健康或熔断状态。
- Endpoint 或 Key 变化同时清除模型选择与生成测试结果；模型或超时变化清除旧生成测试结果但不破坏连接验证；名称或启停变化保留结果。任何变化都不静默切换模型。生成取消保留此前结果，重启不自动重发。

## 2. Flow 02：创建 Corporation 与 Goal Contract

```mermaid
flowchart TD
    A["Dashboard: 新建"] --> B["选择工作区"]
    B --> C["描述目标"]
    C --> D["填写约束 / 交付物 / 预算（可选）"]
    D --> E["选择已验证 Provider / 精确模型"]
    E --> F["生成 Goal Contract"]
    F --> G{"存在关键歧义？"}
    G -->|是，周期内未满 5 轮| H["结构化澄清"]
    H --> F
    G -->|是，已满 5 轮| I{"用户决定"}
    I -->|继续| H
    I -->|保存未确认草稿| J["Goal Contract Review"]
    I -->|取消| K["保留原始输入"]
    G -->|否| J
    J -->|编辑| F
    J -->|确认| L["生成计划"]
    J -->|保存草稿| M["返回 Dashboard"]
```

### 表单结构

1. 目标（必填，大文本）；
2. 工作区（必填，显示读写权限）；
3. 期望交付物（可选，推荐）；
4. 约束（可选）；
5. 非目标（高级）；
6. 预算（使用默认值，可展开）。

模型生成只要求目标、Corporation 名称和可用 Workspace；成功标准、交付物、约束与非目标是可选提示。分析前必须明确显示接收这些字段的 Provider 和精确模型。Workspace 路径、目录结构和文件内容不发送给 Provider。

### Goal Contract Review

必须逐块显示：

- 目标摘要；
- 成功标准；
- 范围内；
- 范围外；
- 假设；
- 交付物；
- 风险；
- 预算和停止条件。

高影响假设使用待确认标记，不能放在折叠区。

每个澄清周期最多 5 轮。达到上限时 UI 停止显示“生成中”，准确展示当前轮次、累计 usage、剩余 HIGH-impact 缺口，并提供“继续下一 5 轮”“保存为未确认草稿”“取消”三个动作。续期只对本次周期生效；不能记住为自动偏好。保存草稿后仍须逐项确认 HIGH 假设，不能直接批准或规划。

## 3. Flow 03：计划审阅与开始执行

```mermaid
flowchart TD
    A["计划生成中"] --> B["Plan Review"]
    B --> C["检查 Task / 依赖 / 输出 / 验收"]
    C --> D["查看能力要求与建议角色（尚未组队）"]
    D --> E["查看预算估算和高风险动作"]
    E --> F{"用户决定"}
    F -->|修改| G["有限编辑 / 重新规划"]
    G --> B
    F -->|开始执行| H["确认工作区与硬预算"]
    H --> I["Corporation EXECUTING"]
    F -->|保存草稿| J["PAUSED / DRAFT"]
```

### 计划编辑边界

v0.1 支持：

- 修改 Task 标题、说明、优先级；
- 修改验收标准；
- 调整明确依赖；
- 删除未执行 Task；
- 请求重新规划。

不支持任意画布拖拽或在执行中直接改写已完成 Task。

## 4. Flow 04：观察与控制执行

```mermaid
stateDiagram-v2
    [*] --> Executing
    Executing --> Paused: 用户暂停
    Paused --> Executing: 用户继续
    Executing --> WaitingHuman: 审批/澄清/预算
    WaitingHuman --> Executing: 用户解决
    Executing --> Verifying: 候选产物完成
    Verifying --> Executing: 需要修订
    Verifying --> Completed: 全部通过
    Executing --> Failed: 不可恢复失败
    Executing --> Cancelled: 用户取消
```

### Workspace 默认信息

- 当前 Task 和 Owner；
- 下一 Task；
- 关键路径；
- 进度和预算；
- 最新 Artifact；
- 待审批；
- 最近重要事件。

### 暂停

- 点击后立即停止调度新 Task；
- 当前步骤进入安全检查点；
- UI 显示“正在暂停”中间态；
- 完成后显示已暂停原因和可恢复位置。

### 取消

危险操作。确认界面说明：

- 将停止哪些 Run；
- 已提交 Artifact 是否保留；
- 用户工作区文件不会自动回滚；
- 是否生成当前进展报告。

## 5. Flow 05：工具审批

```mermaid
flowchart TD
    A["Agent 请求 Tool Call"] --> B["Policy 判定 REQUIRE_APPROVAL"]
    B --> C["Corporation 进入 WAITING_HUMAN"]
    C --> D["显示 Approval Detail"]
    D --> E{"用户选择"}
    E -->|批准本次| F["创建精确一次性 Grant"]
    E -->|批准规则| G["仅低/中风险且允许记住"]
    E -->|拒绝| H["记录拒绝并通知 Task Engine"]
    F --> I["执行 Tool"]
    G --> I
    I --> J["展示结果与副作用证据"]
    H --> K["重规划 / 请求替代 / 失败"]
```

### 审批内容

固定顺序：

1. 动作；
2. 请求者和所属 Task；
3. 精确资源；
4. Diff/命令参数；
5. 风险等级；
6. 预计副作用；
7. 数据是否离开本机；
8. 批准范围；
9. 拒绝后的影响。

### 按钮

- 主按钮：`批准本次写入` / `批准本次命令`；
- 次按钮：`拒绝`；
- 可记住时：独立复选框或菜单，不作为默认；
- 删除、不可逆命令、越界访问不得显示“始终允许”。

## 6. Flow 06：验收失败与修订

```mermaid
flowchart TD
    A["Candidate Artifact"] --> B["确定性检查"]
    B -->|通过| C["LLM Judge（如需）"]
    B -->|失败| D["结构化 Issue"]
    C -->|通过| E["Artifact APPROVED"]
    C -->|失败| D
    C -->|不确定| F["请求人工判断"]
    D --> G{"责任分类"}
    G -->|执行问题| H["创建修订 Run"]
    G -->|计划问题| I["请求重规划"]
    G -->|输入问题| F
    H --> A
```

### UI 表现

- 不用红色总分替代具体问题；
- 按 REQUIRED / IMPORTANT / OPTIONAL 分组；
- 每个问题显示证据和建议动作；
- 显示 `修订 1 / 2`；
- 新旧 Artifact 版本可比较；
- 达到修订上限时给出人工选项，不无限重试。

## 7. Flow 07：崩溃恢复

```mermaid
flowchart TD
    A["应用启动"] --> B["恢复扫描"]
    B --> C{"存在中断 Run？"}
    C -->|否| D["Dashboard"]
    C -->|是，安全可重试| E["Recovery Summary"]
    C -->|副作用不确定| F["阻断式 Recovery Detail"]
    E --> G["继续 / 保持暂停 / 取消"]
    F --> H["查看 Tool、目标和证据"]
    H --> I["标记已完成 / 安全重试 / 停止并人工检查"]
```

恢复界面必须避免默认自动重放写入或命令。

## 8. Flow 08：最终交付

```mermaid
flowchart TD
    A["所有必需 Task 通过"] --> B["Final Delivery"]
    B --> C["成功标准逐项结果"]
    B --> D["交付物列表"]
    B --> E["已知限制 / 未完成项"]
    B --> F["成本 / 时间 / 修订"]
    C --> G["查看证据"]
    D --> H["打开文件 / 所在位置"]
    B --> I["导出 Markdown 报告"]
    B --> J["归档 Corporation"]
```

完成页不能只显示庆祝动画。若存在未满足项，状态必须是部分完成或失败，而不是 COMPLETED。

## 9. Flow 09：Provider 故障

```text
调用失败
→ 归一化错误
→ 可重试：显示等待和下一次时间
→ Provider 熔断：显示降级
→ 有合规回退：展示已切换模型
→ 无回退：WAITING_HUMAN
→ 用户修改 Provider / 重试 / 保持暂停
```

错误详情只显示安全字段。
