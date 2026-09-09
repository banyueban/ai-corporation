import { describe, expect, it } from "vitest";
import {
  planReviewFailureSchema,
  planReviewSaveVersionRequestSchema,
} from "./plan-review";

const commandId = "019fa9bb-7100-7d90-a4e3-a5b0eea2a9ef";
const corporationId = "019fa9bb-7101-7d90-a4e3-a5b0eea2a9ef";
const planId = "019fa9bb-7102-7d90-a4e3-a5b0eea2a9ef";
const taskId = "019fa9bb-7103-7d90-a4e3-a5b0eea2a9ef";

describe("Plan Review protocol", () => {
  it("accepts only the finite edit fields", () => {
    const request = validSaveRequest();
    expect(planReviewSaveVersionRequestSchema.safeParse(request).success).toBe(
      true,
    );
    expect(
      planReviewSaveVersionRequestSchema.safeParse({
        ...request,
        tasks: [{ ...request.tasks[0], budget: { maxCostMicros: "1" } }],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate source Task identities and unknown request fields", () => {
    const request = validSaveRequest();
    expect(
      planReviewSaveVersionRequestSchema.safeParse({
        ...request,
        tasks: [...request.tasks, request.tasks[0]],
      }).success,
    ).toBe(false);
    expect(
      planReviewSaveVersionRequestSchema.safeParse({
        ...request,
        startExecution: true,
      }).success,
    ).toBe(false);
  });

  it("only exposes trusted blocking Task IDs for delete blockers", () => {
    expect(
      planReviewFailureSchema.safeParse({
        ok: false,
        error: {
          code: "DELETE_BLOCKED",
          message: "A retained Task still uses the deleted Task output.",
          blockingTaskIds: [taskId],
        },
      }).success,
    ).toBe(true);
    expect(
      planReviewFailureSchema.safeParse({
        ok: false,
        error: {
          code: "STATE_CONFLICT",
          message: "The current Plan state does not allow this action.",
          blockingTaskIds: [taskId],
        },
      }).success,
    ).toBe(false);
  });
});

function validSaveRequest() {
  return {
    schemaVersion: "1.0" as const,
    commandId,
    corporationId,
    sourcePlanId: planId,
    expectedPlanVersion: 1,
    tasks: [
      {
        sourceTaskId: taskId,
        title: "保留任务",
        objective: "生成可验收结果",
        priority: 50,
        acceptanceCriteria: [
          {
            sourceLocalId: "criterion-result",
            description: "结果存在",
            severity: "REQUIRED" as const,
            evidenceRequired: ["result"],
          },
        ],
      },
    ],
    dependencies: [],
  };
}
