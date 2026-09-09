import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations, loadMigrations } from "./migrations";
import { PiTaskRepository } from "./pi-task-repository";

describe("PiTaskRepository company boundary", () => {
  let database: DatabaseSync;
  let repository: PiTaskRepository;

  beforeEach(() => {
    database = new DatabaseSync(":memory:");
    applyMigrations(database, loadMigrations(path.resolve("migrations")));
    // 这项测试只验证任务查询的公司条件，关联表由各自仓储测试负责。
    database.exec("PRAGMA foreign_keys = OFF");
    repository = new PiTaskRepository(database);
  });

  afterEach(() => database.close());

  it("lists and finds latest tasks only inside the requested company", () => {
    const companyA = "019b0000-0000-7000-8000-000000000041";
    const companyB = "019b0000-0000-7000-8000-000000000042";
    const employeeId = "019b0000-0000-7000-8000-000000000043";
    const workspaceId = "019b0000-0000-7000-8000-000000000044";
    const insert = database.prepare(
      `INSERT INTO pi_task
       (id, company_id, employee_id, workspace_id, user_input, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'COMPLETED', ?, ?)`,
    );
    insert.run(
      "019b0000-0000-7000-8000-000000000045",
      companyA,
      employeeId,
      workspaceId,
      "A 的任务",
      "2026-08-21T00:00:00.000Z",
      "2026-08-21T00:00:00.000Z",
    );
    insert.run(
      "019b0000-0000-7000-8000-000000000046",
      companyB,
      employeeId,
      workspaceId,
      "B 的任务",
      "2026-08-21T01:00:00.000Z",
      "2026-08-21T01:00:00.000Z",
    );

    expect(repository.list(companyA).map(({ userInput }) => userInput)).toEqual(
      ["A 的任务"],
    );
    expect(repository.getLatest(companyA, employeeId)?.userInput).toBe(
      "A 的任务",
    );
  });

  it("returns verified deliverables and real command checks with the task", () => {
    const taskId = "019b0000-0000-7000-8000-000000000055";
    database
      .prepare(
        `INSERT INTO pi_task
        (id, company_id, employee_id, workspace_id, user_input, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'WAITING_ACCEPTANCE', ?, ?)`,
      )
      .run(
        taskId,
        "019b0000-0000-7000-8000-000000000051",
        "019b0000-0000-7000-8000-000000000052",
        "019b0000-0000-7000-8000-000000000053",
        "创建结果",
        "2026-08-22T00:00:00.000Z",
        "2026-08-22T00:00:00.000Z",
      );
    repository.upsertDeliverable({
      taskId,
      relativePath: "result.md",
      source: "WORKSPACE_WRITE",
      changeKind: "CREATED",
      sha256: "a".repeat(64),
      sizeBytes: 12,
      diff: "+结果",
      sourceCallId: "call-write",
      registeredAt: "2026-08-22T00:01:00.000Z",
    });
    repository.upsertDeliverable({
      taskId,
      relativePath: "result.md",
      source: "WORKSPACE_WRITE",
      changeKind: "MODIFIED",
      sha256: "b".repeat(64),
      sizeBytes: 13,
      diff: "+新结果",
      sourceCallId: "call-write-2",
      registeredAt: "2026-08-22T00:01:30.000Z",
    });
    repository.beginCommandCall({
      taskId,
      toolCallId: "call-check",
      command: "node --test",
      now: "2026-08-22T00:02:00.000Z",
    });
    repository.finishCommandCall(
      "call-check",
      "SUCCEEDED",
      { exitCode: 0, durationMs: 42, truncated: false },
      "2026-08-22T00:02:01.000Z",
    );

    const task = repository.get(taskId);
    expect(task?.deliverables).toEqual([
      expect.objectContaining({
        relativePath: "result.md",
        sha256: "b".repeat(64),
        changeKind: "MODIFIED",
      }),
    ]);
    expect(task?.checks).toEqual([
      expect.objectContaining({
        command: "node --test",
        status: "SUCCEEDED",
        exitCode: 0,
        durationMs: 42,
      }),
    ]);
  });

  it("stores task attachment facts without exposing the private storage name", () => {
    const taskId = "019d0000-0000-7000-8000-000000000010";
    const attachmentId = "019d0000-0000-7000-8000-000000000011";
    const task = repository.create({
      id: taskId,
      companyId: "019d0000-0000-7000-8000-000000000012",
      employeeId: "019d0000-0000-7000-8000-000000000013",
      workspaceId: "019d0000-0000-7000-8000-000000000014",
      userInput: "整理附件",
      now: "2026-09-02T00:00:00.000Z",
      attachments: [
        {
          id: attachmentId,
          displayName: "说明.md",
          mediaType: "text/markdown",
          sizeBytes: 12,
          sha256: "c".repeat(64),
          storageName: "019d0000-0000-7000-8000-000000000015.md",
          createdAt: "2026-09-02T00:00:00.000Z",
        },
      ],
    });

    expect(task.attachments).toEqual([
      {
        id: attachmentId,
        displayName: "说明.md",
        mediaType: "text/markdown",
        sizeBytes: 12,
        sha256: "c".repeat(64),
      },
    ]);
    expect(JSON.stringify(task)).not.toContain("000000000015.md");
    expect(repository.getAttachment(taskId, attachmentId)?.storageName).toBe(
      "019d0000-0000-7000-8000-000000000015.md",
    );
  });

  it("keeps collaboration assignments, actor events, and waiting decisions", () => {
    const taskId = "019f0000-0000-7000-8000-000000000010";
    const finalId = "019f0000-0000-7000-8000-000000000011";
    const helperId = "019f0000-0000-7000-8000-000000000012";
    const task = repository.create({
      id: taskId,
      companyId: "019f0000-0000-7000-8000-000000000013",
      employeeId: "019f0000-0000-7000-8000-000000000014",
      workspaceId: "019f0000-0000-7000-8000-000000000015",
      userInput: "协作生成报告",
      mode: "COLLABORATION",
      finalAssignment: {
        id: finalId,
        employeeName: "报告负责人",
        instruction: "协作生成报告",
      },
      now: "2026-09-08T00:00:00.000Z",
    });
    expect(task).toMatchObject({
      mode: "COLLABORATION",
      status: "RUNNING",
      assignments: [{ id: finalId, role: "FINAL", status: "RUNNING" }],
    });

    repository.createAssignment({
      id: helperId,
      taskId,
      employeeId: "019f0000-0000-7000-8000-000000000016",
      employeeName: "资料员工",
      instruction: "整理事实",
      role: "HELPER",
      now: "2026-09-08T00:01:00.000Z",
    });
    repository.setAssignmentStatus(
      helperId,
      "FAILED",
      "2026-09-08T00:02:00.000Z",
      {
        failureMessage: "资料不足",
      },
    );
    repository.appendEvent(
      taskId,
      "PROGRESS",
      "资料员工的分工失败：资料不足",
      "2026-09-08T00:02:00.000Z",
      {
        assignmentId: helperId,
        employeeId: "019f0000-0000-7000-8000-000000000016",
        employeeName: "资料员工",
      },
    );
    repository.setStatus(taskId, "WAITING_USER", "2026-09-08T00:03:00.000Z", {
      failureMessage: "请决定是否继续",
    });

    expect(repository.get(taskId)).toMatchObject({
      mode: "COLLABORATION",
      status: "WAITING_USER",
      failureMessage: "请决定是否继续",
      assignments: [
        { id: finalId, status: "RUNNING" },
        { id: helperId, status: "FAILED", failureMessage: "资料不足" },
      ],
      events: [
        {
          assignmentId: helperId,
          employeeName: "资料员工",
          content: "资料员工的分工失败：资料不足",
        },
      ],
    });
  });
});
