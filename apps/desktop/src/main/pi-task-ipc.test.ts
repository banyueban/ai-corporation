import { describe, expect, it, vi } from "vitest";
import { handlePiTask } from "./pi-task-ipc";

const taskId = "018f0f5f-79b2-7cc3-8c4d-1f54a8e2c901";
const companyId = "018f0f5f-79b2-7cc3-8c4d-1f54a8e2c902";

describe("Pi task IPC boundary", () => {
  it("rejects an untrusted command approval before service access", () => {
    const service = { resolveCommandApproval: vi.fn() };
    const result = handlePiTask(
      "resolveCommandApproval",
      false,
      {},
      service as never,
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "UNAUTHORIZED_CALLER" },
    });
    expect(service.resolveCommandApproval).not.toHaveBeenCalled();
  });

  it("rejects forged approval scope before service access", () => {
    const service = { resolveCommandApproval: vi.fn() };
    const result = handlePiTask(
      "resolveCommandApproval",
      true,
      {
        schemaVersion: 2,
        commandId: taskId,
        companyId,
        taskId,
        approvalId: taskId,
        decision: "APPROVE",
        scope: "FOREVER",
      },
      service as never,
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST" },
    });
    expect(service.resolveCommandApproval).not.toHaveBeenCalled();
  });
});
