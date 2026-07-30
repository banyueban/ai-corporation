import { describe, expect, it, vi } from "vitest";
import {
  handleCorporationPause,
  handleCorporationResume,
} from "./corporation-state-ipc";

const request = {
  schemaVersion: "1.0",
  commandId: "019fa9bb-6102-7d90-a4e3-a5b0eea2a9ef",
  corporationId: "019fa9bb-6100-7d90-a4e3-a5b0eea2a9ef",
  expectedVersion: 1,
};

describe("Corporation state IPC boundary", () => {
  it("rejects untrusted callers before dispatch", async () => {
    const pause = vi.fn();
    await expect(
      handleCorporationPause(false, request, { pause, resume: vi.fn() }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "UNAUTHORIZED_CALLER" },
    });
    expect(pause).not.toHaveBeenCalled();
  });

  it("rejects extra or forged state fields", async () => {
    const service = { pause: vi.fn(), resume: vi.fn() };
    await expect(
      handleCorporationPause(
        true,
        { ...request, targetStatus: "EXECUTING" },
        service,
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" },
    });
    await expect(
      handleCorporationResume(true, { ...request, reason: "SYSTEM" }, service),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" },
    });
    expect(service.pause).not.toHaveBeenCalled();
    expect(service.resume).not.toHaveBeenCalled();
  });
});
