import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GoalEngineModelDraft } from "@ai-corporation/protocols";
import { applyMigrations, loadMigrations } from "./migrations";
import {
  GoalEngineRepository,
  GoalEngineStateConflictError,
} from "./goal-engine-repository";

const migrationDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);
const workspaceId = "019fa9bb-5000-7d90-a4e3-a5b0eea2a9ef";
const corporationId = "019fa9bb-5001-7d90-a4e3-a5b0eea2a9ef";
const providerId = "019fa9bb-5002-7d90-a4e3-a5b0eea2a9ef";
const operationId = "019fa9bb-5003-7d90-a4e3-a5b0eea2a9ef";
const now = "2026-08-02T12:00:00.000Z";
let database: DatabaseSync;
let repository: GoalEngineRepository;

beforeEach(() => {
  database = new DatabaseSync(":memory:");
  applyMigrations(database, loadMigrations(migrationDirectory));
  seedFacts();
  repository = new GoalEngineRepository(database);
});

afterEach(() => database.close());

describe("GoalEngineRepository", () => {
  it("persists clarification transcript and atomically saves a Provider Goal", () => {
    const started = repository.begin(beginInput());
    expect(started).toMatchObject({ status: "GENERATING", version: 1 });
    const questionId = "019fa9bb-5004-7d90-a4e3-a5b0eea2a9ef";
    const clarification = repository.saveStage({
      operationId,
      expectedVersion: 1,
      draft: draft(),
      questions: [
        { questionId, text: "Which market is first?", impact: "HIGH" },
      ],
      usage: { inputTokens: 10, outputTokens: 20, costSource: "UNKNOWN" },
      eventId: "019fa9bb-5005-7d90-a4e3-a5b0eea2a9ef",
      now,
    });
    expect(clarification).toMatchObject({
      status: "CLARIFICATION_REQUIRED",
      roundInCycle: 0,
      version: 2,
    });
    const generating = repository.beginAnswer({
      operationId,
      expectedVersion: 2,
      answers: [{ questionId, answer: "Germany" }],
      now,
    });
    expect(generating).toMatchObject({
      status: "GENERATING",
      roundInCycle: 1,
      answers: [{ question: "Which market is first?", answer: "Germany" }],
    });
    const saved = repository.saveStage({
      operationId,
      expectedVersion: 3,
      draft: draft(),
      questions: [],
      usage: { inputTokens: 25, outputTokens: 40, costSource: "UNKNOWN" },
      eventId: "019fa9bb-5006-7d90-a4e3-a5b0eea2a9ef",
      now,
    });
    expect(saved).toMatchObject({
      status: "GOAL_SAVED",
      goal: { version: 1, source: "PROVIDER", status: "DRAFT" },
    });
    expect(
      database
        .prepare(
          "SELECT version, active_goal_version FROM corporation WHERE id = ?",
        )
        .get(corporationId),
    ).toEqual({ version: 2, active_goal_version: 1 });
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM domain_event").get(),
    ).toEqual({ count: 1 });
    expect(
      database
        .prepare("SELECT COUNT(*) AS count FROM goal_contract_command")
        .get(),
    ).toEqual({ count: 1 });
  });

  it("enforces one active operation and interrupts generating calls on restart", () => {
    repository.begin(beginInput());
    expect(() =>
      repository.begin({
        ...beginInput(),
        operationId: "019fa9bb-5010-7d90-a4e3-a5b0eea2a9ef",
        requestHash: "b".repeat(64),
      }),
    ).toThrow(GoalEngineStateConflictError);
    const operation = repository.requiredInternal(operationId);
    repository.startModelCall({
      id: "019fa9bb-5011-7d90-a4e3-a5b0eea2a9ef",
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

  it("stops at five rounds and requires an explicit one-cycle extension", () => {
    repository.begin(beginInput());
    let questionId = "019fa9bb-5100-7d90-a4e3-a5b0eea2a9ef";
    let version = repository.saveStage({
      operationId,
      expectedVersion: 1,
      draft: draft(),
      questions: [{ questionId, text: "Initial question", impact: "HIGH" }],
      usage: { costSource: "UNKNOWN" },
      eventId: "019fa9bb-5020-7d90-a4e3-a5b0eea2a9ef",
      now,
    }).version;
    for (let round = 0; round < 5; round += 1) {
      const generating = repository.beginAnswer({
        operationId,
        expectedVersion: version,
        answers: [{ questionId, answer: `Answer ${round}` }],
        now,
      });
      version = generating.version;
      questionId = `019fa9bb-51${(round + 1).toString().padStart(2, "0")}-7d90-a4e3-a5b0eea2a9ef`;
      const stage = repository.saveStage({
        operationId,
        expectedVersion: version,
        draft: draft(),
        questions: [{ questionId, text: `Question ${round}`, impact: "HIGH" }],
        usage: { costSource: "UNKNOWN" },
        eventId: "019fa9bb-5020-7d90-a4e3-a5b0eea2a9ef",
        now,
      });
      version = stage.version;
    }
    const current = repository.getPublic(operationId);
    expect(current).toMatchObject({
      status: "EXTENSION_REQUIRED",
      roundInCycle: 5,
    });
    const continued = repository.continueCycle({
      operationId,
      expectedVersion: current.version,
      now,
    });
    expect(continued).toMatchObject({
      status: "CLARIFICATION_REQUIRED",
      cycleNumber: 2,
      roundInCycle: 0,
    });
  });
});

function beginInput() {
  return {
    operationId,
    corporationId,
    expectedCorporationVersion: 1,
    expectedGoalVersion: 0,
    providerId,
    expectedProviderVersion: 1,
    requestHash: "a".repeat(64),
    goalInput: { originalGoal: "Launch safely" },
    now,
  };
}

function draft(): GoalEngineModelDraft {
  return {
    statement: "Launch safely in Germany",
    successCriteria: ["First customer succeeds"],
    inScope: ["Germany"],
    outOfScope: [],
    constraints: [],
    assumptions: [],
    deliverables: ["Launch report"],
    riskLevel: "MEDIUM",
    budget: {},
    stopConditions: [],
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
      id, workspace_id, name, status, version, created_at, updated_at
    ) VALUES (?, ?, 'Example', 'DRAFT', 1, ?, ?)`,
    )
    .run(corporationId, workspaceId, now, now);
  const vaultId = "019fa9bb-5030-7d90-a4e3-a5b0eea2a9ef";
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
