import { createHash } from "node:crypto";
import {
  goalContractContentInputSchema,
  goalContractErrorMessages,
  type GoalContractApproveRequest,
  type GoalContractErrorCode,
  type GoalContractGetCurrentRequest,
  type GoalContractItemResult,
  type GoalContractListResult,
  type GoalContractListVersionsRequest,
  type GoalContractNullableItemResult,
  type GoalContractSaveDraftRequest,
  type TimelineListRequest,
  type TimelineListResult,
} from "@ai-corporation/protocols";
import {
  GoalAssumptionConfirmationError,
  GoalCommandConflictError,
  GoalCorporationNotFoundError,
  type GoalContractRepository,
  GoalStateConflictError,
  GoalProviderContentMutationError,
  GoalVersionConflictError,
  TimelineCursorError,
} from "@ai-corporation/storage";
import { createUuidV7 } from "./uuid-v7";

type Repository = Pick<
  GoalContractRepository,
  "approve" | "getCurrent" | "listTimeline" | "listVersions" | "saveDraft"
>;

export class GoalContractService {
  readonly #clock: () => string;
  readonly #repository: Repository;
  readonly #uuid: () => string;

  constructor(options: {
    readonly clock?: () => string;
    readonly repository: Repository;
    readonly uuid?: () => string;
  }) {
    this.#clock = options.clock ?? (() => new Date().toISOString());
    this.#repository = options.repository;
    this.#uuid = options.uuid ?? createUuidV7;
  }

  saveDraft(request: GoalContractSaveDraftRequest): GoalContractItemResult {
    try {
      const content = goalContractContentInputSchema.parse(request.content);
      return {
        ok: true,
        value: this.#repository.saveDraft({
          command: {
            commandId: request.commandId,
            commandType: "SAVE_DRAFT",
            requestHash: requestHash({
              schemaVersion: request.schemaVersion,
              commandId: request.commandId,
              corporationId: request.corporationId,
              expectedCorporationVersion: request.expectedCorporationVersion,
              expectedGoalVersion: request.expectedGoalVersion,
              content,
            }),
          },
          corporationId: request.corporationId,
          expectedCorporationVersion: request.expectedCorporationVersion,
          expectedGoalVersion: request.expectedGoalVersion,
          content,
          now: this.#clock(),
          eventId: this.#uuid(),
        }),
      };
    } catch (error) {
      return failure(mapError(error));
    }
  }

  getCurrent(
    request: GoalContractGetCurrentRequest,
  ): GoalContractNullableItemResult {
    try {
      return {
        ok: true,
        value: this.#repository.getCurrent(request.corporationId) ?? null,
      };
    } catch (error) {
      return failure(mapError(error));
    }
  }

  listVersions(
    request: GoalContractListVersionsRequest,
  ): GoalContractListResult {
    try {
      return {
        ok: true,
        value: [...this.#repository.listVersions(request.corporationId)],
      };
    } catch (error) {
      return failure(mapError(error));
    }
  }

  approve(request: GoalContractApproveRequest): GoalContractItemResult {
    try {
      return {
        ok: true,
        value: this.#repository.approve({
          command: {
            commandId: request.commandId,
            commandType: "APPROVE",
            requestHash: requestHash({
              schemaVersion: request.schemaVersion,
              commandId: request.commandId,
              corporationId: request.corporationId,
              expectedCorporationVersion: request.expectedCorporationVersion,
              goalVersion: request.goalVersion,
            }),
          },
          corporationId: request.corporationId,
          expectedCorporationVersion: request.expectedCorporationVersion,
          goalVersion: request.goalVersion,
          now: this.#clock(),
          eventId: this.#uuid(),
        }),
      };
    } catch (error) {
      return failure(mapError(error));
    }
  }

  listTimeline(request: TimelineListRequest): TimelineListResult {
    try {
      return {
        ok: true,
        value: this.#repository.listTimeline({
          corporationId: request.corporationId,
          ...(request.afterCursor === undefined
            ? {}
            : { afterCursor: request.afterCursor }),
          ...(request.limit === undefined ? {} : { limit: request.limit }),
        }),
      };
    } catch (error) {
      return failure(mapError(error));
    }
  }
}

export function goalContractFailure(
  code: GoalContractErrorCode,
): GoalContractItemResult &
  GoalContractNullableItemResult &
  GoalContractListResult &
  TimelineListResult {
  return failure(code);
}

function failure(code: GoalContractErrorCode): {
  readonly ok: false;
  readonly error: {
    readonly code: GoalContractErrorCode;
    readonly message: string;
  };
} {
  return {
    ok: false,
    error: { code, message: goalContractErrorMessages[code] },
  };
}

function mapError(error: unknown): GoalContractErrorCode {
  if (error instanceof GoalCorporationNotFoundError) {
    return "CORPORATION_NOT_FOUND";
  }
  if (error instanceof GoalVersionConflictError) return "VERSION_CONFLICT";
  if (error instanceof GoalStateConflictError) return "STATE_CONFLICT";
  if (error instanceof GoalProviderContentMutationError)
    return "STATE_CONFLICT";
  if (error instanceof GoalAssumptionConfirmationError) {
    return "ASSUMPTION_CONFIRMATION_REQUIRED";
  }
  if (error instanceof GoalCommandConflictError) return "COMMAND_CONFLICT";
  if (error instanceof TimelineCursorError) return "VALIDATION_FAILED";
  return "STORAGE_UNAVAILABLE";
}

function requestHash(value: Readonly<Record<string, unknown>>): string {
  return createHash("sha256")
    .update(JSON.stringify(value), "utf8")
    .digest("hex");
}
