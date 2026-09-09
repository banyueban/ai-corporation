import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PlannerDraftPublic } from "@ai-corporation/protocols";
import { applyMigrations, loadMigrations } from "./migrations";
import {
  PlanReviewRepository,
  PlanReviewStateConflictError,
} from "./plan-review-repository";

const migrationDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);
const workspaceId = "019fa9bb-7200-7d90-a4e3-a5b0eea2a9ef";
const corporationId = "019fa9bb-7201-7d90-a4e3-a5b0eea2a9ef";
const providerId = "019fa9bb-7202-7d90-a4e3-a5b0eea2a9ef";
const sourcePlanId = "019fa9bb-7203-7d90-a4e3-a5b0eea2a9ef";
const sourceTaskId = "019fa9bb-7204-7d90-a4e3-a5b0eea2a9ef";
const newPlanId = "019fa9bb-7205-7d90-a4e3-a5b0eea2a9ef";
const newTaskId = "019fa9bb-7206-7d90-a4e3-a5b0eea2a9ef";
const saveCommandId = "019fa9bb-7207-7d90-a4e3-a5b0eea2a9ef";
const approveCommandId = "019fa9bb-7208-7d90-a4e3-a5b0eea2a9ef";
const now = "2026-08-10T12:00:00.000Z";
let database: DatabaseSync;
let repository: PlanReviewRepository;

beforeEach(() => {
  database = new DatabaseSync(":memory:");
  applyMigrations(database, loadMigrations(migrationDirectory));
  seedFacts(database);
  repository = new PlanReviewRepository(database);
});

afterEach(() => database.close());

describe("PlanReviewRepository", () => {
  it("atomically supersedes the current Plan and saves one new version", () => {
    const source = repository.getCurrent(corporationId)!;
    const next = nextPlan(source);
    const saved = repository.saveVersion({
      commandId: saveCommandId,
      requestHash: "a".repeat(64),
      sourcePlan: source,
      newPlan: next,
      now,
    });

    expect(saved).toMatchObject({
      planId: newPlanId,
      planVersion: 2,
      supersedesPlanId: sourcePlanId,
      status: "DRAFT",
      validationStatus: "PENDING",
    });
    expect(repository.listVersions(corporationId)).toMatchObject([
      { planId: newPlanId, status: "DRAFT" },
      { planId: sourcePlanId, status: "SUPERSEDED" },
    ]);
    expect(
      repository.saveVersion({
        commandId: saveCommandId,
        requestHash: "a".repeat(64),
        sourcePlan: source,
        newPlan: next,
        now,
      }),
    ).toEqual(saved);
    expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("approves only the current VALIDATED/VALID Plan and freezes it", () => {
    const approved = repository.approve({
      commandId: approveCommandId,
      corporationId,
      planId: sourcePlanId,
      expectedPlanVersion: 1,
      requestHash: "b".repeat(64),
      now,
    });
    expect(approved).toMatchObject({
      status: "APPROVED",
      validationStatus: "VALID",
      approvedAt: now,
    });
    expect(
      repository.approve({
        commandId: approveCommandId,
        corporationId,
        planId: sourcePlanId,
        expectedPlanVersion: 1,
        requestHash: "b".repeat(64),
        now,
      }),
    ).toEqual(approved);
    expect(() =>
      repository.approve({
        commandId: "019fa9bb-7209-7d90-a4e3-a5b0eea2a9ef",
        corporationId,
        planId: sourcePlanId,
        expectedPlanVersion: 1,
        requestHash: "c".repeat(64),
        now,
      }),
    ).toThrow(PlanReviewStateConflictError);
    expect(
      database
        .prepare("SELECT status FROM corporation WHERE id = ?")
        .get(corporationId),
    ).toEqual({ status: "DRAFT" });
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM task").get(),
    ).toEqual({
      count: 0,
    });
  });

  it("rolls back superseding the source when the new Plan cannot be inserted", () => {
    const source = repository.getCurrent(corporationId)!;
    const broken = {
      ...nextPlan(source),
      provider: {
        ...nextPlan(source).provider,
        providerId: "019fa9bb-7298-7d90-a4e3-a5b0eea2a9ef",
      },
    };

    expect(() =>
      repository.saveVersion({
        commandId: saveCommandId,
        requestHash: "a".repeat(64),
        sourcePlan: source,
        newPlan: broken,
        now,
      }),
    ).toThrow();
    expect(repository.getCurrent(corporationId)).toEqual(source);
    expect(repository.listVersions(corporationId)).toEqual([source]);
  });
});

function seedFacts(target: DatabaseSync) {
  target
    .prepare(
      `INSERT INTO workspace (
        id, name, display_path, canonical_root_path, platform,
        permission_mode, access_status, path_identity_json,
        created_at, updated_at
      ) VALUES (?, 'M2-TU-08', 'E:\\m2-tu-08', '\\\\?\\E:\\m2-tu-08',
        'windows', 'READ_WRITE', 'AVAILABLE', '{}', ?, ?)`,
    )
    .run(workspaceId, now, now);
  target
    .prepare(
      `INSERT INTO corporation (
        id, workspace_id, name, status, version, created_at, updated_at
      ) VALUES (?, ?, 'Plan Review', 'DRAFT', 1, ?, ?)`,
    )
    .run(corporationId, workspaceId, now, now);
  const goalContent = {
    goal: "Create result",
    successCriteria: ["Result exists"],
    deliverables: ["result"],
    constraints: [],
    assumptions: [],
    nonGoals: [],
    budget: { maxCostMicros: "1000000", maxDurationMs: 60000, maxRevisions: 1 },
  };
  target
    .prepare(
      `INSERT INTO goal_contract_version (
        corporation_id, version, status, source, content_json,
        created_by, created_at, approved_at
      ) VALUES (?, 1, 'DRAFT', 'MANUAL', ?, 'local-user', ?, NULL)`,
    )
    .run(corporationId, JSON.stringify(goalContent), now);
  target
    .prepare("UPDATE corporation SET active_goal_version = 1 WHERE id = ?")
    .run(corporationId);
  target
    .prepare(
      `UPDATE goal_contract_version SET status = 'APPROVED', approved_at = ?
       WHERE corporation_id = ? AND version = 1`,
    )
    .run(now, corporationId);
  target
    .prepare(
      `INSERT INTO provider (
        id, type, name, endpoint, config_json, config_status,
        version, created_at, updated_at
      ) VALUES (?, 'OPENAI_COMPATIBLE', 'Mock', 'https://example.test', '{}',
        'ENABLED', 1, ?, ?)`,
    )
    .run(providerId, now, now);
  const plan = sourcePlan();
  target
    .prepare(
      `INSERT INTO task_plan (
        id, corporation_id, goal_version, version, status,
        validation_status, summary, draft_json, provider_id,
        provider_version, model_id, created_by_operation_id,
        validation_report_json, validator_version, validated_draft_hash,
        validated_at, supersedes_plan_id, approved_at, created_at
      ) VALUES (?, ?, 1, 1, 'VALIDATED', 'VALID', ?, ?, ?, 1, 'model-a',
        '019fa9bb-7299-7d90-a4e3-a5b0eea2a9ef', ?, '1.0', ?, ?, NULL, NULL, ?)`,
    )
    .run(
      sourcePlanId,
      corporationId,
      plan.summary,
      JSON.stringify(plan),
      providerId,
      JSON.stringify(plan.validationReport),
      "d".repeat(64),
      now,
      now,
    );
}

function sourcePlan(): PlannerDraftPublic {
  return {
    schemaVersion: "1.0",
    planId: sourcePlanId,
    corporationId,
    planVersion: 1,
    goalVersion: 1,
    status: "VALIDATED",
    validationStatus: "VALID",
    validationReport: {
      schemaVersion: "1.0",
      validatorVersion: "1.0",
      planId: sourcePlanId,
      planVersion: 1,
      status: "VALID",
      issues: [],
      warnings: [],
      validatedAt: now,
    },
    summary: "Create result",
    tasks: [task(sourceTaskId)],
    dependencies: [],
    milestones: [{ title: "Done", taskLocalIds: ["task-one"] }],
    assumptions: [],
    risks: [],
    provider: { providerId, providerVersion: 1, model: "model-a" },
    usage: { costSource: "UNKNOWN" },
    createdAt: now,
  };
}

function nextPlan(source: PlannerDraftPublic): PlannerDraftPublic {
  return {
    ...source,
    planId: newPlanId,
    planVersion: 2,
    status: "DRAFT",
    validationStatus: "PENDING",
    validationReport: undefined,
    tasks: [task(newTaskId)],
    supersedesPlanId: sourcePlanId,
    createdAt: now,
  };
}

function task(id: string): PlannerDraftPublic["tasks"][number] {
  return {
    id,
    localId: "task-one",
    title: "Create result",
    objective: "Create the result",
    kind: "GENERATION",
    priority: 50,
    riskLevel: "LOW",
    suggestedRole: "Writer",
    requiredCapabilities: [],
    requiredTools: [],
    inputs: [{ source: "GOAL_CONTRACT", logicalName: "goal", required: true }],
    expectedOutputs: [
      {
        logicalName: "result",
        mediaType: "text/plain",
        required: true,
        description: "Result",
      },
    ],
    acceptanceCriteria: [
      {
        localId: "criterion-result",
        description: "Result exists",
        severity: "REQUIRED",
        evidenceRequired: ["result"],
      },
    ],
    budget: { maxDurationMs: 1000 },
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
  };
}
