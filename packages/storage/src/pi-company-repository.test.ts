import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations, loadMigrations } from "./migrations";
import { PiCompanyRepository } from "./pi-company-repository";
import { WorkspaceRepository } from "./workspace-repository";

describe("PiCompanyRepository", () => {
  let database: DatabaseSync;
  let repository: PiCompanyRepository;
  const companyId = "019b0000-0000-7000-8000-000000000010";
  const employeeId = "019b0000-0000-7000-8000-000000000011";
  const workspaceId = "019b0000-0000-7000-8000-000000000012";

  beforeEach(() => {
    database = new DatabaseSync(":memory:");
    applyMigrations(database, loadMigrations(path.resolve("migrations")));
    database.exec("PRAGMA foreign_keys = OFF");
    database
      .prepare(
        `INSERT INTO pi_employee
        (id, name, provider_id, provider_version, model_id, skill_name, created_at, updated_at)
       VALUES (?, '小文', ?, 1, 'model', 'text-organize', ?, ?)`,
      )
      .run(employeeId, companyId, now(), now());
    new WorkspaceRepository(database).saveAuthorized(
      "测试工作区",
      {
        workspaceId,
        displayPath: "C:\\test",
        canonicalRootPath: "C:\\test",
        permissionMode: "READ_WRITE",
        accessStatus: "AVAILABLE",
        pathIdentity: {
          platform: "windows",
          volumeRoot: "C:",
          rootCreationTime: "1",
        },
        lastVerifiedAt: now(),
      },
      now(),
    );
    repository = new PiCompanyRepository(database);
  });

  afterEach(() => database.close());

  it("creates a company and reuses employees and workspaces through memberships", () => {
    repository.create({
      commandId: command(1),
      id: companyId,
      name: "工作室",
      now: now(),
    });
    const withEmployee = repository.changeEmployee({
      commandId: command(2),
      companyId,
      employeeId,
      add: true,
      now: now(),
    });
    expect(withEmployee.employeeIds).toEqual([employeeId]);

    const withWorkspace = repository.changeWorkspace({
      commandId: command(3),
      companyId,
      workspaceId,
      add: true,
      now: now(),
    });
    expect(withWorkspace.workspaceIds).toEqual([workspaceId]);
    expect(repository.hasEmployee(companyId, employeeId)).toBe(true);
    expect(repository.hasWorkspace(companyId, workspaceId)).toBe(true);

    repository.changeEmployee({
      commandId: command(5),
      companyId,
      employeeId,
      add: false,
      now: now(),
    });
    repository.changeWorkspace({
      commandId: command(6),
      companyId,
      workspaceId,
      add: false,
      now: now(),
    });
    expect(repository.hasEmployee(companyId, employeeId)).toBe(false);
    expect(repository.hasWorkspace(companyId, workspaceId)).toBe(false);
    expect(
      database
        .prepare("SELECT 1 FROM pi_employee WHERE id = ?")
        .get(employeeId),
    ).toBeDefined();
    expect(
      database.prepare("SELECT 1 FROM workspace WHERE id = ?").get(workspaceId),
    ).toBeDefined();
  });

  it("replays the same command without duplicating membership", () => {
    repository.create({
      commandId: command(1),
      id: companyId,
      name: "工作室",
      now: now(),
    });
    const input = {
      commandId: command(2),
      companyId,
      employeeId,
      add: true,
      now: now(),
    };
    expect(repository.changeEmployee(input)).toEqual(
      repository.changeEmployee(input),
    );
  });

  it("renames a company without changing its identity", () => {
    repository.create({
      commandId: command(1),
      id: companyId,
      name: "工作室",
      now: now(),
    });
    const renamed = repository.updateName({
      commandId: command(4),
      companyId,
      name: "新工作室",
      now: "2026-08-21T01:00:00.000Z",
    });
    expect(renamed).toMatchObject({ id: companyId, name: "新工作室" });
  });
});

function now(): string {
  return "2026-08-21T00:00:00.000Z";
}

function command(suffix: number): string {
  return `019b0000-0000-7000-8000-${String(suffix).padStart(12, "0")}`;
}
