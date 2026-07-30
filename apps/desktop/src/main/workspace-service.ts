import {
  workspacePublicSchema,
  type WorkspaceAccessStatus,
  type WorkspaceCanonicalizeResult,
  type WorkspaceIpcErrorCode,
  type WorkspaceListIpcResult,
  type WorkspaceRevalidateIpcResult,
  type WorkspaceSelectIpcResult,
  type WorkspaceTrustedRecord,
} from "@ai-corporation/protocols";
import {
  WorkspaceNotFoundError,
  type WorkspaceRepository,
} from "@ai-corporation/storage";
import {
  WorkspaceNativeError,
  type NativeCoreClient,
} from "./native-core-client";
import { createUuidV7 } from "./uuid-v7";

type Repository = Pick<
  WorkspaceRepository,
  | "getTrusted"
  | "getTrustedByCanonicalRoot"
  | "listPublic"
  | "saveAuthorized"
  | "updateVerification"
>;
type NativeClient = Pick<NativeCoreClient, "canonicalizeWorkspace">;

export class WorkspaceService {
  readonly #clock: () => string;
  readonly #nativeClient: () => NativeClient | undefined;
  readonly #repository: Repository;
  readonly #uuid: () => string;

  constructor(options: {
    readonly clock?: () => string;
    readonly nativeClient: () => NativeClient | undefined;
    readonly repository: Repository;
    readonly uuid?: () => string;
  }) {
    this.#clock = options.clock ?? (() => new Date().toISOString());
    this.#nativeClient = options.nativeClient;
    this.#repository = options.repository;
    this.#uuid = options.uuid ?? createUuidV7;
  }

  list(): WorkspaceListIpcResult {
    try {
      return { ok: true, value: [...this.#repository.listPublic()] };
    } catch {
      return failure("STORAGE_UNAVAILABLE");
    }
  }

  saveAuthorized(
    name: string,
    record: WorkspaceTrustedRecord,
    now = this.#clock(),
  ): void {
    this.#repository.saveAuthorized(name, record, now);
  }

  async authorizeSelectedRoot(
    displayPath: string,
  ): Promise<WorkspaceSelectIpcResult> {
    const client = this.#nativeClient();
    if (client === undefined) {
      return failure("NATIVE_CORE_UNAVAILABLE");
    }

    let result: WorkspaceCanonicalizeResult;
    try {
      result = await client.canonicalizeWorkspace(displayPath, "");
    } catch {
      return failure("VERIFICATION_FAILED");
    }
    if (result.permissionMode === undefined) {
      return failure("VERIFICATION_FAILED");
    }

    const verifiedAt = this.#clock();
    try {
      const existing = this.#repository.getTrustedByCanonicalRoot(
        result.canonicalRootPath,
      );
      if (existing !== undefined) {
        if (!sameIdentity(existing.pathIdentity, result.pathIdentity)) {
          return failure("VERIFICATION_FAILED");
        }
        const updated = this.#repository.updateVerification(
          existing.workspaceId,
          {
            accessStatus: "AVAILABLE",
            lastVerifiedAt: verifiedAt,
            permissionMode: result.permissionMode,
          },
        );
        return selected(updated);
      }

      let workspaceId: string;
      try {
        workspaceId = this.#uuid();
      } catch {
        return failure("SELECTION_UNAVAILABLE");
      }
      const trusted: WorkspaceTrustedRecord = {
        workspaceId,
        displayPath,
        canonicalRootPath: result.canonicalRootPath,
        permissionMode: result.permissionMode,
        accessStatus: "AVAILABLE",
        pathIdentity: result.pathIdentity,
        lastVerifiedAt: verifiedAt,
      };
      this.#repository.saveAuthorized(displayPath, trusted, verifiedAt);
      return selected(trusted);
    } catch {
      return failure("STORAGE_UNAVAILABLE");
    }
  }

  async revalidate(workspaceId: string): Promise<WorkspaceRevalidateIpcResult> {
    let trusted: WorkspaceTrustedRecord | undefined;
    try {
      trusted = this.#repository.getTrusted(workspaceId);
    } catch {
      return failure("STORAGE_UNAVAILABLE");
    }
    if (trusted === undefined) {
      return failure("WORKSPACE_NOT_FOUND");
    }

    const client = this.#nativeClient();
    if (client === undefined) {
      return failure("NATIVE_CORE_UNAVAILABLE");
    }

    const verifiedAt = this.#clock();
    try {
      const result = await client.canonicalizeWorkspace(
        trusted.canonicalRootPath,
        "",
      );
      return this.#applySuccessfulVerification(trusted, result, verifiedAt);
    } catch (error) {
      if (error instanceof WorkspaceNativeError) {
        return this.#applyNativeFailure(trusted, error, verifiedAt);
      }
      return failure("VERIFICATION_FAILED");
    }
  }

  #applySuccessfulVerification(
    trusted: WorkspaceTrustedRecord,
    result: WorkspaceCanonicalizeResult,
    verifiedAt: string,
  ): WorkspaceRevalidateIpcResult {
    const identityMatches =
      JSON.stringify(trusted.pathIdentity) ===
      JSON.stringify(result.pathIdentity);
    const complete = identityMatches && result.permissionMode !== undefined;
    return this.#persist(
      trusted.workspaceId,
      complete ? "AVAILABLE" : "UNVERIFIED",
      complete ? result.permissionMode : null,
      verifiedAt,
    );
  }

  #applyNativeFailure(
    trusted: WorkspaceTrustedRecord,
    error: WorkspaceNativeError,
    verifiedAt: string,
  ): WorkspaceRevalidateIpcResult {
    let accessStatus: WorkspaceAccessStatus;
    switch (error.reason) {
      case "ROOT_NOT_FOUND":
        accessStatus = "MISSING";
        break;
      case "PERMISSION_DENIED":
        accessStatus = "PERMISSION_DENIED";
        break;
      case "INVALID_PATH":
      case "PATH_IDENTITY_UNAVAILABLE":
        accessStatus = "UNVERIFIED";
        break;
      case "PERMISSION_PROBE_FAILED":
      case "PERMISSION_PROBE_CLEANUP_FAILED": {
        const persisted = this.#persist(
          trusted.workspaceId,
          "UNVERIFIED",
          null,
          verifiedAt,
        );
        return persisted.ok ? failure("VERIFICATION_FAILED") : persisted;
      }
      default:
        return failure("VERIFICATION_FAILED");
    }
    return this.#persist(trusted.workspaceId, accessStatus, null, verifiedAt);
  }

  #persist(
    workspaceId: string,
    accessStatus: WorkspaceAccessStatus,
    permissionMode: WorkspaceCanonicalizeResult["permissionMode"] | null,
    verifiedAt: string,
  ): WorkspaceRevalidateIpcResult {
    try {
      const updated = this.#repository.updateVerification(workspaceId, {
        accessStatus,
        lastVerifiedAt: verifiedAt,
        permissionMode: permissionMode ?? null,
      });
      return {
        ok: true,
        value: workspacePublicSchema.parse({
          workspaceId: updated.workspaceId,
          displayPath: updated.displayPath,
          permissionMode: updated.permissionMode,
          accessStatus: updated.accessStatus,
        }),
      };
    } catch (error) {
      return failure(
        error instanceof WorkspaceNotFoundError
          ? "WORKSPACE_NOT_FOUND"
          : "STORAGE_UNAVAILABLE",
      );
    }
  }
}

export function failure(
  code: WorkspaceIpcErrorCode,
): Extract<WorkspaceRevalidateIpcResult, { ok: false }> {
  return {
    ok: false,
    error: {
      code,
      message: "Workspace operation failed",
    },
  };
}

function selected(record: WorkspaceTrustedRecord): WorkspaceSelectIpcResult {
  return {
    ok: true,
    value: {
      status: "SELECTED",
      workspace: workspacePublicSchema.parse({
        workspaceId: record.workspaceId,
        displayPath: record.displayPath,
        permissionMode: record.permissionMode,
        accessStatus: record.accessStatus,
      }),
    },
  };
}

function sameIdentity(
  left: WorkspaceTrustedRecord["pathIdentity"],
  right: WorkspaceTrustedRecord["pathIdentity"],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
