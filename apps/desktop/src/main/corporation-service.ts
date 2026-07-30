import { createHash } from "node:crypto";
import {
  corporationErrorMessages,
  corporationNameSchema,
  type CorporationArchiveRequest,
  type CorporationCreateRequest,
  type CorporationErrorCode,
  type CorporationGetRequest,
  type CorporationItemResult,
  type CorporationListRequest,
  type CorporationListResult,
  type CorporationPublic,
  type CorporationUpdateNameRequest,
  type WorkspaceRevalidateIpcResult,
} from "@ai-corporation/protocols";
import {
  CorporationCommandConflictError,
  CorporationNotFoundError,
  type CorporationRepository,
  CorporationStateConflictError,
  CorporationVersionConflictError,
} from "@ai-corporation/storage";
import { createUuidV7 } from "./uuid-v7";

type Repository = Pick<
  CorporationRepository,
  "archive" | "create" | "get" | "list" | "updateName"
>;

export class CorporationService {
  readonly #clock: () => string;
  readonly #repository: Repository;
  readonly #revalidateWorkspace: (
    workspaceId: string,
  ) => Promise<WorkspaceRevalidateIpcResult>;
  readonly #uuid: () => string;

  constructor(options: {
    readonly clock?: () => string;
    readonly repository: Repository;
    readonly revalidateWorkspace: (
      workspaceId: string,
    ) => Promise<WorkspaceRevalidateIpcResult>;
    readonly uuid?: () => string;
  }) {
    this.#clock = options.clock ?? (() => new Date().toISOString());
    this.#repository = options.repository;
    this.#revalidateWorkspace = options.revalidateWorkspace;
    this.#uuid = options.uuid ?? createUuidV7;
  }

  async create(
    request: CorporationCreateRequest,
  ): Promise<CorporationItemResult> {
    let workspace: WorkspaceRevalidateIpcResult;
    try {
      workspace = await this.#revalidateWorkspace(request.workspaceId);
    } catch {
      return failure("WORKSPACE_UNAVAILABLE");
    }
    if (
      !workspace.ok ||
      workspace.value.workspaceId !== request.workspaceId ||
      workspace.value.accessStatus !== "AVAILABLE"
    ) {
      return failure("WORKSPACE_UNAVAILABLE");
    }

    try {
      const now = this.#clock();
      const corporation: CorporationPublic = {
        schemaVersion: "1.0",
        id: this.#uuid(),
        workspaceId: request.workspaceId,
        name: corporationNameSchema.parse(request.name),
        status: "DRAFT",
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      return {
        ok: true,
        value: this.#repository.create({
          command: {
            commandId: request.commandId,
            commandType: "CREATE",
            requestHash: requestHash({
              schemaVersion: request.schemaVersion,
              commandId: request.commandId,
              workspaceId: request.workspaceId,
              name: corporation.name,
            }),
          },
          corporation,
          event: {
            eventId: this.#uuid(),
            eventType: "corporation.created",
            corporationId: corporation.id,
            aggregateVersion: 1,
            occurredAt: now,
            payload: {
              workspaceId: corporation.workspaceId,
              name: corporation.name,
              status: "DRAFT",
            },
          },
        }),
      };
    } catch (error) {
      return failure(mapError(error));
    }
  }

  get(request: CorporationGetRequest): CorporationItemResult {
    try {
      const corporation = this.#repository.get(request.corporationId);
      return corporation === undefined
        ? failure("NOT_FOUND")
        : { ok: true, value: corporation };
    } catch {
      return failure("STORAGE_UNAVAILABLE");
    }
  }

  list(request: CorporationListRequest): CorporationListResult {
    try {
      return {
        ok: true,
        value: [
          ...this.#repository.list(
            request.workspaceId,
            request.includeArchived ?? false,
          ),
        ],
      };
    } catch {
      return failure("STORAGE_UNAVAILABLE");
    }
  }

  updateName(request: CorporationUpdateNameRequest): CorporationItemResult {
    const name = corporationNameSchema.parse(request.name);
    try {
      return {
        ok: true,
        value: this.#repository.updateName({
          command: {
            commandId: request.commandId,
            commandType: "UPDATE_NAME",
            requestHash: requestHash({
              schemaVersion: request.schemaVersion,
              commandId: request.commandId,
              corporationId: request.corporationId,
              expectedVersion: request.expectedVersion,
              name,
            }),
          },
          corporationId: request.corporationId,
          expectedVersion: request.expectedVersion,
          name,
          now: this.#clock(),
          eventId: this.#uuid(),
        }),
      };
    } catch (error) {
      return failure(mapError(error));
    }
  }

  archive(request: CorporationArchiveRequest): CorporationItemResult {
    try {
      return {
        ok: true,
        value: this.#repository.archive({
          command: {
            commandId: request.commandId,
            commandType: "ARCHIVE",
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
        }),
      };
    } catch (error) {
      return failure(mapError(error));
    }
  }
}

export function corporationFailure(
  code: CorporationErrorCode,
): CorporationItemResult & CorporationListResult {
  return failure(code);
}

function failure(
  code: CorporationErrorCode,
): Extract<CorporationItemResult, { ok: false }> {
  return {
    ok: false,
    error: { code, message: corporationErrorMessages[code] },
  };
}

function mapError(error: unknown): CorporationErrorCode {
  if (error instanceof CorporationNotFoundError) {
    return "NOT_FOUND";
  }
  if (error instanceof CorporationVersionConflictError) {
    return "VERSION_CONFLICT";
  }
  if (error instanceof CorporationStateConflictError) {
    return "STATE_CONFLICT";
  }
  if (error instanceof CorporationCommandConflictError) {
    return "COMMAND_CONFLICT";
  }
  return "STORAGE_UNAVAILABLE";
}

function requestHash(value: Readonly<Record<string, unknown>>): string {
  return createHash("sha256")
    .update(JSON.stringify(value), "utf8")
    .digest("hex");
}
