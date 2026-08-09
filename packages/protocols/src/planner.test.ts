import { describe, expect, it } from "vitest";
import {
  plannerDraftCandidateSchema,
  plannerOperationPublicSchema,
  plannerStartRequestSchema,
  type PlannerDraftCandidate,
} from "./planner";

const id = "019fa9bb-7000-7d90-a4e3-a5b0eea2a9ef";

describe("Planner protocol", () => {
  it("requires an explicit provider version and exact model without extra fields", () => {
    expect(
      plannerStartRequestSchema.safeParse({
        schemaVersion: "1.0",
        operationId: id,
        corporationId: id,
        expectedCorporationVersion: 1,
        goalVersion: 1,
        providerId: id,
        expectedProviderVersion: 1,
        modelId: "model-a",
      }).success,
    ).toBe(true);
    expect(
      plannerStartRequestSchema.safeParse({
        schemaVersion: "1.0",
        operationId: id,
        corporationId: id,
        expectedCorporationVersion: 1,
        goalVersion: 1,
        providerId: id,
        expectedProviderVersion: 1,
        modelId: "model-a",
        workspacePath: "forbidden",
      }).success,
    ).toBe(false);
  });

  it("accepts semantic content and local references but rejects trusted identities", () => {
    const candidate = draftCandidate();
    expect(plannerDraftCandidateSchema.safeParse(candidate).success).toBe(true);
    expect(
      plannerDraftCandidateSchema.safeParse({
        ...candidate,
        corporationId: id,
        planId: id,
      }).success,
    ).toBe(false);
  });

  it("requires TASK_OUTPUT inputs to carry exactly one local task reference", () => {
    const candidate = draftCandidate();
    candidate.tasks[0]!.inputs = [
      {
        source: "TASK_OUTPUT",
        logicalName: "missing-ref",
        required: true,
      },
    ];
    expect(plannerDraftCandidateSchema.safeParse(candidate).success).toBe(
      false,
    );
  });

  it("does not perform semantic DAG validation in the structural schema", () => {
    const candidate = draftCandidate();
    candidate.dependencies = [
      {
        upstreamLocalId: "unknown-task",
        downstreamLocalId: "task-one",
        condition: "ON_SUCCESS",
      },
    ];
    expect(plannerDraftCandidateSchema.safeParse(candidate).success).toBe(true);
  });

  it("rejects public operations that pretend an unsaved plan exists", () => {
    expect(
      plannerOperationPublicSchema.safeParse({
        schemaVersion: "1.0",
        operationId: id,
        corporationId: id,
        providerId: id,
        providerVersion: 1,
        modelId: "model-a",
        status: "PLAN_SAVED",
        version: 1,
        usage: { costSource: "UNKNOWN" },
        updatedAt: "2026-08-09T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});

function draftCandidate(): PlannerDraftCandidate {
  return {
    schemaVersion: "1.0" as const,
    summary: "Create one verifiable output.",
    tasks: [
      {
        localId: "task-one",
        title: "Create output",
        objective: "Create the requested output.",
        kind: "GENERATION" as const,
        priority: 50,
        riskLevel: "LOW" as const,
        suggestedRole: "Writer",
        requiredCapabilities: [],
        requiredTools: [],
        inputs: [
          {
            source: "GOAL_CONTRACT" as const,
            logicalName: "approved-goal",
            required: true,
          },
        ],
        expectedOutputs: [
          {
            logicalName: "result",
            mediaType: "text/plain",
            required: true,
            description: "Requested result.",
          },
        ],
        acceptanceCriteria: [
          {
            localId: "criterion-result",
            description: "The result exists.",
            severity: "REQUIRED" as const,
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
          workspaceRead: false,
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
  };
}
