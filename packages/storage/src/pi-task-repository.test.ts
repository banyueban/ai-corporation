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
});
