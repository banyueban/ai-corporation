import type {
  NormalizedGenerationRequest,
  NormalizedGenerationResponse,
  ProviderFailureReason,
  ProviderModelDescriptor,
} from "@ai-corporation/protocols";

export interface ProviderAdapterConfig {
  readonly endpoint: string;
  readonly key: string;
}

export type ProviderApiDialect = "CHAT_COMPLETIONS" | "RESPONSES" | "MOCK";

export interface ProviderAdapterDescriptor {
  readonly type: "OPENAI_COMPATIBLE" | "MOCK";
  readonly displayName: string;
  readonly dialect: ProviderApiDialect;
}

export interface ProviderGenerationConfig extends ProviderAdapterConfig {
  readonly generationTimeoutMs: number;
}

export interface ProviderFailure {
  readonly reason: ProviderFailureReason;
  readonly retryable: boolean;
  readonly suggestedBackoffMs?: number;
}

export interface ModelProvider {
  descriptor(): ProviderAdapterDescriptor;
  validateConfig(config: ProviderAdapterConfig): void;
  listModels(
    config: ProviderAdapterConfig,
    signal: AbortSignal,
  ): Promise<readonly ProviderModelDescriptor[]>;
  generate(
    config: ProviderGenerationConfig,
    request: NormalizedGenerationRequest,
    signal: AbortSignal,
  ): Promise<NormalizedGenerationResponse>;
}

export class ProviderAdapterError extends Error {
  readonly failure: ProviderFailure;

  constructor(failure: ProviderFailure) {
    super("Provider request failed");
    this.name = "ProviderAdapterError";
    this.failure = failure;
  }
}

export class ProviderAdapterConfigError extends Error {
  constructor() {
    super("Provider configuration is invalid");
    this.name = "ProviderAdapterConfigError";
  }
}

export class ProviderAdapterRegistry {
  readonly #adapters = new Map<ProviderApiDialect, ModelProvider>();

  constructor(adapters: readonly ModelProvider[]) {
    for (const adapter of adapters) {
      const dialect = adapter.descriptor().dialect;
      if (this.#adapters.has(dialect)) throw new ProviderAdapterConfigError();
      this.#adapters.set(dialect, adapter);
    }
  }

  resolve(dialect: ProviderApiDialect): ModelProvider {
    const adapter = this.#adapters.get(dialect);
    if (adapter === undefined) throw new ProviderAdapterConfigError();
    return adapter;
  }
}
