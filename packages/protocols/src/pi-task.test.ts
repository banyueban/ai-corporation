import { describe, expect, it } from "vitest";
import {
  piTaskResolveCommandApprovalRequestSchema,
  piTaskSchema,
} from "./pi-task";

const taskId = "018f0f5f-79b2-7cc3-8c4d-1f54a8e2c901";
const approvalId = "018f0f5f-79b2-7cc3-8c4d-1f54a8e2c902";

describe("Pi task command approval protocol", () => {
  it("accepts a strict task-scoped command decision", () => {
    expect(
      piTaskResolveCommandApprovalRequestSchema.parse({
        schemaVersion: 1,
        commandId: "018f0f5f-79b2-7cc3-8c4d-1f54a8e2c903",
        taskId,
        approvalId,
        decision: "APPROVE",
      }),
    ).toMatchObject({ decision: "APPROVE", taskId, approvalId });
  });

  it("rejects forged fields and unsupported decisions", () => {
    expect(
      piTaskResolveCommandApprovalRequestSchema.safeParse({
        schemaVersion: 1,
        commandId: "018f0f5f-79b2-7cc3-8c4d-1f54a8e2c903",
        taskId,
        approvalId,
        decision: "ALWAYS_ALLOW",
        workspaceId: taskId,
      }).success,
    ).toBe(false);
  });

  it("persists approval and live command events as ordinary ordered task events", () => {
    const parsed = piTaskSchema.parse({
      schemaVersion: 1,
      id: taskId,
      employeeId: approvalId,
      workspaceId: "018f0f5f-79b2-7cc3-8c4d-1f54a8e2c904",
      userInput: "运行测试",
      status: "RUNNING",
      events: [
        {
          sequence: 1,
          kind: "APPROVAL_REQUIRED",
          content: "{}",
          createdAt: "2026-08-15T00:00:00.000Z",
        },
        {
          sequence: 2,
          kind: "TOOL_UPDATE",
          content: "{}",
          createdAt: "2026-08-15T00:00:01.000Z",
        },
      ],
      createdAt: "2026-08-15T00:00:00.000Z",
      updatedAt: "2026-08-15T00:00:01.000Z",
    });
    expect(parsed.events.map(({ kind }) => kind)).toEqual([
      "APPROVAL_REQUIRED",
      "TOOL_UPDATE",
    ]);
  });
});
