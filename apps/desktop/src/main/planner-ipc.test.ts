import { describe, expect, it, vi } from "vitest";
import {
  handlePlannerCancel,
  handlePlannerGetCurrent,
  handlePlannerStart,
} from "./planner-ipc";

const id = "019fa9bb-7200-7d90-a4e3-a5b0eea2a9ef";
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
    usage: { costSource: "UNKNOWN" as const },
    updatedAt: "2026-08-09T00:00:00.000Z",
  },
};

describe("Planner IPC boundary", () => {
  const service = {
    cancel: vi.fn(() => success),
    getCurrent: vi.fn(() => success),
    start: vi.fn(async () => success),
  };

  it("rejects an untrusted caller before dispatch", async () => {
    await expect(handlePlannerStart(false, {}, service)).resolves.toMatchObject(
      {
        ok: false,
        error: { code: "UNAUTHORIZED_CALLER" },
      },
    );
    expect(service.start).not.toHaveBeenCalled();
  });

  it("strictly rejects extra fields on all three channels", async () => {
    const invalid = { schemaVersion: "1.0", operationId: id, forged: true };
    const results = [
      await handlePlannerStart(true, invalid, service),
      handlePlannerCancel(true, invalid, service),
      handlePlannerGetCurrent(true, invalid, service),
    ];
    for (const result of results) {
      expect(result).toMatchObject({
        ok: false,
        error: { code: "VALIDATION_FAILED" },
      });
    }
  });

  it("dispatches one explicit normalized start request", async () => {
    await expect(
      handlePlannerStart(
        true,
        {
          schemaVersion: "1.0",
          operationId: id,
          corporationId: id,
          expectedCorporationVersion: 3,
          goalVersion: 1,
          providerId: id,
          expectedProviderVersion: 1,
          modelId: "model-a",
        },
        service,
      ),
    ).resolves.toEqual(success);
    expect(service.start).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: id, modelId: "model-a" }),
    );
  });
});
