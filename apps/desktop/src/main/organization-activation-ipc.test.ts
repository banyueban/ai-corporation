import { describe, expect, it, vi } from "vitest";
import {
  handleOrganizationActivationActivate,
  handleOrganizationActivationGetCurrent,
} from "./organization-activation-ipc";
const id = (n: string) => `019faa03-0000-7000-8000-${n.padStart(12, "0")}`;
describe("Organization Activation IPC", () => {
  it("rejects untrusted or forged requests", () => {
    const service = { activate: vi.fn(), getCurrent: vi.fn() };
    expect(
      handleOrganizationActivationGetCurrent(
        false,
        { schemaVersion: "1.0", corporationId: id("1") },
        service,
      ),
    ).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED_CALLER" } });
    expect(
      handleOrganizationActivationActivate(
        true,
        { schemaVersion: "1.0", key: "secret" },
        service,
      ),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(service.activate).not.toHaveBeenCalled();
  });
});
