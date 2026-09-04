# AI Corporation Desktop v0.1 基础设计系统

## 1. 目标

提供足以编码的 Token、组件和交互规范。v0.1 优先建立一致、克制、可信赖的工作台，不追求完整品牌系统。

### 1.1 界面语言

- v0.1 用户界面默认使用简体中文；
- 软件自定义的标题、按钮、提示、状态和错误说明使用中文；
- 外部标准名称保持其标准写法，例如 `API Key`、`URL`、Provider 实际名称和模型 ID；
- 内部状态值不得直接作为主要界面文字，必须映射为中文；错误编号保留用于准确排查，但同时提供中文说明；
- 用户输入、模型输出、文件路径、ID 和外部返回值不得被软件擅自翻译。

## 2. 主题

- 默认跟随系统主题；
- 同时支持浅色和深色；
- 当前 Milestone 0 深色壳可作为开发起点，但不得把现有临时色值直接视为最终 Token；
- 系统主题变化不重启应用；
- Artifact 内容区可独立使用适合阅读的背景，但保持全局状态一致。

## 3. 颜色 Token

使用语义 Token，不在组件中直接写业务色。

```css
:root {
  --color-bg-canvas: ...;
  --color-bg-surface: ...;
  --color-bg-elevated: ...;
  --color-border-default: ...;
  --color-border-strong: ...;
  --color-text-primary: ...;
  --color-text-secondary: ...;
  --color-text-muted: ...;
  --color-accent: ...;
  --color-accent-hover: ...;
  --color-status-info: ...;
  --color-status-success: ...;
  --color-status-warning: ...;
  --color-status-danger: ...;
  --color-focus-ring: ...;
}
```

规则：

- 文本与背景达到 WCAG AA；
- Danger 只用于失败和破坏性动作；
- Warning 用于等待决定、预算接近上限和降级；
- Active 状态可使用 Accent，不用 Danger；
- 状态同时有图标与文字。

## 4. 字体

### 4.1 UI 字体

系统字体优先：

```css
font-family:
  Inter,
  ui-sans-serif,
  system-ui,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  sans-serif;
```

### 4.2 等宽字体

用于路径、命令、ID、哈希、Diff：

```css
font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
```

### 4.3 字级

| Token   | 尺寸/行高 | 用途                 |
| ------- | --------- | -------------------- |
| display | 32/40     | 空状态或完成页主标题 |
| h1      | 24/32     | 页面标题             |
| h2      | 18/26     | 区块标题             |
| h3      | 15/22     | 卡片标题             |
| body    | 14/21     | 主文本               |
| body-sm | 13/19     | 次级信息             |
| caption | 12/18     | 时间、标签、元数据   |
| code    | 13/20     | 路径、命令和代码     |

正文默认不小于 13px。

## 5. 间距与尺寸

基于 4px：

```text
space-1  4
space-2  8
space-3  12
space-4  16
space-5  20
space-6  24
space-8  32
space-10 40
space-12 48
```

- 页面边距：24–32px；
- 卡片内边距：16–24px；
- 表单字段间距：16px；
- 紧凑列表行高：36px；
- 普通列表行高：44px；
- 主按钮高：40px；
- 小图标按钮：32px。

## 6. 圆角、边框与阴影

- 控件圆角：6px；
- 卡片：8px；
- 对话框：12px；
- 默认 1px 边框；
- 阴影只表达层级，不表达状态；
- 深色主题中优先边框而非大面积阴影。

## 7. 核心组件

### 7.1 AppShell

- Native title/drag region；
- GlobalSidebar；
- PageHeader；
- MainContent；
- DetailsDrawer；
- GlobalBanner；
- ToastViewport。

### 7.2 StatusBadge

属性：

```ts
type StatusBadgeProps = {
  status: DomainStatus;
  label: string;
  icon: IconName;
  emphasis?: "subtle" | "strong";
};
```

不得由调用方自行决定同一状态颜色。

### 7.3 CorporationCard

显示：

- 名称；
- 目标摘要（最多两行）；
- 状态；
- Task 进度；
- 当前阻塞；
- 预算；
- 更新时间；
- 主操作。

### 7.4 TaskList / TaskRow

- 状态；
- 标题；
- Owner；
- 依赖/阻塞；
- 输出；
- 风险；
- 当前/关键路径标识。

### 7.5 ApprovalCard / ApprovalDialog

必须由统一组件实现，避免不同 Tool 自行设计审批。

插槽：

- action；
- subject；
- resource；
- effect；
- risk；
- preview；
- scope selector；
- deny consequence；
- buttons。

### 7.6 ArtifactViewer

Tab：

- Preview；
- Diff；
- Versions；
- Provenance；
- Evaluation。

大文件虚拟化；HTML 严格消毒。

Pi 任务首版使用同一阅读原则，但直接嵌入员工任务页的“交付成果”区域：

- 第一层显示员工总结、真实文件、检查结果和验收操作；
- 每个文件卡显示相对路径、来源、创建/修改、大小、短哈希和当前状态；
- 文本/代码预览按用户点击加载，外部变化、缺失和读取失败不得被旧缓存掩盖；
- 完整模型和工具过程位于成果区之后并默认折叠；
- 失败、取消和中断的文件使用“未完成成果”，不使用成功色或“已交付”文案。

任务输入区使用紧凑附件卡：文件名为第一层，格式和大小为第二层，右侧只有“移除”。卡片不得显示或把完整本机路径放入可复制文本。拖放区和“选择附件”按钮属于同一控件组，键盘用户不依赖拖放。上传错误紧邻对应文件显示，并说明用户下一步。

### 7.7 BudgetMeter

- 当前/上限；
- 估算标记；
- 80% 与 100% 状态；
- 点击进入按 Task/模型分解。

### 7.8 EventTimeline

- 业务事件默认；
- 技术事件可展开；
- 事件按时间/Task/Agent 筛选；
- 大列表虚拟化；
- 敏感详情默认折叠。

### 7.9 EmptyState

包含：

- 明确状态；
- 为什么为空；
- 一个主操作；
- 可选帮助；
- 不使用装饰插画代替说明。

### 7.10 ErrorState

包含：

- 安全错误摘要；
- 影响范围；
- 恢复动作；
- 诊断引用；
- 可复制的安全错误码。

## 8. 按钮层级

| 类型      | 用途                   |
| --------- | ---------------------- |
| Primary   | 当前上下文唯一推荐动作 |
| Secondary | 安全替代动作           |
| Ghost     | 导航、低权重动作       |
| Danger    | 取消、删除、不可逆动作 |

规则：

- 一个容器最多一个 Primary；
- 审批的 Primary 文案包含具体动作；
- Danger 不与 Primary 使用相似颜色；
- 禁用按钮需说明原因；
- Loading 按钮保留原宽度。

## 9. 表单

- Label 始终可见，不只使用 placeholder；
- 必填项清晰标记；
- 字段级错误紧邻字段；
- 敏感字段提供安全说明；
- 自动保存需显示保存状态；
- 复杂设置使用渐进披露；
- 不在用户输入时立即触发昂贵模型调用；
- `Cmd/Ctrl + Enter` 只在明确说明时提交。

## 10. 对话框、抽屉与页面

| 内容                  | 容器                 |
| --------------------- | -------------------- |
| 快速查看 Task/Agent   | 抽屉                 |
| Artifact 深度查看     | 页面                 |
| 普通确认              | 小型对话框           |
| 高风险审批            | 大型阻断对话框或专页 |
| Recovery 不确定副作用 | 专页/不可忽略模态    |
| 设置编辑              | 页面                 |

对话框不得嵌套。

## 11. 动效

- 120–200ms；
- 只解释状态和空间关系；
- 支持 reduced motion；
- 进度未知使用低干扰动画；
- WAITING_HUMAN 不持续闪烁；
- 完成动画不超过 600ms 且不阻断操作。

## 12. 图标

- 使用单一图标集；
- 16/20/24px 三档；
- 图标按钮有可访问名称和 Tooltip；
- Provider/模型图标不承担状态；
- Agent 默认用 Role 图标，不用拟人头像；
- 破坏性图标同时配文字。

## 13. Diff 和代码

- 支持并排/统一 Diff，1024px 下默认统一；
- 新增/删除不仅用红绿，配 `+`/`-` 和行号；
- 长行可横向滚动；
- 路径可复制；
- Secret 片段遮挡；
- 固定 Process Profile 按 executable 和 args 分段显示；完整系统命令保持原文并用等宽字体整段显示，不能隐藏管道、串联、重定向或换行。
- 首次任务命令授权必须紧邻显示真实风险说明和授权范围；不能用“安全运行”“沙箱运行”等字样掩盖当前没有 OS 级强隔离的事实。

## 14. 组件状态

每个交互组件至少实现：

- default；
- hover；
- active；
- focus-visible；
- disabled；
- loading；
- error（适用时）；
- selected（适用时）。

Storybook 或等价组件展示工具列入 Milestone 1，而非 Milestone 0 硬门槛。

## 15. 平台适配

### Windows

- 遵循 Windows 窗口按钮区域；
- 路径和盘符显示完整；
- Ctrl 快捷键；
- 高 DPI 测试。

### macOS

- 保留 traffic lights 区域；
- Cmd 快捷键；
- 应用自管 Key Vault 和系统通知语言；
- 窗口全屏/Space 恢复。

业务布局和组件行为保持一致。
