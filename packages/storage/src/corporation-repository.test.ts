import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CorporationPublic } from "@ai-corporation/protocols";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CorporationCommandConflictError,
  CorporationRepository,
  CorporationStateConflictError,
  CorporationVersionConflictError,
  type CorporationFaultStage,
} from "./corporation-repository";
import { applyMigrations, loadMigrations } from "./migrations";

const migrationDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);
const workspaceId = "019fa9bb-375e-7d90-a4e3-a5b0eea2a9ef";
const corporationId = "019fa9bb-375f-7d90-a4e3-a5b0eea2a9ef";
const createCommandId = "019fa9bb-3760-7d90-a4e3-a5b0eea2a9ef";
const eventId = "019fa9bb-3761-7d90-a4e3-a5b0eea2a9ef";
const now = "2026-07-30T00:00:00.000Z";

let database: DatabaseSync;

beforeEach(() => {
  database = new DatabaseSync(":memory:");
  applyMigrations(database, loadMigrations(migrationDirectory));
  database
    .prepare(
      `INSERT INTO workspace (
        id, name, display_path, canonical_root_path, platform,
        permission_mode, access_status, path_identity_json,
        last_verified_at, created_at, updated_at
      ) VALUES (?, 'Workspace', 'display', 'canonical', 'windows',
        'READ_WRITE', 'AVAILABLE', '{}', ?, ?, ?)`,
    )
    .run(workspaceId, now, now, now);
});

afterEach(() => database.close());

describe("CorporationRepository", () => {
  it("creates state, event, and receipt atomically and replays once", () => {
    const repository = new CorporationRepository(database);
    const input = createInput();
    expect(repository.create(input)).toEqual(input.corporation);
    expect(repository.create(input)).toEqual(input.corporation);
    expect(count("corporation")).toBe(1);
    expect(count("domain_event")).toBe(1);
    expect(count("corporation_command")).toBe(1);
  });

  it("rejects conflicting command reuse", () => {
    const repository = new CorporationRepository(database);
    repository.create(createInput());
    expect(() =>
      repository.create({
        ...createInput(),
        command: { ...createInput().command, requestHash: "b".repeat(64) },
      }),
    ).toThrow(CorporationCommandConflictError);
    expect(count("domain_event")).toBe(1);
  });

  it.each(["STATE", "EVENT", "RECEIPT"] as const)(
    "rolls all writes back after a %s fault",
    (stage) => {
      const repository = new CorporationRepository(database, {
        fault: faultAt(stage),
      });
      expect(() => repository.create(createInput())).toThrow("injected");
      expect(count("corporation")).toBe(0);
      expect(count("domain_event")).toBe(0);
      expect(count("corporation_command")).toBe(0);
    },
  );

  it("updates with optimistic locking and stable list ordering", () => {
    const repository = new CorporationRepository(database);
    repository.create(createInput());
    const updated = repository.updateName({
      command: {
        commandId: "019fa9bb-3762-7d90-a4e3-a5b0eea2a9ef",
        commandType: "UPDATE_NAME",
        requestHash: "c".repeat(64),
      },
      corporationId,
      expectedVersion: 1,
      name: "Renamed",
      now: "2026-07-30T00:00:01.000Z",
      eventId: "019fa9bb-3763-7d90-a4e3-a5b0eea2a9ef",
    });
    expect(updated).toMatchObject({ name: "Renamed", version: 2 });
    expect(
      repository.updateName({
        command: {
          commandId: "019fa9bb-3762-7d90-a4e3-a5b0eea2a9ef",
          commandType: "UPDATE_NAME",
          requestHash: "c".repeat(64),
        },
        corporationId,
        expectedVersion: 1,
        name: "Renamed",
        now: "2026-07-30T00:00:01.000Z",
        eventId: "019fa9bb-3768-7d90-a4e3-a5b0eea2a9ef",
      }),
    ).toEqual(updated);
    expect(() =>
      repository.updateName({
        command: {
          commandId: "019fa9bb-3764-7d90-a4e3-a5b0eea2a9ef",
          commandType: "UPDATE_NAME",
          requestHash: "d".repeat(64),
        },
        corporationId,
        expectedVersion: 1,
        name: "Lost update",
        now,
        eventId: "019fa9bb-3765-7d90-a4e3-a5b0eea2a9ef",
      }),
    ).toThrow(CorporationVersionConflictError);
    expect(repository.list(workspaceId, false)[0]).toEqual(updated);
    expect(count("domain_event")).toBe(2);
  });

  it("lists in stable order without crossing Workspace boundaries", () => {
    const repository = new CorporationRepository(database);
    repository.create(createInput());
    repository.create(
      createInput({
        corporationId: "019fa9bb-376c-7d90-a4e3-a5b0eea2a9ef",
        commandId: "019fa9bb-376d-7d90-a4e3-a5b0eea2a9ef",
        eventId: "019fa9bb-376e-7d90-a4e3-a5b0eea2a9ef",
      }),
    );
    const otherWorkspaceId = "019fa9bb-376f-7d90-a4e3-a5b0eea2a9ef";
    database
      .prepare(
        `INSERT INTO workspace (
          id, name, display_path, canonical_root_path, platform,
          permission_mode, access_status, path_identity_json,
          last_verified_at, created_at, updated_at
        ) VALUES (?, 'Other', 'other-display', 'other-canonical', 'windows',
          'READ_ONLY', 'AVAILABLE', '{}', ?, ?, ?)`,
      )
      .run(otherWorkspaceId, now, now, now);
    repository.create(
      createInput({
        corporationId: "019fa9bb-3770-7d90-a4e3-a5b0eea2a9ef",
        commandId: "019fa9bb-3771-7d90-a4e3-a5b0eea2a9ef",
        eventId: "019fa9bb-3772-7d90-a4e3-a5b0eea2a9ef",
        workspaceId: otherWorkspaceId,
      }),
    );
    expect(repository.list(workspaceId, false).map(({ id }) => id)).toEqual([
      corporationId,
      "019fa9bb-376c-7d90-a4e3-a5b0eea2a9ef",
    ]);
  });

  it("archives only terminal states and makes events immutable", () => {
    const repository = new CorporationRepository(database);
    repository.create(createInput());
    const archiveInput = {
      command: {
        commandId: "019fa9bb-3766-7d90-a4e3-a5b0eea2a9ef",
        commandType: "ARCHIVE" as const,
        requestHash: "e".repeat(64),
      },
      corporationId,
      expectedVersion: 1,
      now: "2026-07-30T00:00:02.000Z",
      eventId: "019fa9bb-3767-7d90-a4e3-a5b0eea2a9ef",
    };
    expect(() => repository.archive(archiveInput)).toThrow(
      CorporationStateConflictError,
    );
    database
      .prepare("UPDATE corporation SET status = 'COMPLETED' WHERE id = ?")
      .run(corporationId);
    const archived = repository.archive(archiveInput);
    expect(archived).toMatchObject({
      status: "ARCHIVED",
      version: 2,
      archivedAt: archiveInput.now,
    });
    expect(repository.list(workspaceId, false)).toEqual([]);
    expect(repository.list(workspaceId, true)).toEqual([archived]);
    expect(repository.archive(archiveInput)).toEqual(archived);
    expect(() =>
      repository.updateName({
        command: {
          commandId: "019fa9bb-3768-7d90-a4e3-a5b0eea2a9ef",
          commandType: "UPDATE_NAME",
          requestHash: "f".repeat(64),
        },
        corporationId,
        expectedVersion: 2,
        name: "Too late",
        now,
        eventId: "019fa9bb-3769-7d90-a4e3-a5b0eea2a9ef",
      }),
    ).toThrow(CorporationStateConflictError);
    expect(count("domain_event")).toBe(2);
    expect(() => database.prepare("DELETE FROM domain_event").run()).toThrow(
      "append-only",
    );
    expect(() =>
      database.prepare("UPDATE domain_event SET payload_json = '{}'").run(),
    ).toThrow("append-only");
  });

  it.each(["UPDATE_NAME", "ARCHIVE"] as const)(
    "rolls an %s state mutation back when event insertion fails",
    (operation) => {
      new CorporationRepository(database).create(createInput());
      if (operation === "ARCHIVE") {
        database
          .prepare("UPDATE corporation SET status = 'FAILED' WHERE id = ?")
          .run(corporationId);
      }
      const repository = new CorporationRepository(database, {
        fault: faultAt("EVENT"),
      });
      const command = {
        commandId: "019fa9bb-376a-7d90-a4e3-a5b0eea2a9ef",
        commandType: operation,
        requestHash: "1".repeat(64),
      };
      expect(() =>
        operation === "UPDATE_NAME"
          ? repository.updateName({
              command,
              corporationId,
              expectedVersion: 1,
              name: "Rolled back",
              now: "2026-07-30T00:00:03.000Z",
              eventId: "019fa9bb-376b-7d90-a4e3-a5b0eea2a9ef",
            })
          : repository.archive({
              command,
              corporationId,
              expectedVersion: 1,
              now: "2026-07-30T00:00:03.000Z",
              eventId: "019fa9bb-376b-7d90-a4e3-a5b0eea2a9ef",
            }),
      ).toThrow("injected");
      expect(repository.get(corporationId)).toMatchObject({
        name: "Example",
        status: operation === "ARCHIVE" ? "FAILED" : "DRAFT",
        version: 1,
      });
      expect(count("domain_event")).toBe(1);
      expect(count("corporation_command")).toBe(1);
    },
  );

  it("restores state and idempotent receipts after reopening SQLite", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "M1-TU-04-recovery-"));
    const databasePath = path.join(directory, "workspace.sqlite");
    const persistent = new DatabaseSync(databasePath);
    applyMigrations(persistent, loadMigrations(migrationDirectory));
    seedWorkspace(persistent);
    new CorporationRepository(persistent).create(createInput());
    persistent.close();

    const reopened = new DatabaseSync(databasePath);
    applyMigrations(reopened, loadMigrations(migrationDirectory));
    const repository = new CorporationRepository(reopened);
    expect(repository.get(corporationId)).toEqual(createInput().corporation);
    expect(repository.create(createInput())).toEqual(createInput().corporation);
    expect(
      reopened.prepare("SELECT COUNT(*) AS count FROM domain_event").get()
        ?.count,
    ).toBe(1);
    reopened.close();
    rmSync(directory, { force: true, recursive: true });
  });
});

function createInput(
  overrides: {
    readonly commandId?: string;
    readonly corporationId?: string;
    readonly eventId?: string;
    readonly workspaceId?: string;
  } = {},
) {
  const currentCorporationId = overrides.corporationId ?? corporationId;
  const currentWorkspaceId = overrides.workspaceId ?? workspaceId;
  const corporation: CorporationPublic = {
    schemaVersion: "1.0",
    id: currentCorporationId,
    workspaceId: currentWorkspaceId,
    name: "Example",
    status: "DRAFT",
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  return {
    command: {
      commandId: overrides.commandId ?? createCommandId,
      commandType: "CREATE" as const,
      requestHash: "a".repeat(64),
    },
    corporation,
    event: {
      eventId: overrides.eventId ?? eventId,
      eventType: "corporation.created" as const,
      corporationId: currentCorporationId,
      aggregateVersion: 1,
      occurredAt: now,
      payload: {
        workspaceId: currentWorkspaceId,
        name: "Example",
        status: "DRAFT",
      },
    },
  };
}

function count(table: string): number {
  const row = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get();
  return Number(row?.count);
}

function seedWorkspace(target: DatabaseSync): void {
  target
    .prepare(
      `INSERT INTO workspace (
        id, name, display_path, canonical_root_path, platform,
        permission_mode, access_status, path_identity_json,
        last_verified_at, created_at, updated_at
      ) VALUES (?, 'Workspace', 'display', 'canonical', 'windows',
        'READ_WRITE', 'AVAILABLE', '{}', ?, ?, ?)`,
    )
    .run(workspaceId, now, now, now);
}

function faultAt(expected: CorporationFaultStage) {
  return (actual: CorporationFaultStage) => {
    if (actual === expected) throw new Error("injected");
  };
}
