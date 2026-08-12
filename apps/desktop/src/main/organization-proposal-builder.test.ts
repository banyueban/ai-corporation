import {
  plannerDraftPublicSchema,
  type PlannerDraftPublic,
} from "@ai-corporation/protocols";
import { describe, expect, it } from "vitest";
import { buildOrganizationProposal } from "./organization-proposal-builder";

const ids = {
  corporation: "019fa9bb-9000-7d90-a4e3-a5b0eea2a9ef",
  plan: "019fa9bb-9001-7d90-a4e3-a5b0eea2a9ef",
  provider: "019fa9bb-9002-7d90-a4e3-a5b0eea2a9ef",
  organization: "019fa9bb-9003-7d90-a4e3-a5b0eea2a9ef",
  analysis: "019fa9bb-9004-7d90-a4e3-a5b0eea2a9ef",
  software: "019fa9bb-9005-7d90-a4e3-a5b0eea2a9ef",
  quality: "019fa9bb-9006-7d90-a4e3-a5b0eea2a9ef",
  human: "019fa9bb-9007-7d90-a4e3-a5b0eea2a9ef",
};

describe("buildOrganizationProposal", () => {
  it("creates the three fixed executor groups, separates Judge, and assigns human decisions to the user", () => {
    const proposal = buildOrganizationProposal({
      organizationId: ids.organization,
      plan: plan(),
      version: 1,
      createdAt: "2026-08-12T08:00:00.000Z",
    });
    expect(proposal.members.map(({ memberId }) => memberId)).toEqual([
      "planner.primary",
      "executor.analysis-documents",
      "executor.quality-validation",
      "executor.software-implementation",
      "judge.primary",
    ]);
    expect(proposal.assignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          taskId: ids.human,
          ownerType: "HUMAN",
          ownerId: "human.user",
        }),
        expect.objectContaining({
          taskId: ids.software,
          ownerId: "executor.software-implementation",
        }),
        expect.objectContaining({
          taskId: ids.quality,
          ownerId: "executor.quality-validation",
        }),
      ]),
    );
    expect(proposal.separationConstraints).toHaveLength(3);
    expect(JSON.stringify(proposal)).not.toContain("providerId");
    expect(JSON.stringify(proposal)).not.toContain('"model"');
  });

  it("is deterministic and reports unsupported mandatory capabilities without inventing a member", () => {
    const source = plan();
    source.tasks[0]!.requiredCapabilities.push({
      path: "legal.contract",
      minimumLevel: 0.8,
      mandatory: true,
    });
    const first = buildOrganizationProposal({
      organizationId: ids.organization,
      plan: source,
      version: 1,
      createdAt: "2026-08-12T08:00:00.000Z",
    });
    const second = buildOrganizationProposal({
      organizationId: ids.organization,
      plan: source,
      version: 1,
      createdAt: "2026-08-12T08:00:00.000Z",
    });
    expect(first).toEqual(second);
    expect(first.capabilityGaps).toEqual([
      expect.objectContaining({
        capability: "legal.contract",
        severity: "BLOCKING",
        taskIds: [ids.analysis],
      }),
    ]);
    expect(first.members).toHaveLength(5);
  });
});

function plan(): PlannerDraftPublic {
  return plannerDraftPublicSchema.parse({
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
      validatedAt: "2026-08-12T07:00:00.000Z",
    },
    summary: "Team plan",
    tasks: [
      task(ids.analysis, "analysis", "ANALYSIS", ["analysis.requirements"], []),
      task(
        ids.software,
        "software",
        "GENERATION",
        ["software.implementation"],
        ["workspace.propose_write"],
      ),
      task(ids.quality, "quality", "VALIDATION", ["quality.validation"], []),
      task(ids.human, "human", "HUMAN_DECISION", ["human.decision"], []),
    ],
    dependencies: [],
    milestones: [],
    assumptions: [],
    risks: [],
    provider: {
      providerId: ids.provider,
      providerVersion: 1,
      model: "secret-exact-model",
    },
    usage: { costSource: "UNKNOWN" },
    approvedAt: "2026-08-12T07:30:00.000Z",
    createdAt: "2026-08-12T06:00:00.000Z",
  });
}

function task(
  id: string,
  localId: string,
  kind: "ANALYSIS" | "GENERATION" | "VALIDATION" | "HUMAN_DECISION",
  capabilities: string[],
  tools: string[],
) {
  return {
    id,
    localId,
    title: localId,
    objective: `Complete ${localId}`,
    kind,
    priority: 50,
    riskLevel: "LOW",
    suggestedRole: "Suggested",
    requiredCapabilities: capabilities.map((path) => ({
      path,
      minimumLevel: 0.5,
      mandatory: true,
    })),
    requiredTools: tools,
    inputs: [{ source: "GOAL_CONTRACT", logicalName: "goal", required: true }],
    expectedOutputs: [
      {
        logicalName: `${localId}-output`,
        mediaType: "text/plain",
        required: true,
        description: "Result",
      },
    ],
    acceptanceCriteria: [
      {
        localId: `${localId}-done`,
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
  };
}
