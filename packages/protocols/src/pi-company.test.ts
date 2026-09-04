import { describe, expect, it } from "vitest";
import { piCompanyCreateRequestSchema, piCompanySchema } from "./pi-company";

const companyId = "019b0000-0000-7000-8000-000000000010";

describe("Pi company protocol", () => {
  it("accepts a strict lightweight company", () => {
    expect(
      piCompanySchema.parse({
        schemaVersion: 1,
        id: companyId,
        name: "我的公司",
        employeeIds: [],
        workspaceIds: [],
        createdAt: "2026-08-21T00:00:00.000Z",
        updatedAt: "2026-08-21T00:00:00.000Z",
      }).name,
    ).toBe("我的公司");
  });

  it("rejects renderer-owned identity and unknown fields", () => {
    expect(
      piCompanyCreateRequestSchema.safeParse({
        schemaVersion: 1,
        commandId: companyId,
        id: companyId,
        name: "伪造公司",
      }).success,
    ).toBe(false);
  });
});
