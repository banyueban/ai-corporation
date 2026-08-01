# AI Corporation Desktop v0.1 页面与交互状态矩阵

## 1. 状态设计规则

每个异步页面至少实现：

- `INITIAL`：尚未请求；
- `LOADING`：首次加载；
- `READY`：可交互；
- `REFRESHING`：保留旧数据的后台刷新；
- `EMPTY`：成功但无数据；
- `ERROR`：无法完成请求；
- `OFFLINE/DEGRADED`：部分能力不可用。

不要用一个全屏 Spinner 覆盖所有状态。执行状态与页面加载状态必须区分。

## 2. 全局应用状态

| 状态 | 触发 | UI | 可操作 | 禁止 |
|---|---|---|---|---|
| Starting | Main/Sidecar 启动 | 启动画面 + 当前步骤 | 查看诊断（超时后） | 创建任务 |
| Ready | 所有必需服务可用 | Dashboard | 全部正常操作 | — |
| Degraded | Provider/Sidecar 非核心能力异常 | 顶部持久 Banner | 查看诊断、修复、只读浏览 | 启动依赖故障能力的任务 |
| Offline | 远程 Provider 不可达 | 离线标记 | 本地浏览、暂停、设置 | 新模型调用 |
| Update available | 检查到更新 | 非阻断通知 | 稍后/查看更新 | 活跃任务中强制更新 |
| Fatal | DB 损坏或不可恢复启动错误 | 安全错误页 | 备份、导出诊断、退出 | 继续执行 |

## 3. Onboarding 状态

| 状态 | 主内容 | 主按钮 | 错误恢复 |
|---|---|---|---|
| Welcome | 产品定位与本地优先说明 | 开始设置 | — |
| Provider input | Provider 表单 | 测试连接 | 字段级修复 |
| Testing | 逐步测试状态 | 取消测试 | 超时后重试 |
| Authentication failed | 安全错误摘要 | 重新测试 | 编辑 Key/Endpoint |
| Network failed | 网络原因 | 保存未验证配置 | 稍后验证 |
| Key Vault failed | 阻断说明，并区分数据库、本地加密密钥或完整性错误 | 重试/重新录入 | 不允许明文降级或显示保存成功 |
| Provider valid | 成功状态、模型列表 | 继续 | — |
| Complete | 默认策略摘要 | 进入 Dashboard | 返回修改 |

## 4. Dashboard 状态

| 状态 | 展示 |
|---|---|
| Loading | 卡片 Skeleton，保留侧栏 |
| Empty | 创建首个 Corporation + 推荐示例 |
| Active | 待处理 → 活跃 → 最近完成 |
| Only archived | 显示归档摘要和新建入口 |
| Recovery detected | 恢复卡片置顶，禁止自动恢复 |
| Provider invalid | 持久配置 Banner，新建按钮可用但开始执行前阻断 |
| Query error | 保留可用导航，显示重试和诊断 |

## 5. Create / Goal Contract 状态

| 状态 | 行为 |
|---|---|
| Draft clean | 保存草稿、分析目标 |
| Draft dirty | 离开时提示保存；窗口关闭走草稿保护 |
| Workspace read-only | 明确提示可执行只读任务，写入类目标需修改权限 |
| Analyzing | 禁用重复提交，可取消 |
| Clarification needed | 问题置顶，已有合同内容保留 |
| Contract ready | 显示完整合同和待确认假设 |
| Contract changed | 标记新版本；旧计划若存在则提示受影响 |
| Goal analysis failed | 显示错误类别；允许重试、换模型、保存原始目标 |

## 6. Plan Review 状态

| 状态 | 主区域 | 主操作 |
|---|---|---|
| Generating | 规划步骤，不伪造 Task | 取消 |
| Validation failed | 图/引用/验收错误列表 | 自动修复一次或重新规划 |
| Ready | Task、依赖、团队、预算、风险 | 确认并开始 |
| Edited | 未保存标记、局部验证结果 | 保存并重新验证 |
| Capability gap | 缺失能力和替代方案 | 换 Provider/修改计划/请求用户 |
| Budget over limit | 超出硬预算 | 降低范围/增加预算 |
| Start pending | 正在持久化计划和团队 | 禁止重复点击 |
| Superseded | 只读旧版本 | 查看当前版本 |

## 7. Corporation Workspace 状态

表中大写值来自 Corporation 领域状态。`PAUSING` 是暂停命令尚未完成的 UI 过渡状态，不持久化为 Corporation 状态。

| Corporation 状态 | Header | 主内容 | 主操作 |
|---|---|---|---|
| DRAFT | 草稿 | Goal/Plan 尚未确认 | 继续设置 |
| PLANNING | 正在规划 | 计划生成步骤 | 暂停 |
| ORGANIZING | 正在组建团队 | 能力和角色分配 | 暂停 |
| EXECUTING | 正在执行 | 当前 Task、下一步、Artifact | 暂停 |
| VERIFYING | 正在验收 | 检查项和证据 | 暂停 |
| WAITING_HUMAN | 等待你的决定 | 阻断卡片置顶 | 处理请求 |
| PAUSING | 正在安全暂停 | 检查点说明 | 等待/强制停止（危险） |
| PAUSED | 已暂停 | 恢复点、原因 | 继续 |
| COMPLETED | 已完成 | 最终交付摘要 | 查看交付 |
| FAILED | 失败 | 归因、已保护数据、可选路径 | 重试/重规划/导出 |
| CANCELLED | 已取消 | 保留产物和进展报告 | 归档 |
| ARCHIVED | 已归档 | 只读 | 恢复到 Dashboard |

## 8. Task 状态

| Task 状态 | 标签 | 可用操作 |
|---|---|---|
| DRAFT | 草稿 | 编辑 |
| BLOCKED | 等待依赖 | 查看依赖 |
| READY | 待执行 | 调整优先级、暂停 |
| RUNNING | 执行中 | 查看 Run、暂停 Corporation |
| VERIFYING | 验收中 | 查看候选 Artifact |
| WAITING_HUMAN | 等待决定 | 处理对应请求 |
| RETRY_PENDING | 等待重试 | 查看策略、取消重试 |
| REPLAN_REQUIRED | 需要重规划 | 查看原因、重规划 |
| PAUSED | 已暂停 | 继续 |
| COMPLETED | 已完成 | 查看输出与证据 |
| FAILED | 失败 | 查看归因、符合条件时重试 |
| CANCELLED | 已取消 | 查看历史 |

## 9. Approval 状态

| 状态 | UI 行为 |
|---|---|
| Loading details | 不显示批准按钮，直到精确资源加载完成 |
| Pending | 显示完整审批内容 |
| Content changed | 若请求 fingerprint 改变，旧审批失效并刷新 |
| Approved | 显示批准范围、批准人、时间 |
| Denied | 显示拒绝及后续 Task 行为 |
| Expired | 禁用按钮，允许请求新审批 |
| Cancelled | 说明请求已无效 |
| Execution started | 显示工具执行状态，不能再次批准 |
| Execution unknown | 进入 Recovery，不显示“再次运行”快捷按钮 |

### 9.1 Approval 按钮规则

| 风险 | 允许范围 | 默认焦点 |
|---|---|---|
| Low read-only | Once / Task / Workspace rule | Once |
| Medium write | Once / Corporation narrow rule | Once |
| High process/delete | Once only | 拒绝或无危险默认焦点 |
| Critical/forbidden | 不显示批准 | 返回/查看策略 |

## 10. Artifact 生命周期与完整性状态

生命周期状态：

| 生命周期状态 | 表现 | 操作 |
|---|---|---|
| DRAFT | 草稿标记 | 预览 |
| CANDIDATE | 等待验收 | 预览、Diff、查看来源 |
| APPROVED | 成功标记 | 打开、导出、追溯 |
| REJECTED | 失败标记 + Issue 数 | 查看问题和旧版本 |
| SUPERSEDED | 弱化 | 跳转当前版本 |
完整性状态独立于生命周期状态：

| 完整性状态 | 表现 | 操作 |
|---|---|---|
| VALID | 内容和引用校验通过 | 按生命周期状态操作 |
| CORRUPTED | 哈希不匹配 | 停止使用、恢复备份 |
| MISSING | 引用文件不存在 | 定位、重新生成 |

`CONFLICT` 是 Change Set 状态，表现为“工作区冲突”，操作是比较、保留外部版本或重新生成；不得把 Artifact 生命周期改写为 `CONFLICT`。

## 11. Evaluation 状态

| 状态 | UI |
|---|---|
| Running deterministic | 显示正在执行的检查名 |
| Running judge | 显示语义验收，不显示隐藏推理 |
| PASS | 逐项通过 + Evidence |
| FAIL | REQUIRED 问题置顶 + 修订入口 |
| INCONCLUSIVE | 单个 Evaluator 无法判断；聚合后显示 `NEEDS_HUMAN` 或补充证据入口 |
| ERROR | 验收器错误，不将 Artifact 标记为内容失败 |
| Revision limit reached | 显示历史修订 + 人工决策 |

## 12. Budget 状态

| 使用率 | 表现 | 行为 |
|---|---|---|
| < 80% | 中性 | 正常 |
| 80–99% | 警告 | 显示预计剩余 Task 是否可完成 |
| 100% | 阻断 | 停止新调用，进入 WAITING_HUMAN |
| Usage unknown | 标记估算/未知 | 采用保守预留 |
| Reservation conflict | 等待调度 | 不重复预留 |

## 13. Provider 状态

Provider 配置状态：

| 配置状态 | UI |
|---|---|
| ENABLED | 可被调度；同时展示健康状态 |
| DISABLED | 只读配置，不参与调度 |

Provider 运行时健康状态：

| 健康状态 | UI |
|---|---|
| HEALTHY | 正常 |
| DEGRADED | 黄色 Banner、显示回退 |
| OPEN | 暂时不可用，不连续重试 |
| HALF_OPEN | 显示正在探测，只允许单个探测请求 |

最近失败原因作为补充信息展示，不替代配置或健康状态：

| 失败原因 | UI |
|---|---|
| Rate limited | 显示下次重试时间 |
| Authentication failed | 阻断并跳转设置 |
| Quota exhausted | 阻断、切换 Provider/增加配额 |
| Model missing | 要求选择替代模型 |
| Timeout / Network | 显示重试时间、网络诊断和可用回退 |
| Invalid request / Content filter | 显示不可重试原因和修改入口 |

## 14. 通用异步规则

- 提交按钮点击后立即进入 pending，防止双击；
- pending 超过 400ms 才显示进度；
- 超过 10 秒显示取消或诊断入口；
- 刷新不清空当前可用内容；
- 乐观更新只用于无危险、可逆 UI 偏好；
- 状态和副作用操作使用服务端/主进程确认后更新；
- 事件断线时显示“正在重新连接”，用 cursor 补发；
- 迟到响应不得覆盖更新版本。

## 15. 键盘与焦点状态

- `Cmd/Ctrl + K`：全局搜索/命令入口（只包含安全导航与明确动作）；
- `Cmd/Ctrl + N`：新建 Corporation；
- `Cmd/Ctrl + ,`：Settings；
- `Esc`：关闭非阻断抽屉；审批模态需二次 Esc 或明确取消；
- 焦点不进入隐藏内容；
- 状态更新不强制抢焦点，除非出现阻断安全请求。
