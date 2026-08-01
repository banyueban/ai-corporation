import { describe, expect, it } from "vitest";
import type { ProviderErrorCode } from "@ai-corporation/protocols";
import { providerErrorMessage } from "./provider-settings-view-model";

describe("ProviderSettings recovery messages", () => {
  it.each<[ProviderErrorCode, RegExp]>([
    ["INVALID_REQUEST", /check.+retry/iu],
    ["UNAUTHORIZED_CALLER", /not authorized/iu],
    ["NOT_FOUND", /reload/iu],
    ["CONFLICT", /reload before saving/iu],
    ["IDEMPOTENCY_CONFLICT", /already used/iu],
    ["VAULT_KEY_UNAVAILABLE", /no Key change was saved/iu],
    ["VAULT_INTEGRITY_FAILED", /delete it and enter a new Key/iu],
    ["STORAGE_UNAVAILABLE", /input is retained/iu],
    ["INTERNAL", /no successful Key change was confirmed/iu],
  ])("maps %s to a fixed impact and recovery message", (code, expected) => {
    expect(providerErrorMessage(code)).toMatch(expected);
  });
});
