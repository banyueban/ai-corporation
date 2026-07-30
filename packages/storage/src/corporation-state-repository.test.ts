import { DatabaseSync } from "node:sqlite";
import { Worker } from "node:worker_threads";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CorporationCommandConflictError,
  CorporationDataError,
  CorporationStateConflictError,
  CorporationVersionConflictError,
} from "./corporation-repository";
import {
  CorporationStateRepository,
  type CorporationStateFaultStage,
} from "./corporation-state-repository";
import { GoalContractRepository } from "./goal-contract-repository";
import { applyMigrations, loadMigrations } from "./migrations";

const migrationDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);
const workspaceId = "019fa9bb-6000-7d90-a4e3-a5b0eea2a9ef";
const corporationId = "019fa9bb-6001-7d90-a4e3-a5b0eea2a9ef";
const now = "2026-07-30T05:00:00.000Z";
let database: DatabaseSync;
let directory: string;

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "M1-TU-06-state-"));
  database = new DatabaseSync(path.join(directory, "state.sqlite"));
  applyMigrations(database, loadMigrations(migrationDirectory));
  seed();
});

afterEach(() => {
  database.close();
  rmSync(directory, { force: true, recursive: true });
});

describe("CorporationStateRepository", () => {
  it.each([
    "DRAFT",
    "PLANNING",
    "ORGANIZING",
    "EXECUTING",
    "VERIFYING",
    "WAITING_HUMAN",
  ] as const)(
    "pauses and resumes %s with exact metadata and events",
    (status) => {
      database
        .prepare("UPDATE corporation SET status = ? WHERE id = ?")
        .run(status, corporationId);
      const repository = new CorporationStateRepository(database);
      const paused = repository.pause(pauseInput());
      expect(paused).toMatchObject({
        status: "PAUSED",
        version: 2,
        pausedFrom: status,
        pausedAt: now,
      });
      const resumed = repository.resume(resumeInput());
      expect(resumed).toMatchObject({
        status,
        version: 3,
      });
      expect(resumed).not.toHaveProperty("pausedFrom");
      expect(eventTypes()).toEqual([
        "corporation.created",
        "corporation.paused",
        "corporation.resumed",
      ]);
      expect(count("corporation_state_command")).toBe(2);
    },
  );

  it("replays the same command and rejects conflicting reuse or versions", () => {
    const repository = new CorporationStateRepository(database);
    const input = pauseInput();
    const paused = repository.pause(input);
    expect(repository.pause(input)).toEqual(paused);
    expect(count("corporation_state_command")).toBe(1);
    expect(eventTypes()).toHaveLength(2);
    expect(() =>
      repository.pause({
        ...input,
        command: { ...input.command, requestHash: "f".repeat(64) },
      }),
    ).toThrow(CorporationCommandConflictError);
    expect(() =>
      repository.resume({ ...resumeInput(), expectedVersion: 1 }),
    ).toThrow(CorporationVersionConflictError);
  });

  it.each(["MISSING", "PERMISSION_DENIED", "UNVERIFIED"] as const)(
    "rejects %s workspaces without writes",
    (accessStatus) => {
      const repository = new CorporationStateRepository(database);
      database
        .prepare("UPDATE workspace SET access_status = ? WHERE id = ?")
        .run(accessStatus, workspaceId);
      expect(() => repository.pause(pauseInput())).toThrow(
        CorporationStateConflictError,
      );
      expect(count("corporation_state_command")).toBe(0);
      expect(eventTypes()).toEqual(["corporation.created"]);
    },
  );

  it("rejects invalid states without writes", () => {
    const repository = new CorporationStateRepository(database);
    database
      .prepare("UPDATE corporation SET status = 'COMPLETED' WHERE id = ?")
      .run(corporationId);
    expect(() => repository.pause(pauseInput())).toThrow(
      CorporationStateConflictError,
    );
    expect(() =>
      repository.resume({ ...resumeInput(), expectedVersion: 1 }),
    ).toThrow(CorporationStateConflictError);
    expect(count("corporation_state_command")).toBe(0);
    expect(eventTypes()).toEqual(["corporation.created"]);
  });

  it("rejects corrupted paused metadata instead of guessing a resume target", () => {
    database.exec("DROP TRIGGER corporation_validate_pause_metadata_update");
    database
      .prepare(
        `UPDATE corporation
        SET status = 'PAUSED', paused_from = NULL, paused_at = NULL
        WHERE id = ?`,
      )
      .run(corporationId);
    expect(() =>
      new CorporationStateRepository(database).resume(resumeInput()),
    ).toThrow(CorporationDataError);
    expect(count("corporation_state_command")).toBe(0);
  });

  it.each(["STATE", "EVENT", "RECEIPT"] as const)(
    "rolls pause writes back after a %s fault",
    (stage) => {
      const repository = new CorporationStateRepository(database, {
        fault: faultAt(stage),
      });
      expect(() => repository.pause(pauseInput())).toThrow("injected");
      expect(corporation()).toMatchObject({
        status: "DRAFT",
        version: 1,
        paused_from: null,
        paused_at: null,
      });
      expect(eventTypes()).toEqual(["corporation.created"]);
      expect(count("corporation_state_command")).toBe(0);
    },
  );

  it.each(["STATE", "EVENT", "RECEIPT"] as const)(
    "rolls resume writes back after a %s fault",
    (stage) => {
      new CorporationStateRepository(database).pause(pauseInput());
      const repository = new CorporationStateRepository(database, {
        fault: faultAt(stage),
      });
      expect(() => repository.resume(resumeInput())).toThrow("injected");
      expect(corporation()).toMatchObject({
        status: "PAUSED",
        version: 2,
        paused_from: "DRAFT",
        paused_at: now,
      });
      expect(eventTypes()).toEqual([
        "corporation.created",
        "corporation.paused",
      ]);
      expect(count("corporation_state_command")).toBe(1);
    },
  );

  it("restores paused metadata, events, and receipts after SQLite reopens", () => {
    const databasePath = path.join(directory, "state.sqlite");
    const paused = new CorporationStateRepository(database).pause(pauseInput());
    database.close();
    database = new DatabaseSync(databasePath);
    database.exec("PRAGMA foreign_keys = ON");
    const repository = new CorporationStateRepository(database);
    expect(repository.pause(pauseInput())).toEqual(paused);
    expect(repository.resume(resumeInput())).toMatchObject({
      status: "DRAFT",
      version: 3,
    });
    expect(eventTypes()).toEqual([
      "corporation.created",
      "corporation.paused",
      "corporation.resumed",
    ]);
  });

  it("publishes redacted paused and resumed facts through the canonical timeline", () => {
    const state = new CorporationStateRepository(database);
    state.pause(pauseInput());
    state.resume(resumeInput());
    const timeline = new GoalContractRepository(database).listTimeline({
      corporationId,
    });
    expect(
      timeline.items.map(({ eventType, summary }) => ({
        eventType,
        summary,
      })),
    ).toEqual([
      {
        eventType: "corporation.created",
        summary: "Corporation created.",
      },
      {
        eventType: "corporation.paused",
        summary: "Corporation paused.",
      },
      {
        eventType: "corporation.resumed",
        summary: "Corporation resumed.",
      },
    ]);
    expect(Object.keys(timeline.items[1] ?? {})).toEqual([
      "schemaVersion",
      "eventId",
      "eventType",
      "corporationId",
      "aggregateVersion",
      "occurredAt",
      "summary",
    ]);
  });

  it("allows only one pause from the same expected version across two connections", async () => {
    const databasePath = path.join(directory, "state.sqlite");
    database.close();
    const gate = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
    const results = await Promise.all([
      concurrentPause(databasePath, gate),
      concurrentPause(databasePath, gate),
    ]);
    expect(results.sort()).toEqual([0, 1]);

    database = new DatabaseSync(databasePath);
    expect(corporation()).toMatchObject({
      status: "PAUSED",
      version: 2,
      paused_from: "DRAFT",
      paused_at: now,
    });
  });
});

function pauseInput() {
  return {
    command: {
      commandId: "019fa9bb-6003-7d90-a4e3-a5b0eea2a9ef",
      commandType: "PAUSE" as const,
      requestHash: "a".repeat(64),
    },
    corporationId,
    expectedVersion: 1,
    eventId: "019fa9bb-6004-7d90-a4e3-a5b0eea2a9ef",
    now,
  };
}

function resumeInput() {
  return {
    command: {
      commandId: "019fa9bb-6005-7d90-a4e3-a5b0eea2a9ef",
      commandType: "RESUME" as const,
      requestHash: "b".repeat(64),
    },
    corporationId,
    expectedVersion: 2,
    eventId: "019fa9bb-6006-7d90-a4e3-a5b0eea2a9ef",
    now: "2026-07-30T05:01:00.000Z",
  };
}

function seed() {
  database
    .prepare(
      `INSERT INTO workspace (
        id, name, display_path, canonical_root_path, platform,
        permission_mode, access_status, path_identity_json,
        created_at, updated_at
      ) VALUES (?, 'Workspace', 'display', 'canonical', 'windows',
        'READ_WRITE', 'AVAILABLE', '{}', ?, ?)`,
    )
    .run(workspaceId, now, now);
  database
    .prepare(
      `INSERT INTO corporation (
        id, workspace_id, name, status, version, created_at, updated_at
      ) VALUES (?, ?, 'Corporation', 'DRAFT', 1, ?, ?)`,
    )
    .run(corporationId, workspaceId, now, now);
  database
    .prepare(
      `INSERT INTO domain_event (
        event_id, schema_version, event_type, aggregate_type, aggregate_id,
        aggregate_version, corporation_id, correlation_id, actor_json,
        payload_json, sensitivity, occurred_at
      ) VALUES (?, '1.0', 'corporation.created', 'CORPORATION', ?, 1, ?, ?,
        '{"kind":"USER","id":"local-user"}', '{}', 'NORMAL', ?)`,
    )
    .run(
      "019fa9bb-6002-7d90-a4e3-a5b0eea2a9ef",
      corporationId,
      corporationId,
      "019fa9bb-6002-7d90-a4e3-a5b0eea2a9ef",
      now,
    );
}

function corporation() {
  return database
    .prepare(
      `SELECT status, version, paused_from, paused_at
      FROM corporation WHERE id = ?`,
    )
    .get(corporationId);
}

function eventTypes() {
  return database
    .prepare(
      `SELECT event_type FROM domain_event
      WHERE corporation_id = ? ORDER BY aggregate_version`,
    )
    .all(corporationId)
    .map(({ event_type }) => event_type);
}

function count(table: string): number {
  const row = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get();
  return Number(row?.count);
}

function faultAt(expected: CorporationStateFaultStage) {
  return (actual: CorporationStateFaultStage) => {
    if (actual === expected) throw new Error("injected");
  };
}

function concurrentPause(
  databasePath: string,
  gate: SharedArrayBuffer,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      `
        const { DatabaseSync } = require("node:sqlite");
        const { parentPort, workerData } = require("node:worker_threads");
        const gate = new Int32Array(workerData.gate);
        parentPort.postMessage({ ready: true });
        Atomics.wait(gate, 1, 0);
        const database = new DatabaseSync(workerData.databasePath, {
          timeout: 5000,
        });
        database.exec("BEGIN IMMEDIATE");
        const result = database.prepare(
          "UPDATE corporation SET status = 'PAUSED', paused_from = 'DRAFT', " +
          "paused_at = ?, version = 2, updated_at = ? " +
          "WHERE id = ? AND version = 1 AND status = 'DRAFT'"
        ).run(workerData.now, workerData.now, workerData.corporationId);
        database.exec(result.changes === 1 ? "COMMIT" : "ROLLBACK");
        database.close();
        parentPort.postMessage({ changes: Number(result.changes) });
      `,
      {
        eval: true,
        workerData: { corporationId, databasePath, gate, now },
      },
    );
    worker.once("error", reject);
    worker.on("message", (message: unknown) => {
      if (
        typeof message === "object" &&
        message !== null &&
        "ready" in message
      ) {
        const view = new Int32Array(gate);
        if (Atomics.add(view, 0, 1) === 1) {
          Atomics.store(view, 1, 1);
          Atomics.notify(view, 1, 2);
        }
        return;
      }
      if (
        typeof message === "object" &&
        message !== null &&
        "changes" in message &&
        typeof message.changes === "number"
      ) {
        resolve(message.changes);
      }
    });
  });
}
