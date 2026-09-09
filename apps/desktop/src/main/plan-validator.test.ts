import { describe, expect, it } from "vitest";
import type { PlannerDraftPublic } from "@ai-corporation/protocols";
import { PLANNER_CATALOGS } from "./planner-catalogs";
import { validatePlanDraft } from "./plan-validator";

const planId = "019fa9bb-8000-7d90-a4e3-a5b0eea2a9ef";
const corporationId = "019fa9bb-8001-7d90-a4e3-a5b0eea2a9ef";
const providerId = "019fa9bb-8002-7d90-a4e3-a5b0eea2a9ef";
const taskOneId = "019fa9bb-8003-7d90-a4e3-a5b0eea2a9ef";
const taskTwoId = "019fa9bb-8004-7d90-a4e3-a5b0eea2a9ef";
const now = "2026-08-09T16:00:00.000Z";

describe("validatePlanDraft", () => {
  it("accepts one Task and creates a formal contract without fake Artifacts", () => {
    const result = validate(basePlan(), {});
    expect(result.report).toMatchObject({ status: "VALID", issues: [] });
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]).toMatchObject({
      id: taskOneId,
      inputRefs: [
        {
          source: "GOAL_CONTRACT",
          goalVersion: 1,
          logicalName: "approved-goal",
        },
      ],
      expectedOutputs: [{ artifactType: "TEXT" }],
      acceptanceCriteria: [{ id: "criterion-result" }],
    });
    expect(JSON.stringify(result.tasks)).not.toContain("artifactId");
  });

  it("rejects cycles, missing required acceptance, and missing leaf output", () => {
    const plan = twoTaskPlan();
    plan.dependencies.push({
      upstreamLocalId: "task-two",
      downstreamLocalId: "task-one",
      condition: "ON_SUCCESS",
    });
    plan.tasks[0]!.acceptanceCriteria = [];
    const result = validate(plan, {});
    expect(result.report.status).toBe("INVALID");
    expect(result.report.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "CYCLE_DETECTED",
        "TASK_MISSING_REQUIRED_ACCEPTANCE",
      ]),
    );
    expect(result.tasks).toEqual([]);

    const leafPlan = twoTaskPlan();
    leafPlan.tasks[1]!.expectedOutputs = [];
    expect(
      validate(leafPlan, {}).report.issues.map(({ code }) => code),
    ).toContain("LEAF_MISSING_REQUIRED_OUTPUT");
  });

  it("checks cost totals, longest-path duration, and revision totals", () => {
    const plan = twoTaskPlan();
    for (const task of plan.tasks) {
      task.budget.maxCostMicros = "60";
      task.budget.maxDurationMs = 60_000;
      task.retryPolicy.maxEvaluationRevisions = 1;
    }
    const failed = validate(plan, {
      costLimitMicros: 100,
      durationLimitMinutes: 1,
      maxRevisions: 1,
    });
    expect(failed.report.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "BUDGET_COST_EXCEEDED",
        "BUDGET_DURATION_EXCEEDED",
        "BUDGET_REVISIONS_EXCEEDED",
      ]),
    );
    const passed = validate(plan, {
      costLimitMicros: 120,
      durationLimitMinutes: 2,
      maxRevisions: 2,
    });
    expect(passed.report.status).toBe("VALID");
  });

  it("rejects unsafe paths and output references without an upstream dependency", () => {
    const plan = twoTaskPlan();
    plan.dependencies = [];
    plan.tasks[1]!.permissionHints.workspaceWrite = ["../outside.txt"];
    const result = validate(plan, {});
    expect(result.report.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "TASK_OUTPUT_NOT_UPSTREAM",
        "UNSAFE_WORKSPACE_PATH",
      ]),
    );
  });

  it("accepts 20 Tasks and rejects 21 without changing the draft", () => {
    const twenty = planWithTaskCount(20);
    expect(validate(twenty, {}).report.status).toBe("VALID");
    expect(validate(twenty, {}).tasks).toHaveLength(20);

    const twentyOne = planWithTaskCount(21);
    const snapshot = JSON.stringify(twentyOne);
    const result = validate(twentyOne, {});
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({
        code: "TASK_COUNT_EXCEEDED",
        actual: 21,
        limit: 20,
      }),
    );
    expect(result.tasks).toEqual([]);
    expect(JSON.stringify(twentyOne)).toBe(snapshot);
  });

  it("rejects broken graph and milestone references", () => {
    const plan = twoTaskPlan();
    plan.dependencies.push(
      { ...plan.dependencies[0]! },
      {
        upstreamLocalId: "task-one",
        downstreamLocalId: "task-one",
        condition: "ON_SUCCESS",
      },
      {
        upstreamLocalId: "missing-task",
        downstreamLocalId: "task-two",
        condition: "ON_SUCCESS",
      },
    );
    plan.milestones = [
      { title: "First", taskLocalIds: ["task-one", "missing-task"] },
      { title: "Second", taskLocalIds: ["task-one"] },
    ];
    const codes = validate(plan, {}).report.issues.map(({ code }) => code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "DUPLICATE_DEPENDENCY",
        "SELF_DEPENDENCY",
        "UNKNOWN_TASK_REFERENCE",
        "UNKNOWN_MILESTONE_TASK",
        "DUPLICATE_MILESTONE_TASK",
      ]),
    );
  });

  it("rejects duplicate acceptance/output IDs and missing evidence labels", () => {
    const plan = basePlan();
    plan.tasks[0]!.acceptanceCriteria.push({
      ...plan.tasks[0]!.acceptanceCriteria[0]!,
      evidenceRequired: [],
    });
    plan.tasks[0]!.expectedOutputs.push({
      ...plan.tasks[0]!.expectedOutputs[0]!,
    });
    expect(validate(plan, {}).report.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "DUPLICATE_ACCEPTANCE_LOCAL_ID",
        "ACCEPTANCE_EVIDENCE_MISSING",
        "DUPLICATE_OUTPUT_LOGICAL_NAME",
      ]),
    );
  });

  it("maps all supported media types and rejects unknown or mismatched outputs", () => {
    const plan = basePlan();
    plan.tasks[0]!.expectedOutputs = [
      output("plain", "text/plain"),
      output("markdown", "text/markdown"),
      output("json", "application/json"),
      output("file", "application/octet-stream"),
    ];
    expect(validate(plan, {}).tasks[0]?.expectedOutputs).toMatchObject([
      { artifactType: "TEXT" },
      { artifactType: "DOCUMENT" },
      { artifactType: "JSON" },
      { artifactType: "FILE" },
    ]);

    const invalid = twoTaskPlan();
    invalid.tasks[0]!.expectedOutputs[0]!.mediaType = "image/png";
    invalid.tasks[1]!.inputs[0]!.mediaType = "application/json";
    invalid.tasks[1]!.inputs.push({
      source: "TASK_OUTPUT",
      taskLocalId: "task-one",
      logicalName: "missing-output",
      required: true,
    });
    expect(validate(invalid, {}).report.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "UNSUPPORTED_MEDIA_TYPE",
        "TASK_OUTPUT_MEDIA_TYPE_MISMATCH",
        "TASK_OUTPUT_NOT_FOUND",
      ]),
    );
  });

  it("uses the longest parallel path and reports missing or overflowing limits", () => {
    const parallel = planWithTaskCount(3);
    parallel.dependencies = [
      {
        upstreamLocalId: "task-1",
        downstreamLocalId: "task-3",
        condition: "ON_SUCCESS",
      },
      {
        upstreamLocalId: "task-2",
        downstreamLocalId: "task-3",
        condition: "ON_SUCCESS",
      },
    ];
    parallel.tasks[0]!.budget = { maxCostMicros: "30", maxDurationMs: 40_000 };
    parallel.tasks[1]!.budget = { maxCostMicros: "30", maxDurationMs: 20_000 };
    parallel.tasks[2]!.budget = { maxCostMicros: "40", maxDurationMs: 20_000 };
    expect(
      validate(parallel, {
        costLimitMicros: 100,
        durationLimitMinutes: 1,
        maxRevisions: 0,
      }).report.status,
    ).toBe("VALID");

    delete parallel.tasks[0]!.budget.maxCostMicros;
    expect(
      validate(parallel, { costLimitMicros: 100 }).report.issues,
    ).toContainEqual(expect.objectContaining({ code: "BUDGET_LIMIT_MISSING" }));

    const overflow = twoTaskPlan();
    overflow.tasks[0]!.budget.maxDurationMs = Number.MAX_SAFE_INTEGER;
    overflow.tasks[1]!.budget.maxDurationMs = 1;
    expect(
      validate(overflow, { durationLimitMinutes: Number.MAX_SAFE_INTEGER })
        .report.issues,
    ).toContainEqual(
      expect.objectContaining({ code: "BUDGET_DURATION_EXCEEDED" }),
    );
  });

  it("rejects unknown catalogs and path attacks but accepts safe relative paths", () => {
    const plan = basePlan();
    plan.tasks[0]!.requiredCapabilities.push({
      path: "unknown.capability",
      minimumLevel: 1,
      mandatory: true,
    });
    plan.tasks[0]!.requiredTools.push("unknown.tool");
    plan.tasks[0]!.permissionHints.processProfiles.push("shell-anything");
    plan.tasks[0]!.permissionHints.workspaceWrite = [
      "/absolute",
      "C:/drive",
      "//server/share",
      ".",
      "../outside",
      "folder\\file",
      "nul\0file",
    ];
    const result = validate(plan, {});
    expect(result.report.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "UNKNOWN_CAPABILITY",
        "UNKNOWN_TOOL",
        "FORBIDDEN_PROCESS_PROFILE",
        "UNSAFE_WORKSPACE_PATH",
      ]),
    );

    const safe = basePlan();
    safe.tasks[0]!.permissionHints.workspaceWrite = ["reports/result.md"];
    expect(validate(safe, {}).report.status).toBe("VALID");
  });

  it("emits a stable size warning without blocking validation", () => {
    const plan = basePlan();
    plan.tasks[0]!.inputs = Array.from({ length: 8 }, (_, index) => ({
      source: "GOAL_CONTRACT" as const,
      logicalName: `input-${index}`,
      required: true,
    }));
    const first = validate(plan, {});
    const second = validate(plan, {});
    expect(first.report.status).toBe("VALID");
    expect(first.report.warnings).toContainEqual(
      expect.objectContaining({ code: "SINGLE_RUN_SIZE_WARNING" }),
    );
    expect(first.draftHash).toBe(second.draftHash);
    expect(first.report.warnings).toEqual(second.report.warnings);
  });
});

function validate(
  plan: PlannerDraftPublic,
  goalBudget: Parameters<typeof validatePlanDraft>[0]["goalBudget"],
) {
  return validatePlanDraft({
    catalogs: PLANNER_CATALOGS,
    goalBudget,
    now,
    plan,
  });
}

function basePlan(): PlannerDraftPublic {
  return {
    schemaVersion: "1.0",
    planId,
    corporationId,
    planVersion: 1,
    goalVersion: 1,
    status: "DRAFT",
    validationStatus: "PENDING",
    summary: "Create one result.",
    tasks: [task("task-one", taskOneId)],
    dependencies: [],
    milestones: [{ title: "Delivery", taskLocalIds: ["task-one"] }],
    assumptions: [],
    risks: [],
    provider: { providerId, providerVersion: 1, model: "model-a" },
    usage: { costSource: "UNKNOWN" },
    createdAt: now,
  };
}

function twoTaskPlan(): PlannerDraftPublic {
  const plan = basePlan();
  plan.tasks.push({
    ...task("task-two", taskTwoId),
    inputs: [
      {
        source: "TASK_OUTPUT",
        taskLocalId: "task-one",
        logicalName: "result",
        mediaType: "text/plain",
        required: true,
      },
    ],
  });
  plan.dependencies = [
    {
      upstreamLocalId: "task-one",
      downstreamLocalId: "task-two",
      condition: "ON_SUCCESS",
    },
  ];
  plan.milestones = [
    { title: "Delivery", taskLocalIds: ["task-one", "task-two"] },
  ];
  return plan;
}

function planWithTaskCount(count: number): PlannerDraftPublic {
  const plan = basePlan();
  plan.tasks = Array.from({ length: count }, (_, index) =>
    task(`task-${index + 1}`, generatedTaskId(index)),
  );
  plan.milestones = [
    {
      title: "Delivery",
      taskLocalIds: plan.tasks.map(({ localId }) => localId),
    },
  ];
  return plan;
}

function generatedTaskId(index: number): string {
  const group = (0x8100 + index).toString(16).padStart(4, "0");
  const tail = (0xa5b0eea2a000n + BigInt(index)).toString(16).padStart(12, "0");
  return `019fa9bb-${group}-7d90-a4e3-${tail}`;
}

function output(logicalName: string, mediaType: string) {
  return {
    logicalName,
    mediaType,
    required: true,
    description: `${logicalName} output.`,
  };
}

function task(
  localId: string,
  id: string,
): PlannerDraftPublic["tasks"][number] {
  return {
    id,
    localId,
    title: "Create output",
    objective: "Create the requested output.",
    kind: "GENERATION",
    priority: 50,
    riskLevel: "LOW",
    suggestedRole: "Writer",
    requiredCapabilities: [
      { path: "writing.document", minimumLevel: 0.7, mandatory: true },
    ],
    requiredTools: [],
    inputs: [
      { source: "GOAL_CONTRACT", logicalName: "approved-goal", required: true },
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
      workspaceRead: false,
      workspaceWrite: [],
      processProfiles: [],
    },
    assumptions: [],
    nonGoals: [],
  };
}
