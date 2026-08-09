const internalLabels: Readonly<Record<string, string>> = {
  DRAFT: "草稿",
  PLANNING: "规划中",
  ORGANIZING: "组建中",
  EXECUTING: "执行中",
  VERIFYING: "验证中",
  WAITING_HUMAN: "等待人工处理",
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
  PENDING: "等待验证",
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

const timelineLabels: Readonly<Record<string, string>> = {
  "corporation.created": "公司已创建。",
  "corporation.name.updated": "公司名称已更新。",
  "corporation.archived": "公司已归档。",
  "goal.contract.drafted": "目标合同草稿已保存。",
  "goal.contract.approved": "目标合同已批准。",
  "corporation.paused": "公司已暂停。",
  "corporation.resumed": "公司已继续运行。",
};

export function internalLabel(value: string): string {
  return internalLabels[value] ?? value;
}

export function timelineLabel(eventType: string): string {
  return timelineLabels[eventType] ?? eventType;
}

export function formatUiTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN");
}
