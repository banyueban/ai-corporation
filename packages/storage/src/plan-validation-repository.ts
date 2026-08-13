import { DatabaseSync } from "node:sqlite";
import {
  goalBudgetSchema,
  goalContractContentInputSchema,
  planValidationReportSchema,
  plannerDraftPublicSchema,
  taskContractSchema,
  type GoalBudget,
  type PlannerDraftPublic,
  type TaskContract,
} from "@ai-corporation/protocols";

export class PlanValidationDataError extends Error {}
export class PlanValidationConflictError extends Error {}

export interface StoredPlanValidationInput {
  readonly goalBudget: GoalBudget;
  readonly plan: PlannerDraftPublic;
}

export class PlanValidationRepository {
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  listPendingPlanIds(): readonly string[] {
    return this.#database
      .prepare(
        `SELECT id FROM task_plan
         WHERE status = 'DRAFT' AND validation_status = 'PENDING'
         ORDER BY created_at, id`,
      )
      .all()
      .map((row) => stringValue(row.id));
  }

  readInput(planId: string): StoredPlanValidationInput {
    const row = this.#database
      .prepare(
        `SELECT p.draft_json, g.content_json
         FROM task_plan p
         INNER JOIN goal_contract_version g
           ON g.corporation_id = p.corporation_id
          AND g.version = p.goal_version
         WHERE p.id = ?`,
      )
      .get(planId);
    if (row === undefined) throw new PlanValidationDataError();
    try {
      return {
        plan: plannerDraftPublicSchema.parse(parseJson(row.draft_json)),
        goalBudget: goalBudgetSchema.parse(
          goalContractContentInputSchema.parse(parseJson(row.content_json))
            .budget,
        ),
      };
    } catch {
      throw new PlanValidationDataError();
    }
  }

  commit(input: {
    readonly draftHash: string;
    readonly plan: PlannerDraftPublic;
    readonly report: unknown;
    readonly tasks: readonly TaskContract[];
  }): PlannerDraftPublic {
    const report = planValidationReportSchema.parse(input.report);
    const tasks = input.tasks.map((task) => taskContractSchema.parse(task));
    if ((report.status === "VALID") !== tasks.length > 0) {
      throw new PlanValidationDataError();
    }
    const updatedPlan = plannerDraftPublicSchema.parse({
      ...input.plan,
      status: report.status === "VALID" ? "VALIDATED" : "DRAFT",
      validationStatus: report.status,
      validationReport: report,
    });

    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const current = this.#database
        .prepare(
          `SELECT status, validation_status, validated_draft_hash, draft_json
           FROM task_plan WHERE id = ?`,
        )
        .get(input.plan.planId);
      if (current === undefined) throw new PlanValidationDataError();
      if (current.validation_status !== "PENDING") {
        if (current.validated_draft_hash !== input.draftHash) {
          throw new PlanValidationConflictError();
        }
        this.#database.exec("ROLLBACK");
        return plannerDraftPublicSchema.parse(parseJson(current.draft_json));
      }

      const updated = this.#database
        .prepare(
          `UPDATE task_plan SET status = ?, validation_status = ?, draft_json = ?,
             validation_report_json = ?, validator_version = ?,
             validated_draft_hash = ?, validated_at = ?
           WHERE id = ? AND corporation_id = ? AND version = ?
             AND goal_version = ? AND status = 'DRAFT'
             AND validation_status = 'PENDING'`,
        )
        .run(
          updatedPlan.status,
          updatedPlan.validationStatus,
          JSON.stringify(updatedPlan),
          JSON.stringify(report),
          report.validatorVersion,
          input.draftHash,
          report.validatedAt,
          input.plan.planId,
          input.plan.corporationId,
          input.plan.planVersion,
          input.plan.goalVersion,
        );
      if (updated.changes !== 1) throw new PlanValidationConflictError();

      if (report.status === "VALID") {
        const insertTask = this.#database.prepare(
          `INSERT INTO task (
            id, corporation_id, plan_id, parent_id, title, objective, kind,
            priority, risk_level, status, contract_json, attempt, max_attempts,
            weight, version, created_at, updated_at
          ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, 'DRAFT', ?, 0, ?, 1, 1, ?, ?)`,
        );
        for (const task of tasks) {
          insertTask.run(
            task.id,
            task.corporationId,
            input.plan.planId,
            task.title,
            task.objective,
            task.kind,
            task.priority,
            task.riskLevel,
            JSON.stringify(task),
            task.retryPolicy.maxAttempts,
            report.validatedAt,
            report.validatedAt,
          );
        }
        const insertDependency = this.#database.prepare(
          `INSERT INTO task_dependency (
            plan_id, upstream_task_id, downstream_task_id, condition,
            artifact_requirements_json
          ) VALUES (?, ?, ?, ?, '[]')`,
        );
        for (const task of tasks) {
          for (const dependency of task.dependencies) {
            insertDependency.run(
              input.plan.planId,
              dependency.taskId,
              task.id,
              dependency.condition,
            );
          }
        }
      }
      this.#database.exec("COMMIT");
      return updatedPlan;
    } catch (error) {
      try {
        this.#database.exec("ROLLBACK");
      } catch (rollbackError) {
        void rollbackError;
      }
      if (error instanceof PlanValidationConflictError) throw error;
      throw new PlanValidationDataError();
    }
  }
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") throw new PlanValidationDataError();
  return JSON.parse(value) as unknown;
}

function stringValue(value: unknown): string {
  if (typeof value !== "string") throw new PlanValidationDataError();
  return value;
}
