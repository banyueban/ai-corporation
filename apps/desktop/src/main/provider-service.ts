import { createHash } from "node:crypto";
import {
  type ProviderCancelConnectionTestRequest,
  type ProviderCancelConnectionTestResult,
  type ProviderCancelGenerationTestRequest,
  type ProviderCancelGenerationTestResult,
  type ProviderConnectionTestResult,
  type ProviderGenerationTestResult,
  type ProviderDeleteKeyRequest,
  type ProviderErrorCode,
  type ProviderItemResult,
  type ProviderListResult,
  type ProviderRevealKeyRequest,
  type ProviderRevealKeyResult,
  type ProviderSaveRequest,
  type ProviderTestConnectionRequest,
  type ProviderTestGenerationRequest,
  type NormalizedGenerationRequest,
  type NormalizedGenerationResponse,
} from "@ai-corporation/protocols";
import {
  OpenAiChatCompletionsAdapter,
  ProviderAdapterConfigError,
  ProviderAdapterError,
  ProviderAdapterRegistry,
  type ProviderApiDialect,
  type ModelProvider,
} from "@ai-corporation/providers";
import {
  ProviderCommandConflictError,
  ProviderDataError,
  ProviderModelSelectionError,
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
  | "saveGenerationTest"
>;

type ActiveConnectionTest = {
  readonly controller: AbortController;
};

export class ProviderService {
  readonly #clock: () => string;
  readonly #activeConnectionTests = new Map<string, ActiveConnectionTest>();
  readonly #finishedConnectionTestIds = new Set<string>();
  readonly #finishedConnectionTestOrder: string[] = [];
  readonly #activeGenerationTests = new Map<string, ActiveConnectionTest>();
  readonly #finishedGenerationTestIds = new Set<string>();
  readonly #finishedGenerationTestOrder: string[] = [];
  readonly #adapterOverride: ModelProvider | undefined;
  readonly #adapters: ProviderAdapterRegistry;
  readonly #repository: Repository;
  readonly #uuid: () => string;
  readonly #vault: ProviderKeyVault;

  constructor(options: {
    readonly clock?: () => string;
    readonly adapter?: ModelProvider;
    readonly adapters?: readonly ModelProvider[];
    readonly repository: Repository;
    readonly uuid?: () => string;
    readonly vault: ProviderKeyVault;
  }) {
    this.#clock = options.clock ?? (() => new Date().toISOString());
    this.#adapterOverride = options.adapter;
    const adapters = options.adapters ?? [new OpenAiChatCompletionsAdapter()];
    this.#adapters = new ProviderAdapterRegistry(adapters);
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
          ...(request.apiDialect === undefined
            ? {}
            : { apiDialect: request.apiDialect }),
          ...(request.selectedModelId === undefined
            ? {}
            : { selectedModelId: request.selectedModelId }),
          ...(request.generationTimeoutMs === undefined
            ? {}
            : { generationTimeoutMs: request.generationTimeoutMs }),
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
        const models = await this.#resolveAdapter(
          provider.apiDialect ?? "CHAT_COMPLETIONS",
        ).listModels(
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

  async testGeneration(
    request: ProviderTestGenerationRequest,
  ): Promise<ProviderGenerationTestResult> {
    if (
      this.#activeGenerationTests.has(request.requestId) ||
      this.#finishedGenerationTestIds.has(request.requestId)
    ) {
      return generationTestFailure("ALREADY_GENERATING");
    }
    let active: ActiveConnectionTest | undefined;
    try {
      const provider = this.#repository.get(request.providerId);
      if (provider === undefined) return generationTestFailure("NOT_FOUND");
      if (provider.version !== request.expectedVersion) {
        return generationTestFailure("CONFLICT");
      }
      if (provider.configStatus !== "ENABLED") {
        return generationTestFailure("DISABLED");
      }
      if (!provider.hasKey) return generationTestFailure("MISSING_KEY");
      if (provider.connectionTest?.status !== "VERIFIED") {
        return generationTestFailure("UNVERIFIED");
      }
      if (provider.selectedModelId === undefined) {
        return generationTestFailure("MODEL_NOT_SELECTED");
      }
      if (
        !provider.connectionTest.models.some(
          ({ id }) => id === provider.selectedModelId,
        )
      ) {
        return generationTestFailure("MODEL_STALE");
      }
      const stored = this.#repository.getEncryptedKey(request.providerId);
      const key = this.#vault.decrypt(stored.encrypted, stored.entryId);
      active = { controller: new AbortController() };
      this.#activeGenerationTests.set(request.requestId, active);
      try {
        const response = await this.#resolveAdapter(
          provider.apiDialect ?? "CHAT_COMPLETIONS",
        ).generate(
          {
            endpoint: provider.endpoint,
            key,
            generationTimeoutMs: provider.generationTimeoutMs ?? 60_000,
          },
          {
            modelId: provider.selectedModelId,
            input: request.input,
            maxOutputTokens: request.maxOutputTokens,
            ...(request.temperature === undefined
              ? {}
              : { temperature: request.temperature }),
          },
          active.controller.signal,
        );
        return {
          ok: true,
          value: this.#repository.saveGenerationTest({
            providerId: provider.id,
            expectedVersion: provider.version,
            snapshot: {
              status: "SUCCEEDED",
              providerVersion: provider.version,
              modelId: response.modelId,
              outputPreview: createOutputPreview(response.outputParts),
              stopReason: response.stopReason,
              usage: response.usage,
              completedAt: this.#clock(),
            },
          }),
        };
      } catch (error) {
        if (
          error instanceof ProviderAdapterError &&
          error.failure.reason === "CANCELLED"
        ) {
          return generationTestFailure("CANCELLED");
        }
        const failure = normalizeAdapterFailure(error);
        return {
          ok: true,
          value: this.#repository.saveGenerationTest({
            providerId: provider.id,
            expectedVersion: provider.version,
            snapshot: {
              status: "FAILED",
              providerVersion: provider.version,
              modelId: provider.selectedModelId,
              failure,
              completedAt: this.#clock(),
            },
          }),
        };
      }
    } catch (error) {
      return generationTestFailure(mapGenerationTestError(error));
    } finally {
      if (
        active !== undefined &&
        this.#activeGenerationTests.get(request.requestId) === active
      ) {
        this.#activeGenerationTests.delete(request.requestId);
        rememberFinished(
          request.requestId,
          this.#finishedGenerationTestIds,
          this.#finishedGenerationTestOrder,
        );
      }
    }
  }

  cancelGenerationTest(
    request: ProviderCancelGenerationTestRequest,
  ): ProviderCancelGenerationTestResult {
    const active = this.#activeGenerationTests.get(request.requestId);
    if (active === undefined) return generationCancellationFailure("NOT_FOUND");
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

  async generate(
    request: {
      readonly providerId: string;
      readonly expectedVersion: number;
      readonly modelId?: string;
      readonly generation: Omit<NormalizedGenerationRequest, "modelId">;
    },
    signal: AbortSignal,
  ): Promise<NormalizedGenerationResponse> {
    this.assertReady(
      request.providerId,
      request.expectedVersion,
      request.modelId,
    );
    const provider = this.#repository.get(request.providerId);
    if (provider === undefined)
      throw new ProviderRuntimeUnavailableError("NOT_FOUND");
    const modelId = request.modelId ?? provider.selectedModelId;
    if (modelId === undefined) {
      throw new ProviderRuntimeUnavailableError("MODEL_NOT_SELECTED");
    }
    const stored = this.#repository.getEncryptedKey(request.providerId);
    const key = this.#vault.decrypt(stored.encrypted, stored.entryId);
    return this.#resolveAdapter(
      provider.apiDialect ?? "CHAT_COMPLETIONS",
    ).generate(
      {
        endpoint: provider.endpoint,
        key,
        generationTimeoutMs: provider.generationTimeoutMs ?? 60_000,
      },
      { modelId, ...request.generation },
      signal,
    );
  }

  assertReady(
    providerId: string,
    expectedVersion: number,
    requestedModelId?: string,
  ): void {
    const provider = this.#repository.get(providerId);
    if (provider === undefined)
      throw new ProviderRuntimeUnavailableError("NOT_FOUND");
    if (provider.version !== expectedVersion)
      throw new ProviderRuntimeUnavailableError("VERSION_CONFLICT");
    if (provider.configStatus !== "ENABLED")
      throw new ProviderRuntimeUnavailableError("DISABLED");
    if (!provider.hasKey)
      throw new ProviderRuntimeUnavailableError("MISSING_KEY");
    const connectionTest = provider.connectionTest;
    if (connectionTest?.status !== "VERIFIED")
      throw new ProviderRuntimeUnavailableError("UNVERIFIED");
    const modelId = requestedModelId ?? provider.selectedModelId;
    if (modelId === undefined)
      throw new ProviderRuntimeUnavailableError("MODEL_NOT_SELECTED");
    if (!connectionTest.models.some(({ id }) => id === modelId))
      throw new ProviderRuntimeUnavailableError("MODEL_STALE");
    const stored = this.#repository.getEncryptedKey(providerId);
    this.#vault.decrypt(stored.encrypted, stored.entryId);
  }

  #rememberFinishedConnectionTest(requestId: string): void {
    rememberFinished(
      requestId,
      this.#finishedConnectionTestIds,
      this.#finishedConnectionTestOrder,
    );
  }

  #resolveAdapter(dialect: ProviderApiDialect): ModelProvider {
    if (this.#adapterOverride !== undefined) return this.#adapterOverride;
    return this.#adapters.resolve(dialect);
  }
}

export class ProviderRuntimeUnavailableError extends Error {
  constructor(
    readonly reason:
      | "NOT_FOUND"
      | "VERSION_CONFLICT"
      | "DISABLED"
      | "MISSING_KEY"
      | "UNVERIFIED"
      | "MODEL_NOT_SELECTED"
      | "MODEL_STALE",
  ) {
    super("Provider runtime is unavailable");
    this.name = "ProviderRuntimeUnavailableError";
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
  if (error instanceof ProviderModelSelectionError) return "INVALID_REQUEST";
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

function mapGenerationTestError(
  error: unknown,
):
  | "NOT_FOUND"
  | "CONFLICT"
  | "VAULT_KEY_UNAVAILABLE"
  | "VAULT_INTEGRITY_FAILED"
  | "STORAGE_UNAVAILABLE" {
  return mapConnectionTestError(error);
}

function generationTestFailure(
  code:
    | "NOT_FOUND"
    | "CONFLICT"
    | "MISSING_KEY"
    | "DISABLED"
    | "UNVERIFIED"
    | "MODEL_NOT_SELECTED"
    | "MODEL_STALE"
    | "ALREADY_GENERATING"
    | "CANCELLED"
    | "VAULT_KEY_UNAVAILABLE"
    | "VAULT_INTEGRITY_FAILED"
    | "STORAGE_UNAVAILABLE",
): ProviderGenerationTestResult {
  return {
    ok: false,
    error: { code, message: "Provider generation test failed" },
  };
}

function generationCancellationFailure(
  code: "NOT_FOUND" | "STORAGE_UNAVAILABLE",
): ProviderCancelGenerationTestResult {
  return {
    ok: false,
    error: {
      code,
      message: "Provider generation test cancellation failed",
    },
  };
}

function rememberFinished(
  requestId: string,
  ids: Set<string>,
  order: string[],
): void {
  ids.add(requestId);
  order.push(requestId);
  if (order.length <= 1_024) return;
  const expired = order.shift();
  if (expired !== undefined) ids.delete(expired);
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

function createOutputPreview(
  parts: readonly { readonly kind: "TEXT"; readonly text: string }[],
): string {
  const value = parts.map(({ text }) => text).join("\n");
  return value.length <= 65_536 ? value : value.slice(0, 65_536);
}
