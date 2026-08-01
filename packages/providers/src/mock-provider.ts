import type { ProviderModelDescriptor } from "@ai-corporation/protocols";
import {
  ProviderAdapterConfigError,
  ProviderAdapterError,
  type ModelProvider,
  type ProviderAdapterConfig,
  type ProviderFailure,
} from "./model-provider";

export type MockProviderOutcome =
  | { readonly type: "SUCCESS"; readonly modelIds: readonly string[] }
  | { readonly type: "FAILURE"; readonly failure: ProviderFailure };

export class DeterministicMockProvider implements ModelProvider {
  readonly #clock: () => string;
  readonly #outcome: MockProviderOutcome;

  constructor(
    outcome: MockProviderOutcome,
    clock: () => string = () => new Date().toISOString(),
  ) {
    this.#outcome = outcome;
    this.#clock = clock;
  }

  descriptor() {
    return { type: "MOCK" as const, displayName: "Deterministic Mock" };
  }

  validateConfig(config: ProviderAdapterConfig): void {
    if (config.endpoint.length === 0 || config.key.length === 0) {
      throw new ProviderAdapterConfigError();
    }
  }

  async listModels(
    config: ProviderAdapterConfig,
    signal: AbortSignal,
  ): Promise<readonly ProviderModelDescriptor[]> {
    this.validateConfig(config);
    if (signal.aborted) {
      throw new ProviderAdapterError({
        reason: "CANCELLED",
        retryable: false,
      });
    }
    if (this.#outcome.type === "FAILURE") {
      throw new ProviderAdapterError(this.#outcome.failure);
    }
    const observedAt = this.#clock();
    return [...new Set(this.#outcome.modelIds)].map((id) => ({
      id,
      displayName: id,
      source: "PROVIDER" as const,
      observedAt,
    }));
  }
}
