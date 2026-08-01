import { createHash } from "node:crypto";
import {
  type ProviderDeleteKeyRequest,
  type ProviderErrorCode,
  type ProviderItemResult,
  type ProviderListResult,
  type ProviderRevealKeyRequest,
  type ProviderRevealKeyResult,
  type ProviderSaveRequest,
} from "@ai-corporation/protocols";
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
  "deleteKey" | "get" | "getEncryptedKey" | "hasVaultEntries" | "list" | "save"
>;

export class ProviderService {
  readonly #clock: () => string;
  readonly #repository: Repository;
  readonly #uuid: () => string;
  readonly #vault: ProviderKeyVault;

  constructor(options: {
    readonly clock?: () => string;
    readonly repository: Repository;
    readonly uuid?: () => string;
    readonly vault: ProviderKeyVault;
  }) {
    this.#clock = options.clock ?? (() => new Date().toISOString());
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

function requestHash(value: Readonly<Record<string, unknown>>): string {
  return createHash("sha256")
    .update(JSON.stringify(value), "utf8")
    .digest("hex");
}
