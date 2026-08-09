import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PlannerDraftCandidate } from "@ai-corporation/protocols";
import { applyMigrations, loadMigrations } from "./migrations";
import {
  PlannerRepository,
  PlannerStateConflictError,
  PlannerVersionConflictError,
} from "./planner-repository";

const migrationDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);
const workspaceId = "019fa9bb-6000-7d90-a4e3-a5b0eea2a9ef";
const corporationId = "019fa9bb-6001-7d90-a4e3-a5b0eea2a9ef";
const providerId = "019fa9bb-6002-7d90-a4e3-a5b0eea2a9ef";
const operationId = "019fa9bb-6003-7d90-a4e3-a5b0eea2a9ef";
const planId = "019fa9bb-6004-7d90-a4e3-a5b0eea2a9ef";
const taskId = "019fa9bb-6005-7d90-a4e3-a5b0eea2a9ef";
const now = "2026-08-09T12:00:00.000Z";
let database: DatabaseSync;
let repository: PlannerRepository;

beforeEach(() => {
  database = new DatabaseSync(":memory:");
  applyMigrations(database, loadMigrations(migrationDirectory));
  seedFacts();
  repository = new PlannerRepository(database);
});

afterEach(() => database.close());

describe("PlannerRepository", () => {
  it("binds the approved Goal and atomically saves an unvalidated draft", () => {
    const operation = repository.begin(beginInput());
    const saved = repository.savePlan({
      operation,
      candidate: candidate(),
      planId,
      taskIds: [taskId],
      usage: { inputTokens: 10, outputTokens: 20, costSource: "UNKNOWN" },
      now,
    });

    expect(saved).toMatchObject({
      status: "PLAN_SAVED",
      plan: {
        planId,
        planVersion: 1,
        status: "DRAFT",
        validationStatus: "PENDING",
        tasks: [{ id: taskId, localId: "task-one" }],
      },
    });
    expect(
      database
        .prepare("SELECT status, validation_status FROM task_plan WHERE id = ?")
        .get(planId),
    ).toEqual({ status: "DRAFT", validation_status: "PENDING" });
    expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("allows one active operation and interrupts its model call without replay", () => {
    const operation = repository.begin(beginInput());
    expect(() =>
      repository.begin({
        ...beginInput(),
        operationId: "019fa9bb-6010-7d90-a4e3-a5b0eea2a9ef",
        requestHash: "b".repeat(64),
      }),
    ).toThrow(PlannerStateConflictError);
    repository.startModelCall({
      id: "019fa9bb-6011-7d90-a4e3-a5b0eea2a9ef",
      operation,
      attempt: 1,
      repair: false,
      now,
    });
    expect(repository.interruptGenerating(now)).toBe(1);
    expect(repository.getPublic(operationId)).toMatchObject({
      status: "INTERRUPTED",
    });
    expect(database.prepare("SELECT status FROM model_call").get()).toEqual({
      status: "INTERRUPTED",
    });
  });

  it("rejects planning from a draft Goal or after facts change", () => {
    database
      .prepare(
        "UPDATE goal_contract_version SET status = 'SUPERSEDED', approved_at = NULL",
      )
      .run();
    expect(() => repository.begin(beginInput())).toThrow(
      PlannerStateConflictError,
    );

    database.close();
    database = new DatabaseSync(":memory:");
    applyMigrations(database, loadMigrations(migrationDirectory));
    seedFacts();
    repository = new PlannerRepository(database);
    const operation = repository.begin(beginInput());
    database
      .prepare("UPDATE provider SET version = 2 WHERE id = ?")
      .run(providerId);
    expect(() =>
      repository.savePlan({
        operation,
        candidate: candidate(),
        planId,
        taskIds: [taskId],
        usage: { costSource: "UNKNOWN" },
        now,
      }),
    ).toThrow(PlannerVersionConflictError);
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM task_plan").get(),
    ).toEqual({
      count: 0,
    });
  });

  it("rejects another generation after a Plan draft exists", () => {
    const operation = repository.begin(beginInput());
    repository.savePlan({
      operation,
      candidate: candidate(),
      planId,
      taskIds: [taskId],
      usage: { costSource: "UNKNOWN" },
      now,
    });
    expect(() =>
      repository.begin({
        ...beginInput(),
        operationId: "019fa9bb-6020-7d90-a4e3-a5b0eea2a9ef",
        requestHash: "c".repeat(64),
      }),
    ).toThrow(PlannerStateConflictError);
  });
});

function beginInput() {
  return {
    operationId,
    corporationId,
    expectedCorporationVersion: 3,
    goalVersion: 1,
    providerId,
    expectedProviderVersion: 1,
    modelId: "model-a",
    requestHash: "a".repeat(64),
    now,
  };
}

function candidate(): PlannerDraftCandidate {
  return {
    schemaVersion: "1.0",
    summary: "Create one verifiable output.",
    tasks: [
      {
        localId: "task-one",
        title: "Create output",
        objective: "Create the requested output.",
        kind: "GENERATION",
        priority: 50,
        riskLevel: "LOW",
        suggestedRole: "Writer",
        requiredCapabilities: [],
        requiredTools: [],
        inputs: [
          {
            source: "GOAL_CONTRACT",
            logicalName: "approved-goal",
            required: true,
          },
        ],
        expectedOutputs: [
          {
            logicalName: "result",
            mediaType: "text/plain",
            required: true,
            description: "Requested result.",
          },
        ],
        acceptanceCriteria: [
          {
            localId: "criterion-result",
            description: "The result exists.",
            severity: "REQUIRED",
            evidenceRequired: ["result"],
          },
        ],
        budget: {},
        retryPolicy: {
          maxAttempts: 1,
          maxEvaluationRevisions: 0,
          retryableCategories: [],
        },
        permissionHints: {
          workspaceRead: false,
          workspaceWrite: [],
          processProfiles: [],
        },
        assumptions: [],
        nonGoals: [],
      },
    ],
    dependencies: [],
    milestones: [],
    assumptions: [],
    risks: [],
  };
}

function seedFacts(): void {
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
  database
    .prepare(
      `INSERT INTO corporation (
        id, workspace_id, name, status, version, active_goal_version,
        created_at, updated_at
      ) VALUES (?, ?, 'Example', 'DRAFT', 3, NULL, ?, ?)`,
    )
    .run(corporationId, workspaceId, now, now);
  database
    .prepare(
      `INSERT INTO goal_contract_version (
        corporation_id, version, status, source, content_json,
        created_by, created_at, approved_at
      ) VALUES (?, 1, 'DRAFT', 'MANUAL', ?, 'local-user', ?, NULL)`,
    )
    .run(corporationId, JSON.stringify(goalContent()), now);
  database
    .prepare("UPDATE corporation SET active_goal_version = 1 WHERE id = ?")
    .run(corporationId);
  database
    .prepare(
      `UPDATE goal_contract_version SET status = 'APPROVED', approved_at = ?
       WHERE corporation_id = ? AND version = 1`,
    )
    .run(now, corporationId);

  const vaultId = "019fa9bb-6030-7d90-a4e3-a5b0eea2a9ef";
  database
    .prepare(
      `INSERT INTO key_vault_entry (
        id, ciphertext, nonce, auth_tag, encryption_version,
        version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 1, 1, ?, ?)`,
    )
    .run(
      vaultId,
      new Uint8Array([1]),
      new Uint8Array(12),
      new Uint8Array(16),
      now,
      now,
    );
  database
    .prepare(
      `INSERT INTO provider (
        id, type, name, endpoint, key_vault_entry_id, config_json,
        config_status, version, created_at, updated_at,
        api_dialect, selected_model_id, generation_timeout_ms
      ) VALUES (?, 'OPENAI_COMPATIBLE', 'Provider', 'https://example.test', ?,
        '{}', 'ENABLED', 1, ?, ?, 'CHAT_COMPLETIONS', 'model-a', 60000)`,
    )
    .run(providerId, vaultId, now, now);
  database
    .prepare(
      `INSERT INTO provider_connection_test (
        provider_id, provider_version, status, failure_reason, retryable,
        suggested_backoff_ms, models_json, tested_at
      ) VALUES (?, 1, 'VERIFIED', NULL, NULL, NULL, ?, ?)`,
    )
    .run(providerId, JSON.stringify([{ id: "model-a" }]), now);
}

function goalContent() {
  return {
    source: "MANUAL",
    originalGoal: "Create a result",
    statement: "Create a result",
    successCriteria: ["The result exists"],
    inScope: [],
    outOfScope: [],
    constraints: [],
    assumptions: [],
    deliverables: ["result"],
    riskLevel: "LOW",
    budget: {},
    stopConditions: [],
  };
}
