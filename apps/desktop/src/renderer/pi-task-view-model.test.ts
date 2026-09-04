import type { PiTask } from "@ai-corporation/protocols";
import { describe, expect, it } from "vitest";
import { preferFresherPiTask } from "./pi-task-view-model";

const baseTask: PiTask = {
  schemaVersion: 2,
  id: "019b7f4d-a200-7000-8000-000000000001",
  companyId: "019b7f4d-a200-7000-8000-000000000002",
  employeeId: "019b7f4d-a200-7000-8000-000000000003",
  userInput: "运行测试",
  status: "RUNNING",
  events: [],
  createdAt: "2026-08-21T00:00:00.000Z",
  updatedAt: "2026-08-21T00:00:00.000Z",
};

describe("Pi task view model", () => {
  it("does not let a stale poll restore an already resolved approval", () => {
    const waiting: PiTask = {
      ...baseTask,
      events: [event(1, "APPROVAL_REQUIRED")],
    };
    const resolved: PiTask = {
      ...baseTask,
      events: [event(1, "APPROVAL_REQUIRED"), event(2, "APPROVAL_RESOLVED")],
    };
    expect(preferFresherPiTask(resolved, waiting)).toBe(resolved);
  });

  it("accepts a newer terminal status when the event count is unchanged", () => {
    const completed: PiTask = {
      ...baseTask,
      status: "WAITING_ACCEPTANCE",
      updatedAt: "2026-08-21T00:00:01.000Z",
    };
    expect(preferFresherPiTask(baseTask, completed)).toBe(completed);
  });
});

function event(
  sequence: number,
  kind: "APPROVAL_REQUIRED" | "APPROVAL_RESOLVED",
) {
  return {
    sequence,
    kind,
    content: "{}",
    createdAt: "2026-08-21T00:00:00.000Z",
  } as const;
}
