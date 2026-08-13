import { describe, expect, it, vi } from "vitest";
import {
  handleAgentRunContinue,
  handleAgentRunGetCurrent,
} from "./agent-run-ipc";

const id = "018f0f5f-79b2-7cc3-8c4d-1f54a8e2c901";

describe("agent run IPC boundary", () => {
  it("rejects unauthorized callers before service access", () => {
    const service = { getCurrent: vi.fn() };
    expect(handleAgentRunGetCurrent(false, {}, service as never)).toMatchObject(
      {
        ok: false,
        error: { code: "UNAUTHORIZED_CALLER" },
      },
    );
    expect(service.getCurrent).not.toHaveBeenCalled();
  });

  it("rejects forged command data", async () => {
    const service = { continue: vi.fn() };
    const result = await handleAgentRunContinue(
      true,
      {
        schemaVersion: "1.0",
        commandId: id,
        corporationId: id,
        runId: id,
        expectedAttempt: 1,
        providerId: id,
      },
      service as never,
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" },
    });
    expect(service.continue).not.toHaveBeenCalled();
  });
});
