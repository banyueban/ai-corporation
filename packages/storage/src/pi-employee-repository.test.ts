import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations, loadMigrations } from "./migrations";
import { PiEmployeeRepository } from "./pi-employee-repository";
import path from "node:path";

describe("PiEmployeeRepository", () => {
  let database: DatabaseSync;
  let repository: PiEmployeeRepository;
  let providerId: string;

  beforeEach(() => {
    database = new DatabaseSync(":memory:");
    applyMigrations(database, loadMigrations(path.resolve("migrations")));
    providerId = "019c0000-0000-7000-8000-000000000001";
    const vaultId = "019c0000-0000-7000-8000-000000000002";
    database
      .prepare(
        `INSERT INTO key_vault_entry
          (id, ciphertext, nonce, auth_tag, encryption_version, created_at, updated_at)
        VALUES (?, X'01', zeroblob(12), zeroblob(16), 1, ?, ?)`,
      )
      .run(vaultId, now(), now());
    database
      .prepare(
        `INSERT INTO provider
          (id, type, name, endpoint, api_dialect, generation_timeout_ms,
           key_vault_entry_id, config_json, config_status, version, created_at, updated_at)
         VALUES (?, 'OPENAI_COMPATIBLE', '测试', 'https://example.com',
          'CHAT_COMPLETIONS', 60000, ?, '{}', 'ENABLED', 1, ?, ?)`,
      )
      .run(providerId, vaultId, now(), now());
    repository = new PiEmployeeRepository(database);
  });

  afterEach(() => database.close());

  it("creates, lists and updates an independent employee", () => {
    const id = "019c0000-0000-7000-8000-000000000003";
    const created = repository.save({
      id,
      name: "小文",
      providerId,
      providerVersion: 1,
      modelId: "deepseek-v4-flash",
      skillNames: ["text-organize", "coding-task"],
      now: now(),
    });
    expect(repository.list()).toEqual([created]);

    const updated = repository.save({
      id,
      name: "文档员工",
      providerId,
      providerVersion: 1,
      modelId: "deepseek-v4-flash",
      skillNames: ["coding-task", "text-organize"],
      now: "2026-08-14T01:00:00.000Z",
    });
    expect(updated.name).toBe("文档员工");
    expect(updated.skillNames).toEqual(["coding-task", "text-organize"]);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(
      database
        .prepare(
          "SELECT skill_name, position FROM pi_employee_skill WHERE employee_id = ? ORDER BY position",
        )
        .all(id),
    ).toEqual([
      { skill_name: "coding-task", position: 0 },
      { skill_name: "text-organize", position: 1 },
    ]);
    expect(
      database
        .prepare("SELECT skill_name FROM pi_employee WHERE id = ?")
        .get(id),
    ).toEqual({ skill_name: "coding-task" });

    expect(() =>
      repository.save({
        id,
        name: "无效更新",
        providerId,
        providerVersion: 1,
        modelId: "deepseek-v4-flash",
        skillNames: ["coding-task", "coding-task"],
        now: "2026-08-14T02:00:00.000Z",
      }),
    ).toThrow();
    expect(repository.get(id)?.name).toBe("文档员工");
  });
});

function now(): string {
  return "2026-08-14T00:00:00.000Z";
}
