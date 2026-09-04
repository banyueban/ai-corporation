import { createHash } from "node:crypto";
import {
  executionStartErrorMessages,
  type ExecutionStartErrorCode,
  type ExecutionStartGetCurrentRequest,
  type ExecutionStartItemResult,
  type ExecutionStartNullableItemResult,
  type ExecutionStartRequest,
} from "@ai-corporation/protocols";
import {
  ExecutionStartAssignmentError,
  ExecutionStartCommandConflictError,
  ExecutionStartDataError,
  ExecutionStartNoEntryTaskError,
  ExecutionStartNotFoundError,
  ExecutionStartOrganizationError,
  ExecutionStartPlanError,
  ExecutionStartProviderError,
  ExecutionStartRepository,
  ExecutionStartStateError,
  ExecutionStartVersionError,
  ExecutionStartWorkspaceError,
} from "@ai-corporation/storage";

type Repository = Pick<
  ExecutionStartRepository,
  "getCurrent" | "resolveCommand" | "start"
>;

export class ExecutionStartService {
  readonly #clock: () => string;
  readonly #createId: () => string;
  readonly #repository: Repository;
  constructor(options: {
    clock?: () => string;
    createId: () => string;
    repository: Repository;
  }) {
    this.#clock = options.clock ?? (() => new Date().toISOString());
    this.#createId = options.createId;
    this.#repository = options.repository;
  }
  getCurrent(
    request: ExecutionStartGetCurrentRequest,
  ): ExecutionStartNullableItemResult {
    try {
      return {
        ok: true,
        value: this.#repository.getCurrent(request.corporationId) ?? null,
      };
    } catch (error) {
      return mapFailure(error);
    }
  }
  start(request: ExecutionStartRequest): ExecutionStartItemResult {
    const requestHash = createHash("sha256")
      .update(JSON.stringify(request))
      .digest("hex");
    try {
      const replay = this.#repository.resolveCommand(
        request.commandId,
        requestHash,
      );
      if (replay !== undefined) return { ok: true, value: replay };
      return {
        ok: true,
        value: this.#repository.start({
          request,
          requestHash,
          runId: this.#createId(),
          eventId: this.#createId(),
          now: this.#clock(),
        }),
      };
    } catch (error) {
      return mapFailure(error);
    }
  }
}

export function executionStartFailure(
  code: ExecutionStartErrorCode,
): Extract<ExecutionStartItemResult, { ok: false }> {
  return {
    ok: false,
    error: { code, message: executionStartErrorMessages[code] },
  };
}
function mapFailure(
  error: unknown,
): Extract<ExecutionStartItemResult, { ok: false }> {
  if (error instanceof ExecutionStartNotFoundError)
    return executionStartFailure("CORPORATION_NOT_FOUND");
  if (error instanceof ExecutionStartVersionError)
    return executionStartFailure("CORPORATION_CHANGED");
  if (error instanceof ExecutionStartStateError)
    return executionStartFailure("STATE_CONFLICT");
  if (error instanceof ExecutionStartWorkspaceError)
    return executionStartFailure("WORKSPACE_UNAVAILABLE");
  if (error instanceof ExecutionStartPlanError)
    return executionStartFailure("PLAN_NOT_READY");
  if (error instanceof ExecutionStartOrganizationError)
    return executionStartFailure("ORGANIZATION_NOT_READY");
  if (error instanceof ExecutionStartProviderError)
    return executionStartFailure("PROVIDER_NOT_READY");
  if (error instanceof ExecutionStartAssignmentError)
    return executionStartFailure("ASSIGNMENT_INVALID");
  if (error instanceof ExecutionStartNoEntryTaskError)
    return executionStartFailure("NO_ENTRY_TASK");
  if (error instanceof ExecutionStartCommandConflictError)
    return executionStartFailure("COMMAND_CONFLICT");
  if (error instanceof ExecutionStartDataError)
    return executionStartFailure("STORAGE_FAILURE");
  return executionStartFailure("STORAGE_FAILURE");
}
