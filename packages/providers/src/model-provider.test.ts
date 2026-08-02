import { describe, expect, it } from "vitest";
import type {
  NormalizedGenerationRequest,
  NormalizedGenerationResponse,
  ProviderModelDescriptor,
} from "@ai-corporation/protocols";
import {
  ProviderAdapterConfigError,
  ProviderAdapterRegistry,
  type ModelProvider,
  type ProviderApiDialect,
  type ProviderGenerationConfig,
} from "./model-provider";

describe("ProviderAdapterRegistry", () => {
  it("keeps Chat and future Responses adapters side by side and resolves exactly by dialect", () => {
    const chat = adapter("CHAT_COMPLETIONS", "Chat");
    const responses = adapter("RESPONSES", "Responses");
    const registry = new ProviderAdapterRegistry([chat, responses]);

    expect(registry.resolve("CHAT_COMPLETIONS")).toBe(chat);
    expect(registry.resolve("RESPONSES")).toBe(responses);
    expect(registry.resolve("CHAT_COMPLETIONS")).not.toBe(responses);
  });

  it("rejects replacement by duplicate dialect and unknown dialect resolution", () => {
    expect(
      () =>
        new ProviderAdapterRegistry([
          adapter("CHAT_COMPLETIONS", "Chat A"),
          adapter("CHAT_COMPLETIONS", "Chat B"),
        ]),
    ).toThrow(ProviderAdapterConfigError);
    expect(() =>
      new ProviderAdapterRegistry([
        adapter("CHAT_COMPLETIONS", "Chat"),
      ]).resolve("RESPONSES"),
    ).toThrow(ProviderAdapterConfigError);
  });
});

function adapter(
  dialect: ProviderApiDialect,
  displayName: string,
): ModelProvider {
  return {
    descriptor: () => ({
      type: "OPENAI_COMPATIBLE",
      displayName,
      dialect,
    }),
    validateConfig: () => undefined,
    listModels: async (): Promise<readonly ProviderModelDescriptor[]> => [],
    generate: async (
      _config: ProviderGenerationConfig,
      request: NormalizedGenerationRequest,
    ): Promise<NormalizedGenerationResponse> => ({
      modelId: request.modelId,
      outputParts: [{ kind: "TEXT", text: displayName }],
      stopReason: "COMPLETED",
      usage: { costSource: "UNKNOWN" },
    }),
  };
}
