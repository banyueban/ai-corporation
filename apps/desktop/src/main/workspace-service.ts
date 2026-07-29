import {
  workspacePublicSchema,
  type WorkspaceAccessStatus,
  type WorkspaceCanonicalizeResult,
  type WorkspaceIpcErrorCode,
  type WorkspaceListIpcResult,
  type WorkspaceRevalidateIpcResult,
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

type Repository = Pick<
  WorkspaceRepository,
  "getTrusted" | "listPublic" | "saveAuthorized" | "updateVerification"
>;
type NativeClient = Pick<NativeCoreClient, "canonicalizeWorkspace">;

export class WorkspaceService {
  readonly #clock: () => string;
  readonly #nativeClient: () => NativeClient | undefined;
  readonly #repository: Repository;

  constructor(options: {
    readonly clock?: () => string;
    readonly nativeClient: () => NativeClient | undefined;
    readonly repository: Repository;
  }) {
    this.#clock = options.clock ?? (() => new Date().toISOString());
    this.#nativeClient = options.nativeClient;
    this.#repository = options.repository;
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
