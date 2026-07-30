import { describe, expect, it } from "vitest";
import {
  goalContractContentInputSchema,
  goalContractFailureSchema,
  goalContractPublicSchema,
  goalContractSaveDraftRequestSchema,
  timelineEventPublicSchema,
  timelineListRequestSchema,
} from "./goal-contract";

const id = "019fa9bb-375e-7d90-a4e3-a5b0eea2a9ef";
const timestamp = "2026-07-30T00:00:00.000Z";

const content = {
  source: "MANUAL",
  originalGoal: "Ship safely",
  statement: "Ship safely",
  successCriteria: ["All checks pass"],
  inScope: [],
  outOfScope: [],
  constraints: [],
  assumptions: [],
  deliverables: [],
  riskLevel: "LOW",
  budget: {},
  stopConditions: [],
} as const;

describe("Goal Contract Protocol", () => {
  it("normalizes content and rejects duplicate, control, and extra fields", () => {
    const parsed = goalContractContentInputSchema.parse({
      ...content,
      originalGoal: "  Cafe\u0301  ",
      statement: "  Café ",
    });
    expect(parsed.originalGoal).toBe("Café");
    expect(parsed.statement).toBe("Café");
    expect(
      goalContractContentInputSchema.safeParse({
        ...content,
        successCriteria: ["same", " same "],
      }).success,
    ).toBe(false);
    expect(
      goalContractContentInputSchema.safeParse({
        ...content,
        statement: "bad\u0000goal",
      }).success,
    ).toBe(false);
    expect(
      goalContractContentInputSchema.safeParse({
        ...content,
        hiddenPrompt: "leak",
      }).success,
    ).toBe(false);
  });

  it("requires deterministic Mock content and safe budgets", () => {
    expect(
      goalContractContentInputSchema.safeParse({
        ...content,
        source: "MOCK",
        statement: "Invented expansion",
      }).success,
    ).toBe(false);
    expect(
      goalContractContentInputSchema.safeParse({
        ...content,
        budget: { costLimitMicros: Number.MAX_SAFE_INTEGER + 1 },
      }).success,
    ).toBe(false);
  });

  it("enforces command identity, versions, and strict request fields", () => {
    expect(
      goalContractSaveDraftRequestSchema.parse({
        schemaVersion: "1.0",
        commandId: id,
        corporationId: id,
        expectedCorporationVersion: 1,
        expectedGoalVersion: 0,
        content,
      }).expectedGoalVersion,
    ).toBe(0);
    expect(
      goalContractSaveDraftRequestSchema.safeParse({
        schemaVersion: "1.0",
        commandId: "not-v7",
        corporationId: id,
        expectedCorporationVersion: 0,
        expectedGoalVersion: -1,
        content,
      }).success,
    ).toBe(false);
  });

  it("enforces approved projection and fixed public timeline summaries", () => {
    const goal = {
      schemaVersion: "1.0",
      corporationId: id,
      version: 1,
      status: "APPROVED",
      ...content,
      createdAt: timestamp,
    };
    expect(goalContractPublicSchema.safeParse(goal).success).toBe(false);
    expect(
      goalContractPublicSchema.safeParse({
        ...goal,
        approvedAt: timestamp,
      }).success,
    ).toBe(true);
    expect(
      timelineEventPublicSchema.safeParse({
        schemaVersion: "1.0",
        eventId: id,
        eventType: "goal.contract.drafted",
        corporationId: id,
        aggregateVersion: 2,
        occurredAt: timestamp,
        summary: "User goal leaked here",
      }).success,
    ).toBe(false);
  });

  it("rejects malformed cursors and non-contract error messages", () => {
    expect(
      timelineListRequestSchema.safeParse({
        schemaVersion: "1.0",
        corporationId: id,
        afterCursor: "not+base64url",
      }).success,
    ).toBe(false);
    expect(
      goalContractFailureSchema.safeParse({
        ok: false,
        error: {
          code: "STORAGE_UNAVAILABLE",
          message: "E:\\secret\\database.sqlite failed",
        },
      }).success,
    ).toBe(false);
  });
});
