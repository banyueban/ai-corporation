import {
  organizationProposalSchema,
  type OrganizationProposal,
  type PlannerDraftPublic,
} from "@ai-corporation/protocols";

type Group =
  "ANALYSIS_DOCUMENTS" | "SOFTWARE_IMPLEMENTATION" | "QUALITY_VALIDATION";

const TEMPLATES = {
  planner: {
    memberId: "planner.primary",
    templateId: "builtin.planner",
    templateVersion: 1,
    displayName: "规划负责人",
    role: "PLANNER",
    modelStrategy: "HIGH_REASONING",
    capabilities: ["analysis.requirements"],
    allowedTools: ["workspace.read_text"],
  },
  judge: {
    memberId: "judge.primary",
    templateId: "builtin.judge",
    templateVersion: 1,
    displayName: "独立验收员",
    role: "JUDGE",
    modelStrategy: "HIGH_REASONING",
    capabilities: ["quality.validation"],
    allowedTools: ["workspace.read_text", "process.run_profile"],
  },
  executors: {
    ANALYSIS_DOCUMENTS: {
      memberId: "executor.analysis-documents",
      templateId: "builtin.executor.analysis-documents",
      templateVersion: 1,
      displayName: "分析与文档执行员",
      role: "EXECUTOR",
      capabilityGroup: "ANALYSIS_DOCUMENTS",
      modelStrategy: "BALANCED",
      capabilities: ["analysis.requirements", "writing.document"],
      allowedTools: ["workspace.read_text", "workspace.propose_write"],
    },
    SOFTWARE_IMPLEMENTATION: {
      memberId: "executor.software-implementation",
      templateId: "builtin.executor.software-implementation",
      templateVersion: 1,
      displayName: "软件实现执行员",
      role: "EXECUTOR",
      capabilityGroup: "SOFTWARE_IMPLEMENTATION",
      modelStrategy: "BALANCED",
      capabilities: ["software.implementation"],
      allowedTools: [
        "workspace.read_text",
        "workspace.propose_write",
        "process.run_profile",
      ],
    },
    QUALITY_VALIDATION: {
      memberId: "executor.quality-validation",
      templateId: "builtin.executor.quality-validation",
      templateVersion: 1,
      displayName: "质量验收执行员",
      role: "EXECUTOR",
      capabilityGroup: "QUALITY_VALIDATION",
      modelStrategy: "HIGH_REASONING",
      capabilities: ["quality.validation"],
      allowedTools: ["workspace.read_text", "process.run_profile"],
    },
  },
} as const;

const KNOWN_CAPABILITIES = new Set([
  "analysis.requirements",
  "writing.document",
  "software.implementation",
  "quality.validation",
  "human.decision",
]);

const KNOWN_TOOLS = new Set([
  "workspace.read_text",
  "workspace.propose_write",
  "process.run_profile",
]);

export function buildOrganizationProposal(input: {
  readonly organizationId: string;
  readonly plan: PlannerDraftPublic;
  readonly version: number;
  readonly createdAt: string;
}): OrganizationProposal {
  const groups = new Set<Group>();
  const assignments = input.plan.tasks.map((task) => {
    if (task.kind === "HUMAN_DECISION") {
      return {
        taskId: task.id,
        ownerType: "HUMAN" as const,
        ownerId: "human.user",
        reason: "此任务需要用户本人作出决定。",
      };
    }
    const group = groupForTask(task);
    groups.add(group);
    return {
      taskId: task.id,
      ownerType: "AGENT" as const,
      ownerId: TEMPLATES.executors[group].memberId,
      reason: groupReason(group),
    };
  });

  const executors = [...groups]
    .sort()
    .map((group) => TEMPLATES.executors[group]);
  const gapsByCapability = new Map<string, string[]>();
  for (const task of input.plan.tasks) {
    for (const requirement of task.requiredCapabilities) {
      if (requirement.mandatory && !KNOWN_CAPABILITIES.has(requirement.path)) {
        gapsByCapability.set(requirement.path, [
          ...(gapsByCapability.get(requirement.path) ?? []),
          task.id,
        ]);
      }
    }
    for (const tool of task.requiredTools) {
      if (!KNOWN_TOOLS.has(tool)) {
        gapsByCapability.set(`tool.${tool}`, [
          ...(gapsByCapability.get(`tool.${tool}`) ?? []),
          task.id,
        ]);
      }
    }
  }

  return organizationProposalSchema.parse({
    schemaVersion: "1.0",
    organizationId: input.organizationId,
    corporationId: input.plan.corporationId,
    planId: input.plan.planId,
    planVersion: input.plan.planVersion,
    version: input.version,
    status: "DRAFT",
    templateSetVersion: "builtin-v1",
    members: [TEMPLATES.planner, ...executors, TEMPLATES.judge],
    assignments,
    separationConstraints: executors.map((executor) => ({
      rule: "EXECUTOR_JUDGE_SEPARATION" as const,
      executorMemberId: executor.memberId,
      judgeMemberId: TEMPLATES.judge.memberId,
    })),
    capabilityGaps: [...gapsByCapability.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([capability, taskIds]) => ({
        taskIds: [...new Set(taskIds)],
        capability,
        severity: "BLOCKING" as const,
        reason: capability.startsWith("tool.")
          ? "内置团队模板不支持这个必需工具。"
          : "内置团队模板不覆盖这个必需能力。",
        alternatives: capability.startsWith("tool.")
          ? [
              "CHANGE_PLAN" as const,
              "INSTALL_TOOL" as const,
              "ASK_HUMAN" as const,
            ]
          : ["CHANGE_PLAN" as const, "ASK_HUMAN" as const],
      })),
    createdAt: input.createdAt,
  });
}

function groupForTask(task: PlannerDraftPublic["tasks"][number]): Group {
  const capabilities = task.requiredCapabilities.map(({ path }) => path);
  if (capabilities.some((path) => path.startsWith("software."))) {
    return "SOFTWARE_IMPLEMENTATION";
  }
  if (
    task.kind === "VALIDATION" ||
    capabilities.some((path) => path.startsWith("quality."))
  ) {
    return "QUALITY_VALIDATION";
  }
  return "ANALYSIS_DOCUMENTS";
}

function groupReason(group: Group): string {
  if (group === "SOFTWARE_IMPLEMENTATION")
    return "任务需要软件实现或工作区写入/进程工具。";
  if (group === "QUALITY_VALIDATION") return "任务属于质量检查或结果验收。";
  return "任务属于分析、文档生成或内容转换。";
}
