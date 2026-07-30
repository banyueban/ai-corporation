import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import type {
  CorporationPublic,
  GoalContractContentInput,
} from "@ai-corporation/protocols";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CorporationRepository } from "./corporation-repository";
import {
  GoalAssumptionConfirmationError,
  GoalCommandConflictError,
  GoalContractRepository,
  GoalStateConflictError,
  GoalVersionConflictError,
  TimelineCursorError,
  type GoalFaultStage,
} from "./goal-contract-repository";
import { applyMigrations, loadMigrations } from "./migrations";

const migrationDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);
const workspaceId = "019fa9bb-4000-7d90-a4e3-a5b0eea2a9ef";
const corporationId = "019fa9bb-4001-7d90-a4e3-a5b0eea2a9ef";
const now = "2026-07-30T01:00:00.000Z";

let database: DatabaseSync;

beforeEach(() => {
  database = new DatabaseSync(":memory:");
  applyMigrations(database, loadMigrations(migrationDirectory));
  seedCorporation(database);
});

afterEach(() => database.close());

describe("GoalContractRepository", () => {
  it("saves atomically, returns current/history, and replays one command", () => {
    const repository = new GoalContractRepository(database);
    const input = saveInput();
    const saved = repository.saveDraft(input);

    expect(saved).toMatchObject({ version: 1, status: "DRAFT" });
    expect(repository.saveDraft(input)).toEqual(saved);
    expect(repository.getCurrent(corporationId)).toEqual(saved);
    expect(repository.listVersions(corporationId)).toEqual([saved]);
    expect(count("goal_contract_version")).toBe(1);
    expect(count("goal_contract_command")).toBe(1);
    expect(count("domain_event")).toBe(2);
    expect(corporation()).toMatchObject({
      active_goal_version: 1,
      version: 2,
    });
  });

  it("rejects command reuse, stale versions, and non-DRAFT corporations", () => {
    const repository = new GoalContractRepository(database);
    repository.saveDraft(saveInput());
    expect(() =>
      repository.saveDraft({
        ...saveInput(),
        command: { ...saveInput().command, requestHash: "f".repeat(64) },
      }),
    ).toThrow(GoalCommandConflictError);
    expect(() =>
      repository.saveDraft({
        ...saveInput(),
        command: command("019fa9bb-4010-7d90-a4e3-a5b0eea2a9ef", "SAVE_DRAFT"),
      }),
    ).toThrow(GoalVersionConflictError);

    database
      .prepare("UPDATE corporation SET status = 'PLANNING' WHERE id = ?")
      .run(corporationId);
    expect(() =>
      repository.saveDraft({
        ...saveInput(),
        command: command("019fa9bb-4011-7d90-a4e3-a5b0eea2a9ef", "SAVE_DRAFT"),
        expectedCorporationVersion: 2,
        expectedGoalVersion: 1,
      }),
    ).toThrow(GoalStateConflictError);
  });

  it.each(["GOAL", "CORPORATION", "EVENT", "RECEIPT"] as const)(
    "rolls Goal, Corporation, event, and receipt back after a %s fault",
    (stage) => {
      const repository = new GoalContractRepository(database, {
        fault: faultAt(stage),
      });
      expect(() => repository.saveDraft(saveInput())).toThrow("injected");
      expect(count("goal_contract_version")).toBe(0);
      expect(count("goal_contract_command")).toBe(0);
      expect(count("domain_event")).toBe(1);
      expect(corporation()).toMatchObject({
        active_goal_version: null,
        version: 1,
      });
    },
  );

  it("requires confirmed HIGH assumptions before approval", () => {
    const repository = new GoalContractRepository(database);
    repository.saveDraft(
      saveInput({
        assumptions: [
          {
            text: "Production access exists",
            impact: "HIGH",
            confirmed: false,
          },
        ],
      }),
    );
    expect(() => repository.approve(approveInput())).toThrow(
      GoalAssumptionConfirmationError,
    );
    expect(repository.getCurrent(corporationId)).toMatchObject({
      status: "DRAFT",
    });
    expect(count("goal_contract_command")).toBe(1);
    expect(count("domain_event")).toBe(2);
  });

  it("approves the current draft and supersedes it with a later version", () => {
    const repository = new GoalContractRepository(database);
    repository.saveDraft(saveInput());
    const approved = repository.approve(approveInput());
    expect(approved).toMatchObject({
      status: "APPROVED",
      approvedAt: "2026-07-30T01:00:01.000Z",
    });
    expect(corporation()).toMatchObject({
      active_goal_version: 1,
      status: "DRAFT",
      version: 3,
    });
    expect(repository.approve(approveInput())).toEqual(approved);
    expect(count("goal_contract_command")).toBe(2);
    expect(count("domain_event")).toBe(3);

    const second = repository.saveDraft({
      ...saveInput({ statement: "Ship even more safely" }),
      command: command("019fa9bb-4012-7d90-a4e3-a5b0eea2a9ef", "SAVE_DRAFT"),
      expectedCorporationVersion: 3,
      expectedGoalVersion: 1,
      eventId: "019fa9bb-4013-7d90-a4e3-a5b0eea2a9ef",
      now: "2026-07-30T01:00:02.000Z",
    });
    expect(second).toMatchObject({ version: 2, status: "DRAFT" });
    expect(repository.listVersions(corporationId)).toMatchObject([
      { version: 2, status: "DRAFT" },
      { version: 1, status: "SUPERSEDED" },
    ]);
  });

  it.each(["GOAL", "CORPORATION", "EVENT", "RECEIPT"] as const)(
    "rolls approval writes back after a %s fault",
    (stage) => {
      new GoalContractRepository(database).saveDraft(saveInput());
      const repository = new GoalContractRepository(database, {
        fault: faultAt(stage),
      });
      expect(() => repository.approve(approveInput())).toThrow("injected");
      expect(repository.getCurrent(corporationId)).toMatchObject({
        status: "DRAFT",
      });
      expect(corporation()).toMatchObject({
        active_goal_version: 1,
        version: 2,
      });
      expect(count("goal_contract_command")).toBe(1);
      expect(count("domain_event")).toBe(2);
    },
  );

  it("returns a redacted stable timeline and rejects foreign cursors", () => {
    const repository = new GoalContractRepository(database);
    repository.saveDraft(saveInput());
    repository.approve(approveInput());

    const first = repository.listTimeline({ corporationId, limit: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).toBeDefined();
    expect(first.items[0]).toMatchObject({
      eventType: "corporation.created",
      summary: "Corporation created.",
    });
    expect(Object.keys(first.items[0] ?? {})).toEqual([
      "schemaVersion",
      "eventId",
      "eventType",
      "corporationId",
      "aggregateVersion",
      "occurredAt",
      "summary",
    ]);

    const cursor = first.nextCursor;
    if (cursor === undefined) throw new Error("missing cursor");
    const second = repository.listTimeline({
      corporationId,
      afterCursor: cursor,
      limit: 10,
    });
    expect(second.items.map(({ eventType }) => eventType)).toEqual([
      "goal.contract.drafted",
      "goal.contract.approved",
    ]);
    expect(second.nextCursor).toBeUndefined();
    expect(() =>
      repository.listTimeline({
        corporationId,
        afterCursor: "bm90LWEtY2Fub25pY2FsLWN1cnNvcg",
      }),
    ).toThrow(TimelineCursorError);
  });

  it("allows only one writer for the same Corporation and Goal versions", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "M1-TU-05-goal-race-"));
    const databasePath = path.join(directory, "workspace.sqlite");
    const persistent = new DatabaseSync(databasePath);
    applyMigrations(persistent, loadMigrations(migrationDirectory));
    seedCorporation(persistent);
    persistent.close();

    const gate = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
    const results = await Promise.all([
      concurrentSave(
        databasePath,
        gate,
        "019fa9bb-4020-7d90-a4e3-a5b0eea2a9ef",
      ),
      concurrentSave(
        databasePath,
        gate,
        "019fa9bb-4021-7d90-a4e3-a5b0eea2a9ef",
      ),
    ]);
    expect(results.sort()).toEqual([0, 1]);

    const reopened = new DatabaseSync(databasePath);
    expect(
      reopened
        .prepare(
          `SELECT version, active_goal_version
          FROM corporation WHERE id = ?`,
        )
        .get(corporationId),
    ).toEqual({ version: 2, active_goal_version: 1 });
    expect(
      reopened
        .prepare("SELECT COUNT(*) AS count FROM goal_contract_version")
        .get(),
    ).toEqual({ count: 1 });
    reopened.close();
    rmSync(directory, { force: true, recursive: true });
  });

  it("restores Goal versions, timeline, and receipts after reopening SQLite", () => {
    const directory = mkdtempSync(
      path.join(tmpdir(), "M1-TU-05-goal-recovery-"),
    );
    const databasePath = path.join(directory, "workspace.sqlite");
    const persistent = new DatabaseSync(databasePath);
    applyMigrations(persistent, loadMigrations(migrationDirectory));
    seedCorporation(persistent);
    const initial = new GoalContractRepository(persistent);
    initial.saveDraft(saveInput());
    const approved = initial.approve(approveInput());
    persistent.close();

    const reopened = new DatabaseSync(databasePath);
    applyMigrations(reopened, loadMigrations(migrationDirectory));
    const restored = new GoalContractRepository(reopened);
    expect(restored.getCurrent(corporationId)).toEqual(approved);
    expect(restored.approve(approveInput())).toEqual(approved);
    expect(
      restored
        .listTimeline({ corporationId })
        .items.map(({ eventType }) => eventType),
    ).toEqual([
      "corporation.created",
      "goal.contract.drafted",
      "goal.contract.approved",
    ]);
    expect(
      reopened
        .prepare("SELECT COUNT(*) AS count FROM goal_contract_command")
        .get(),
    ).toEqual({ count: 2 });
    reopened.close();
    rmSync(directory, { force: true, recursive: true });
  });
});

function seedCorporation(target: DatabaseSync): void {
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
  const corporation: CorporationPublic = {
    schemaVersion: "1.0",
    id: corporationId,
    workspaceId,
    name: "Example",
    status: "DRAFT",
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  new CorporationRepository(target).create({
    command: command("019fa9bb-4002-7d90-a4e3-a5b0eea2a9ef", "CREATE"),
    corporation,
    event: {
      eventId: "019fa9bb-4003-7d90-a4e3-a5b0eea2a9ef",
      eventType: "corporation.created",
      corporationId,
      aggregateVersion: 1,
      occurredAt: now,
      payload: { workspaceId, name: "Example", status: "DRAFT" },
    },
  });
}

function saveInput(overrides: Partial<GoalContractContentInput> = {}) {
  const content: GoalContractContentInput = {
    source: "MANUAL",
    originalGoal: "Ship safely",
    statement: "Ship safely",
    successCriteria: ["All checks pass"],
    inScope: [],
    outOfScope: [],
    constraints: [],
    assumptions: [],
    deliverables: ["Release"],
    riskLevel: "LOW",
    budget: {},
    stopConditions: [],
    ...overrides,
  };
  return {
    command: command("019fa9bb-4004-7d90-a4e3-a5b0eea2a9ef", "SAVE_DRAFT"),
    corporationId,
    expectedCorporationVersion: 1,
    expectedGoalVersion: 0,
    content,
    now,
    eventId: "019fa9bb-4005-7d90-a4e3-a5b0eea2a9ef",
  };
}

function approveInput() {
  return {
    command: command("019fa9bb-4006-7d90-a4e3-a5b0eea2a9ef", "APPROVE"),
    corporationId,
    expectedCorporationVersion: 2,
    goalVersion: 1,
    now: "2026-07-30T01:00:01.000Z",
    eventId: "019fa9bb-4007-7d90-a4e3-a5b0eea2a9ef",
  };
}

function command<T extends "CREATE" | "SAVE_DRAFT" | "APPROVE">(
  commandId: string,
  commandType: T,
): { commandId: string; commandType: T; requestHash: string } {
  return { commandId, commandType, requestHash: "a".repeat(64) };
}

function count(table: string): number {
  return Number(
    database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count,
  );
}

function corporation(): Record<string, unknown> {
  return (
    database
      .prepare(
        `SELECT status, version, active_goal_version
        FROM corporation WHERE id = ?`,
      )
      .get(corporationId) ?? {}
  );
}

function faultAt(expected: GoalFaultStage) {
  return (actual: GoalFaultStage) => {
    if (actual === expected) throw new Error("injected");
  };
}

function concurrentSave(
  databasePath: string,
  gate: SharedArrayBuffer,
  commandId: string,
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
        const current = database.prepare(
          "SELECT version, active_goal_version FROM corporation WHERE id = ?"
        ).get(workerData.corporationId);
        let changes = 0;
        if (current.version !== 1 || current.active_goal_version !== null) {
          database.exec("ROLLBACK");
        } else {
          database.prepare(
            "INSERT INTO goal_contract_version (" +
            "corporation_id, version, status, source, content_json, " +
            "created_by, created_at, approved_at" +
            ") VALUES (?, 1, 'DRAFT', 'MANUAL', ?, 'local-user', ?, NULL)"
          ).run(workerData.corporationId, workerData.content, workerData.now);
          const result = database.prepare(
            "UPDATE corporation SET active_goal_version = 1, version = 2, " +
            "updated_at = ? WHERE id = ? AND version = 1 AND status = 'DRAFT'"
          ).run(workerData.now, workerData.corporationId);
          changes = Number(result.changes);
          database.exec(result.changes === 1 ? "COMMIT" : "ROLLBACK");
        }
        database.close();
        parentPort.postMessage({ changes });
      `,
      {
        eval: true,
        workerData: {
          commandId,
          content: JSON.stringify(saveInput().content),
          corporationId,
          databasePath,
          gate,
          now,
        },
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
