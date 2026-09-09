import { describe, expect, it } from "vitest";
import {
  executionStartErrorMessages,
  executionStartItemResultSchema,
  executionStartRequestSchema,
} from "./execution-start";

const id = (n: string) => `019faa04-0000-7000-8000-${n.padStart(12, "0")}`;

describe("Execution Start protocol", () => {
  it("accepts only the minimal trusted request", () => {
    const request = {
      schemaVersion: "1.0",
      commandId: id("1"),
      corporationId: id("2"),
      expectedCorporationVersion: 3,
    };
    expect(executionStartRequestSchema.parse(request)).toEqual(request);
    expect(
      executionStartRequestSchema.safeParse({ ...request, taskId: id("3") })
        .success,
    ).toBe(false);
  });

  it("rejects mismatched run and human task results and non-fixed errors", () => {
    const base = {
      schemaVersion: "1.0",
      corporationId: id("2"),
      corporationVersion: 4,
      corporationStatus: "WAITING_HUMAN",
      selectedTaskId: id("3"),
      selectedTaskTitle: "Choose",
      selectedTaskKind: "HUMAN_DECISION",
      tasks: [{ taskId: id("3"), title: "Choose", status: "WAITING_HUMAN" }],
      startedAt: "2026-08-13T01:00:00.000Z",
    };
    expect(
      executionStartItemResultSchema.safeParse({ ok: true, value: base })
        .success,
    ).toBe(true);
    expect(
      executionStartItemResultSchema.safeParse({
        ok: true,
        value: {
          ...base,
          run: {
            runId: id("4"),
            taskId: id("3"),
            agentInstanceId: id("5"),
            attempt: 1,
            status: "CREATED",
          },
        },
      }).success,
    ).toBe(false);
    expect(
      executionStartItemResultSchema.safeParse({
        ok: false,
        error: {
          code: "STATE_CONFLICT",
          message: executionStartErrorMessages.STATE_CONFLICT,
        },
      }).success,
    ).toBe(true);
    expect(
      executionStartItemResultSchema.safeParse({
        ok: false,
        error: { code: "STATE_CONFLICT", message: "raw db" },
      }).success,
    ).toBe(false);
  });
});
