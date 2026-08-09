import { DatabaseSync } from "node:sqlite";
import {
  goalContractContentInputSchema,
  normalizedUsageSchema,
  plannerDraftCandidateSchema,
  plannerDraftPublicSchema,
  plannerOperationPublicSchema,
  type GoalContractContentInput,
  type NormalizedUsage,
  type PlannerDraftCandidate,
  type PlannerDraftPublic,
  type PlannerFailureReason,
  type PlannerOperationPublic,
  type ProviderFailureDiagnostic,
} from "@ai-corporation/protocols";

export class PlannerNotFoundError extends Error {}
export class PlannerVersionConflictError extends Error {}
export class PlannerStateConflictError extends Error {}
export class PlannerCommandConflictError extends Error {}
export class PlannerProviderUnavailableError extends Error {}
export class PlannerDataError extends Error {}

export interface PlannerStoredOperation {
  readonly corporationId: string;
  readonly expectedCorporationVersion: number;
  readonly goal: GoalContractContentInput;
  readonly goalVersion: number;
  readonly modelId: string;
  readonly operationId: string;
  readonly providerId: string;
  readonly providerVersion: number;
  readonly requestHash: string;
  readonly status: PlannerOperationPublic["status"];
  readonly usage: NormalizedUsage;
  readonly version: number;
}

export class PlannerRepository {
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  begin(input: {
    readonly operationId: string;
    readonly corporationId: string;
    readonly expectedCorporationVersion: number;
    readonly goalVersion: number;
    readonly providerId: string;
    readonly expectedProviderVersion: number;
    readonly modelId: string;
    readonly requestHash: string;
    readonly now: string;
  }): PlannerStoredOperation {
    const existing = this.#readInternal(input.operationId);
    if (existing !== undefined) {
      if (existing.requestHash !== input.requestHash) {
        throw new PlannerCommandConflictError();
      }
      return existing;
    }

    const context = this.#startContext(
      input.corporationId,
      input.goalVersion,
      input.providerId,
    );
    if (
      context.corporationVersion !== input.expectedCorporationVersion ||
      context.activeGoalVersion !== input.goalVersion ||
      context.providerVersion !== input.expectedProviderVersion
    ) {
      throw new PlannerVersionConflictError();
    }
    if (
      context.corporationStatus !== "DRAFT" ||
      context.goalStatus !== "APPROVED" ||
      context.hasActivePlan
    ) {
      throw new PlannerStateConflictError();
    }
    if (
      context.providerStatus !== "ENABLED" ||
      !context.hasKey ||
      context.connectionStatus !== "VERIFIED" ||
      context.selectedModelId !== input.modelId ||
      !context.models.includes(input.modelId)
    ) {
      throw new PlannerProviderUnavailableError();
    }

    try {
      this.#database
        .prepare(
          `INSERT INTO planner_generation_operation (
            operation_id, corporation_id, request_hash,
            expected_corporation_version, goal_version,
            provider_id, provider_version, model_id, status, version,
            usage_json, failure_reason, created_at, updated_at,
            completed_at, saved_plan_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'GENERATING', 1,
            ?, NULL, ?, ?, NULL, NULL)`,
        )
        .run(
          input.operationId,
          input.corporationId,
          input.requestHash,
          input.expectedCorporationVersion,
          input.goalVersion,
          input.providerId,
          input.expectedProviderVersion,
          input.modelId,
          JSON.stringify({ costSource: "UNKNOWN" }),
          input.now,
          input.now,
        );
      return this.#readRequired(input.operationId);
    } catch (error) {
      if (isConstraint(error)) throw new PlannerStateConflictError();
      throw new PlannerDataError();
    }
  }

  getCurrent(corporationId: string): PlannerOperationPublic | undefined {
    const row = this.#database
      .prepare(
        `SELECT operation_id FROM planner_generation_operation
         WHERE corporation_id = ?
         ORDER BY updated_at DESC, operation_id DESC LIMIT 1`,
      )
      .get(corporationId);
    if (row === undefined) return undefined;
    return this.getPublic(stringValue(row.operation_id));
  }

  getPublic(operationId: string): PlannerOperationPublic {
    const row = this.#database
      .prepare(
        `SELECT operation_id, corporation_id, provider_id, provider_version,
          model_id, status, version, usage_json, failure_reason,
          saved_plan_id, updated_at
         FROM planner_generation_operation WHERE operation_id = ?`,
      )
      .get(operationId);
    if (row === undefined) throw new PlannerNotFoundError();
    try {
      const plan =
        row.saved_plan_id === null
          ? undefined
          : this.#readPlan(stringValue(row.saved_plan_id));
      return plannerOperationPublicSchema.parse({
        schemaVersion: "1.0",
        operationId: row.operation_id,
        corporationId: row.corporation_id,
        providerId: row.provider_id,
        providerVersion: row.provider_version,
        modelId: row.model_id,
        status: row.status,
        version: row.version,
        usage: normalizedUsageSchema.parse(parseJson(row.usage_json)),
        ...(row.failure_reason === null
          ? {}
          : { failureReason: row.failure_reason }),
        ...(plan === undefined ? {} : { plan }),
        updatedAt: row.updated_at,
      });
    } catch (error) {
      if (error instanceof PlannerNotFoundError) throw error;
      throw new PlannerDataError();
    }
  }

  savePlan(input: {
    readonly operation: PlannerStoredOperation;
    readonly candidate: PlannerDraftCandidate;
    readonly planId: string;
    readonly taskIds: readonly string[];
    readonly usage: NormalizedUsage;
    readonly now: string;
  }): PlannerOperationPublic {
    const candidate = plannerDraftCandidateSchema.parse(input.candidate);
    if (input.taskIds.length !== candidate.tasks.length) {
      throw new PlannerDataError();
    }
    const draft = plannerDraftPublicSchema.parse({
      schemaVersion: "1.0",
      planId: input.planId,
      corporationId: input.operation.corporationId,
      planVersion: 1,
      goalVersion: input.operation.goalVersion,
      status: "DRAFT",
      validationStatus: "PENDING",
      summary: candidate.summary,
      tasks: candidate.tasks.map((task, index) => ({
        ...task,
        id: input.taskIds[index],
      })),
      dependencies: candidate.dependencies,
      milestones: candidate.milestones,
      assumptions: candidate.assumptions,
      risks: candidate.risks,
      provider: {
        providerId: input.operation.providerId,
        providerVersion: input.operation.providerVersion,
        model: input.operation.modelId,
      },
      usage: input.usage,
      createdAt: input.now,
    });

    this.#database.exec("BEGIN IMMEDIATE");
    try {
      if (!this.#factsUnchanged(input.operation)) {
        throw new PlannerVersionConflictError();
      }
      const activePlan = this.#database
        .prepare(
          `SELECT 1 AS found FROM task_plan
           WHERE corporation_id = ? AND status <> 'SUPERSEDED' LIMIT 1`,
        )
        .get(input.operation.corporationId);
      if (activePlan !== undefined) throw new PlannerStateConflictError();

      this.#database
        .prepare(
          `INSERT INTO task_plan (
            id, corporation_id, goal_version, version, status,
            validation_status, summary, draft_json, provider_id,
            provider_version, model_id, created_by_operation_id, created_at
          ) VALUES (?, ?, ?, 1, 'DRAFT', 'PENDING', ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          draft.planId,
          draft.corporationId,
          draft.goalVersion,
          draft.summary,
          JSON.stringify(draft),
          draft.provider.providerId,
          draft.provider.providerVersion,
          draft.provider.model,
          input.operation.operationId,
          input.now,
        );
      const updated = this.#database
        .prepare(
          `UPDATE planner_generation_operation
           SET status = 'PLAN_SAVED', version = version + 1,
             usage_json = ?, completed_at = ?, updated_at = ?, saved_plan_id = ?
           WHERE operation_id = ? AND status = 'GENERATING' AND version = ?`,
        )
        .run(
          JSON.stringify(input.usage),
          input.now,
          input.now,
          draft.planId,
          input.operation.operationId,
          input.operation.version,
        );
      if (updated.changes !== 1) throw new PlannerVersionConflictError();
      this.#database.exec("COMMIT");
      return this.getPublic(input.operation.operationId);
    } catch (error) {
      this.#database.exec("ROLLBACK");
      if (
        error instanceof PlannerVersionConflictError ||
        error instanceof PlannerStateConflictError
      ) {
        throw error;
      }
      throw new PlannerDataError();
    }
  }

  fail(input: {
    readonly operationId: string;
    readonly expectedVersion: number;
    readonly failureReason: PlannerFailureReason;
    readonly usage: NormalizedUsage;
    readonly now: string;
  }): PlannerOperationPublic {
    const updated = this.#database
      .prepare(
        `UPDATE planner_generation_operation
         SET status = 'FAILED', version = version + 1, failure_reason = ?,
           usage_json = ?, completed_at = ?, updated_at = ?
         WHERE operation_id = ? AND status = 'GENERATING' AND version = ?`,
      )
      .run(
        input.failureReason,
        JSON.stringify(input.usage),
        input.now,
        input.now,
        input.operationId,
        input.expectedVersion,
      );
    if (updated.changes !== 1) throw new PlannerVersionConflictError();
    return this.getPublic(input.operationId);
  }

  cancel(operationId: string, now: string): PlannerOperationPublic {
    const updated = this.#database
      .prepare(
        `UPDATE planner_generation_operation
         SET status = 'CANCELLED', version = version + 1,
           completed_at = ?, updated_at = ?
         WHERE operation_id = ? AND status = 'GENERATING'`,
      )
      .run(now, now, operationId);
    if (updated.changes !== 1) {
      const current = this.#readInternal(operationId);
      if (current === undefined) throw new PlannerNotFoundError();
      if (current.status !== "CANCELLED") throw new PlannerStateConflictError();
    }
    return this.getPublic(operationId);
  }

  interruptGenerating(now: string): number {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      this.#database
        .prepare(
          `UPDATE model_call SET status = 'INTERRUPTED', ended_at = ?
           WHERE status = 'STARTED' AND purpose = 'PLAN_GENERATION'
             AND operation_id IN (
               SELECT operation_id FROM planner_generation_operation
               WHERE status = 'GENERATING'
             )`,
        )
        .run(now);
      const updated = this.#database
        .prepare(
          `UPDATE planner_generation_operation
           SET status = 'INTERRUPTED', version = version + 1,
             completed_at = ?, updated_at = ?
           WHERE status = 'GENERATING'`,
        )
        .run(now, now);
      this.#database.exec("COMMIT");
      return Number(updated.changes);
    } catch {
      this.#database.exec("ROLLBACK");
      throw new PlannerDataError();
    }
  }

  startModelCall(input: {
    readonly id: string;
    readonly operation: PlannerStoredOperation;
    readonly attempt: number;
    readonly repair: boolean;
    readonly now: string;
  }): void {
    this.#database
      .prepare(
        `INSERT INTO model_call (
          id, corporation_id, operation_id, purpose, task_id, run_id,
          provider_id, provider_version, model_id, attempt, status,
          request_meta_json, response_meta_json, usage_json, failure_reason,
          started_at, ended_at
        ) VALUES (?, ?, ?, 'PLAN_GENERATION', NULL, NULL, ?, ?, ?, ?,
          'STARTED', ?, NULL, ?, NULL, ?, NULL)`,
      )
      .run(
        input.id,
        input.operation.corporationId,
        input.operation.operationId,
        input.operation.providerId,
        input.operation.providerVersion,
        input.operation.modelId,
        input.attempt,
        JSON.stringify({ schemaVersion: 1, repair: input.repair }),
        JSON.stringify({ costSource: "UNKNOWN" }),
        input.now,
      );
  }

  finishModelCall(input: {
    readonly id: string;
    readonly status: "SUCCEEDED" | "FAILED" | "CANCELLED";
    readonly usage: NormalizedUsage;
    readonly failureReason?: string;
    readonly failureDiagnostic?: ProviderFailureDiagnostic;
    readonly now: string;
  }): void {
    const updated = this.#database
      .prepare(
        `UPDATE model_call SET status = ?, response_meta_json = ?,
          usage_json = ?, failure_reason = ?, ended_at = ?
         WHERE id = ? AND status = 'STARTED'`,
      )
      .run(
        input.status,
        JSON.stringify({
          schemaVersion: 1,
          ...(input.failureDiagnostic === undefined
            ? {}
            : { failureDiagnostic: input.failureDiagnostic }),
        }),
        JSON.stringify(input.usage),
        input.failureReason ?? null,
        input.now,
        input.id,
      );
    if (updated.changes !== 1) throw new PlannerVersionConflictError();
  }

  recordModelOutputDiagnostic(input: {
    readonly id: string;
    readonly diagnostic:
      "INVALID_JSON" | "SCHEMA_INVALID" | "RESPONSE_TOO_LARGE";
  }): void {
    const updated = this.#database
      .prepare(
        `UPDATE model_call
         SET response_meta_json = json_set(
           response_meta_json, '$.modelOutputDiagnostic', ?
         )
         WHERE id = ? AND status = 'SUCCEEDED'`,
      )
      .run(input.diagnostic, input.id);
    if (updated.changes !== 1) throw new PlannerVersionConflictError();
  }

  nextAttempt(operationId: string): number {
    const row = this.#database
      .prepare(
        `SELECT COALESCE(MAX(attempt), 0) AS value
         FROM model_call WHERE operation_id = ?`,
      )
      .get(operationId);
    if (typeof row?.value !== "number") throw new PlannerDataError();
    return row.value + 1;
  }

  #readPlan(planId: string): PlannerDraftPublic {
    const row = this.#database
      .prepare("SELECT draft_json FROM task_plan WHERE id = ?")
      .get(planId);
    if (row === undefined) throw new PlannerNotFoundError();
    return plannerDraftPublicSchema.parse(parseJson(row.draft_json));
  }

  #readRequired(operationId: string): PlannerStoredOperation {
    const operation = this.#readInternal(operationId);
    if (operation === undefined) throw new PlannerNotFoundError();
    return operation;
  }

  #readInternal(operationId: string): PlannerStoredOperation | undefined {
    const row = this.#database
      .prepare(
        `SELECT o.operation_id, o.corporation_id, o.request_hash,
          o.expected_corporation_version, o.goal_version,
          o.provider_id, o.provider_version, o.model_id, o.status,
          o.version, o.usage_json, g.content_json
         FROM planner_generation_operation o
         INNER JOIN goal_contract_version g
           ON g.corporation_id = o.corporation_id AND g.version = o.goal_version
         WHERE o.operation_id = ?`,
      )
      .get(operationId);
    if (row === undefined) return undefined;
    try {
      return {
        operationId: stringValue(row.operation_id),
        corporationId: stringValue(row.corporation_id),
        requestHash: stringValue(row.request_hash),
        expectedCorporationVersion: numberValue(
          row.expected_corporation_version,
        ),
        goalVersion: numberValue(row.goal_version),
        providerId: stringValue(row.provider_id),
        providerVersion: numberValue(row.provider_version),
        modelId: stringValue(row.model_id),
        status: plannerOperationPublicSchema.shape.status.parse(row.status),
        version: numberValue(row.version),
        usage: normalizedUsageSchema.parse(parseJson(row.usage_json)),
        goal: goalContractContentInputSchema.parse(parseJson(row.content_json)),
      };
    } catch {
      throw new PlannerDataError();
    }
  }

  #startContext(
    corporationId: string,
    goalVersion: number,
    providerId: string,
  ) {
    const row = this.#database
      .prepare(
        `SELECT c.status AS corporation_status, c.version AS corporation_version,
          c.active_goal_version, g.status AS goal_status,
          p.version AS provider_version, p.config_status AS provider_status,
          p.selected_model_id, p.key_vault_entry_id,
          t.status AS connection_status, t.models_json,
          EXISTS(
            SELECT 1 FROM task_plan current_plan
            WHERE current_plan.corporation_id = c.id
              AND current_plan.status <> 'SUPERSEDED'
          ) AS has_active_plan
         FROM corporation c
         INNER JOIN goal_contract_version g
           ON g.corporation_id = c.id AND g.version = ?
         INNER JOIN provider p ON p.id = ?
         LEFT JOIN provider_connection_test t ON t.provider_id = p.id
           AND t.provider_version = p.version
         WHERE c.id = ?`,
      )
      .get(goalVersion, providerId, corporationId);
    if (row === undefined) throw new PlannerNotFoundError();
    let models: string[];
    try {
      const parsed = parseJson(row.models_json ?? "[]");
      if (!Array.isArray(parsed)) throw new Error();
      models = parsed.flatMap((value) =>
        typeof value === "object" &&
        value !== null &&
        "id" in value &&
        typeof value.id === "string"
          ? [value.id]
          : [],
      );
    } catch {
      throw new PlannerDataError();
    }
    return {
      corporationStatus: stringValue(row.corporation_status),
      corporationVersion: numberValue(row.corporation_version),
      activeGoalVersion: numberValue(row.active_goal_version),
      goalStatus: stringValue(row.goal_status),
      providerVersion: numberValue(row.provider_version),
      providerStatus: stringValue(row.provider_status),
      selectedModelId:
        row.selected_model_id === null
          ? undefined
          : stringValue(row.selected_model_id),
      hasKey: row.key_vault_entry_id !== null,
      connectionStatus:
        row.connection_status === null
          ? undefined
          : stringValue(row.connection_status),
      models,
      hasActivePlan: row.has_active_plan === 1,
    };
  }

  #factsUnchanged(operation: PlannerStoredOperation): boolean {
    const row = this.#database
      .prepare(
        `SELECT EXISTS(
          SELECT 1 FROM corporation c
          INNER JOIN goal_contract_version g
            ON g.corporation_id = c.id AND g.version = ?
          INNER JOIN provider p ON p.id = ?
          WHERE c.id = ? AND c.version = ? AND c.status = 'DRAFT'
            AND c.active_goal_version = ? AND g.status = 'APPROVED'
            AND p.version = ? AND p.config_status = 'ENABLED'
            AND p.selected_model_id = ? AND p.key_vault_entry_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM provider_connection_test t
              WHERE t.provider_id = p.id AND t.provider_version = p.version
                AND t.status = 'VERIFIED'
                AND EXISTS (
                  SELECT 1 FROM json_each(t.models_json)
                  WHERE json_extract(value, '$.id') = p.selected_model_id
                )
            )
        ) AS valid`,
      )
      .get(
        operation.goalVersion,
        operation.providerId,
        operation.corporationId,
        operation.expectedCorporationVersion,
        operation.goalVersion,
        operation.providerVersion,
        operation.modelId,
      );
    return row?.valid === 1;
  }
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") throw new PlannerDataError();
  return JSON.parse(value) as unknown;
}

function stringValue(value: unknown): string {
  if (typeof value !== "string") throw new PlannerDataError();
  return value;
}

function numberValue(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new PlannerDataError();
  }
  return value;
}

function isConstraint(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("UNIQUE constraint failed") ||
      error.message.includes("CHECK constraint failed"))
  );
}
