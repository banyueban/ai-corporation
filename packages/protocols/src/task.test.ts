import { describe, expect, it } from "vitest";
import { planValidationReportSchema, taskContractSchema } from "./index";

const planId = "019fa9bb-8000-7d90-a4e3-a5b0eea2a9ef";
const taskId = "019fa9bb-8001-7d90-a4e3-a5b0eea2a9ef";
const corporationId = "019fa9bb-8002-7d90-a4e3-a5b0eea2a9ef";

describe("formal Task and Plan validation protocols", () => {
  it("accepts the exact formal Task shape", () => {
    expect(taskContractSchema.safeParse(formalTask()).success).toBe(true);
  });

  it("rejects extra fields, invalid identities, duplicate outputs, and duplicate evidence labels", () => {
    expect(
      taskContractSchema.safeParse({ ...formalTask(), extra: true }).success,
    ).toBe(false);
    expect(
      taskContractSchema.safeParse({ ...formalTask(), id: "task-one" }).success,
    ).toBe(false);

    const duplicateOutputs = formalTask();
    duplicateOutputs.expectedOutputs.push({
      ...duplicateOutputs.expectedOutputs[0]!,
    });
    expect(taskContractSchema.safeParse(duplicateOutputs).success).toBe(false);

    const duplicateEvidence = formalTask();
    duplicateEvidence.acceptanceCriteria[0]!.evidenceRequired = [
      "result",
      "result",
    ];
    expect(taskContractSchema.safeParse(duplicateEvidence).success).toBe(false);
  });

  it("rejects invalid report states, codes, paths, versions, and excess findings", () => {
    const report = validReport();
    expect(planValidationReportSchema.safeParse(report).success).toBe(true);
    expect(
      planValidationReportSchema.safeParse({ ...report, status: "INVALID" })
        .success,
    ).toBe(false);
    expect(
      planValidationReportSchema.safeParse({
        ...report,
        issues: [{ code: "MODEL_SAYS_BAD", path: "tasks.0" }],
      }).success,
    ).toBe(false);
    expect(
      planValidationReportSchema.safeParse({
        ...report,
        issues: [{ code: "CYCLE_DETECTED", path: "" }],
      }).success,
    ).toBe(false);
    expect(
      planValidationReportSchema.safeParse({ ...report, planVersion: 0 })
        .success,
    ).toBe(false);
    expect(
      planValidationReportSchema.safeParse({
        ...report,
        status: "INVALID",
        issues: Array.from({ length: 201 }, () => ({
          code: "CYCLE_DETECTED",
          path: "dependencies",
        })),
      }).success,
    ).toBe(false);
  });
});

function formalTask() {
  return {
    schemaVersion: "1.0" as const,
    id: taskId,
    corporationId,
    planVersion: 1,
    title: "Create output",
    objective: "Create the requested output.",
    kind: "GENERATION" as const,
    priority: 50,
    riskLevel: "LOW" as const,
    requiredCapabilities: [],
    requiredTools: [],
    inputRefs: [
      {
        source: "GOAL_CONTRACT" as const,
        goalVersion: 1,
        logicalName: "approved-goal",
        required: true,
      },
    ],
    expectedOutputs: [
      {
        logicalName: "result",
        artifactType: "TEXT" as const,
        mediaType: "text/plain",
        required: true,
        description: "Requested result.",
      },
    ],
    acceptanceCriteria: [
      {
        id: "criterion-result",
        description: "The result exists.",
        severity: "REQUIRED" as const,
        evidenceRequired: ["result"],
      },
    ],
    dependencies: [],
    budget: {},
    retryPolicy: {
      maxAttempts: 1,
      maxEvaluationRevisions: 0,
      retryableCategories: [],
    },
    permissionRequest: {
      workspaceRead: false,
      workspaceWrite: [],
      processProfiles: [],
    },
    assumptions: [],
    nonGoals: [],
  };
}

function validReport() {
  return {
    schemaVersion: "1.0" as const,
    validatorVersion: "1.0" as const,
    planId,
    planVersion: 1,
    status: "VALID" as const,
    issues: [],
    warnings: [],
    validatedAt: "2026-08-09T16:00:00.000Z",
  };
}
