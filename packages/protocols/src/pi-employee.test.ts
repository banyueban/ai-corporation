import { describe, expect, it } from "vitest";
import { piEmployeeSaveRequestSchema, piEmployeeSchema } from "./pi-employee";

const employeeId = "019c0000-0000-7000-8000-000000000001";
const providerId = "019c0000-0000-7000-8000-000000000002";

describe("Pi employee protocol", () => {
  it("accepts an ordered non-empty multi-skill employee", () => {
    expect(
      piEmployeeSchema.parse({
        schemaVersion: 2,
        id: employeeId,
        name: "小文",
        providerId,
        providerVersion: 1,
        modelId: "model",
        skillNames: ["text-organize", "coding-task"],
        createdAt: "2026-08-23T00:00:00.000Z",
        updatedAt: "2026-08-23T00:00:00.000Z",
      }).skillNames,
    ).toEqual(["text-organize", "coding-task"]);
  });

  it("rejects empty, duplicate, invalid and legacy single-skill requests", () => {
    const base = {
      schemaVersion: 2,
      commandId: employeeId,
      name: "小文",
      providerId,
      expectedProviderVersion: 1,
      modelId: "model",
    } as const;
    for (const skillNames of [[], ["coding-task", "coding-task"], ["Bad"]]) {
      expect(
        piEmployeeSaveRequestSchema.safeParse({ ...base, skillNames }).success,
      ).toBe(false);
    }
    expect(
      piEmployeeSaveRequestSchema.safeParse({
        ...base,
        skillName: "text-organize",
      }).success,
    ).toBe(false);
  });
});
