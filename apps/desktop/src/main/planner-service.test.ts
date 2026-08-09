import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  NormalizedGenerationRequest,
  NormalizedGenerationResponse,
  PlannerStartRequest,
} from "@ai-corporation/protocols";
import {
  applyMigrations,
  loadMigrations,
  PlannerRepository,
} from "@ai-corporation/storage";
import { ProviderAdapterError } from "@ai-corporation/providers";
import { PlannerService } from "./planner-service";

const migrationDirectory = fileURLToPath(
  new URL("../../../../packages/storage/migrations/", import.meta.url),
);
const workspaceId = "019fa9bb-7000-7d90-a4e3-a5b0eea2a9ef";
const corporationId = "019fa9bb-7001-7d90-a4e3-a5b0eea2a9ef";
const providerId = "019fa9bb-7002-7d90-a4e3-a5b0eea2a9ef";
const operationId = "019fa9bb-7003-7d90-a4e3-a5b0eea2a9ef";
const now = "2026-08-09T14:00:00.000Z";
let database: DatabaseSync;
let repository: PlannerRepository;

beforeEach(() => {
  database = new DatabaseSync(":memory:");
  applyMigrations(database, loadMigrations(migrationDirectory));
  seedFacts();
  repository = new PlannerRepository(database);
});

afterEach(() => database.close());

describe("PlannerService", () => {
  it("sends only the approved Goal and allowlisted catalogs, then saves a pending draft", async () => {
    const calls: unknown[] = [];
    const service = createService(async (request) => {
      calls.push(request);
      return response(validOutput(), 11, 7);
    });
    const result = await service.start(startRequest());

    expect(result).toMatchObject({
      ok: true,
      value: {
        status: "PLAN_SAVED",
        usage: { inputTokens: 11, outputTokens: 7 },
        plan: {
          status: "DRAFT",
          validationStatus: "PENDING",
          tasks: [{ localId: "task-one", suggestedRole: "Writer" }],
        },
      },
    });
    const serialized = JSON.stringify(calls);
    expect(serialized).toContain("Create a safe report");
    expect(serialized).toContain("writing.document");
    expect(serialized).not.toContain("canonical-secret-path");
    expect(serialized).not.toContain("fake-key-material");
    expect(calls[0]).toMatchObject({
      generation: {
        maxOutputTokens: 65_536,
        outputFormat: "JSON_OBJECT",
        temperature: 0,
      },
    });
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM model_call").get(),
    ).toEqual({
      count: 1,
    });
  });

  it("repairs invalid JSON exactly once using USER data and aggregates usage", async () => {
    let count = 0;
    const calls: Array<{
      readonly generation: Pick<NormalizedGenerationRequest, "input">;
    }> = [];
    const service = createService(async (request) => {
      calls.push(
        request as {
          readonly generation: Pick<NormalizedGenerationRequest, "input">;
        },
      );
      count += 1;
      return count === 1
        ? response("```json\n{}\n```", 3, 2)
        : response(validOutput(), 4, 5);
    });
    const result = await service.start(startRequest());

    expect(count).toBe(2);
    expect(calls[1]?.generation.input.map(({ actor }) => actor)).toEqual([
      "SYSTEM",
      "USER",
      "USER",
    ]);
    expect(JSON.stringify(calls[1])).not.toContain('"actor":"ASSISTANT"');
    expect(JSON.stringify(calls[1])).toContain("untrusted data to correct");
    expect(JSON.stringify(calls[1])).toContain("root:invalid_json");
    expect(result).toMatchObject({
      ok: true,
      value: {
        status: "PLAN_SAVED",
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

  it("fails without a task_plan after the one repair is also invalid", async () => {
    let count = 0;
    const service = createService(async () => {
      count += 1;
      return response("not-json", 1, 1);
    });
    const result = await service.start(startRequest());
    expect(count).toBe(2);
    expect(result).toMatchObject({
      ok: true,
      value: { status: "FAILED", failureReason: "INVALID_MODEL_OUTPUT" },
    });
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM task_plan").get(),
    ).toEqual({
      count: 0,
    });
    const metadata = database
      .prepare("SELECT response_meta_json FROM model_call ORDER BY attempt")
      .all()
      .map((row) => JSON.parse(String(row.response_meta_json)));
    expect(metadata).toEqual([
      { schemaVersion: 1, modelOutputDiagnostic: "INVALID_JSON" },
      { schemaVersion: 1, modelOutputDiagnostic: "INVALID_JSON" },
    ]);
  });

  it("gives the one repair safe canonical enum values without accepting private dialects", async () => {
    const calls: unknown[] = [];
    let count = 0;
    const service = createService(async (request) => {
      calls.push(request);
      count += 1;
      if (count === 2) return response(validOutput());
      const invalid = JSON.parse(validOutput()) as {
        tasks: Array<{ inputs: Array<{ source: string }> }>;
        dependencies: unknown[];
      };
      invalid.tasks[0]!.inputs[0]!.source = "PREVIOUS_TASK";
      invalid.dependencies = [
        {
          upstreamLocalId: "task-one",
          downstreamLocalId: "task-one",
          condition: "COMPLETED",
        },
      ];
      return response(JSON.stringify(invalid));
    });

    const result = await service.start(startRequest());

    expect(result).toMatchObject({ ok: true, value: { status: "PLAN_SAVED" } });
    const repairRequest = JSON.stringify(calls[1]);
    expect(repairRequest).toContain(
      "tasks.0.inputs.0.source:invalid_value:allowed=GOAL_CONTRACT|TASK_OUTPUT",
    );
    expect(repairRequest).toContain(
      "dependencies.0.condition:invalid_value:allowed=ON_SUCCESS",
    );
  });

  it("records normalized Provider failure without remote text", async () => {
    const service = createService(async () => {
      throw new ProviderAdapterError(
        { reason: "PROVIDER_INTERNAL", retryable: false },
        "HTTP_SERVER_ERROR",
      );
    });
    const result = await service.start(startRequest());
    expect(result).toMatchObject({
      ok: true,
      value: { status: "FAILED", failureReason: "PROVIDER_FAILURE" },
    });
    expect(
      database
        .prepare(
          "SELECT status, failure_reason, response_meta_json FROM model_call",
        )
        .get(),
    ).toEqual({
      status: "FAILED",
      failure_reason: "PROVIDER_INTERNAL",
      response_meta_json:
        '{"schemaVersion":1,"failureDiagnostic":"HTTP_SERVER_ERROR"}',
    });
  });

  it("cancels the active request and ignores its late completion", async () => {
    let release: (() => void) | undefined;
    const service = createService(
      (_request, signal) =>
        new Promise<NormalizedGenerationResponse>((resolve, reject) => {
          release = () => resolve(response(validOutput()));
          signal.addEventListener("abort", () => {
            reject(
              new ProviderAdapterError(
                { reason: "CANCELLED", retryable: false },
                undefined,
              ),
            );
          });
        }),
    );
    const pending = service.start(startRequest());
    await Promise.resolve();
    const cancelled = service.cancel({ schemaVersion: "1.0", operationId });
    release?.();
    const completed = await pending;
    expect(cancelled).toMatchObject({
      ok: true,
      value: { status: "CANCELLED" },
    });
    expect(completed).toMatchObject({
      ok: true,
      value: { status: "CANCELLED" },
    });
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM task_plan").get(),
    ).toEqual({
      count: 0,
    });
  });

  it("ends as a version-conflict failure when bound facts change before save", async () => {
    const service = createService(async () => {
      database
        .prepare("UPDATE corporation SET version = version + 1 WHERE id = ?")
        .run(corporationId);
      return response(validOutput());
    });

    const result = await service.start(startRequest());

    expect(result).toMatchObject({
      ok: true,
      value: { status: "FAILED", failureReason: "VERSION_CONFLICT" },
    });
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM task_plan").get(),
    ).toEqual({
      count: 0,
    });
  });
});

function createService(
  generate: (
    request: unknown,
    signal: AbortSignal,
  ) => Promise<NormalizedGenerationResponse>,
) {
  let uuidIndex = 0;
  return new PlannerService({
    clock: () => now,
    provider: { generate },
    repository,
    uuid: () =>
      `019fa9bb-${(7100 + uuidIndex++).toString()}-7d90-a4e3-a5b0eea2a9ef`,
  });
}

function startRequest(): PlannerStartRequest {
  return {
    schemaVersion: "1.0",
    operationId,
    corporationId,
    expectedCorporationVersion: 3,
    goalVersion: 1,
    providerId,
    expectedProviderVersion: 1,
    modelId: "model-a",
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

function validOutput(): string {
  return JSON.stringify({
    schemaVersion: "1.0",
    summary: "Create one verifiable report.",
    tasks: [
      {
        localId: "task-one",
        title: "Create report",
        objective: "Create the requested report.",
        kind: "GENERATION",
        priority: 50,
        riskLevel: "LOW",
        suggestedRole: "Writer",
        requiredCapabilities: [
          { path: "writing.document", minimumLevel: 0.7, mandatory: true },
        ],
        requiredTools: ["workspace.propose_write"],
        inputs: [
          {
            source: "GOAL_CONTRACT",
            logicalName: "approved-goal",
            required: true,
          },
        ],
        expectedOutputs: [
          {
            logicalName: "report",
            mediaType: "text/markdown",
            required: true,
            description: "Requested report.",
          },
        ],
        acceptanceCriteria: [
          {
            localId: "criterion-report",
            description: "The report matches the approved Goal.",
            severity: "REQUIRED",
            evidenceRequired: ["report"],
          },
        ],
        budget: { maxOutputTokens: 4096 },
        retryPolicy: {
          maxAttempts: 2,
          maxEvaluationRevisions: 1,
          retryableCategories: ["provider"],
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
    milestones: [{ title: "Delivery", taskLocalIds: ["task-one"] }],
    assumptions: [],
    risks: [
      {
        description: "Revision may be needed.",
        level: "LOW",
        mitigation: "Validate against explicit criteria.",
      },
    ],
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
    .run(
      corporationId,
      JSON.stringify({
        source: "MANUAL",
        originalGoal: "Create a safe report",
        statement: "Create a safe report",
        successCriteria: ["The report is verifiable"],
        inScope: [],
        outOfScope: [],
        constraints: [],
        assumptions: [],
        deliverables: ["report"],
        riskLevel: "LOW",
        budget: {},
        stopConditions: [],
      }),
      now,
    );
  database
    .prepare("UPDATE corporation SET active_goal_version = 1 WHERE id = ?")
    .run(corporationId);
  database
    .prepare(
      `UPDATE goal_contract_version SET status = 'APPROVED', approved_at = ?
       WHERE corporation_id = ? AND version = 1`,
    )
    .run(now, corporationId);

  const vaultId = "019fa9bb-7030-7d90-a4e3-a5b0eea2a9ef";
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
