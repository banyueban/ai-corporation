import {
  organizationProposalSchema,
  plannerDraftPublicSchema,
} from "@ai-corporation/protocols";

type Ids = {
  corporation: string;
  provider: string;
  plan: string;
  task: string;
};

export function buildProposal(
  ids: Ids,
  organizationId: string,
  version: number,
  createdAt: string,
) {
  return organizationProposalSchema.parse({
    schemaVersion: "1.0",
    organizationId,
    corporationId: ids.corporation,
    planId: ids.plan,
    planVersion: 1,
    version,
    status: "DRAFT",
    templateSetVersion: "builtin-v1",
    members: [
      {
        memberId: "planner.primary",
        templateId: "builtin.planner",
        templateVersion: 1,
        displayName: "规划负责人",
        role: "PLANNER",
        modelStrategy: "HIGH_REASONING",
        capabilities: ["analysis.requirements"],
        allowedTools: ["workspace.read_text"],
      },
      {
        memberId: "executor.analysis-documents",
        templateId: "builtin.executor.analysis-documents",
        templateVersion: 1,
        displayName: "分析与文档执行员",
        role: "EXECUTOR",
        capabilityGroup: "ANALYSIS_DOCUMENTS",
        modelStrategy: "BALANCED",
        capabilities: ["analysis.requirements"],
        allowedTools: ["workspace.read_text"],
      },
      {
        memberId: "judge.primary",
        templateId: "builtin.judge",
        templateVersion: 1,
        displayName: "独立验收员",
        role: "JUDGE",
        modelStrategy: "HIGH_REASONING",
        capabilities: ["quality.validation"],
        allowedTools: ["workspace.read_text"],
      },
    ],
    assignments: [
      {
        taskId: ids.task,
        ownerType: "AGENT",
        ownerId: "executor.analysis-documents",
        reason: "分析任务",
      },
    ],
    separationConstraints: [
      {
        rule: "EXECUTOR_JUDGE_SEPARATION",
        executorMemberId: "executor.analysis-documents",
        judgeMemberId: "judge.primary",
      },
    ],
    capabilityGaps: [],
    createdAt,
  });
}

buildProposal.plan = (ids: Ids, now: string) =>
  plannerDraftPublicSchema.parse({
    schemaVersion: "1.0",
    planId: ids.plan,
    corporationId: ids.corporation,
    planVersion: 1,
    goalVersion: 1,
    status: "APPROVED",
    validationStatus: "VALID",
    validationReport: {
      schemaVersion: "1.0",
      validatorVersion: "1.0",
      planId: ids.plan,
      planVersion: 1,
      status: "VALID",
      issues: [],
      warnings: [],
      validatedAt: now,
    },
    summary: "Create result",
    tasks: [
      {
        id: ids.task,
        localId: "task-one",
        title: "Create",
        objective: "Create result",
        kind: "ANALYSIS",
        priority: 50,
        riskLevel: "LOW",
        suggestedRole: "Analyst",
        requiredCapabilities: [
          { path: "analysis.requirements", minimumLevel: 0.5, mandatory: true },
        ],
        requiredTools: [],
        inputs: [
          { source: "GOAL_CONTRACT", logicalName: "goal", required: true },
        ],
        expectedOutputs: [
          {
            logicalName: "result",
            mediaType: "text/plain",
            required: true,
            description: "Result",
          },
        ],
        acceptanceCriteria: [
          {
            localId: "done",
            description: "Done",
            severity: "REQUIRED",
            evidenceRequired: ["result"],
          },
        ],
        budget: {},
        retryPolicy: {
          maxAttempts: 1,
          maxEvaluationRevisions: 0,
          retryableCategories: [],
        },
        permissionHints: {
          workspaceRead: true,
          workspaceWrite: [],
          processProfiles: [],
        },
        assumptions: [],
        nonGoals: [],
      },
    ],
    dependencies: [],
    milestones: [],
    assumptions: [],
    risks: [],
    provider: {
      providerId: ids.provider,
      providerVersion: 1,
      model: "model-a",
    },
    usage: { costSource: "UNKNOWN" },
    approvedAt: now,
    createdAt: now,
  });
