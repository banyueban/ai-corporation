const internalLabels: Readonly<Record<string, string>> = {
  DRAFT: "草稿",
  VALIDATED: "已验证",
  PLANNING: "规划中",
  ORGANIZING: "组建中",
  EXECUTING: "执行中",
  VERIFYING: "验证中",
  WAITING_HUMAN: "等待人工处理",
  BLOCKED: "等待依赖",
  READY: "可以执行",
  RUNNING: "执行中",
  CREATED: "已创建",
  PAUSED: "已暂停",
  COMPLETED: "已完成",
  FAILED: "失败",
  CANCELLED: "已取消",
  ARCHIVED: "已归档",
  APPROVED: "已批准",
  SUPERSEDED: "已被新版替代",
  GENERATING: "生成中",
  CLARIFICATION_REQUIRED: "需要补充说明",
  EXTENSION_REQUIRED: "需要决定是否继续",
  GOAL_SAVED: "目标草稿已保存",
  PLAN_SAVED: "计划草稿已保存",
  INTERRUPTED: "已中断",
  NOT_STARTED: "尚未开始",
  PENDING: "正在本地验证",
  VALID: "验证通过",
  INVALID: "验证未通过",
  ENABLED: "已启用",
  DISABLED: "已停用",
  VERIFIED: "已验证",
  UNVERIFIED: "尚未验证",
  SUCCEEDED: "成功",
  IDLE: "尚未测试",
  LOW: "低",
  MEDIUM: "中",
  HIGH: "高",
  MANUAL: "手动创建",
  MOCK: "本地模拟",
  PROVIDER: "模型服务商生成",
  READ_WRITE: "可读写",
  READ_ONLY: "只读",
  GENERATION: "内容生成",
  EVALUATION: "结果评估",
  TOOL: "工具操作",
  HUMAN: "人工处理",
};

const planValidationFindingLabels: Readonly<Record<string, string>> = {
  TASK_COUNT_EXCEEDED: "任务数量超过 20 个",
  DUPLICATE_TASK_LOCAL_ID: "任务编号重复",
  DUPLICATE_ACCEPTANCE_LOCAL_ID: "同一任务内的验收编号重复",
  ACCEPTANCE_EVIDENCE_MISSING: "验收标准没有填写证据标签",
  DUPLICATE_OUTPUT_LOGICAL_NAME: "同一任务内的输出名称重复",
  UNKNOWN_TASK_REFERENCE: "引用了不存在的任务",
  SELF_DEPENDENCY: "任务依赖了自己",
  DUPLICATE_DEPENDENCY: "任务依赖关系重复",
  CYCLE_DETECTED: "任务之间形成循环依赖",
  UNKNOWN_MILESTONE_TASK: "里程碑引用了不存在的任务",
  DUPLICATE_MILESTONE_TASK: "里程碑重复引用同一任务",
  TASK_MISSING_REQUIRED_ACCEPTANCE: "任务缺少必须通过的验收标准",
  LEAF_MISSING_REQUIRED_OUTPUT: "末端任务缺少必须交付的输出",
  TASK_OUTPUT_NOT_FOUND: "引用的任务输出不存在",
  TASK_OUTPUT_NOT_UPSTREAM: "引用的输出不来自上游任务",
  TASK_OUTPUT_MEDIA_TYPE_MISMATCH: "输入与上游输出的媒体类型不一致",
  UNSUPPORTED_MEDIA_TYPE: "使用了不支持的媒体类型",
  BUDGET_LIMIT_MISSING: "目标有预算限制，但任务没有对应限制",
  BUDGET_COST_EXCEEDED: "任务总成本超过目标限制",
  BUDGET_DURATION_EXCEEDED: "任务关键路径时长超过目标限制",
  BUDGET_REVISIONS_EXCEEDED: "任务总修改次数超过目标限制",
  UNKNOWN_CAPABILITY: "使用了能力目录中不存在的能力",
  UNKNOWN_TOOL: "使用了工具目录中不存在的工具",
  UNSAFE_WORKSPACE_PATH: "工作区路径不安全或不是相对路径",
  FORBIDDEN_PROCESS_PROFILE: "使用了未允许的进程配置",
  SINGLE_RUN_SIZE_WARNING: "单次运行的预计资源用量较大",
};

const timelineLabels: Readonly<Record<string, string>> = {
  "corporation.created": "公司已创建。",
  "corporation.name.updated": "公司名称已更新。",
  "corporation.archived": "公司已归档。",
  "goal.contract.drafted": "目标合同草稿已保存。",
  "goal.contract.approved": "目标合同已批准。",
  "corporation.paused": "公司已暂停。",
  "corporation.resumed": "公司已继续运行。",
};

const agentRunErrorLabels: Readonly<Record<string, string>> = {
  RUN_CHANGED: "运行记录已经变化，请刷新后再试。",
  RUN_NOT_CONTINUABLE: "当前运行不能继续，请刷新后查看最新状态。",
  TASK_INPUT_UNSUPPORTED:
    "该任务需要读取工作区、上游任务结果或运行进程，当前版本还不能处理。",
  PROVIDER_NOT_READY: "模型服务商尚未准备好，请检查模型设置。",
  PROVIDER_FAILURE: "模型服务商请求失败，请检查连接后再试。",
  RUN_NOT_FOUND: "没有找到这条运行记录，请刷新后再试。",
  COMMAND_CONFLICT: "本次操作与之前的操作冲突，请重新发起。",
  STORAGE_FAILURE: "本地数据操作失败，软件没有把本次操作标记为成功。",
};

export function internalLabel(value: string): string {
  return internalLabels[value] ?? value;
}

export function planValidationFindingLabel(value: string): string {
  return planValidationFindingLabels[value] ?? "未知的计划验证问题";
}

export function timelineLabel(eventType: string): string {
  return timelineLabels[eventType] ?? eventType;
}

export function agentRunErrorLabel(value: string): string {
  return (
    agentRunErrorLabels[value] ??
    `运行操作失败（${value}），软件没有把本次操作标记为成功。`
  );
}

export function formatUiTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN");
}
