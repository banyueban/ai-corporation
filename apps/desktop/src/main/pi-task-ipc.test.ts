import { describe, expect, it, vi } from "vitest";
import { handlePiTask, handlePiTaskDeliverable } from "./pi-task-ipc";

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

  it("rejects an untrusted deliverable preview before service access", async () => {
    const service = { previewDeliverable: vi.fn() };
    const result = await handlePiTaskDeliverable(
      "preview",
      false,
      {},
      service as never,
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "UNAUTHORIZED_CALLER" },
    });
    expect(service.previewDeliverable).not.toHaveBeenCalled();
  });

  it("passes only a valid registered-file request to the service", async () => {
    const service = {
      previewDeliverable: vi.fn().mockResolvedValue({
        ok: false,
        error: {
          code: "DELIVERABLE_NOT_FOUND",
          message: "交付成果操作失败",
        },
      }),
    };
    const request = {
      schemaVersion: 2,
      companyId,
      taskId,
      relativePath: "result.md",
    };
    await handlePiTaskDeliverable("preview", true, request, service as never);
    expect(service.previewDeliverable).toHaveBeenCalledWith(request);
  });
});
