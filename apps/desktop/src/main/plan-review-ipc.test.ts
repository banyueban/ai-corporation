import { describe, expect, it, vi } from "vitest";
import {
  handlePlanReviewApprove,
  handlePlanReviewGetCurrent,
  handlePlanReviewListVersions,
  handlePlanReviewSaveVersion,
} from "./plan-review-ipc";

const corporationId = "019fa9bb-7400-7d90-a4e3-a5b0eea2a9ef";
const planId = "019fa9bb-7401-7d90-a4e3-a5b0eea2a9ef";
const taskId = "019fa9bb-7402-7d90-a4e3-a5b0eea2a9ef";
const commandId = "019fa9bb-7403-7d90-a4e3-a5b0eea2a9ef";

describe("Plan Review IPC", () => {
  it("rejects untrusted callers and malformed requests before the service", () => {
    const service = {
      approve: vi.fn(),
      getCurrent: vi.fn(),
      listVersions: vi.fn(),
      saveVersion: vi.fn(),
    };
    expect(
      handlePlanReviewGetCurrent(
        false,
        { schemaVersion: "1.0", corporationId },
        service,
      ),
    ).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED_CALLER" } });
    expect(
      handlePlanReviewSaveVersion(
        true,
        { schemaVersion: "1.0", corporationId, startExecution: true },
        service,
      ),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(service.getCurrent).not.toHaveBeenCalled();
    expect(service.saveVersion).not.toHaveBeenCalled();
  });

  it("routes all four strict allowlist calls", () => {
    const failure = {
      ok: false as const,
      error: {
        code: "STATE_CONFLICT" as const,
        message: "The current Plan state does not allow this action.",
      },
    };
    const service = {
      approve: vi.fn(() => failure),
      getCurrent: vi.fn(() => ({ ok: true as const, value: null })),
      listVersions: vi.fn(() => ({ ok: true as const, value: [] })),
      saveVersion: vi.fn(() => failure),
    };
    expect(
      handlePlanReviewGetCurrent(
        true,
        { schemaVersion: "1.0", corporationId },
        service,
      ),
    ).toEqual({ ok: true, value: null });
    expect(
      handlePlanReviewListVersions(
        true,
        { schemaVersion: "1.0", corporationId },
        service,
      ),
    ).toEqual({ ok: true, value: [] });
    expect(
      handlePlanReviewSaveVersion(
        true,
        {
          schemaVersion: "1.0",
          commandId,
          corporationId,
          sourcePlanId: planId,
          expectedPlanVersion: 1,
          tasks: [
            {
              sourceTaskId: taskId,
              title: "任务",
              objective: "目标",
              priority: 50,
              acceptanceCriteria: [],
            },
          ],
          dependencies: [],
        },
        service,
      ),
    ).toEqual(failure);
    expect(
      handlePlanReviewApprove(
        true,
        {
          schemaVersion: "1.0",
          commandId,
          corporationId,
          planId,
          expectedPlanVersion: 1,
        },
        service,
      ),
    ).toEqual(failure);
  });
});
