import type {
  GoalContractContentInput,
  GoalContractPublic,
} from "@ai-corporation/protocols";
import {
  GoalAssumptionConfirmationError,
  GoalCommandConflictError,
  GoalCorporationNotFoundError,
  GoalVersionConflictError,
  TimelineCursorError,
} from "@ai-corporation/storage";
import { describe, expect, it, vi } from "vitest";
import { GoalContractService } from "./goal-contract-service";

const corporationId = "019fa9bb-5000-7d90-a4e3-a5b0eea2a9ef";
const commandId = "019fa9bb-5001-7d90-a4e3-a5b0eea2a9ef";
const eventId = "019fa9bb-5002-7d90-a4e3-a5b0eea2a9ef";
const now = "2026-07-30T02:00:00.000Z";

const content: GoalContractContentInput = {
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
};

const goal: GoalContractPublic = {
  schemaVersion: "1.0",
  corporationId,
  version: 1,
  status: "DRAFT",
  ...content,
  createdAt: now,
};

describe("GoalContractService", () => {
  it("normalizes content and sends trusted time, event ID, and request hash", () => {
    const saveDraft = vi.fn(() => goal);
    const service = createService({ saveDraft });
    const result = service.saveDraft({
      schemaVersion: "1.0",
      commandId,
      corporationId,
      expectedCorporationVersion: 1,
      expectedGoalVersion: 0,
      content: {
        ...content,
        originalGoal: " Ship safely ",
        statement: "Ship safely",
      },
    });
    expect(result).toEqual({ ok: true, value: goal });
    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        corporationId,
        now,
        eventId,
        content: expect.objectContaining({ originalGoal: "Ship safely" }),
        command: expect.objectContaining({
          commandType: "SAVE_DRAFT",
          requestHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
        }),
      }),
    );
  });

  it.each([
    [new GoalCorporationNotFoundError(), "CORPORATION_NOT_FOUND"],
    [new GoalVersionConflictError(), "VERSION_CONFLICT"],
    [new GoalAssumptionConfirmationError(), "ASSUMPTION_CONFIRMATION_REQUIRED"],
    [new GoalCommandConflictError(), "COMMAND_CONFLICT"],
  ] as const)("maps repository errors to fixed failures", (error, code) => {
    const service = createService({
      approve: vi.fn(() => {
        throw error;
      }),
    });
    expect(
      service.approve({
        schemaVersion: "1.0",
        commandId,
        corporationId,
        expectedCorporationVersion: 2,
        goalVersion: 1,
      }),
    ).toMatchObject({ ok: false, error: { code } });
  });

  it("returns null for a Corporation without a Goal and rejects bad cursors", () => {
    const empty = createService({ getCurrent: vi.fn(() => undefined) });
    expect(empty.getCurrent({ schemaVersion: "1.0", corporationId })).toEqual({
      ok: true,
      value: null,
    });
    const invalidCursor = createService({
      listTimeline: vi.fn(() => {
        throw new TimelineCursorError();
      }),
    });
    expect(
      invalidCursor.listTimeline({
        schemaVersion: "1.0",
        corporationId,
        afterCursor: "valid-shape",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED" },
    });
  });
});

function createService(
  overrides: Partial<
    ConstructorParameters<typeof GoalContractService>[0]["repository"]
  > = {},
) {
  return new GoalContractService({
    clock: () => now,
    repository: {
      approve: vi.fn(() => goal),
      getCurrent: vi.fn(() => goal),
      listTimeline: vi.fn(() => ({
        schemaVersion: "1.0" as const,
        items: [],
      })),
      listVersions: vi.fn(() => [goal]),
      saveDraft: vi.fn(() => goal),
      ...overrides,
    },
    uuid: () => eventId,
  });
}
