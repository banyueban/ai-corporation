import { describe, expect, it, vi } from "vitest";
import {
  handleExecutionStart,
  handleExecutionStartGetCurrent,
} from "./execution-start-ipc";
const id = (n: string) => `019faa05-0000-7000-8000-${n.padStart(12, "0")}`;
describe("Execution Start IPC", () => {
  it("rejects untrusted and forged input before calling the service", () => {
    const service = { start: vi.fn(), getCurrent: vi.fn() };
    expect(
      handleExecutionStart(false, { schemaVersion: "1.0" }, service),
    ).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED_CALLER" } });
    expect(
      handleExecutionStart(
        true,
        {
          schemaVersion: "1.0",
          commandId: id("1"),
          corporationId: id("2"),
          expectedCorporationVersion: 1,
          taskId: id("3"),
        },
        service,
      ),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(
      handleExecutionStartGetCurrent(
        true,
        { schemaVersion: "1.0", corporationId: id("2"), runId: id("3") },
        service,
      ),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(service.start).not.toHaveBeenCalled();
    expect(service.getCurrent).not.toHaveBeenCalled();
  });
});
