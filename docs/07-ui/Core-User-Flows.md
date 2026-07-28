# AI Corporation Desktop v0.1 核心用户流程

## 1. Flow 01：首次设置

### 目标

让用户在不暴露密钥的前提下完成一个可用 Provider 配置。

```mermaid
flowchart TD
    A["欢迎"] --> B["选择 Provider 类型"]
    B --> C["填写 Endpoint / API Key / Model"]
    C --> D["保存 Key 到系统安全存储"]
    D --> E["连接测试"]
    E -->|成功| F["选择默认 Planner / Executor / Judge 策略"]
    F --> G["设置默认预算与审批偏好"]
    G --> H["进入 Dashboard"]
    E -->|失败| I["显示错误类别与修复建议"]
    I --> C
```

### 关键交互

- API Key 默认遮挡，只能短暂显示；
- 保存前说明存储位置；
- 连接测试显示步骤，不输出 Authorization；
- Provider 返回模型列表时可选择；失败时允许手工模型 ID；
- 用户可跳过非必需个性化，但不能跳过至少一个可用 Provider。

### 异常

- 系统安全存储不可用：阻断保存，不能降级明文；
- 网络不可用：允许保存未验证配置，但 Dashboard 显示“需验证”，不能启动 Corporation；
- 认证失败：不盲目重试；
- Endpoint 格式错误：字段级提示。

## 2. Flow 02：创建 Corporation 与 Goal Contract

```mermaid
flowchart TD
    A["Dashboard: 新建"] --> B["选择工作区"]
    B --> C["描述目标"]
    C --> D["填写约束 / 交付物 / 预算（可选）"]
    D --> E["生成 Goal Contract"]
    E --> F{"存在关键歧义？"}
    F -->|是| G["结构化澄清"]
    G --> E
    F -->|否| H["Goal Contract Review"]
    H -->|编辑| E
    H -->|确认| I["生成计划"]
    H -->|保存草稿| J["返回 Dashboard"]
```

### 表单结构

1. 目标（必填，大文本）；
2. 工作区（必填，显示读写权限）；
3. 期望交付物（可选，推荐）；
4. 约束（可选）；
5. 非目标（高级）；
6. 预算（使用默认值，可展开）。

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

## 3. Flow 03：计划审阅与开始执行

```mermaid
flowchart TD
    A["计划生成中"] --> B["Plan Review"]
    B --> C["检查 Task / 依赖 / 输出 / 验收"]
    C --> D["查看临时团队与模型策略"]
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

