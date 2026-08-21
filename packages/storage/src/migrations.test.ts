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

  it("creates the domain schema through the Pi employee migration", () => {
    const database = new DatabaseSync(":memory:");
    const migrations = loadMigrations(migrationDirectory);
    applyMigrations(database, migrations);

    expect(
      readAppliedMigrations(database).map(({ version }) => version),
    ).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
    ]);
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
              'goal_generation_operation',
              'planner_generation_operation',
              'pi_employee',
              'idx_pi_employee_updated',
              'pi_task',
              'pi_task_event',
              'pi_workspace_write',
              'idx_pi_workspace_write_task',
              'idx_pi_task_employee_updated',
              'task_plan',
              'task',
              'task_dependency',
              'plan_review_command',
              'organization_version',
              'organization_proposal_command',
              'idx_organization_current',
              'model_call',
              'corporation_state_command',
              'idx_corporation_workspace_updated',
              'idx_goal_contract_corporation_version',
              'idx_goal_generation_active',
              'idx_planner_generation_active',
              'idx_task_plan_corporation_version',
              'idx_task_plan_identity',
              'idx_task_plan_current',
              'idx_task_plan_supersedes',
              'idx_model_call_operation',
              'idx_event_corporation_timeline',
              'domain_event_reject_update',
              'domain_event_reject_delete',
              'goal_contract_reject_content_update',
              'goal_contract_reject_delete',
              'corporation_validate_active_goal',
              'corporation_validate_pause_metadata_insert',
              'corporation_validate_pause_metadata_update',
              'task_plan_approval_insert_guard',
              'task_plan_approval_update_guard',
              'task_plan_version_insert_guard',
              'task_plan_supersede_update_guard'
            )
          ORDER BY name`,
        )
        .all()
        .map(({ name }) => name),
    ).toEqual([
      "corporation",
      "corporation_command",
      "corporation_state_command",
      "corporation_validate_active_goal",
      "corporation_validate_pause_metadata_insert",
      "corporation_validate_pause_metadata_update",
      "domain_event",
      "domain_event_reject_delete",
      "domain_event_reject_update",
      "goal_contract_command",
      "goal_contract_reject_content_update",
      "goal_contract_reject_delete",
      "goal_contract_version",
      "goal_generation_operation",
      "idx_corporation_workspace_updated",
      "idx_event_corporation_timeline",
      "idx_goal_contract_corporation_version",
      "idx_goal_generation_active",
      "idx_model_call_operation",
      "idx_organization_current",
      "idx_pi_employee_updated",
      "idx_pi_task_employee_updated",
      "idx_pi_workspace_write_task",
      "idx_planner_generation_active",
      "idx_task_plan_corporation_version",
      "idx_task_plan_current",
      "idx_task_plan_identity",
      "idx_task_plan_supersedes",
      "model_call",
      "organization_proposal_command",
      "organization_version",
      "pi_employee",
      "pi_task",
      "pi_task_event",
      "pi_workspace_write",
      "plan_review_command",
      "planner_generation_operation",
      "task",
      "task_dependency",
      "task_plan",
      "task_plan_approval_insert_guard",
      "task_plan_approval_update_guard",
      "task_plan_supersede_update_guard",
      "task_plan_version_insert_guard",
    ]);
    expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    database.close();
  });

  it("puts existing Pi work into one default company without changing task identity", () => {
    const database = new DatabaseSync(":memory:");
    const migrations = loadMigrations(migrationDirectory);
    applyMigrations(
      database,
      migrations.filter(({ version }) => version <= 20),
    );
    const employeeId = "019b0000-0000-7000-8000-000000000021";
    const workspaceId = "019b0000-0000-7000-8000-000000000022";
    const taskId = "019b0000-0000-7000-8000-000000000023";
    const runningTaskId = "019b0000-0000-7000-8000-000000000025";
    const corporationId = "019b0000-0000-7000-8000-000000000026";
    const now = "2026-08-21T00:00:00.000Z";
    database.exec("PRAGMA foreign_keys = OFF");
    database
      .prepare(
        `INSERT INTO provider
        (id, type, name, endpoint, config_json, config_status, version, created_at, updated_at)
       VALUES (?, 'OPENAI_COMPATIBLE', '旧 Provider', 'https://example.test/v1',
         '{}', 'ENABLED', 1, ?, ?)`,
      )
      .run(employeeId, now, now);
    database
      .prepare(
        `INSERT INTO pi_employee
        (id, name, provider_id, provider_version, model_id, skill_name, created_at, updated_at)
       VALUES (?, '旧员工', ?, 1, 'model', 'text-organize', ?, ?)`,
      )
      .run(employeeId, employeeId, now, now);
    database
      .prepare(
        `INSERT INTO workspace
        (id, name, display_path, canonical_root_path, platform, permission_mode,
         access_status, path_identity_json, last_verified_at, created_at, updated_at)
       VALUES (?, '旧工作区', 'C:\\old', 'C:\\old', 'windows', 'READ_WRITE',
         'AVAILABLE', ?, ?, ?, ?)`,
      )
      .run(
        workspaceId,
        JSON.stringify({
          platform: "windows",
          volumeRoot: "C:",
          rootCreationTime: "1",
        }),
        now,
        now,
        now,
      );
    database
      .prepare(
        `INSERT INTO corporation
        (id, workspace_id, name, status, version, created_at, updated_at)
       VALUES (?, ?, '旧版公司', 'DRAFT', 1, ?, ?)`,
      )
      .run(corporationId, workspaceId, now, now);
    database
      .prepare(
        `INSERT INTO pi_task
        (id, employee_id, workspace_id, user_input, status, created_at, updated_at)
       VALUES (?, ?, ?, '旧任务', 'COMPLETED', ?, ?)`,
      )
      .run(taskId, employeeId, workspaceId, now, now);
    database
      .prepare(
        `INSERT INTO pi_task
        (id, employee_id, workspace_id, user_input, status, created_at, updated_at)
       VALUES (?, ?, ?, '运行中的旧任务', 'RUNNING', ?, ?)`,
      )
      .run(runningTaskId, employeeId, workspaceId, now, now);
    database
      .prepare(
        `INSERT INTO pi_task_event (task_id, sequence, kind, content, created_at)
         VALUES (?, 1, 'MODEL_OUTPUT', '旧输出', ?)`,
      )
      .run(taskId, now);
    const taskBefore = database
      .prepare("SELECT * FROM pi_task WHERE id = ?")
      .get(taskId);
    const eventBefore = database
      .prepare("SELECT * FROM pi_task_event WHERE task_id = ?")
      .get(taskId);
    const corporationBefore = database
      .prepare("SELECT * FROM corporation WHERE id = ?")
      .get(corporationId);
    const runningTaskBefore = database
      .prepare("SELECT * FROM pi_task WHERE id = ?")
      .get(runningTaskId);

    applyMigrations(database, migrations);

    const companyId = "019b0000-0000-7000-8000-000000000001";
    expect(database.prepare("SELECT id, name FROM pi_company").get()).toEqual({
      id: companyId,
      name: "我的公司",
    });
    expect(
      database
        .prepare("SELECT company_id FROM pi_task WHERE id = ?")
        .get(taskId),
    ).toEqual({
      company_id: companyId,
    });
    const { company_id: migratedCompanyId, ...taskAfter } = database
      .prepare("SELECT * FROM pi_task WHERE id = ?")
      .get(taskId) as Record<string, unknown>;
    expect(migratedCompanyId).toBe(companyId);
    expect(taskAfter).toEqual(taskBefore);
    expect(
      database
        .prepare("SELECT * FROM pi_task_event WHERE task_id = ?")
        .get(taskId),
    ).toEqual(eventBefore);
    expect(
      database
        .prepare("SELECT * FROM corporation WHERE id = ?")
        .get(corporationId),
    ).toEqual(corporationBefore);
    const { company_id: runningCompanyId, ...runningTaskAfter } = database
      .prepare("SELECT * FROM pi_task WHERE id = ?")
      .get(runningTaskId) as Record<string, unknown>;
    expect(runningCompanyId).toBe(companyId);
    expect(runningTaskAfter).toEqual(runningTaskBefore);
    expect(
      database.prepare("SELECT employee_id FROM pi_company_employee").get(),
    ).toEqual({
      employee_id: employeeId,
    });
    expect(
      database.prepare("SELECT workspace_id FROM pi_company_workspace").get(),
    ).toEqual({
      workspace_id: workspaceId,
    });
    database
      .prepare(
        "INSERT INTO pi_company (id, name, created_at, updated_at) VALUES (?, '另一公司', ?, ?)",
      )
      .run("019b0000-0000-7000-8000-000000000099", now, now);
    expect(() =>
      database
        .prepare("UPDATE pi_task SET company_id = ? WHERE id = ?")
        .run("019b0000-0000-7000-8000-000000000099", taskId),
    ).toThrow("pi_task company_id is immutable");
    expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    database.close();
  });

  it("does not create a default company for an empty Pi installation", () => {
    const database = new DatabaseSync(":memory:");
    const migrations = loadMigrations(migrationDirectory);
    applyMigrations(database, migrations);
    applyMigrations(database, migrations);
    expect(
      database.prepare("SELECT COUNT(*) AS total FROM pi_company").get(),
    ).toEqual({ total: 0 });
    database.close();
  });

  it("attaches an existing employee even when there are no tasks", () => {
    const database = new DatabaseSync(":memory:");
    const migrations = loadMigrations(migrationDirectory);
    applyMigrations(
      database,
      migrations.filter(({ version }) => version <= 20),
    );
    const employeeId = "019b0000-0000-7000-8000-000000000024";
    const now = "2026-08-21T00:00:00.000Z";
    database.exec("PRAGMA foreign_keys = OFF");
    database
      .prepare(
        `INSERT INTO pi_employee
          (id, name, provider_id, provider_version, model_id, skill_name, created_at, updated_at)
         VALUES (?, '旧员工', ?, 1, 'model', 'text-organize', ?, ?)`,
      )
      .run(employeeId, employeeId, now, now);
    applyMigrations(database, migrations);
    expect(
      database.prepare("SELECT employee_id FROM pi_company_employee").get(),
    ).toEqual({ employee_id: employeeId });
    expect(
      database
        .prepare("SELECT COUNT(*) AS total FROM pi_company_workspace")
        .get(),
    ).toEqual({ total: 0 });
    database.close();
  });

  it("upgrades an existing 0009 database to strict Planner tables", () => {
    const database = new DatabaseSync(":memory:");
    const migrations = loadMigrations(migrationDirectory);
    applyMigrations(database, migrations.slice(0, 9));
    expect(
      database
        .prepare("SELECT name FROM sqlite_master WHERE name = 'task_plan'")
        .get(),
    ).toBeUndefined();

    applyMigrations(database, migrations);

    expect(
      database
        .prepare(
          `SELECT name, strict FROM pragma_table_list
           WHERE name IN ('task_plan', 'planner_generation_operation')
           ORDER BY name`,
        )
        .all(),
    ).toEqual([
      { name: "planner_generation_operation", strict: 1 },
      { name: "task_plan", strict: 1 },
    ]);
    expect(
      database
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_planner_generation_active'",
        )
        .get(),
    ).toMatchObject({
      sql: expect.stringContaining("WHERE status = 'GENERATING'"),
    });
    expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    database.close();
  });

  it("upgrades 0005 to the constrained Provider Key Vault schema", () => {
    const database = new DatabaseSync(":memory:");
    const migrations = loadMigrations(migrationDirectory);
    applyMigrations(database, migrations.slice(0, 5));
    applyMigrations(database, migrations);

    expect(
      database
        .prepare(
          `SELECT name FROM sqlite_master
          WHERE type = 'table'
            AND name IN ('key_vault_entry', 'provider', 'provider_command')
          ORDER BY name`,
        )
        .all()
        .map(({ name }) => name),
    ).toEqual(["key_vault_entry", "provider", "provider_command"]);

    const now = "2026-08-02T00:00:00.000Z";
    const vaultId = "019b7f4d-a000-7000-8000-000000000011";
    const providerId = "019b7f4d-a000-7000-8000-000000000012";
    database
      .prepare(
        `INSERT INTO key_vault_entry (
          id, ciphertext, nonce, auth_tag, encryption_version,
          version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 1, 1, ?, ?)`,
      )
      .run(
        vaultId,
        Buffer.from("ciphertext"),
        Buffer.alloc(12, 1),
        Buffer.alloc(16, 2),
        now,
        now,
      );
    database
      .prepare(
        `INSERT INTO provider (
          id, type, name, endpoint, key_vault_entry_id, config_json,
          config_status, version, created_at, updated_at
        ) VALUES (?, 'OPENAI_COMPATIBLE', 'Primary',
          'https://api.example.test/v1', ?, '{}', 'ENABLED', 1, ?, ?)`,
      )
      .run(providerId, vaultId, now, now);

    expect(() =>
      database
        .prepare(
          `INSERT INTO key_vault_entry (
            id, ciphertext, nonce, auth_tag, encryption_version,
            version, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 1, 1, ?, ?)`,
        )
        .run(
          "019b7f4d-a000-7000-8000-000000000013",
          Buffer.from("ciphertext"),
          Buffer.alloc(11),
          Buffer.alloc(16),
          now,
          now,
        ),
    ).toThrow();
    expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    database.close();
  });

  it("upgrades a populated 0006 database to the constrained connection projection", () => {
    const database = new DatabaseSync(":memory:");
    const migrations = loadMigrations(migrationDirectory);
    applyMigrations(database, migrations.slice(0, 6));
    const now = "2026-08-02T00:00:00.000Z";
    const vaultId = "019b7f4d-a000-7000-8000-000000000014";
    const providerId = "019b7f4d-a000-7000-8000-000000000015";
    database
      .prepare(
        `INSERT INTO key_vault_entry (
          id, ciphertext, nonce, auth_tag, encryption_version,
          version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 1, 1, ?, ?)`,
      )
      .run(
        vaultId,
        Buffer.from("ciphertext"),
        Buffer.alloc(12, 1),
        Buffer.alloc(16, 2),
        now,
        now,
      );
    database
      .prepare(
        `INSERT INTO provider (
          id, type, name, endpoint, key_vault_entry_id, config_json,
          config_status, version, created_at, updated_at
        ) VALUES (?, 'OPENAI_COMPATIBLE', 'Primary',
          'https://api.example.test/v1', ?, '{}', 'ENABLED', 1, ?, ?)`,
      )
      .run(providerId, vaultId, now, now);

    applyMigrations(database, migrations);
    expect(
      database
        .prepare(
          `INSERT INTO provider_connection_test (
            provider_id, provider_version, status, failure_reason, retryable,
            suggested_backoff_ms, models_json, tested_at
          ) VALUES (?, 1, 'VERIFIED', NULL, NULL, NULL, '[]', ?)`,
        )
        .run(providerId, now).changes,
    ).toBe(1);
    expect(() =>
      database
        .prepare(
          `UPDATE provider_connection_test
          SET status = 'FAILED', failure_reason = NULL, retryable = 1
          WHERE provider_id = ?`,
        )
        .run(providerId),
    ).toThrow();
    expect(() =>
      database
        .prepare(
          `UPDATE provider_connection_test
          SET status = 'FAILED', failure_reason = 'RAW_PROVIDER_ERROR',
            retryable = 0, models_json = '[]'
          WHERE provider_id = ?`,
        )
        .run(providerId),
    ).toThrow();
    expect(() =>
      database
        .prepare(
          `UPDATE provider_connection_test SET models_json = '{}'
          WHERE provider_id = ?`,
        )
        .run(providerId),
    ).toThrow();
    expect(() =>
      database
        .prepare(
          `INSERT INTO provider_connection_test (
            provider_id, provider_version, status, failure_reason, retryable,
            suggested_backoff_ms, models_json, tested_at
          ) VALUES (?, 1, 'VERIFIED', NULL, NULL, NULL, '[]', ?)`,
        )
        .run("019b7f4d-a000-7000-8000-000000000099", now),
    ).toThrow();
    expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    database.prepare("DELETE FROM provider WHERE id = ?").run(providerId);
    expect(
      database
        .prepare("SELECT COUNT(*) AS count FROM provider_connection_test")
        .get(),
    ).toEqual({ count: 0 });
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
      database
        .prepare("PRAGMA table_info(corporation)")
        .all()
        .map(({ name }) => name),
    ).toEqual(
      expect.arrayContaining([
        "active_goal_version",
        "paused_from",
        "paused_at",
      ]),
    );

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

  it("upgrades a populated 0004 database without changing existing Corporation, Goal, or Event facts", () => {
    const database = new DatabaseSync(":memory:");
    const migrations = loadMigrations(migrationDirectory);
    applyMigrations(database, migrations.slice(0, 4));
    const workspaceId = "019fa9bb-375e-7d90-a4e3-a5b0eea2a911";
    const corporationId = "019fa9bb-375e-7d90-a4e3-a5b0eea2a912";
    const eventId = "019fa9bb-375e-7d90-a4e3-a5b0eea2a913";
    const createdAt = "2026-07-30T00:00:00.000Z";
    const content = JSON.stringify({
      schemaVersion: "1.0",
      source: "MANUAL",
      originalGoal: "Preserve facts",
      statement: "Preserve facts",
      successCriteria: ["Rows remain unchanged"],
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
          id, workspace_id, name, status, version, active_goal_version,
          created_at, updated_at
        ) VALUES (?, ?, 'Corporation', 'DRAFT', 1, NULL, ?, ?)`,
      )
      .run(corporationId, workspaceId, createdAt, createdAt);
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
        SET version = 2, active_goal_version = 1, updated_at = ?
        WHERE id = ?`,
      )
      .run(createdAt, corporationId);
    database
      .prepare(
        `INSERT INTO domain_event (
          event_id, schema_version, event_type, aggregate_type, aggregate_id,
          aggregate_version, corporation_id, correlation_id, actor_json,
          payload_json, sensitivity, occurred_at
        ) VALUES (?, '1.0', 'goal.contract.drafted', 'CORPORATION', ?, 2, ?,
          ?, '{"kind":"USER","id":"local-user"}', '{}', 'NORMAL', ?)`,
      )
      .run(eventId, corporationId, corporationId, eventId, createdAt);

    const before = {
      corporation: database
        .prepare(
          "SELECT id, name, status, version, active_goal_version FROM corporation",
        )
        .get(),
      event: database
        .prepare(
          "SELECT event_id, event_type, aggregate_version FROM domain_event",
        )
        .get(),
      goal: database
        .prepare(
          "SELECT corporation_id, version, status, content_json FROM goal_contract_version",
        )
        .get(),
    };
    applyMigrations(database, migrations);

    expect(
      database
        .prepare(
          "SELECT id, name, status, version, active_goal_version FROM corporation",
        )
        .get(),
    ).toEqual(before.corporation);
    expect(
      database
        .prepare(
          "SELECT event_id, event_type, aggregate_version FROM domain_event",
        )
        .get(),
    ).toEqual(before.event);
    expect(
      database
        .prepare(
          "SELECT corporation_id, version, status, content_json FROM goal_contract_version",
        )
        .get(),
    ).toEqual(before.goal);
    expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    database.close();
  });

  it("upgrades populated 0007 Provider data with safe generation defaults and constraints", () => {
    const database = new DatabaseSync(":memory:");
    const migrations = loadMigrations(migrationDirectory);
    applyMigrations(database, migrations.slice(0, 7));
    const now = "2026-08-02T04:00:00.000Z";
    const vaultId = "019b7f4d-a000-7000-8000-000000000091";
    const providerId = "019b7f4d-a000-7000-8000-000000000092";
    database
      .prepare(
        `INSERT INTO key_vault_entry (
          id, ciphertext, nonce, auth_tag, encryption_version,
          version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 1, 1, ?, ?)`,
      )
      .run(
        vaultId,
        Buffer.from("ciphertext"),
        Buffer.alloc(12, 1),
        Buffer.alloc(16, 2),
        now,
        now,
      );
    database
      .prepare(
        `INSERT INTO provider (
          id, type, name, endpoint, key_vault_entry_id, config_json,
          config_status, version, created_at, updated_at
        ) VALUES (?, 'OPENAI_COMPATIBLE', 'Primary',
          'https://api.example.test/v1', ?, '{}', 'ENABLED', 1, ?, ?)`,
      )
      .run(providerId, vaultId, now, now);
    applyMigrations(database, migrations);
    expect(
      database
        .prepare(
          `SELECT api_dialect, selected_model_id, generation_timeout_ms
          FROM provider WHERE id = ?`,
        )
        .get(providerId),
    ).toEqual({
      api_dialect: "CHAT_COMPLETIONS",
      selected_model_id: null,
      generation_timeout_ms: 60_000,
    });
    expect(() =>
      database
        .prepare(
          "UPDATE provider SET generation_timeout_ms = 4999 WHERE id = ?",
        )
        .run(providerId),
    ).toThrow();
    expect(() =>
      database
        .prepare("UPDATE provider SET api_dialect = 'RESPONSES' WHERE id = ?")
        .run(providerId),
    ).toThrow();
    const insertGeneration = database.prepare(
      `INSERT INTO provider_generation_test (
        provider_id, provider_version, model_id, status, failure_reason,
        retryable, suggested_backoff_ms, stop_reason, output_preview,
        usage_json, completed_at
      ) VALUES (?, 1, 'model-a', ?, ?, ?, NULL, ?, ?, ?, ?)`,
    );
    expect(() =>
      insertGeneration.run(
        "019b7f4d-a000-7000-8000-000000000099",
        "SUCCEEDED",
        null,
        null,
        "COMPLETED",
        "ok",
        '{"costSource":"UNKNOWN"}',
        now,
      ),
    ).toThrow();
    expect(() =>
      insertGeneration.run(
        providerId,
        "INVALID",
        null,
        null,
        "COMPLETED",
        "ok",
        '{"costSource":"UNKNOWN"}',
        now,
      ),
    ).toThrow();
    expect(() =>
      insertGeneration.run(
        providerId,
        "SUCCEEDED",
        null,
        null,
        "COMPLETED",
        "ok",
        "not-json",
        now,
      ),
    ).toThrow();
    expect(() =>
      insertGeneration.run(
        providerId,
        "SUCCEEDED",
        "TIMEOUT",
        1,
        "COMPLETED",
        "ok",
        '{"costSource":"UNKNOWN"}',
        now,
      ),
    ).toThrow();
    insertGeneration.run(
      providerId,
      "SUCCEEDED",
      null,
      null,
      "COMPLETED",
      "ok",
      '{"costSource":"UNKNOWN"}',
      now,
    );
    expect(
      database
        .prepare("SELECT status, output_preview FROM provider_generation_test")
        .get(),
    ).toEqual({ status: "SUCCEEDED", output_preview: "ok" });
    database.prepare("DELETE FROM provider WHERE id = ?").run(providerId);
    expect(
      database
        .prepare("SELECT count(*) AS count FROM provider_generation_test")
        .get(),
    ).toEqual({ count: 0 });
    expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    database.close();
  });

  it("upgrades populated 0008 Goal data without changing MANUAL semantics", () => {
    const database = new DatabaseSync(":memory:");
    const migrations = loadMigrations(migrationDirectory);
    applyMigrations(database, migrations.slice(0, 8));
    const timestamp = "2026-08-02T05:00:00.000Z";
    const workspaceId = "019fa9bb-7200-7d90-a4e3-a5b0eea2a9ef";
    const corporationId = "019fa9bb-7201-7d90-a4e3-a5b0eea2a9ef";
    const content = JSON.stringify({
      source: "MANUAL",
      originalGoal: "Preserve this Goal",
      statement: "Preserve this Goal",
      successCriteria: ["Unchanged"],
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
        `INSERT INTO workspace (
        id, name, display_path, canonical_root_path, platform,
        permission_mode, access_status, path_identity_json, created_at, updated_at
      ) VALUES (?, 'Workspace', 'display', 'canonical', 'windows',
        'READ_WRITE', 'AVAILABLE', '{}', ?, ?)`,
      )
      .run(workspaceId, timestamp, timestamp);
    database
      .prepare(
        `INSERT INTO corporation (
        id, workspace_id, name, status, version, created_at, updated_at
      ) VALUES (?, ?, 'Corporation', 'DRAFT', 1, ?, ?)`,
      )
      .run(corporationId, workspaceId, timestamp, timestamp);
    database
      .prepare(
        `INSERT INTO goal_contract_version (
        corporation_id, version, status, source, content_json,
        created_by, created_at, approved_at
      ) VALUES (?, 1, 'DRAFT', 'MANUAL', ?, 'local-user', ?, NULL)`,
      )
      .run(corporationId, content, timestamp);
    database
      .prepare(
        `UPDATE corporation SET active_goal_version = 1, version = 2,
        updated_at = ? WHERE id = ?`,
      )
      .run(timestamp, corporationId);

    applyMigrations(database, migrations);
    expect(
      database
        .prepare(
          `SELECT source, content_json FROM goal_contract_version
      WHERE corporation_id = ? AND version = 1`,
        )
        .get(corporationId),
    ).toEqual({ source: "MANUAL", content_json: content });
    expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    database.close();
  });
});
