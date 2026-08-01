import { createHash } from "node:crypto";
import {
  type ProviderCancelConnectionTestRequest,
  type ProviderCancelConnectionTestResult,
  type ProviderConnectionTestResult,
  type ProviderDeleteKeyRequest,
  type ProviderErrorCode,
  type ProviderItemResult,
  type ProviderListResult,
  type ProviderRevealKeyRequest,
  type ProviderRevealKeyResult,
  type ProviderSaveRequest,
  type ProviderTestConnectionRequest,
} from "@ai-corporation/protocols";
import {
  OpenAiCompatibleProvider,
  ProviderAdapterConfigError,
  ProviderAdapterError,
  type ModelProvider,
} from "@ai-corporation/providers";
import {
  ProviderCommandConflictError,
  ProviderDataError,
  ProviderNotFoundError,
  type ProviderRepository,
  ProviderVersionConflictError,
} from "@ai-corporation/storage";
import { createUuidV7 } from "./uuid-v7";
import {
  ProviderKeyVault,
  VaultIntegrityError,
  VaultKeyUnavailableError,
} from "./provider-key-vault";

type Repository = Pick<
  ProviderRepository,
  | "deleteKey"
  | "get"
  | "getEncryptedKey"
  | "hasVaultEntries"
  | "list"
  | "save"
  | "saveConnectionTest"
>;

type ActiveConnectionTest = {
  readonly controller: AbortController;
};

export class ProviderService {
  readonly #clock: () => string;
  readonly #activeConnectionTests = new Map<string, ActiveConnectionTest>();
  readonly #finishedConnectionTestIds = new Set<string>();
  readonly #finishedConnectionTestOrder: string[] = [];
  readonly #adapter: ModelProvider;
  readonly #repository: Repository;
  readonly #uuid: () => string;
  readonly #vault: ProviderKeyVault;

  constructor(options: {
    readonly clock?: () => string;
    readonly adapter?: ModelProvider;
    readonly repository: Repository;
    readonly uuid?: () => string;
    readonly vault: ProviderKeyVault;
  }) {
    this.#clock = options.clock ?? (() => new Date().toISOString());
    this.#adapter = options.adapter ?? new OpenAiCompatibleProvider();
    this.#repository = options.repository;
    this.#uuid = options.uuid ?? createUuidV7;
    this.#vault = options.vault;
  }

  list(): ProviderListResult {
    try {
      return { ok: true, value: [...this.#repository.list()] };
    } catch (error) {
      return providerFailure(mapError(error));
    }
  }

  save(request: ProviderSaveRequest): ProviderItemResult {
    try {
      const providerId = request.providerId ?? this.#uuid();
      let vaultEntryId: string | undefined;
      let encrypted;
      if (request.key !== undefined) {
        if (request.providerId !== undefined) {
          const existing = this.#repository.get(request.providerId);
          if (existing === undefined) throw new ProviderNotFoundError();
          vaultEntryId = existing.hasKey
            ? this.#repository.getEncryptedKey(request.providerId).entryId
            : this.#uuid();
        } else {
          vaultEntryId = this.#uuid();
        }
        encrypted = this.#vault.encrypt(
          request.key,
          vaultEntryId,
          !this.#repository.hasVaultEntries(),
        );
      }
      return {
        ok: true,
        value: this.#repository.save({
          command: {
            commandId: request.commandId,
            commandType: "SAVE",
            requestHash: requestHash(request),
          },
          providerId,
          ...(vaultEntryId === undefined ? {} : { vaultEntryId }),
          ...(encrypted === undefined ? {} : { encrypted }),
          ...(request.expectedVersion === undefined
            ? {}
            : { expectedVersion: request.expectedVersion }),
          name: request.name,
          endpoint: request.endpoint,
          configStatus: request.configStatus,
          now: this.#clock(),
        }),
      };
    } catch (error) {
      return providerFailure(mapError(error));
    }
  }

  revealKey(request: ProviderRevealKeyRequest): ProviderRevealKeyResult {
    try {
      const stored = this.#repository.getEncryptedKey(request.providerId);
      return {
        ok: true,
        value: {
          schemaVersion: 1,
          providerId: request.providerId,
          key: this.#vault.decrypt(stored.encrypted, stored.entryId),
        },
      };
    } catch (error) {
      return providerFailure(mapError(error));
    }
  }

  deleteKey(request: ProviderDeleteKeyRequest): ProviderItemResult {
    try {
      return {
        ok: true,
        value: this.#repository.deleteKey({
          command: {
            commandId: request.commandId,
            commandType: "DELETE_KEY",
            requestHash: requestHash(request),
          },
          providerId: request.providerId,
          expectedVersion: request.expectedVersion,
          now: this.#clock(),
        }),
      };
    } catch (error) {
      return providerFailure(mapError(error));
    }
  }

  async testConnection(
    request: ProviderTestConnectionRequest,
  ): Promise<ProviderConnectionTestResult> {
    if (
      this.#activeConnectionTests.has(request.requestId) ||
      this.#finishedConnectionTestIds.has(request.requestId)
    ) {
      return connectionTestFailure("ALREADY_TESTING");
    }
    let active: ActiveConnectionTest | undefined;
    try {
      const provider = this.#repository.get(request.providerId);
      if (provider === undefined) return connectionTestFailure("NOT_FOUND");
      if (provider.version !== request.expectedVersion) {
        return connectionTestFailure("CONFLICT");
      }
      if (!provider.hasKey) return connectionTestFailure("MISSING_KEY");
      const stored = this.#repository.getEncryptedKey(request.providerId);
      const key = this.#vault.decrypt(stored.encrypted, stored.entryId);
      active = {
        controller: new AbortController(),
      };
      this.#activeConnectionTests.set(request.requestId, active);
      try {
        const models = await this.#adapter.listModels(
          { endpoint: provider.endpoint, key },
          active.controller.signal,
        );
        const snapshot = {
          status: "VERIFIED" as const,
          providerVersion: provider.version,
          testedAt: this.#clock(),
          models: [...models],
        };
        return {
          ok: true,
          value: this.#repository.saveConnectionTest({
            providerId: provider.id,
            expectedVersion: provider.version,
            snapshot,
          }),
        };
      } catch (error) {
        if (
          error instanceof ProviderAdapterError &&
          error.failure.reason === "CANCELLED"
        ) {
          return connectionTestFailure("CANCELLED");
        }
        const failure = normalizeAdapterFailure(error);
        const snapshot = {
          status: "FAILED" as const,
          providerVersion: provider.version,
          testedAt: this.#clock(),
          failure,
          models: [] as [],
        };
        return {
          ok: true,
          value: this.#repository.saveConnectionTest({
            providerId: provider.id,
            expectedVersion: provider.version,
            snapshot,
          }),
        };
      }
    } catch (error) {
      return connectionTestFailure(mapConnectionTestError(error));
    } finally {
      if (
        active !== undefined &&
        this.#activeConnectionTests.get(request.requestId) === active
      ) {
        this.#activeConnectionTests.delete(request.requestId);
        this.#rememberFinishedConnectionTest(request.requestId);
      }
    }
  }

  cancelConnectionTest(
    request: ProviderCancelConnectionTestRequest,
  ): ProviderCancelConnectionTestResult {
    const active = this.#activeConnectionTests.get(request.requestId);
    if (active === undefined) {
      return cancellationFailure("NOT_FOUND");
    }
    active.controller.abort();
    return {
      ok: true,
      value: {
        schemaVersion: 1,
        requestId: request.requestId,
        cancelled: true,
      },
    };
  }

  #rememberFinishedConnectionTest(requestId: string): void {
    this.#finishedConnectionTestIds.add(requestId);
    this.#finishedConnectionTestOrder.push(requestId);
    if (this.#finishedConnectionTestOrder.length <= 1_024) return;
    const expired = this.#finishedConnectionTestOrder.shift();
    if (expired !== undefined) this.#finishedConnectionTestIds.delete(expired);
  }
}

export function providerFailure(code: ProviderErrorCode): {
  readonly ok: false;
  readonly error: {
    readonly code: ProviderErrorCode;
    readonly message: "Provider operation failed";
  };
} {
  return { ok: false, error: { code, message: "Provider operation failed" } };
}

function mapError(error: unknown): ProviderErrorCode {
  if (error instanceof ProviderNotFoundError) return "NOT_FOUND";
  if (error instanceof ProviderVersionConflictError) return "CONFLICT";
  if (error instanceof ProviderCommandConflictError) {
    return "IDEMPOTENCY_CONFLICT";
  }
  if (error instanceof VaultKeyUnavailableError) {
    return "VAULT_KEY_UNAVAILABLE";
  }
  if (
    error instanceof VaultIntegrityError ||
    error instanceof ProviderDataError
  ) {
    return "VAULT_INTEGRITY_FAILED";
  }
  return "STORAGE_UNAVAILABLE";
}

function normalizeAdapterFailure(error: unknown) {
  if (error instanceof ProviderAdapterError) return error.failure;
  if (error instanceof ProviderAdapterConfigError) {
    return { reason: "INVALID_REQUEST" as const, retryable: false };
  }
  return {
    reason: "PROVIDER_INTERNAL" as const,
    retryable: false,
  };
}

function mapConnectionTestError(
  error: unknown,
):
  | "NOT_FOUND"
  | "CONFLICT"
  | "VAULT_KEY_UNAVAILABLE"
  | "VAULT_INTEGRITY_FAILED"
  | "STORAGE_UNAVAILABLE" {
  if (error instanceof ProviderNotFoundError) return "NOT_FOUND";
  if (error instanceof ProviderVersionConflictError) return "CONFLICT";
  if (error instanceof VaultKeyUnavailableError) return "VAULT_KEY_UNAVAILABLE";
  if (
    error instanceof VaultIntegrityError ||
    error instanceof ProviderDataError
  ) {
    return "VAULT_INTEGRITY_FAILED";
  }
  return "STORAGE_UNAVAILABLE";
}

function connectionTestFailure(
  code:
    | "NOT_FOUND"
    | "CONFLICT"
    | "MISSING_KEY"
    | "ALREADY_TESTING"
    | "CANCELLED"
    | "VAULT_KEY_UNAVAILABLE"
    | "VAULT_INTEGRITY_FAILED"
    | "STORAGE_UNAVAILABLE",
): ProviderConnectionTestResult {
  return {
    ok: false,
    error: { code, message: "Provider connection test failed" },
  };
}

function cancellationFailure(
  code: "NOT_FOUND" | "STORAGE_UNAVAILABLE",
): ProviderCancelConnectionTestResult {
  return {
    ok: false,
    error: {
      code,
      message: "Provider connection test cancellation failed",
    },
  };
}

function requestHash(value: Readonly<Record<string, unknown>>): string {
  return createHash("sha256")
    .update(JSON.stringify(value), "utf8")
    .digest("hex");
}
