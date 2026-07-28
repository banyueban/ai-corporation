# AI Corporation Desktop v0.1 UI/UX 文档中心

## 1. 文档定位

本目录是 v0.1 用户界面的实现基线，覆盖低保真信息架构、核心流程、页面线框、交互状态、基础设计系统和 UI 验收要求。

本目录不包含：

- 高保真品牌视觉稿；
- 营销页面；
- 动画演示稿；
- v0.2 以后功能；
- 与实现脱节的概念界面。

## 2. 阅读顺序

1. [UI/UX 总体规范](UI-UX-Specification.md)
2. [信息架构](Information-Architecture.md)
3. [核心用户流程](Core-User-Flows.md)
4. [低保真页面线框](Wireframes.md)
5. [页面与交互状态矩阵](Screen-State-Matrix.md)
6. [基础设计系统](Design-System.md)
7. [UI 验收标准](UI-Acceptance.md)

## 3. 实现约束

- PRD 是功能范围来源；
- 本目录定义用户如何理解和控制这些功能；
- [统一验收标准](../06-engineering/Acceptance-Standard.md)仍是项目唯一验收入口；
- UI 不能发明后端尚不存在的成功状态；
- 状态、预算、审批和进度必须由领域数据驱动；
- 涉及文件、命令、预算和外部副作用时，安全信息优先于视觉简洁；
- v0.1 采用共享 React 代码覆盖 Windows/macOS，平台差异只在窗口行为和系统控件层适配。

## 4. v0.1 核心屏幕

| ID | 屏幕 | 主要任务 |
|---|---|---|
| UI-01 | Onboarding | 配置 Provider、安全存储和默认策略 |
| UI-02 | Dashboard | 查看、恢复和创建 Corporation |
| UI-03 | Create Corporation | 选择工作区并描述目标 |
| UI-04 | Goal Contract Review | 澄清并确认目标合同 |
| UI-05 | Plan Review | 审阅任务图、团队和预算 |
| UI-06 | Corporation Workspace | 观察并控制执行 |
| UI-07 | Approval Detail | 准确理解并批准/拒绝副作用 |
| UI-08 | Artifact Detail | 查看版本、来源、Diff 和评价 |
| UI-09 | Final Delivery | 查看目标完成情况与交付证据 |
| UI-10 | Global Settings | 管理 Provider、模型、安全和本地数据 |

## 5. 设计完成定义

- 核心旅程从入口到终态闭合；
- 每个关键屏幕有低保真线框；
- 空、加载、正常、等待、错误、恢复和完成状态有定义；
- 所有高风险动作有准确的审批交互；
- 页面组件可以映射到领域实体；
- 键盘操作、焦点、颜色对比和缩放有基线；
- 实现团队无需自行猜测主要布局和状态行为。

