import { describe, expect, it } from "vitest";
import {
  SECURE_STORE_GET_RPC_METHOD,
  SECURE_STORE_MAX_SECRET_BYTES,
  SECURE_STORE_SCHEMA_VERSION,
  SECURE_STORE_SET_RPC_METHOD,
  secureStoreDeleteRpcResponseSchema,
  secureStoreGetRpcResponseSchema,
  secureStoreSetRpcRequestSchema,
  secureStoreSetRpcResponseSchema,
  secureStoreStatusRpcResponseSchema,
} from "./secure-store";

const secretRef = "019fa9bb-375e-7d90-a4e3-a5b0eea2a9ef";
const sessionToken = "a".repeat(64);

describe("secure store protocol", () => {
  it("accepts strict set and get shapes", () => {
    expect(
      secureStoreSetRpcRequestSchema.safeParse({
        jsonrpc: "2.0",
        id: "set-1",
        method: SECURE_STORE_SET_RPC_METHOD,
        params: {
          schemaVersion: SECURE_STORE_SCHEMA_VERSION,
          sessionToken,
          secretRef,
          secret: "test-only-provider-key",
        },
      }).success,
    ).toBe(true);
    expect(
      secureStoreGetRpcResponseSchema.safeParse({
        jsonrpc: "2.0",
        id: "get-1",
        result: {
          schemaVersion: SECURE_STORE_SCHEMA_VERSION,
          secret: "test-only-provider-key",
        },
      }).success,
    ).toBe(true);
  });

  it.each([
    ["extra field", { extra: true }],
    ["empty secret", { secret: "" }],
    ["control character", { secret: "secret\nvalue" }],
    [
      "oversized secret",
      { secret: "s".repeat(SECURE_STORE_MAX_SECRET_BYTES + 1) },
    ],
    ["invalid reference", { secretRef: "not-a-uuid" }],
  ])("rejects %s", (_name, override) => {
    expect(
      secureStoreSetRpcRequestSchema.safeParse({
        jsonrpc: "2.0",
        id: "set-invalid",
        method: SECURE_STORE_SET_RPC_METHOD,
        params: {
          schemaVersion: SECURE_STORE_SCHEMA_VERSION,
          sessionToken,
          secretRef,
          secret: "test-only-provider-key",
          ...override,
        },
      }).success,
    ).toBe(false);
  });

  it("rejects the wrong method and ambiguous responses", () => {
    expect(
      secureStoreSetRpcRequestSchema.safeParse({
        jsonrpc: "2.0",
        id: "wrong-method",
        method: SECURE_STORE_GET_RPC_METHOD,
        params: {
          schemaVersion: SECURE_STORE_SCHEMA_VERSION,
          sessionToken,
          secretRef,
          secret: "test-only-provider-key",
        },
      }).success,
    ).toBe(false);
    expect(
      secureStoreStatusRpcResponseSchema.safeParse({
        jsonrpc: "2.0",
        id: "ambiguous",
        result: {
          schemaVersion: SECURE_STORE_SCHEMA_VERSION,
          available: true,
        },
        error: {
          code: -32_020,
          message: "Secure store operation failed",
          data: { reason: "UNAVAILABLE" },
        },
      }).success,
    ).toBe(false);
  });

  it("keeps set and delete result shapes distinct", () => {
    expect(
      secureStoreSetRpcResponseSchema.safeParse({
        jsonrpc: "2.0",
        id: "set",
        result: { schemaVersion: 1, deleted: true },
      }).success,
    ).toBe(false);
    expect(
      secureStoreDeleteRpcResponseSchema.safeParse({
        jsonrpc: "2.0",
        id: "delete",
        result: { schemaVersion: 1, stored: true },
      }).success,
    ).toBe(false);
  });
});
