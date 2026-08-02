import { describe, expect, it, vi } from "vitest";
import {
  handleGoalEngineAnswer,
  handleGoalEngineCancel,
  handleGoalEngineGetCurrent,
  handleGoalEngineResolveExtension,
  handleGoalEngineStart,
} from "./goal-engine-ipc";

const id = "019fa9bb-7100-7d90-a4e3-a5b0eea2a9ef";
const success = {
  ok: true as const,
  value: {
    schemaVersion: "1.0" as const,
    operationId: id,
    corporationId: id,
    providerId: id,
    providerVersion: 1,
    modelId: "model-a",
    status: "GENERATING" as const,
    version: 1,
    cycleNumber: 1,
    roundInCycle: 0,
    questions: [],
    usage: { costSource: "UNKNOWN" as const },
    updatedAt: "2026-08-02T00:00:00.000Z",
  },
};

describe("Goal Engine IPC boundary", () => {
  const service = {
    answer: vi.fn(async () => success),
    cancel: vi.fn(() => success),
    getCurrent: vi.fn(() => success),
    resolveExtension: vi.fn(() => success),
    start: vi.fn(async () => success),
  };

  it("rejects untrusted callers before dispatch", async () => {
    await expect(
      handleGoalEngineStart(false, {}, service),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "UNAUTHORIZED_CALLER" },
    });
    expect(service.start).not.toHaveBeenCalled();
  });

  it("strictly rejects extra fields on all five channels", async () => {
    const invalid = { schemaVersion: "1.0", operationId: id, forged: true };
    const results = [
      await handleGoalEngineStart(true, invalid, service),
      await handleGoalEngineAnswer(true, invalid, service),
      handleGoalEngineResolveExtension(true, invalid, service),
      handleGoalEngineCancel(true, invalid, service),
      handleGoalEngineGetCurrent(true, invalid, service),
    ];
    for (const result of results) {
      expect(result).toMatchObject({
        ok: false,
        error: { code: "VALIDATION_FAILED" },
      });
    }
  });

  it("dispatches one normalized start request", async () => {
    await expect(
      handleGoalEngineStart(
        true,
        {
          schemaVersion: "1.0",
          operationId: id,
          corporationId: id,
          expectedCorporationVersion: 1,
          expectedGoalVersion: 0,
          providerId: id,
          expectedProviderVersion: 1,
          input: { originalGoal: " Ship " },
        },
        service,
      ),
    ).resolves.toEqual(success);
    expect(service.start).toHaveBeenCalledWith(
      expect.objectContaining({ input: { originalGoal: "Ship" } }),
    );
  });
});
