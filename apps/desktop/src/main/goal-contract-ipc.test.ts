import type { GoalContractContentInput } from "@ai-corporation/protocols";
import { describe, expect, it, vi } from "vitest";
import {
  handleGoalContractApprove,
  handleGoalContractGetCurrent,
  handleGoalContractListVersions,
  handleGoalContractSaveDraft,
  handleTimelineList,
} from "./goal-contract-ipc";

const id = "019fa9bb-5000-7d90-a4e3-a5b0eea2a9ef";
const content: GoalContractContentInput = {
  source: "MANUAL",
  originalGoal: "Ship",
  statement: "Ship",
  successCriteria: ["Done"],
  inScope: [],
  outOfScope: [],
  constraints: [],
  assumptions: [],
  deliverables: [],
  riskLevel: "LOW",
  budget: {},
  stopConditions: [],
};
const success = {
  ok: true as const,
  value: {
    schemaVersion: "1.0" as const,
    corporationId: id,
    version: 1,
    status: "DRAFT" as const,
    ...content,
    createdAt: "2026-07-30T02:00:00.000Z",
  },
};

describe("Goal Contract IPC boundary", () => {
  const service = {
    approve: vi.fn(() => success),
    getCurrent: vi.fn(() => success),
    listTimeline: vi.fn(() => ({
      ok: true as const,
      value: { schemaVersion: "1.0" as const, items: [] },
    })),
    listVersions: vi.fn(() => ({ ok: true as const, value: [success.value] })),
    saveDraft: vi.fn(() => success),
  };

  it("rejects untrusted callers before dispatch", () => {
    expect(handleGoalContractGetCurrent(false, {}, service)).toMatchObject({
      ok: false,
      error: { code: "UNAUTHORIZED_CALLER" },
    });
    expect(service.getCurrent).not.toHaveBeenCalled();
  });

  it("rejects extra and forged fields across every channel", () => {
    const invalid = {
      schemaVersion: "1.0",
      corporationId: id,
      actor: "forged",
    };
    for (const result of [
      handleGoalContractSaveDraft(true, invalid, service),
      handleGoalContractGetCurrent(true, invalid, service),
      handleGoalContractListVersions(true, invalid, service),
      handleGoalContractApprove(true, invalid, service),
      handleTimelineList(true, invalid, service),
    ]) {
      expect(result).toMatchObject({
        ok: false,
        error: { code: "VALIDATION_FAILED" },
      });
    }
  });

  it("dispatches a strict normalized save request", () => {
    expect(
      handleGoalContractSaveDraft(
        true,
        {
          schemaVersion: "1.0",
          commandId: id,
          corporationId: id,
          expectedCorporationVersion: 1,
          expectedGoalVersion: 0,
          content: {
            ...content,
            originalGoal: " Ship ",
            statement: "Ship",
          },
        },
        service,
      ),
    ).toEqual(success);
    expect(service.saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({ originalGoal: "Ship" }),
      }),
    );
  });
});
