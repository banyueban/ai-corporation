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

export interface ProviderAdapterDescriptor {
  readonly type: "OPENAI_COMPATIBLE" | "MOCK";
  readonly displayName: string;
  readonly dialect: "CHAT_COMPLETIONS" | "RESPONSES" | "MOCK";
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
