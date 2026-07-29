import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applyMigrations,
  loadMigrations,
  type Migration,
  readAppliedMigrations,
} from "./migrations";

const migration: Migration = {
  checksum: "checksum-1",
  name: "example",
  sql: "CREATE TABLE example (id INTEGER PRIMARY KEY) STRICT;",
  version: 1,
};

const migrationDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);

describe("migration runner", () => {
  it("applies a migration once and enables foreign keys", () => {
    const database = new DatabaseSync(":memory:");

    applyMigrations(database, [migration]);
    applyMigrations(database, [migration]);

    expect(readAppliedMigrations(database)).toEqual([
      { checksum: "checksum-1", version: 1 },
    ]);
    expect(database.prepare("PRAGMA foreign_keys").get()).toEqual({
      foreign_keys: 1,
    });
    database.close();
  });

  it("rejects a changed applied migration", () => {
    const database = new DatabaseSync(":memory:");
    applyMigrations(database, [migration]);

    expect(() =>
      applyMigrations(database, [{ ...migration, checksum: "changed" }]),
    ).toThrow("Applied migration changed: 1");
    database.close();
  });

  it("rolls back a failed migration", () => {
    const database = new DatabaseSync(":memory:");

    expect(() =>
      applyMigrations(database, [
        {
          checksum: "invalid",
          name: "invalid",
          sql: "CREATE TABLE broken (;",
          version: 2,
        },
      ]),
    ).toThrow();

    expect(readAppliedMigrations(database)).toEqual([]);
    database.close();
  });

  it("rejects duplicate migration versions", () => {
    const database = new DatabaseSync(":memory:");

    expect(() => applyMigrations(database, [migration, migration])).toThrow(
      "Duplicate migration version: 1",
    );
    database.close();
  });

  it("creates the constrained Workspace schema from an empty database", () => {
    const database = new DatabaseSync(":memory:");
    applyMigrations(database, loadMigrations(migrationDirectory));

    const columns = database
      .prepare("PRAGMA table_info(workspace)")
      .all()
      .map((row) => row.name);
    expect(columns).toEqual([
      "id",
      "name",
      "display_path",
      "canonical_root_path",
      "platform",
      "permission_mode",
      "access_status",
      "path_identity_json",
      "last_verified_at",
      "created_at",
      "updated_at",
    ]);

    const insert = database.prepare(`
      INSERT INTO workspace (
        id,
        name,
        display_path,
        canonical_root_path,
        platform,
        permission_mode,
        access_status,
        path_identity_json,
        last_verified_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const values = [
      "019fa9bb-375e-7d90-a4e3-a5b0eea2a9ef",
      "Example",
      "E:\\projects\\example",
      "\\\\?\\E:\\projects\\example",
      "windows",
      "READ_WRITE",
      "AVAILABLE",
      '{"platform":"windows","volumeRoot":"\\\\\\\\?\\\\E:","rootCreationTime":"133982208000000000"}',
      "2026-07-29T00:00:00.000Z",
      "2026-07-29T00:00:00.000Z",
      "2026-07-29T00:00:00.000Z",
    ] as const;

    expect(insert.run(...values).changes).toBe(1);
    expect(() =>
      insert.run("019fa9bb-375e-7d90-a4e3-a5b0eea2a9f0", ...values.slice(1)),
    ).toThrow();

    database.close();
  });

  it("rejects invalid Workspace permission, access, platform, and identity", () => {
    const database = new DatabaseSync(":memory:");
    applyMigrations(database, loadMigrations(migrationDirectory));

    const insert = database.prepare(`
      INSERT INTO workspace (
        id,
        name,
        display_path,
        canonical_root_path,
        platform,
        permission_mode,
        access_status,
        path_identity_json,
        created_at,
        updated_at
      ) VALUES (?, 'Example', ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertInvalid = (
      suffix: string,
      platform: string,
      permission: string,
      access: string,
      identity: string,
    ) =>
      insert.run(
        `019fa9bb-375e-7d90-a4e3-a5b0eea2a9${suffix}`,
        `display-${suffix}`,
        `canonical-${suffix}`,
        platform,
        permission,
        access,
        identity,
        "2026-07-29T00:00:00.000Z",
        "2026-07-29T00:00:00.000Z",
      );

    expect(() =>
      insertInvalid("a1", "linux", "READ_WRITE", "AVAILABLE", "{}"),
    ).toThrow();
    expect(() =>
      insertInvalid("a2", "windows", "OWNER", "AVAILABLE", "{}"),
    ).toThrow();
    expect(() =>
      insertInvalid("a3", "windows", "READ_ONLY", "UNKNOWN", "{}"),
    ).toThrow();
    expect(() =>
      insertInvalid("a4", "macos", "READ_ONLY", "UNVERIFIED", "not-json"),
    ).toThrow();

    database.close();
  });
});
