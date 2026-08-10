import { createHash } from "node:crypto";
import {
  planReviewErrorMessages,
  plannerDraftPublicSchema,
  type PlanReviewApproveRequest,
  type PlanReviewErrorCode,
  type PlanReviewGetCurrentRequest,
  type PlanReviewItemResult,
  type PlanReviewListResult,
  type PlanReviewListVersionsRequest,
  type PlanReviewNullableItemResult,
  type PlanReviewSaveVersionRequest,
  type PlannerTaskCandidate,
} from "@ai-corporation/protocols";
import {
  PlanReviewCommandConflictError,
  PlanReviewDataError,
  PlanReviewNotFoundError,
  PlanReviewRepository,
  PlanReviewStateConflictError,
  PlanReviewVersionConflictError,
} from "@ai-corporation/storage";
import type { PlanValidationService } from "./plan-validation-service";

type Repository = Pick<
  PlanReviewRepository,
  "approve" | "getCurrent" | "listVersions" | "resolveCommand" | "saveVersion"
>;

class PlanReviewInputError extends Error {}

export class PlanReviewService {
  readonly #clock: () => string;
  readonly #createId: () => string;
  readonly #repository: Repository;
  readonly #validator: Pick<PlanValidationService, "validate">;

  constructor(options: {
    readonly clock?: () => string;
    readonly createId: () => string;
    readonly repository: Repository;
    readonly validator: Pick<PlanValidationService, "validate">;
  }) {
    this.#clock = options.clock ?? (() => new Date().toISOString());
    this.#createId = options.createId;
    this.#repository = options.repository;
    this.#validator = options.validator;
  }

  getCurrent(
    request: PlanReviewGetCurrentRequest,
  ): PlanReviewNullableItemResult {
    try {
      return {
        ok: true,
        value: this.#repository.getCurrent(request.corporationId) ?? null,
      };
    } catch (error) {
      return mapFailure(error);
    }
  }

  listVersions(request: PlanReviewListVersionsRequest): PlanReviewListResult {
    try {
      return {
        ok: true,
        value: [...this.#repository.listVersions(request.corporationId)],
      };
    } catch (error) {
      return mapFailure(error);
    }
  }

  saveVersion(request: PlanReviewSaveVersionRequest): PlanReviewItemResult {
    const requestHash = hashRequest(request);
    try {
      const existing = this.#repository.resolveCommand({
        commandId: request.commandId,
        commandType: "SAVE_VERSION",
        requestHash,
      });
      if (existing !== undefined) {
        return {
          ok: true,
          value:
            existing.validationStatus === "PENDING"
              ? this.#validator.validate(existing.planId)
              : existing,
        };
      }

      const source = this.#repository.getCurrent(request.corporationId);
      if (source === undefined) {
        throw new PlanReviewNotFoundError();
      }
      if (source.planId !== request.sourcePlanId) {
        throw new PlanReviewVersionConflictError();
      }
      if (source.planVersion !== request.expectedPlanVersion) {
        throw new PlanReviewVersionConflictError();
      }
      if (!(
        (source.status === "VALIDATED" &&
          source.validationStatus === "VALID") ||
        (source.status === "DRAFT" && source.validationStatus === "INVALID")
      )) {
        throw new PlanReviewStateConflictError();
      }

      const sourceById = new Map(source.tasks.map((task) => [task.id, task]));
      const retainedSourceIds = new Set(
        request.tasks.map(({ sourceTaskId }) => sourceTaskId),
      );
      if (
        request.tasks.some(({ sourceTaskId }) => !sourceById.has(sourceTaskId))
      ) {
        return planReviewFailure("VALIDATION_FAILED");
      }
      const deletedLocalIds = new Set(
        source.tasks
          .filter(({ id }) => !retainedSourceIds.has(id))
          .map(({ localId }) => localId),
      );
      const blockingTaskIds = source.tasks
        .filter(
          (task) =>
            retainedSourceIds.has(task.id) &&
            task.inputs.some(
              (input) =>
                input.source === "TASK_OUTPUT" &&
                input.taskLocalId !== undefined &&
                deletedLocalIds.has(input.taskLocalId),
            ),
        )
        .map(({ id }) => id);
      if (blockingTaskIds.length > 0) {
        return planReviewFailure("DELETE_BLOCKED", blockingTaskIds);
      }

      const editedTasks = request.tasks.map((edit) => {
        const sourceTask = sourceById.get(edit.sourceTaskId);
        if (sourceTask === undefined) throw new PlanReviewDataError();
        const id = this.#createId();
        const criteriaByLocalId = new Map(
          sourceTask.acceptanceCriteria.map((criterion) => [
            criterion.localId,
            criterion,
          ]),
        );
        const usedLocalIds = new Set<string>();
        const acceptanceCriteria = edit.acceptanceCriteria.map((criterion) => {
          let localId = criterion.sourceLocalId;
          if (localId !== undefined && !criteriaByLocalId.has(localId)) {
            throw new PlanReviewInputError();
          }
          if (localId === undefined) {
            do {
              localId = `criterion-${this.#createId().replaceAll("-", "").slice(0, 24)}`;
            } while (usedLocalIds.has(localId));
          }
          usedLocalIds.add(localId);
          return {
            localId,
            description: criterion.description,
            severity: criterion.severity,
            evidenceRequired: criterion.evidenceRequired,
          };
        });
        const candidate: PlannerTaskCandidate & { id: string } = {
          ...sourceTask,
          id,
          title: edit.title,
          objective: edit.objective,
          ...(edit.description === undefined
            ? { description: undefined }
            : { description: edit.description }),
          priority: edit.priority,
          acceptanceCriteria,
        };
        return candidate;
      });

      const dependencies = request.dependencies.map((dependency) => {
        const upstream = sourceById.get(dependency.upstreamSourceTaskId);
        const downstream = sourceById.get(dependency.downstreamSourceTaskId);
        if (
          upstream === undefined ||
          downstream === undefined ||
          !retainedSourceIds.has(upstream.id) ||
          !retainedSourceIds.has(downstream.id)
        ) {
          throw new PlanReviewInputError();
        }
        return {
          upstreamLocalId: upstream.localId,
          downstreamLocalId: downstream.localId,
          condition: dependency.condition,
        };
      });
      const now = this.#clock();
      const newPlan = plannerDraftPublicSchema.parse({
        ...source,
        planId: this.#createId(),
        planVersion: source.planVersion + 1,
        status: "DRAFT",
        validationStatus: "PENDING",
        validationReport: undefined,
        tasks: editedTasks,
        dependencies,
        milestones: source.milestones
          .map((milestone) => ({
            ...milestone,
            taskLocalIds: milestone.taskLocalIds.filter(
              (localId) => !deletedLocalIds.has(localId),
            ),
          }))
          .filter(({ taskLocalIds }) => taskLocalIds.length > 0),
        supersedesPlanId: source.planId,
        approvedAt: undefined,
        createdAt: now,
      });
      const saved = this.#repository.saveVersion({
        commandId: request.commandId,
        requestHash,
        sourcePlan: source,
        newPlan,
        now,
      });
      return { ok: true, value: this.#validator.validate(saved.planId) };
    } catch (error) {
      return mapFailure(error);
    }
  }

  approve(request: PlanReviewApproveRequest): PlanReviewItemResult {
    try {
      return {
        ok: true,
        value: this.#repository.approve({
          ...request,
          requestHash: hashRequest(request),
          now: this.#clock(),
        }),
      };
    } catch (error) {
      return mapFailure(error);
    }
  }
}

function hashRequest(request: object): string {
  return createHash("sha256").update(JSON.stringify(request)).digest("hex");
}

export function planReviewFailure(
  code: PlanReviewErrorCode,
  blockingTaskIds?: readonly string[],
): Extract<PlanReviewItemResult, { ok: false }> {
  return {
    ok: false,
    error: {
      code,
      message: planReviewErrorMessages[code],
      ...(blockingTaskIds === undefined
        ? {}
        : { blockingTaskIds: [...new Set(blockingTaskIds)] }),
    },
  };
}

function mapFailure(
  error: unknown,
): Extract<PlanReviewItemResult, { ok: false }> {
  if (error instanceof PlanReviewNotFoundError) {
    return planReviewFailure("NOT_FOUND");
  }
  if (
    error instanceof PlanReviewVersionConflictError ||
    error instanceof PlanReviewCommandConflictError
  ) {
    return planReviewFailure("VERSION_CONFLICT");
  }
  if (error instanceof PlanReviewStateConflictError) {
    return planReviewFailure("STATE_CONFLICT");
  }
  if (error instanceof PlanReviewInputError) {
    return planReviewFailure("VALIDATION_FAILED");
  }
  return planReviewFailure("STORAGE_UNAVAILABLE");
}
