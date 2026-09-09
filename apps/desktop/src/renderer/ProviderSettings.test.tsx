import { describe, expect, it } from "vitest";
import type { ProviderFailureReason } from "@ai-corporation/protocols";
import {
  connectionFailureMessage,
  connectionLabel,
  connectionOperationMessage,
  generationFailureMessage,
  generationLabel,
  generationOperationMessage,
  validateProviderEndpointForUi,
} from "./ProviderSettings";

describe("ProviderSettings connection view model", () => {
  it.each([
    "AUTHENTICATION",
    "PERMISSION",
    "RATE_LIMIT",
    "QUOTA_EXHAUSTED",
    "INVALID_REQUEST",
    "MODEL_NOT_FOUND",
    "CONTENT_FILTER",
    "TIMEOUT",
    "NETWORK",
    "PROVIDER_INTERNAL",
    "CANCELLED",
  ] satisfies readonly ProviderFailureReason[])(
    "maps %s to a safe actionable message",
    (reason) => {
      const message = connectionFailureMessage(reason);
      expect(message.length).toBeGreaterThan(20);
      expect(message).not.toMatch(/authorization|bearer|stack|raw response/iu);
    },
  );

  it.each([
    "NOT_FOUND",
    "CONFLICT",
    "MISSING_KEY",
    "ALREADY_TESTING",
    "VAULT_KEY_UNAVAILABLE",
    "VAULT_INTEGRITY_FAILED",
    "STORAGE_UNAVAILABLE",
  ])("maps operation error %s without claiming success", (code) => {
    const message = connectionOperationMessage(code);
    expect(message).not.toMatch(/success|verified/iu);
    expect(message.length).toBeGreaterThan(20);
  });

  it("keeps connection status separate from runtime health labels", () => {
    expect(connectionLabel({ status: "UNVERIFIED" })).toBe("尚未验证");
    expect(
      connectionLabel({
        status: "FAILED",
        providerVersion: 1,
        testedAt: "2026-08-02T00:00:00.000Z",
        failure: { reason: "NETWORK", retryable: true },
        models: [],
      }),
    ).toBe("测试失败");
    expect(
      connectionLabel({
        status: "VERIFIED",
        providerVersion: 1,
        testedAt: "2026-08-02T00:00:00.000Z",
        models: [],
      }),
    ).toBe("已验证");
  });

  it("provides field-level Endpoint safety guidance", () => {
    expect(
      validateProviderEndpointForUi("https://api.example.test/v1"),
    ).toBeUndefined();
    expect(
      validateProviderEndpointForUi("http://127.0.0.1:1234/v1"),
    ).toBeUndefined();
    expect(
      validateProviderEndpointForUi("http://remote.example.test/v1"),
    ).toMatch(/HTTPS/iu);
    expect(
      validateProviderEndpointForUi("https://user:pass@example.test/v1?x=1"),
    ).toMatch(/凭据/u);
    expect(validateProviderEndpointForUi("file:///tmp/provider")).toMatch(
      /HTTP/iu,
    );
  });

  it("keeps generation status dialect-neutral and separate from runtime health", () => {
    expect(generationLabel({ status: "IDLE" })).toBe("尚未测试");
    expect(
      generationLabel({
        status: "SUCCEEDED",
        providerVersion: 1,
        modelId: "model-a",
        outputPreview: "ok",
        stopReason: "COMPLETED",
        usage: { costSource: "UNKNOWN" },
        completedAt: "2026-08-02T04:00:00.000Z",
      }),
    ).toBe("生成成功");
  });

  it.each([
    "NOT_FOUND",
    "CONFLICT",
    "MISSING_KEY",
    "DISABLED",
    "UNVERIFIED",
    "MODEL_NOT_SELECTED",
    "MODEL_STALE",
    "ALREADY_GENERATING",
    "VAULT_KEY_UNAVAILABLE",
    "VAULT_INTEGRITY_FAILED",
    "STORAGE_UNAVAILABLE",
  ])(
    "maps generation operation %s without leaking or claiming success",
    (code) => {
      const message = generationOperationMessage(code);
      expect(message.length).toBeGreaterThan(20);
      expect(message).not.toMatch(
        /bearer|authorization|raw response|success/iu,
      );
    },
  );

  it.each([
    "MODEL_NOT_FOUND",
    "CONTENT_FILTER",
  ] satisfies readonly ProviderFailureReason[])(
    "provides an actionable generation failure for %s",
    (reason) => {
      expect(generationFailureMessage(reason).length).toBeGreaterThan(20);
    },
  );
});
