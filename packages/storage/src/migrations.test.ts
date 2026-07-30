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

  it("creates the Corporation, Goal, event, and command schema through migration 0004", () => {
    const database = new DatabaseSync(":memory:");
    const migrations = loadMigrations(migrationDirectory);
    applyMigrations(database, migrations);

    expect(
      readAppliedMigrations(database).map(({ version }) => version),
    ).toEqual([1, 2, 3, 4]);
    expect(
      database
        .prepare(
          `SELECT name FROM sqlite_master
          WHERE type IN ('table', 'index', 'trigger')
            AND name IN (
              'corporation',
              'domain_event',
              'corporation_command',
              'goal_contract_version',
              'goal_contract_command',
              'idx_corporation_workspace_updated',
              'idx_goal_contract_corporation_version',
              'idx_event_corporation_timeline',
              'domain_event_reject_update',
              'domain_event_reject_delete',
              'goal_contract_reject_content_update',
              'goal_contract_reject_delete',
              'corporation_validate_active_goal'
            )
          ORDER BY name`,
        )
        .all()
        .map(({ name }) => name),
    ).toEqual([
      "corporation",
      "corporation_command",
      "corporation_validate_active_goal",
      "domain_event",
      "domain_event_reject_delete",
      "domain_event_reject_update",
      "goal_contract_command",
      "goal_contract_reject_content_update",
      "goal_contract_reject_delete",
      "goal_contract_version",
      "idx_corporation_workspace_updated",
      "idx_event_corporation_timeline",
      "idx_goal_contract_corporation_version",
    ]);
    expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    database.close();
  });

  it("upgrades a populated 0003 database and enforces Goal version boundaries", () => {
    const database = new DatabaseSync(":memory:");
    const migrations = loadMigrations(migrationDirectory);
    applyMigrations(database, migrations.slice(0, 3));

    const workspaceId = "019fa9bb-375e-7d90-a4e3-a5b0eea2a901";
    const corporationId = "019fa9bb-375e-7d90-a4e3-a5b0eea2a902";
    const eventId = "019fa9bb-375e-7d90-a4e3-a5b0eea2a903";
    const createdAt = "2026-07-30T00:00:00.000Z";
    database
      .prepare(
        `INSERT INTO workspace (
          id, name, display_path, canonical_root_path, platform,
          permission_mode, access_status, path_identity_json,
          created_at, updated_at
        ) VALUES (?, 'Workspace', 'display', 'canonical', 'windows',
          'READ_WRITE', 'AVAILABLE', '{}', ?, ?)`,
      )
      .run(workspaceId, createdAt, createdAt);
    database
      .prepare(
        `INSERT INTO corporation (
          id, workspace_id, name, status, version, created_at, updated_at
        ) VALUES (?, ?, 'Corporation', 'DRAFT', 1, ?, ?)`,
      )
      .run(corporationId, workspaceId, createdAt, createdAt);
    database
      .prepare(
        `INSERT INTO domain_event (
          event_id, schema_version, event_type, aggregate_type, aggregate_id,
          aggregate_version, corporation_id, correlation_id, actor_json,
          payload_json, sensitivity, occurred_at
        ) VALUES (?, '1.0', 'corporation.created', 'CORPORATION', ?, 1, ?,
          ?, '{"kind":"USER","id":"local-user"}', '{}', 'NORMAL', ?)`,
      )
      .run(eventId, corporationId, corporationId, eventId, createdAt);

    applyMigrations(database, migrations);

    expect(
      database
        .prepare("SELECT event_type FROM domain_event WHERE event_id = ?")
        .get(eventId),
    ).toEqual({ event_type: "corporation.created" });
    expect(
      database.prepare("PRAGMA table_info(corporation)").all().at(-1),
    ).toMatchObject({ name: "active_goal_version" });

    const content = JSON.stringify({
      schemaVersion: "1.0",
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
    });
    database
      .prepare(
        `INSERT INTO goal_contract_version (
          corporation_id, version, status, source, content_json,
          created_by, created_at
        ) VALUES (?, 1, 'DRAFT', 'MANUAL', ?, 'local-user', ?)`,
      )
      .run(corporationId, content, createdAt);
    database
      .prepare(
        `UPDATE corporation
        SET active_goal_version = 1, version = 2, updated_at = ?
        WHERE id = ?`,
      )
      .run(createdAt, corporationId);

    expect(() =>
      database
        .prepare(
          `UPDATE goal_contract_version
          SET content_json = '{"changed":true}'
          WHERE corporation_id = ? AND version = 1`,
        )
        .run(corporationId),
    ).toThrow("goal contract content is immutable");
    expect(() =>
      database
        .prepare(`UPDATE corporation SET active_goal_version = 3 WHERE id = ?`)
        .run(corporationId),
    ).toThrow("invalid active goal version");
    expect(() =>
      database
        .prepare(
          `INSERT INTO goal_contract_version (
            corporation_id, version, status, source, content_json,
            created_by, created_at, approved_at
          ) VALUES (?, 2, 'APPROVED', 'MANUAL', ?, 'local-user', ?, ?)`,
        )
        .run(corporationId, content, createdAt, createdAt),
    ).toThrow("goal contract must be inserted as draft");

    expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    database.close();
  });
});
