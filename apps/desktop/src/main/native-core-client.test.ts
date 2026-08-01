import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NativeCoreClient,
  parseSecureStoreDeleteResponse,
  parseSecureStoreGetResponse,
  parseSecureStoreSetResponse,
  parseSecureStoreStatusResponse,
  SecureStoreNativeError,
} from "./native-core-client";

type NativeCoreClientConstructor = new (
  process: ChildProcessWithoutNullStreams,
  sessionToken: string,
) => NativeCoreClient;

function createClientFixture(): {
  readonly child: ChildProcessWithoutNullStreams;
  readonly client: NativeCoreClient;
  readonly stdout: PassThrough;
} {
  const emitter = new EventEmitter();
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const processShape = Object.assign(emitter, {
    stdin,
    stdout,
    stderr,
    exitCode: null,
    killed: false,
    kill: vi.fn(() => true),
  });
  const child = processShape as unknown as ChildProcessWithoutNullStreams;
  const ClientForTest =
    NativeCoreClient as unknown as NativeCoreClientConstructor;
  return {
    child,
    client: new ClientForTest(child, "0".repeat(64)),
    stdout,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

const rpcError = {
  jsonrpc: "2.0",
  id: "secure-store-error",
  error: {
    code: -32_020,
    message: "Secure store operation failed",
    data: { reason: "NOT_FOUND" },
  },
};

describe("NativeCoreClient secure store response boundary", () => {
  it("parses only the typed success shapes", () => {
    expect(
      parseSecureStoreStatusResponse({
        jsonrpc: "2.0",
        id: "status",
        result: { schemaVersion: 1, available: true },
      }),
    ).toEqual({ schemaVersion: 1, available: true });
    expect(
      parseSecureStoreSetResponse({
        jsonrpc: "2.0",
        id: "set",
        result: { schemaVersion: 1, stored: true },
      }),
    ).toEqual({ schemaVersion: 1, stored: true });
    expect(
      parseSecureStoreGetResponse({
        jsonrpc: "2.0",
        id: "get",
        result: { schemaVersion: 1, secret: "test-only-secret" },
      }),
    ).toEqual({ schemaVersion: 1, secret: "test-only-secret" });
    expect(
      parseSecureStoreDeleteResponse({
        jsonrpc: "2.0",
        id: "delete",
        result: { schemaVersion: 1, deleted: true },
      }),
    ).toEqual({ schemaVersion: 1, deleted: true });
  });

  it("maps fixed Native errors without platform details", () => {
    expect(() => parseSecureStoreGetResponse(rpcError)).toThrowError(
      new SecureStoreNativeError("NOT_FOUND"),
    );
  });

  it("rejects malformed responses without echoing a secret", () => {
    const secret = "M2-TU-01-do-not-echo";
    let message = "";
    try {
      parseSecureStoreGetResponse({
        jsonrpc: "2.0",
        id: "malformed",
        result: { schemaVersion: 1, secret, extra: secret },
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toBe("Native Core returned an invalid response");
    expect(message).not.toContain(secret);
  });

  it("rejects a pending secure store request when the Sidecar exits", async () => {
    const { child, client } = createClientFixture();
    const pending = client.secureStoreStatus();

    child.emit("exit", 1, null);

    await expect(pending).rejects.toThrow("Native Core stopped");
    client.stop();
  });

  it("times out a secure store request and clears its pending state", async () => {
    vi.useFakeTimers();
    const { client } = createClientFixture();
    const pending = client.secureStoreStatus();
    const rejection = expect(pending).rejects.toThrow(
      "Native Core request timed out",
    );

    await vi.advanceTimersByTimeAsync(5_000);

    await rejection;
    client.stop();
  });

  it("rejects an invalid secure store response received from the Sidecar", async () => {
    const { child, client, stdout } = createClientFixture();
    child.stdin.once("data", (chunk: Buffer) => {
      const request = JSON.parse(chunk.toString("utf8")) as { id: string };
      stdout.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { available: true } })}\n`,
      );
    });

    await expect(client.secureStoreStatus()).rejects.toThrow(
      "Native Core returned an invalid response",
    );
    client.stop();
  });

  it("does not expose secure store methods to Preload or DesktopApi", () => {
    const preloadSource = readFileSync(
      fileURLToPath(new URL("../preload/index.ts", import.meta.url)),
      "utf8",
    );
    const desktopApiSource = readFileSync(
      fileURLToPath(new URL("../shared/desktop-api.ts", import.meta.url)),
      "utf8",
    );

    expect(preloadSource).not.toMatch(/secure.?store|secretRef|api.?key/iu);
    expect(desktopApiSource).not.toMatch(/secure.?store|secretRef|api.?key/iu);
  });
});
