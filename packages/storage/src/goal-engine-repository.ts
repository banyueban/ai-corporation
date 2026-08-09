import { DatabaseSync } from "node:sqlite";
import {
  goalContractContentInputSchema,
  goalEngineInputSchema,
  goalEngineAnswerRecordSchema,
  goalEngineModelDraftSchema,
  goalEngineOperationPublicSchema,
  goalEngineQuestionSchema,
  goalEngineStatusSchema,
  normalizedUsageSchema,
  type GoalContractPublic,
  type GoalEngineAnswer,
  type GoalEngineAnswerRecord,
  type GoalEngineFailureReason,
  type GoalEngineInput,
  type GoalEngineModelDraft,
  type GoalEngineOperationPublic,
  type GoalEngineQuestion,
  type GoalModelOutputDiagnostic,
  type NormalizedUsage,
  type ProviderFailureDiagnostic,
} from "@ai-corporation/protocols";
import { GoalContractRepository } from "./goal-contract-repository";

export class GoalEngineNotFoundError extends Error {}
export class GoalEngineVersionConflictError extends Error {}
export class GoalEngineStateConflictError extends Error {}
export class GoalEngineCommandConflictError extends Error {}
export class GoalEngineProviderUnavailableError extends Error {}
export class GoalEngineDataError extends Error {}

export interface GoalEngineStoredOperation {
  readonly answers: readonly GoalEngineAnswerRecord[];
  readonly corporationId: string;
  readonly corporationName: string;
  readonly cycleNumber: number;
  readonly draft?: GoalEngineModelDraft;
  readonly expectedCorporationVersion: number;
  readonly expectedGoalVersion: number;
  readonly input: GoalEngineInput;
  readonly modelId: string;
  readonly operationId: string;
  readonly providerId: string;
  readonly providerVersion: number;
  readonly questions: readonly GoalEngineQuestion[];
  readonly requestHash: string;
  readonly roundInCycle: number;
  readonly status: GoalEngineOperationPublic["status"];
  readonly usage: NormalizedUsage;
  readonly version: number;
}

export class GoalEngineRepository {
  readonly #database: DatabaseSync;
  readonly #goals: GoalContractRepository;

  constructor(database: DatabaseSync) {
    this.#database = database;
    this.#goals = new GoalContractRepository(database);
  }

  begin(input: {
    readonly operationId: string;
    readonly corporationId: string;
    readonly expectedCorporationVersion: number;
    readonly expectedGoalVersion: number;
    readonly providerId: string;
    readonly expectedProviderVersion: number;
    readonly requestHash: string;
    readonly goalInput: GoalEngineInput;
    readonly now: string;
  }): GoalEngineStoredOperation {
    const existing = this.#readInternal(input.operationId);
    if (existing !== undefined) {
      if (existing.requestHash !== input.requestHash) {
        throw new GoalEngineCommandConflictError();
      }
      return existing;
    }
    const context = this.#startContext(input.corporationId, input.providerId);
    if (
      context.corporationVersion !== input.expectedCorporationVersion ||
      context.activeGoalVersion !== input.expectedGoalVersion ||
      context.providerVersion !== input.expectedProviderVersion
    ) {
      throw new GoalEngineVersionConflictError();
    }
    if (
      context.corporationStatus !== "DRAFT" ||
      context.workspaceStatus !== "AVAILABLE"
    ) {
      throw new GoalEngineStateConflictError();
    }
    if (
      context.providerStatus !== "ENABLED" ||
      !context.hasKey ||
      context.connectionStatus !== "VERIFIED" ||
      context.modelId === undefined ||
      !context.models.includes(context.modelId)
    ) {
      throw new GoalEngineProviderUnavailableError();
    }
    const goalInput = goalEngineInputSchema.parse(input.goalInput);
    try {
      this.#database
        .prepare(
          `INSERT INTO goal_generation_operation (
            operation_id, corporation_id, request_hash,
            expected_corporation_version, expected_goal_version,
            provider_id, provider_version, model_id, status, version,
            cycle_number, round_in_cycle, input_json, draft_json,
            questions_json, answers_json, usage_json, failure_reason,
            created_at, updated_at, completed_at, saved_goal_version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'GENERATING', 1, 1, 0,
            ?, NULL, '[]', '[]', ?, NULL, ?, ?, NULL, NULL)`,
        )
        .run(
          input.operationId,
          input.corporationId,
          input.requestHash,
          input.expectedCorporationVersion,
          input.expectedGoalVersion,
          input.providerId,
          input.expectedProviderVersion,
          context.modelId,
          JSON.stringify(goalInput),
          JSON.stringify({ costSource: "UNKNOWN" }),
          input.now,
          input.now,
        );
    } catch (error) {
      if (this.getCurrent(input.corporationId) !== undefined) {
        throw new GoalEngineStateConflictError();
      }
      throw error;
    }
    return this.requiredInternal(input.operationId);
  }

  requiredInternal(operationId: string): GoalEngineStoredOperation {
    const value = this.#readInternal(operationId);
    if (value === undefined) throw new GoalEngineNotFoundError();
    return value;
  }

  getCurrent(corporationId: string): GoalEngineOperationPublic | undefined {
    const row = this.#database
      .prepare(
        `SELECT * FROM goal_generation_operation
        WHERE corporation_id = ?
        ORDER BY updated_at DESC, operation_id DESC LIMIT 1`,
      )
      .get(corporationId);
    return row === undefined ? undefined : this.#parsePublic(row);
  }

  getPublic(operationId: string): GoalEngineOperationPublic {
    const row = this.#database
      .prepare("SELECT * FROM goal_generation_operation WHERE operation_id = ?")
      .get(operationId);
    if (row === undefined) throw new GoalEngineNotFoundError();
    return this.#parsePublic(row);
  }

  beginAnswer(input: {
    readonly operationId: string;
    readonly expectedVersion: number;
    readonly answers: readonly GoalEngineAnswer[];
    readonly now: string;
  }): GoalEngineStoredOperation {
    const operation = this.requiredInternal(input.operationId);
    if (operation.version !== input.expectedVersion) {
      throw new GoalEngineVersionConflictError();
    }
    if (operation.status !== "CLARIFICATION_REQUIRED") {
      throw new GoalEngineStateConflictError();
    }
    if (!this.#factsUnchanged(operation))
      throw new GoalEngineVersionConflictError();
    const expected = operation.questions
      .map(({ questionId }) => questionId)
      .sort();
    const actual = input.answers.map(({ questionId }) => questionId).sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      throw new GoalEngineStateConflictError();
    }
    const update = this.#database
      .prepare(
        `UPDATE goal_generation_operation
        SET status = 'GENERATING', version = version + 1,
          round_in_cycle = round_in_cycle + 1,
          answers_json = ?, updated_at = ?
        WHERE operation_id = ? AND version = ?
          AND status = 'CLARIFICATION_REQUIRED' AND round_in_cycle < 5`,
      )
      .run(
        JSON.stringify([
          ...operation.answers,
          ...input.answers.map((answer) => ({
            ...answer,
            question: operation.questions.find(
              ({ questionId }) => questionId === answer.questionId,
            )?.text,
          })),
        ]),
        input.now,
        input.operationId,
        input.expectedVersion,
      );
    if (update.changes !== 1) throw new GoalEngineVersionConflictError();
    return this.requiredInternal(input.operationId);
  }

  saveStage(input: {
    readonly operationId: string;
    readonly expectedVersion: number;
    readonly draft: GoalEngineModelDraft;
    readonly questions: readonly GoalEngineQuestion[];
    readonly usage: NormalizedUsage;
    readonly eventId: string;
    readonly now: string;
  }): GoalEngineOperationPublic {
    const draft = goalEngineModelDraftSchema.parse(input.draft);
    const questions = input.questions.map((question) =>
      goalEngineQuestionSchema.parse(question),
    );
    if (questions.length === 0) {
      return this.saveGoal({
        operationId: input.operationId,
        expectedVersion: input.expectedVersion,
        draft,
        usage: input.usage,
        remainingQuestions: [],
        eventId: input.eventId,
        now: input.now,
      });
    }
    const operation = this.requiredInternal(input.operationId);
    if (!this.#factsUnchanged(operation))
      throw new GoalEngineVersionConflictError();
    const status =
      operation.roundInCycle >= 5
        ? "EXTENSION_REQUIRED"
        : "CLARIFICATION_REQUIRED";
    const update = this.#database
      .prepare(
        `UPDATE goal_generation_operation
        SET status = ?, version = version + 1, draft_json = ?,
          questions_json = ?, usage_json = ?, updated_at = ?
        WHERE operation_id = ? AND version = ? AND status = 'GENERATING'`,
      )
      .run(
        status,
        JSON.stringify(draft),
        JSON.stringify(questions),
        JSON.stringify(normalizedUsageSchema.parse(input.usage)),
        input.now,
        input.operationId,
        input.expectedVersion,
      );
    if (update.changes !== 1) throw new GoalEngineVersionConflictError();
    return this.getPublic(input.operationId);
  }

  continueCycle(input: {
    readonly operationId: string;
    readonly expectedVersion: number;
    readonly now: string;
  }): GoalEngineOperationPublic {
    const update = this.#database
      .prepare(
        `UPDATE goal_generation_operation
        SET status = 'CLARIFICATION_REQUIRED', version = version + 1,
          cycle_number = cycle_number + 1, round_in_cycle = 0, updated_at = ?
        WHERE operation_id = ? AND version = ? AND status = 'EXTENSION_REQUIRED'`,
      )
      .run(input.now, input.operationId, input.expectedVersion);
    if (update.changes !== 1) throw new GoalEngineStateConflictError();
    return this.getPublic(input.operationId);
  }

  saveExtensionDraft(input: {
    readonly operationId: string;
    readonly expectedVersion: number;
    readonly now: string;
    readonly eventId: string;
  }): GoalEngineOperationPublic {
    const operation = this.requiredInternal(input.operationId);
    if (
      operation.status !== "EXTENSION_REQUIRED" ||
      operation.version !== input.expectedVersion ||
      operation.draft === undefined
    ) {
      throw new GoalEngineStateConflictError();
    }
    return this.saveGoal({
      operationId: input.operationId,
      expectedVersion: input.expectedVersion,
      draft: operation.draft,
      usage: operation.usage,
      remainingQuestions: operation.questions,
      eventId: input.eventId,
      now: input.now,
    });
  }

  cancel(input: {
    readonly operationId: string;
    readonly now: string;
  }): GoalEngineOperationPublic {
    const update = this.#database
      .prepare(
        `UPDATE goal_generation_operation
        SET status = 'CANCELLED', version = version + 1,
          updated_at = ?, completed_at = ?
        WHERE operation_id = ? AND status IN (
          'GENERATING','CLARIFICATION_REQUIRED','EXTENSION_REQUIRED'
        )`,
      )
      .run(input.now, input.now, input.operationId);
    if (update.changes !== 1) throw new GoalEngineStateConflictError();
    return this.getPublic(input.operationId);
  }

  fail(input: {
    readonly operationId: string;
    readonly expectedVersion: number;
    readonly reason: GoalEngineFailureReason;
    readonly usage: NormalizedUsage;
    readonly now: string;
  }): GoalEngineOperationPublic {
    const update = this.#database
      .prepare(
        `UPDATE goal_generation_operation
        SET status = 'FAILED', version = version + 1, failure_reason = ?,
          usage_json = ?, updated_at = ?, completed_at = ?
        WHERE operation_id = ? AND version = ? AND status = 'GENERATING'`,
      )
      .run(
        input.reason,
        JSON.stringify(input.usage),
        input.now,
        input.now,
        input.operationId,
        input.expectedVersion,
      );
    if (update.changes !== 1) throw new GoalEngineVersionConflictError();
    return this.getPublic(input.operationId);
  }

  interruptGenerating(now: string): number {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      this.#database
        .prepare(
          `UPDATE model_call SET status = 'INTERRUPTED',
            failure_reason = 'APPLICATION_RESTARTED', ended_at = ?
          WHERE status = 'STARTED' AND operation_id IN (
            SELECT operation_id FROM goal_generation_operation
            WHERE status = 'GENERATING'
          )`,
        )
        .run(now);
      const changes = Number(
        this.#database
          .prepare(
            `UPDATE goal_generation_operation
          SET status = 'INTERRUPTED', version = version + 1,
            updated_at = ?, completed_at = ?
          WHERE status = 'GENERATING'`,
          )
          .run(now, now).changes,
      );
      this.#database.exec("COMMIT");
      return changes;
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  startModelCall(input: {
    readonly id: string;
    readonly operation: GoalEngineStoredOperation;
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
        ) VALUES (?, ?, ?, 'GOAL_ANALYSIS', NULL, NULL, ?, ?, ?, ?,
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
    const update = this.#database
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
    if (update.changes !== 1) throw new GoalEngineVersionConflictError();
  }

  recordModelOutputDiagnostic(input: {
    readonly id: string;
    readonly diagnostic: GoalModelOutputDiagnostic;
  }): void {
    const update = this.#database
      .prepare(
        `UPDATE model_call
        SET response_meta_json = json_set(
          response_meta_json, '$.modelOutputDiagnostic', json(?)
        )
        WHERE id = ? AND status = 'SUCCEEDED'`,
      )
      .run(JSON.stringify(input.diagnostic), input.id);
    if (update.changes !== 1) throw new GoalEngineVersionConflictError();
  }

  nextAttempt(operationId: string): number {
    const row = this.#database
      .prepare(
        "SELECT COALESCE(MAX(attempt), 0) AS value FROM model_call WHERE operation_id = ?",
      )
      .get(operationId);
    if (typeof row?.value !== "number") throw new GoalEngineDataError();
    return row.value + 1;
  }

  #saveGoalContent(
    operation: GoalEngineStoredOperation,
    draft: GoalEngineModelDraft,
    questions: readonly GoalEngineQuestion[],
  ) {
    const questionAssumptions = questions.map(({ text }) => ({
      text,
      impact: "HIGH" as const,
      confirmed: false,
    }));
    return goalContractContentInputSchema.parse({
      source: "PROVIDER",
      originalGoal: operation.input.originalGoal,
      ...draft,
      assumptions: dedupeAssumptions([
        ...draft.assumptions,
        ...questionAssumptions,
      ]),
    });
  }

  private saveGoal(input: {
    readonly operationId: string;
    readonly expectedVersion: number;
    readonly draft: GoalEngineModelDraft;
    readonly usage: NormalizedUsage;
    readonly remainingQuestions: readonly GoalEngineQuestion[];
    readonly eventId: string;
    readonly now: string;
  }): GoalEngineOperationPublic {
    const operation = this.requiredInternal(input.operationId);
    if (operation.version !== input.expectedVersion) {
      throw new GoalEngineVersionConflictError();
    }
    const content = this.#saveGoalContent(
      operation,
      input.draft,
      input.remainingQuestions,
    );
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      if (!this.#factsUnchanged(operation))
        throw new GoalEngineVersionConflictError();
      const corporation = this.#database
        .prepare(
          `SELECT version, status, active_goal_version FROM corporation WHERE id = ?`,
        )
        .get(operation.corporationId);
      if (
        corporation === undefined ||
        corporation.version !== operation.expectedCorporationVersion ||
        corporation.status !== "DRAFT" ||
        (corporation.active_goal_version ?? 0) !== operation.expectedGoalVersion
      ) {
        throw new GoalEngineVersionConflictError();
      }
      if (operation.expectedGoalVersion > 0) {
        const old = this.#database
          .prepare(
            `UPDATE goal_contract_version SET status = 'SUPERSEDED', approved_at = NULL
            WHERE corporation_id = ? AND version = ?
              AND status IN ('DRAFT','APPROVED')`,
          )
          .run(operation.corporationId, operation.expectedGoalVersion);
        if (old.changes !== 1) throw new GoalEngineVersionConflictError();
      }
      const goalVersion = operation.expectedGoalVersion + 1;
      const corporationVersion = operation.expectedCorporationVersion + 1;
      this.#database
        .prepare(
          `INSERT INTO goal_contract_version (
            corporation_id, version, status, source, content_json,
            created_by, created_at, approved_at
          ) VALUES (?, ?, 'DRAFT', 'PROVIDER', ?, 'local-user', ?, NULL)`,
        )
        .run(
          operation.corporationId,
          goalVersion,
          JSON.stringify(content),
          input.now,
        );
      const updated = this.#database
        .prepare(
          `UPDATE corporation SET active_goal_version = ?, version = ?, updated_at = ?
          WHERE id = ? AND version = ? AND status = 'DRAFT'`,
        )
        .run(
          goalVersion,
          corporationVersion,
          input.now,
          operation.corporationId,
          operation.expectedCorporationVersion,
        );
      if (updated.changes !== 1) throw new GoalEngineVersionConflictError();
      this.#database
        .prepare(
          `INSERT INTO domain_event (
            event_id, schema_version, event_type, aggregate_type, aggregate_id,
            aggregate_version, corporation_id, correlation_id, actor_json,
            payload_json, sensitivity, occurred_at
          ) VALUES (?, '1.0', 'goal.contract.drafted', 'CORPORATION', ?, ?, ?, ?,
            ?, ?, 'NORMAL', ?)`,
        )
        .run(
          input.eventId,
          operation.corporationId,
          corporationVersion,
          operation.corporationId,
          input.operationId,
          JSON.stringify({ kind: "USER", id: "local-user" }),
          JSON.stringify({ goalVersion, source: "PROVIDER" }),
          input.now,
        );
      const goal = this.#goals.getCurrent(operation.corporationId);
      if (goal === undefined) throw new GoalEngineDataError();
      this.#database
        .prepare(
          `INSERT INTO goal_contract_command (
            command_id, command_type, corporation_id, request_hash,
            result_json, result_version, created_at
          ) VALUES (?, 'SAVE_DRAFT', ?, ?, ?, ?, ?)`,
        )
        .run(
          operation.operationId,
          operation.corporationId,
          operation.requestHash,
          JSON.stringify(goal),
          goalVersion,
          input.now,
        );
      const operationUpdate = this.#database
        .prepare(
          `UPDATE goal_generation_operation SET status = 'GOAL_SAVED',
            version = version + 1, draft_json = ?, questions_json = '[]',
            usage_json = ?, failure_reason = NULL, saved_goal_version = ?,
            updated_at = ?, completed_at = ?
          WHERE operation_id = ? AND version = ? AND status IN (
            'GENERATING','EXTENSION_REQUIRED'
          )`,
        )
        .run(
          JSON.stringify(input.draft),
          JSON.stringify(input.usage),
          goalVersion,
          input.now,
          input.now,
          input.operationId,
          input.expectedVersion,
        );
      if (operationUpdate.changes !== 1)
        throw new GoalEngineVersionConflictError();
      this.#database.exec("COMMIT");
      return this.getPublic(input.operationId);
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  #readInternal(operationId: string): GoalEngineStoredOperation | undefined {
    const row = this.#database
      .prepare(
        `SELECT o.*, c.name AS corporation_name
        FROM goal_generation_operation o
        INNER JOIN corporation c ON c.id = o.corporation_id
        WHERE o.operation_id = ?`,
      )
      .get(operationId);
    if (row === undefined) return undefined;
    try {
      return {
        answers: zodArray(row.answers_json, (value) =>
          GoalEngineAnswerArray.parse(value),
        ),
        corporationId: stringValue(row.corporation_id),
        corporationName: stringValue(row.corporation_name),
        cycleNumber: numberValue(row.cycle_number),
        ...(row.draft_json === null
          ? {}
          : {
              draft: goalEngineModelDraftSchema.parse(
                parseJson(row.draft_json),
              ),
            }),
        expectedCorporationVersion: numberValue(
          row.expected_corporation_version,
        ),
        expectedGoalVersion: numberValue(row.expected_goal_version),
        input: goalEngineInputSchema.parse(parseJson(row.input_json)),
        modelId: stringValue(row.model_id),
        operationId: stringValue(row.operation_id),
        providerId: stringValue(row.provider_id),
        providerVersion: numberValue(row.provider_version),
        questions: zodArray(row.questions_json, (value) =>
          GoalEngineQuestionArray.parse(value),
        ),
        requestHash: stringValue(row.request_hash),
        roundInCycle: numberValue(row.round_in_cycle),
        status: goalEngineStatusSchema.parse(row.status),
        usage: normalizedUsageSchema.parse(parseJson(row.usage_json)),
        version: numberValue(row.version),
      };
    } catch {
      throw new GoalEngineDataError();
    }
  }

  #parsePublic(row: Record<string, unknown>): GoalEngineOperationPublic {
    try {
      const status = goalEngineStatusSchema.parse(row.status);
      let goal: GoalContractPublic | undefined;
      if (status === "GOAL_SAVED") {
        goal = this.#goals.getCurrent(stringValue(row.corporation_id));
        if (goal === undefined || goal.version !== row.saved_goal_version) {
          throw new GoalEngineDataError();
        }
      }
      return goalEngineOperationPublicSchema.parse({
        schemaVersion: "1.0",
        operationId: row.operation_id,
        corporationId: row.corporation_id,
        providerId: row.provider_id,
        providerVersion: row.provider_version,
        modelId: row.model_id,
        status,
        version: row.version,
        cycleNumber: row.cycle_number,
        roundInCycle: row.round_in_cycle,
        questions: parseJson(row.questions_json),
        usage: parseJson(row.usage_json),
        ...(row.failure_reason === null
          ? {}
          : { failureReason: row.failure_reason }),
        ...(goal === undefined ? {} : { goal }),
        updatedAt: row.updated_at,
      });
    } catch (error) {
      if (error instanceof GoalEngineDataError) throw error;
      throw new GoalEngineDataError();
    }
  }

  #startContext(corporationId: string, providerId: string) {
    const row = this.#database
      .prepare(
        `SELECT c.name AS corporation_name, c.status AS corporation_status,
          c.version AS corporation_version, c.active_goal_version,
          w.access_status AS workspace_status,
          p.version AS provider_version, p.config_status AS provider_status,
          p.selected_model_id AS model_id, p.key_vault_entry_id,
          t.status AS connection_status, t.models_json
        FROM corporation c
        INNER JOIN workspace w ON w.id = c.workspace_id
        INNER JOIN provider p ON p.id = ?
        LEFT JOIN provider_connection_test t ON t.provider_id = p.id
          AND t.provider_version = p.version
        WHERE c.id = ?`,
      )
      .get(providerId, corporationId);
    if (row === undefined) throw new GoalEngineNotFoundError();
    const models: string[] = (() => {
      try {
        const parsed = parseJson(row.models_json ?? "[]");
        if (!Array.isArray(parsed)) throw new Error();
        return parsed.flatMap((value) =>
          typeof value === "object" &&
          value !== null &&
          "id" in value &&
          typeof value.id === "string"
            ? [value.id]
            : [],
        );
      } catch {
        throw new GoalEngineDataError();
      }
    })();
    return {
      activeGoalVersion:
        row.active_goal_version === null
          ? 0
          : numberValue(row.active_goal_version),
      corporationStatus: stringValue(row.corporation_status),
      corporationVersion: numberValue(row.corporation_version),
      workspaceStatus: stringValue(row.workspace_status),
      providerVersion: numberValue(row.provider_version),
      providerStatus: stringValue(row.provider_status),
      hasKey: row.key_vault_entry_id !== null,
      connectionStatus:
        row.connection_status === null
          ? undefined
          : stringValue(row.connection_status),
      modelId: row.model_id === null ? undefined : stringValue(row.model_id),
      models,
    };
  }

  #factsUnchanged(operation: GoalEngineStoredOperation): boolean {
    const row = this.#database
      .prepare(
        `SELECT EXISTS(
          SELECT 1 FROM corporation c
          INNER JOIN workspace w ON w.id = c.workspace_id
          INNER JOIN provider p ON p.id = ?
          WHERE c.id = ? AND c.version = ? AND c.status = 'DRAFT'
            AND COALESCE(c.active_goal_version, 0) = ?
            AND w.access_status = 'AVAILABLE'
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
        operation.providerId,
        operation.corporationId,
        operation.expectedCorporationVersion,
        operation.expectedGoalVersion,
        operation.providerVersion,
        operation.modelId,
      );
    return row?.valid === 1;
  }
}

const GoalEngineAnswerArray = goalEngineAnswerRecordSchema.array();
const GoalEngineQuestionArray = goalEngineQuestionSchema.array();

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") throw new GoalEngineDataError();
  return JSON.parse(value) as unknown;
}

function zodArray<T>(value: unknown, parse: (value: unknown) => T): T {
  return parse(parseJson(value));
}

function stringValue(value: unknown): string {
  if (typeof value !== "string") throw new GoalEngineDataError();
  return value;
}

function numberValue(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new GoalEngineDataError();
  }
  return value;
}

function dedupeAssumptions<
  T extends { readonly text: string; readonly impact: string },
>(values: readonly T[]): readonly T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.impact}\u0000${value.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
