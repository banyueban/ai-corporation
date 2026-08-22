import { describe, expect, it } from "vitest";
import {
  piTaskDeliverableRequestSchema,
  piTaskDeliverableSchema,
  piTaskResolveCommandApprovalRequestSchema,
  piTaskSchema,
} from "./pi-task";

const taskId = "018f0f5f-79b2-7cc3-8c4d-1f54a8e2c901";
const approvalId = "018f0f5f-79b2-7cc3-8c4d-1f54a8e2c902";
const companyId = "018f0f5f-79b2-7cc3-8c4d-1f54a8e2c905";

describe("Pi task command approval protocol", () => {
  it("accepts a strict task-scoped command decision", () => {
    expect(
      piTaskResolveCommandApprovalRequestSchema.parse({
        schemaVersion: 2,
        companyId,
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
        schemaVersion: 2,
        companyId,
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
      schemaVersion: 2,
      id: taskId,
      companyId,
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

describe("Pi task deliverable protocol", () => {
  it("accepts verified file facts without an absolute workspace path", () => {
    expect(
      piTaskDeliverableSchema.parse({
        relativePath: "result.md",
        source: "WORKSPACE_WRITE",
        changeKind: "CREATED",
        sha256: "a".repeat(64),
        sizeBytes: 12,
        diff: "+result",
        registeredAt: "2026-08-22T00:00:00.000Z",
      }),
    ).toMatchObject({ relativePath: "result.md", sizeBytes: 12 });
  });

  it("rejects forged fields and malformed hashes", () => {
    expect(
      piTaskDeliverableSchema.safeParse({
        relativePath: "result.md",
        source: "WORKSPACE_WRITE",
        changeKind: "CREATED",
        sha256: "not-a-hash",
        sizeBytes: 12,
        canonicalRootPath: "C:\\secret",
        registeredAt: "2026-08-22T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("allows only company, task and relative path in file actions", () => {
    expect(
      piTaskDeliverableRequestSchema.safeParse({
        schemaVersion: 2,
        companyId,
        taskId,
        relativePath: "result.md",
        absolutePath: "C:\\secret\\result.md",
      }).success,
    ).toBe(false);
  });
});
