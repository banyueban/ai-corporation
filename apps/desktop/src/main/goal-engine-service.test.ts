import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  GoalEngineStartRequest,
  NormalizedGenerationResponse,
} from "@ai-corporation/protocols";
import {
  applyMigrations,
  GoalEngineRepository,
  loadMigrations,
} from "@ai-corporation/storage";
import { GoalEngineService } from "./goal-engine-service";

const migrationDirectory = fileURLToPath(
  new URL("../../../../packages/storage/migrations/", import.meta.url),
);
const workspaceId = "019fa9bb-6000-7d90-a4e3-a5b0eea2a9ef";
const corporationId = "019fa9bb-6001-7d90-a4e3-a5b0eea2a9ef";
const providerId = "019fa9bb-6002-7d90-a4e3-a5b0eea2a9ef";
const operationId = "019fa9bb-6003-7d90-a4e3-a5b0eea2a9ef";
const now = "2026-08-02T14:00:00.000Z";
let database: DatabaseSync;
let repository: GoalEngineRepository;

beforeEach(() => {
  database = new DatabaseSync(":memory:");
  applyMigrations(database, loadMigrations(migrationDirectory));
  seedFacts();
  repository = new GoalEngineRepository(database);
});

afterEach(() => database.close());

describe("GoalEngineService", () => {
  it("sends only disclosed fields and auto-saves one strict Provider result", async () => {
    const calls: unknown[] = [];
    const service = createService(async (request) => {
      calls.push(request);
      return response(validOutput([]), 11, 7);
    });
    const result = await service.start(startRequest());
    expect(result).toMatchObject({
      ok: true,
      value: {
        status: "GOAL_SAVED",
        goal: { source: "PROVIDER", version: 1 },
        usage: { inputTokens: 11, outputTokens: 7 },
      },
    });
    const serialized = JSON.stringify(calls);
    expect(serialized).toContain("Example Corporation");
    expect(serialized).toContain("Launch safely");
    expect(serialized).not.toContain("canonical-secret-path");
    expect(serialized).not.toContain("fake-key-material");
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM model_call").get(),
    ).toEqual({ count: 1 });
  });

  it("repairs invalid JSON exactly once and aggregates both calls", async () => {
    let count = 0;
    const service = createService(async () => {
      count += 1;
      return count === 1
        ? response("```json\n{}\n```", 3, 2)
        : response(validOutput([]), 4, 5);
    });
    const result = await service.start(startRequest());
    expect(count).toBe(2);
    expect(result).toMatchObject({
      ok: true,
      value: {
        status: "GOAL_SAVED",
        usage: { inputTokens: 7, outputTokens: 7 },
      },
    });
    expect(
      database
        .prepare("SELECT attempt, status FROM model_call ORDER BY attempt")
        .all(),
    ).toEqual([
      { attempt: 1, status: "SUCCEEDED" },
      { attempt: 2, status: "SUCCEEDED" },
    ]);
  });

  it("fails without a Goal after the one repair is also invalid", async () => {
    let count = 0;
    const service = createService(async () => {
      count += 1;
      return response("not json", 1, 1);
    });
    const result = await service.start(startRequest());
    expect(count).toBe(2);
    expect(result).toMatchObject({
      ok: true,
      value: { status: "FAILED", failureReason: "INVALID_MODEL_OUTPUT" },
    });
    expect(
      database
        .prepare("SELECT COUNT(*) AS count FROM goal_contract_version")
        .get(),
    ).toEqual({ count: 0 });
  });

  it("uses persisted question text and complete answer in the next generation", async () => {
    const payloads: string[] = [];
    let count = 0;
    const service = createService(async (request) => {
      payloads.push(JSON.stringify(request));
      count += 1;
      return count === 1
        ? response(validOutput(["Which market is first?"]))
        : response(validOutput([]));
    });
    const first = await service.start(startRequest());
    if (!first.ok) throw new Error("start failed");
    const question = first.value.questions[0];
    if (question === undefined) throw new Error("question missing");
    const answered = await service.answer({
      schemaVersion: "1.0",
      operationId,
      expectedOperationVersion: first.value.version,
      answers: [{ questionId: question.questionId, answer: "Germany" }],
    });
    expect(answered).toMatchObject({
      ok: true,
      value: { status: "GOAL_SAVED" },
    });
    expect(payloads[1]).toContain("Which market is first?");
    expect(payloads[1]).toContain("Germany");
  });
});

function createService(
  generate: (
    request: unknown,
    signal: AbortSignal,
  ) => Promise<NormalizedGenerationResponse>,
) {
  let uuidIndex = 0;
  return new GoalEngineService({
    clock: () => now,
    provider: { generate },
    repository,
    uuid: () =>
      `019fa9bb-${(6100 + uuidIndex++).toString()}-7d90-a4e3-a5b0eea2a9ef`,
  });
}

function startRequest(): GoalEngineStartRequest {
  return {
    schemaVersion: "1.0",
    operationId,
    corporationId,
    expectedCorporationVersion: 1,
    expectedGoalVersion: 0,
    providerId,
    expectedProviderVersion: 1,
    input: {
      originalGoal: "Launch safely",
      successCriteriaHints: ["First customer succeeds"],
    },
  };
}

function response(
  text: string,
  inputTokens = 2,
  outputTokens = 3,
): NormalizedGenerationResponse {
  return {
    modelId: "model-a",
    outputParts: [{ kind: "TEXT", text }],
    stopReason: "COMPLETED",
    usage: { inputTokens, outputTokens, costSource: "UNKNOWN" },
  };
}

function validOutput(questions: readonly string[]): string {
  return JSON.stringify({
    draft: {
      statement: "Launch safely in the selected market",
      successCriteria: ["First customer succeeds"],
      inScope: ["Initial launch"],
      outOfScope: [],
      constraints: [],
      assumptions: [],
      deliverables: ["Launch report"],
      riskLevel: "MEDIUM",
      budget: {},
      stopConditions: [],
    },
    unresolvedQuestions: questions.map((text) => ({ text, impact: "HIGH" })),
  });
}

function seedFacts(): void {
  database
    .prepare(
      `INSERT INTO workspace (
      id, name, display_path, canonical_root_path, platform,
      permission_mode, access_status, path_identity_json,
      last_verified_at, created_at, updated_at
    ) VALUES (?, 'Workspace', 'display', 'canonical-secret-path', 'windows',
      'READ_WRITE', 'AVAILABLE', '{}', ?, ?, ?)`,
    )
    .run(workspaceId, now, now, now);
  database
    .prepare(
      `INSERT INTO corporation (
      id, workspace_id, name, status, version, created_at, updated_at
    ) VALUES (?, ?, 'Example Corporation', 'DRAFT', 1, ?, ?)`,
    )
    .run(corporationId, workspaceId, now, now);
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
      new TextEncoder().encode("fake-key-material"),
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
