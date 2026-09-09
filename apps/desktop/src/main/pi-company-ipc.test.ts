import { describe, expect, it, vi } from "vitest";
import { handlePiCompany, handlePiCompanyList } from "./pi-company-ipc";

const companyId = "019b0000-0000-7000-8000-000000000041";

describe("Pi company IPC boundary", () => {
  it("rejects an untrusted caller before service access", () => {
    const service = { list: vi.fn() };
    expect(
      handlePiCompanyList(false, { schemaVersion: 1 }, service as never),
    ).toMatchObject({
      ok: false,
      error: { code: "UNAUTHORIZED_CALLER" },
    });
    expect(service.list).not.toHaveBeenCalled();
  });

  it("rejects renderer-owned company identity on create", () => {
    const service = { create: vi.fn() };
    expect(
      handlePiCompany(
        "create",
        true,
        {
          schemaVersion: 1,
          commandId: companyId,
          id: companyId,
          name: "伪造公司",
        },
        service as never,
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
    expect(service.create).not.toHaveBeenCalled();
  });
});
