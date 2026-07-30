import { createHash } from "node:crypto";
import {
  type CorporationItemResult,
  type CorporationPauseRequest,
  type CorporationResumeRequest,
  type WorkspaceRevalidateIpcResult,
} from "@ai-corporation/protocols";
import {
  CorporationCommandConflictError,
  CorporationNotFoundError,
  type CorporationStateRepository,
  CorporationStateConflictError,
  CorporationVersionConflictError,
} from "@ai-corporation/storage";
import { corporationFailure } from "./corporation-service";
import { createUuidV7 } from "./uuid-v7";

type Repository = Pick<CorporationStateRepository, "pause" | "resume">;

export class CorporationStateService {
  readonly #clock: () => string;
  readonly #repository: Repository;
  readonly #revalidateWorkspace: (
    workspaceId: string,
  ) => Promise<WorkspaceRevalidateIpcResult>;
  readonly #resolveWorkspaceId: (corporationId: string) => string | undefined;
  readonly #uuid: () => string;

  constructor(options: {
    readonly clock?: () => string;
    readonly repository: Repository;
    readonly revalidateWorkspace: (
      workspaceId: string,
    ) => Promise<WorkspaceRevalidateIpcResult>;
    readonly resolveWorkspaceId: (corporationId: string) => string | undefined;
    readonly uuid?: () => string;
  }) {
    this.#clock = options.clock ?? (() => new Date().toISOString());
    this.#repository = options.repository;
    this.#revalidateWorkspace = options.revalidateWorkspace;
    this.#resolveWorkspaceId = options.resolveWorkspaceId;
    this.#uuid = options.uuid ?? createUuidV7;
  }

  pause(request: CorporationPauseRequest): Promise<CorporationItemResult> {
    return this.#transition("PAUSE", request);
  }

  resume(request: CorporationResumeRequest): Promise<CorporationItemResult> {
    return this.#transition("RESUME", request);
  }

  async #transition(
    operation: "PAUSE" | "RESUME",
    request: CorporationPauseRequest | CorporationResumeRequest,
  ): Promise<CorporationItemResult> {
    const workspaceId = this.#resolveWorkspaceId(request.corporationId);
    if (workspaceId === undefined) return corporationFailure("NOT_FOUND");
    let workspace: WorkspaceRevalidateIpcResult;
    try {
      workspace = await this.#revalidateWorkspace(workspaceId);
    } catch {
      return corporationFailure("WORKSPACE_UNAVAILABLE");
    }
    if (
      !workspace.ok ||
      workspace.value.workspaceId !== workspaceId ||
      workspace.value.accessStatus !== "AVAILABLE"
    ) {
      return corporationFailure("WORKSPACE_UNAVAILABLE");
    }

    try {
      const input = {
        command: {
          commandId: request.commandId,
          commandType: operation,
          requestHash: requestHash({
            schemaVersion: request.schemaVersion,
            commandId: request.commandId,
            corporationId: request.corporationId,
            expectedVersion: request.expectedVersion,
          }),
        },
        corporationId: request.corporationId,
        expectedVersion: request.expectedVersion,
        now: this.#clock(),
        eventId: this.#uuid(),
      };
      return {
        ok: true,
        value:
          operation === "PAUSE"
            ? this.#repository.pause(input)
            : this.#repository.resume(input),
      };
    } catch (error) {
      if (error instanceof CorporationNotFoundError) {
        return corporationFailure("NOT_FOUND");
      }
      if (error instanceof CorporationVersionConflictError) {
        return corporationFailure("VERSION_CONFLICT");
      }
      if (error instanceof CorporationStateConflictError) {
        return corporationFailure("STATE_CONFLICT");
      }
      if (error instanceof CorporationCommandConflictError) {
        return corporationFailure("COMMAND_CONFLICT");
      }
      return corporationFailure("STORAGE_UNAVAILABLE");
    }
  }
}

function requestHash(value: Readonly<Record<string, unknown>>): string {
  return createHash("sha256")
    .update(JSON.stringify(value), "utf8")
    .digest("hex");
}
