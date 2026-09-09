import { DatabaseSync } from "node:sqlite";
import {
  plannerDraftPublicSchema,
  type PlannerDraftPublic,
} from "@ai-corporation/protocols";

export class PlanReviewNotFoundError extends Error {}
export class PlanReviewVersionConflictError extends Error {}
export class PlanReviewStateConflictError extends Error {}
export class PlanReviewCommandConflictError extends Error {}
export class PlanReviewDataError extends Error {}

type CommandType = "SAVE_VERSION" | "APPROVE";

export class PlanReviewRepository {
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  getCurrent(corporationId: string): PlannerDraftPublic | undefined {
    const row = this.#database
      .prepare(
        `SELECT draft_json FROM task_plan
         WHERE corporation_id = ? AND status <> 'SUPERSEDED'
         ORDER BY version DESC LIMIT 1`,
      )
      .get(corporationId);
    return row === undefined ? undefined : parsePlan(row.draft_json);
  }

  listVersions(corporationId: string): readonly PlannerDraftPublic[] {
    return this.#database
      .prepare(
        `SELECT draft_json FROM task_plan
         WHERE corporation_id = ? ORDER BY version DESC`,
      )
      .all(corporationId)
      .map((row) => parsePlan(row.draft_json));
  }

  resolveCommand(input: {
    readonly commandId: string;
    readonly commandType: CommandType;
    readonly requestHash: string;
  }): PlannerDraftPublic | undefined {
    const row = this.#database
      .prepare(
        `SELECT command_type, request_hash, result_plan_id
         FROM plan_review_command WHERE command_id = ?`,
      )
      .get(input.commandId);
    if (row === undefined) return undefined;
    if (
      row.command_type !== input.commandType ||
      row.request_hash !== input.requestHash
    ) {
      throw new PlanReviewCommandConflictError();
    }
    return this.#readPlan(stringValue(row.result_plan_id));
  }

  saveVersion(input: {
    readonly commandId: string;
    readonly requestHash: string;
    readonly sourcePlan: PlannerDraftPublic;
    readonly newPlan: PlannerDraftPublic;
    readonly now: string;
  }): PlannerDraftPublic {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.resolveCommand({
        commandId: input.commandId,
        commandType: "SAVE_VERSION",
        requestHash: input.requestHash,
      });
      if (existing !== undefined) {
        this.#database.exec("ROLLBACK");
        return existing;
      }
      const current = this.#database
        .prepare(
          `SELECT draft_json, status, validation_status, version
           FROM task_plan WHERE id = ? AND corporation_id = ?`,
        )
        .get(input.sourcePlan.planId, input.sourcePlan.corporationId);
      if (current === undefined) throw new PlanReviewNotFoundError();
      if (current.version !== input.sourcePlan.planVersion) {
        throw new PlanReviewVersionConflictError();
      }
      if (!(
        (current.status === "VALIDATED" &&
          current.validation_status === "VALID") ||
        (current.status === "DRAFT" && current.validation_status === "INVALID")
      )) {
        throw new PlanReviewStateConflictError();
      }
      const storedSource = parsePlan(current.draft_json);
      if (storedSource.status !== input.sourcePlan.status) {
        throw new PlanReviewVersionConflictError();
      }
      const superseded = plannerDraftPublicSchema.parse({
        ...storedSource,
        status: "SUPERSEDED",
      });
      const updated = this.#database
        .prepare(
          `UPDATE task_plan SET status = 'SUPERSEDED', draft_json = ?
           WHERE id = ? AND corporation_id = ? AND version = ?
             AND status = ? AND validation_status = ?`,
        )
        .run(
          JSON.stringify(superseded),
          storedSource.planId,
          storedSource.corporationId,
          storedSource.planVersion,
          storedSource.status,
          storedSource.validationStatus,
        );
      if (updated.changes !== 1) throw new PlanReviewVersionConflictError();

      this.#database
        .prepare(
          `INSERT INTO task_plan (
            id, corporation_id, goal_version, version, status,
            validation_status, summary, draft_json, provider_id,
            provider_version, model_id, created_by_operation_id,
            validation_report_json, validator_version,
            validated_draft_hash, validated_at, supersedes_plan_id,
            approved_at, created_at
          ) VALUES (?, ?, ?, ?, 'DRAFT', 'PENDING', ?, ?, ?, ?, ?, ?,
            NULL, NULL, NULL, NULL, ?, NULL, ?)`,
        )
        .run(
          input.newPlan.planId,
          input.newPlan.corporationId,
          input.newPlan.goalVersion,
          input.newPlan.planVersion,
          input.newPlan.summary,
          JSON.stringify(input.newPlan),
          input.newPlan.provider.providerId,
          input.newPlan.provider.providerVersion,
          input.newPlan.provider.model,
          input.commandId,
          input.sourcePlan.planId,
          input.now,
        );
      this.#insertCommand({
        commandId: input.commandId,
        commandType: "SAVE_VERSION",
        corporationId: input.newPlan.corporationId,
        requestHash: input.requestHash,
        resultPlanId: input.newPlan.planId,
        now: input.now,
      });
      this.#database.exec("COMMIT");
      return input.newPlan;
    } catch (error) {
      rollback(this.#database);
      rethrowKnown(error);
    }
  }

  approve(input: {
    readonly commandId: string;
    readonly corporationId: string;
    readonly planId: string;
    readonly expectedPlanVersion: number;
    readonly requestHash: string;
    readonly now: string;
  }): PlannerDraftPublic {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.resolveCommand({
        commandId: input.commandId,
        commandType: "APPROVE",
        requestHash: input.requestHash,
      });
      if (existing !== undefined) {
        this.#database.exec("ROLLBACK");
        return existing;
      }
      const row = this.#database
        .prepare(
          `SELECT draft_json, version, status, validation_status
           FROM task_plan WHERE id = ? AND corporation_id = ?`,
        )
        .get(input.planId, input.corporationId);
      if (row === undefined) throw new PlanReviewNotFoundError();
      if (row.version !== input.expectedPlanVersion) {
        throw new PlanReviewVersionConflictError();
      }
      if (row.status !== "VALIDATED" || row.validation_status !== "VALID") {
        throw new PlanReviewStateConflictError();
      }
      const current = parsePlan(row.draft_json);
      const approved = plannerDraftPublicSchema.parse({
        ...current,
        status: "APPROVED",
        approvedAt: input.now,
      });
      const updated = this.#database
        .prepare(
          `UPDATE task_plan SET status = 'APPROVED', approved_at = ?,
             draft_json = ?
           WHERE id = ? AND corporation_id = ? AND version = ?
             AND status = 'VALIDATED' AND validation_status = 'VALID'`,
        )
        .run(
          input.now,
          JSON.stringify(approved),
          input.planId,
          input.corporationId,
          input.expectedPlanVersion,
        );
      if (updated.changes !== 1) throw new PlanReviewVersionConflictError();
      this.#insertCommand({
        commandId: input.commandId,
        commandType: "APPROVE",
        corporationId: input.corporationId,
        requestHash: input.requestHash,
        resultPlanId: input.planId,
        now: input.now,
      });
      this.#database.exec("COMMIT");
      return approved;
    } catch (error) {
      rollback(this.#database);
      rethrowKnown(error);
    }
  }

  #insertCommand(input: {
    readonly commandId: string;
    readonly commandType: CommandType;
    readonly corporationId: string;
    readonly requestHash: string;
    readonly resultPlanId: string;
    readonly now: string;
  }) {
    this.#database
      .prepare(
        `INSERT INTO plan_review_command (
          command_id, corporation_id, command_type, request_hash,
          result_plan_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.commandId,
        input.corporationId,
        input.commandType,
        input.requestHash,
        input.resultPlanId,
        input.now,
      );
  }

  #readPlan(planId: string): PlannerDraftPublic {
    const row = this.#database
      .prepare("SELECT draft_json FROM task_plan WHERE id = ?")
      .get(planId);
    if (row === undefined) throw new PlanReviewNotFoundError();
    return parsePlan(row.draft_json);
  }
}

function parsePlan(value: unknown): PlannerDraftPublic {
  if (typeof value !== "string") throw new PlanReviewDataError();
  try {
    return plannerDraftPublicSchema.parse(JSON.parse(value) as unknown);
  } catch {
    throw new PlanReviewDataError();
  }
}

function stringValue(value: unknown): string {
  if (typeof value !== "string") throw new PlanReviewDataError();
  return value;
}

function rollback(database: DatabaseSync) {
  try {
    database.exec("ROLLBACK");
  } catch {
    // The original error is authoritative.
  }
}

function rethrowKnown(error: unknown): never {
  if (
    error instanceof PlanReviewNotFoundError ||
    error instanceof PlanReviewVersionConflictError ||
    error instanceof PlanReviewStateConflictError ||
    error instanceof PlanReviewCommandConflictError
  ) {
    throw error;
  }
  throw new PlanReviewDataError();
}
