import { describe, expect, it } from "vitest";
import {
  corporationCreateRequestSchema,
  corporationFailureSchema,
  corporationNameSchema,
  corporationPauseRequestSchema,
  corporationPublicSchema,
  corporationResumeRequestSchema,
} from "./corporation";

const id = "019fa9bb-375e-7d90-a4e3-a5b0eea2a9ef";

describe("Corporation Protocol", () => {
  it("normalizes names and rejects controls, excess code points, and fields", () => {
    expect(corporationNameSchema.parse("  Cafe\u0301  ")).toBe("Café");
    expect(corporationNameSchema.safeParse("bad\u0000name").success).toBe(
      false,
    );
    expect(corporationNameSchema.safeParse("x".repeat(121)).success).toBe(
      false,
    );
    expect(
      corporationCreateRequestSchema.safeParse({
        schemaVersion: "1.0",
        commandId: id,
        workspaceId: id,
        name: "Example",
        actor: { kind: "USER", id: "forged" },
      }).success,
    ).toBe(false);
  });

  it("requires UUID v7 and an exact schema version", () => {
    expect(
      corporationCreateRequestSchema.safeParse({
        schemaVersion: "2.0",
        commandId: "not-an-id",
        workspaceId: id,
        name: "Example",
      }).success,
    ).toBe(false);
  });

  it("enforces the archived projection shape", () => {
    const common = {
      schemaVersion: "1.0",
      id,
      workspaceId: id,
      name: "Example",
      version: 1,
      createdAt: "2026-07-30T00:00:00.000Z",
      updatedAt: "2026-07-30T00:00:00.000Z",
    } as const;
    expect(
      corporationPublicSchema.safeParse({
        ...common,
        status: "ARCHIVED",
      }).success,
    ).toBe(false);
    expect(
      corporationPublicSchema.safeParse({
        ...common,
        status: "DRAFT",
        archivedAt: common.updatedAt,
      }).success,
    ).toBe(false);
  });

  it("enforces strict pause commands and paired paused projection metadata", () => {
    const common = {
      schemaVersion: "1.0",
      id,
      workspaceId: id,
      name: "Example",
      version: 2,
      createdAt: "2026-07-30T00:00:00.000Z",
      updatedAt: "2026-07-30T01:00:00.000Z",
    } as const;
    expect(
      corporationPauseRequestSchema.safeParse({
        schemaVersion: "1.0",
        commandId: id,
        corporationId: id,
        expectedVersion: 1,
        targetStatus: "PAUSED",
      }).success,
    ).toBe(false);
    expect(
      corporationResumeRequestSchema.safeParse({
        schemaVersion: "1.0",
        commandId: id,
        corporationId: id,
        expectedVersion: 0,
        targetStatus: "DRAFT",
        reason: "USER",
        resumedAt: common.updatedAt,
      }).success,
    ).toBe(false);
    expect(
      corporationPublicSchema.safeParse({
        ...common,
        status: "PAUSED",
      }).success,
    ).toBe(false);
    expect(
      corporationPublicSchema.safeParse({
        ...common,
        status: "PAUSED",
        pausedFrom: "DRAFT",
        pausedAt: common.updatedAt,
      }).success,
    ).toBe(true);
    expect(
      corporationPublicSchema.safeParse({
        ...common,
        status: "DRAFT",
        pausedFrom: "DRAFT",
        pausedAt: common.updatedAt,
      }).success,
    ).toBe(false);
  });

  it("rejects non-contract error messages", () => {
    expect(
      corporationFailureSchema.safeParse({
        ok: false,
        error: { code: "NOT_FOUND", message: "SQL said no" },
      }).success,
    ).toBe(false);
  });
});
