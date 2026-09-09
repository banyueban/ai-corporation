import { describe, expect, it, vi } from "vitest";
import type {
  PlanReviewSaveVersionRequest,
  PlannerDraftPublic,
} from "@ai-corporation/protocols";
import { PlanReviewService } from "./plan-review-service";

const corporationId = "019fa9bb-7300-7d90-a4e3-a5b0eea2a9ef";
const providerId = "019fa9bb-7301-7d90-a4e3-a5b0eea2a9ef";
const planId = "019fa9bb-7302-7d90-a4e3-a5b0eea2a9ef";
const upstreamId = "019fa9bb-7303-7d90-a4e3-a5b0eea2a9ef";
const downstreamId = "019fa9bb-7304-7d90-a4e3-a5b0eea2a9ef";
const commandId = "019fa9bb-7305-7d90-a4e3-a5b0eea2a9ef";
const generatedIds = [
  "019fa9bb-7310-7d90-a4e3-a5b0eea2a9ef",
  "019fa9bb-7311-7d90-a4e3-a5b0eea2a9ef",
  "019fa9bb-7312-7d90-a4e3-a5b0eea2a9ef",
  "019fa9bb-7313-7d90-a4e3-a5b0eea2a9ef",
] as const;
const now = "2026-08-11T00:00:00.000Z";

describe("PlanReviewService", () => {
  it("creates a new Plan and all-new Task identities, then validates locally", () => {
    const source = plan();
    let savedPlan: PlannerDraftPublic | undefined;
    const saveVersion = vi.fn((input: { newPlan: PlannerDraftPublic }) => {
      savedPlan = input.newPlan;
      return input.newPlan;
    });
    const validate = vi.fn(() => {
      const pending = savedPlan!;
      return {
        ...pending,
        status: "VALIDATED" as const,
        validationStatus: "VALID" as const,
        validationReport: {
          schemaVersion: "1.0" as const,
          validatorVersion: "1.0" as const,
          planId: pending.planId,
          planVersion: pending.planVersion,
          status: "VALID" as const,
          issues: [],
          warnings: [],
          validatedAt: now,
        },
      };
    });
    const ids = [...generatedIds];
    const service = new PlanReviewService({
      clock: () => now,
      createId: () => ids.shift()!,
      repository: {
        approve: vi.fn(),
        getCurrent: () => source,
        listVersions: () => [source],
        resolveCommand: () => undefined,
        saveVersion,
      },
      validator: { validate },
    });

    const request = editRequest();
    request.tasks[0]!.title = "修改后的上游任务";
    request.tasks[0]!.acceptanceCriteria.push({
      description: "新增标准",
      severity: "RECOMMENDED",
      evidenceRequired: ["result"],
    });
    const result = service.saveVersion(request);

    expect(result).toMatchObject({
      ok: true,
      value: {
        planId: generatedIds[3],
        planVersion: 2,
        supersedesPlanId: planId,
        status: "VALIDATED",
      },
    });
    expect(savedPlan?.tasks.map(({ id }) => id)).toEqual([
      generatedIds[0],
      generatedIds[2],
    ]);
    expect(savedPlan?.tasks[0]).toMatchObject({
      title: "修改后的上游任务",
      kind: "GENERATION",
      budget: { maxDurationMs: 1000 },
    });
    expect(savedPlan?.dependencies).toEqual([
      {
        upstreamLocalId: "task-upstream",
        downstreamLocalId: "task-downstream",
        condition: "ON_SUCCESS",
      },
    ]);
    expect(validate).toHaveBeenCalledOnce();
  });

  it("blocks deletion when a retained Task still consumes its output", () => {
    const source = plan();
    const saveVersion = vi.fn();
    const service = new PlanReviewService({
      createId: () => generatedIds[0],
      repository: {
        approve: vi.fn(),
        getCurrent: () => source,
        listVersions: () => [source],
        resolveCommand: () => undefined,
        saveVersion,
      },
      validator: { validate: vi.fn() },
    });
    const request = editRequest();
    request.tasks = [request.tasks[1]!];
    request.dependencies = [];

    expect(service.saveVersion(request)).toEqual({
      ok: false,
      error: {
        code: "DELETE_BLOCKED",
        message: "A retained Task still uses the deleted Task output.",
        blockingTaskIds: [downstreamId],
      },
    });
    expect(saveVersion).not.toHaveBeenCalled();
  });

  it("cleans dependencies and milestone membership when deletion is safe", () => {
    const source = plan();
    let savedPlan: PlannerDraftPublic | undefined;
    const ids = [...generatedIds];
    const service = new PlanReviewService({
      createId: () => ids.shift()!,
      repository: {
        approve: vi.fn(),
        getCurrent: () => source,
        listVersions: () => [source],
        resolveCommand: () => undefined,
        saveVersion: (input) => {
          savedPlan = input.newPlan;
          return input.newPlan;
        },
      },
      validator: { validate: () => savedPlan! },
    });
    const request = editRequest();
    request.tasks = [request.tasks[0]!];
    request.dependencies = [];

    expect(service.saveVersion(request).ok).toBe(true);
    expect(savedPlan?.dependencies).toEqual([]);
    expect(savedPlan?.milestones).toEqual([
      { title: "Done", taskLocalIds: ["task-upstream"] },
    ]);
    expect(savedPlan?.tasks).toHaveLength(1);
  });

  it("finishes local validation when a repeated save command finds a pending Plan", () => {
    const pending = {
      ...plan(),
      status: "DRAFT" as const,
      validationStatus: "PENDING" as const,
      validationReport: undefined,
    };
    const validated = {
      ...plan(),
      planId: pending.planId,
    };
    const validate = vi.fn(() => validated);
    const service = new PlanReviewService({
      createId: () => generatedIds[0],
      repository: {
        approve: vi.fn(),
        getCurrent: vi.fn(),
        listVersions: () => [pending],
        resolveCommand: () => pending,
        saveVersion: vi.fn(),
      },
      validator: { validate },
    });

    expect(service.saveVersion(editRequest())).toEqual({
      ok: true,
      value: validated,
    });
    expect(validate).toHaveBeenCalledWith(pending.planId);
  });
});

function editRequest(): {
  -readonly [
    K in keyof PlanReviewSaveVersionRequest
  ]: PlanReviewSaveVersionRequest[K] extends readonly (infer Item)[]
    ? Item[]
    : PlanReviewSaveVersionRequest[K];
} {
  return {
    schemaVersion: "1.0",
    commandId,
    corporationId,
    sourcePlanId: planId,
    expectedPlanVersion: 1,
    tasks: plan().tasks.map((task) => ({
      sourceTaskId: task.id,
      title: task.title,
      objective: task.objective,
      priority: task.priority,
      acceptanceCriteria: task.acceptanceCriteria.map((criterion) => ({
        sourceLocalId: criterion.localId,
        description: criterion.description,
        severity: criterion.severity,
        evidenceRequired: [...criterion.evidenceRequired],
      })),
    })),
    dependencies: [
      {
        upstreamSourceTaskId: upstreamId,
        downstreamSourceTaskId: downstreamId,
        condition: "ON_SUCCESS",
      },
    ],
  };
}

function plan(): PlannerDraftPublic {
  return {
    schemaVersion: "1.0",
    planId,
    corporationId,
    planVersion: 1,
    goalVersion: 1,
    status: "VALIDATED",
    validationStatus: "VALID",
    validationReport: {
      schemaVersion: "1.0",
      validatorVersion: "1.0",
      planId,
      planVersion: 1,
      status: "VALID",
      issues: [],
      warnings: [],
      validatedAt: now,
    },
    summary: "Plan review",
    tasks: [
      task(upstreamId, "task-upstream", []),
      task(downstreamId, "task-downstream", [
        {
          source: "TASK_OUTPUT",
          taskLocalId: "task-upstream",
          logicalName: "result",
          mediaType: "text/plain",
          required: true,
        },
      ]),
    ],
    dependencies: [
      {
        upstreamLocalId: "task-upstream",
        downstreamLocalId: "task-downstream",
        condition: "ON_SUCCESS",
      },
    ],
    milestones: [
      { title: "Done", taskLocalIds: ["task-upstream", "task-downstream"] },
    ],
    assumptions: [],
    risks: [],
    provider: { providerId, providerVersion: 1, model: "model-a" },
    usage: { costSource: "UNKNOWN" },
    createdAt: now,
  };
}

function task(
  id: string,
  localId: string,
  inputs: PlannerDraftPublic["tasks"][number]["inputs"],
): PlannerDraftPublic["tasks"][number] {
  return {
    id,
    localId,
    title: localId,
    objective: "Create result",
    kind: "GENERATION",
    priority: 50,
    riskLevel: "LOW",
    suggestedRole: "Writer",
    requiredCapabilities: [],
    requiredTools: [],
    inputs,
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
        localId: `criterion-${localId}`,
        description: "Result exists",
        severity: "REQUIRED",
        evidenceRequired: ["result"],
      },
    ],
    budget: { maxDurationMs: 1000 },
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
  };
}
