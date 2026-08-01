import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createInterface } from "node:readline";

const SESSION_TOKEN_ENV = "AI_CORPORATION_SESSION_TOKEN";
const RPC_TIMEOUT_MS = 10_000;

export async function verifyNativeSecureStoreJourney(executablePath) {
  const secretRef = randomUUID();
  const firstSecret = `M2-TU-01-first-${randomUUID()}`;
  const rotatedSecret = `M2-TU-01-rotated-${randomUUID()}`;
  let deleted = false;
  let primaryError;
  let cleanupError;

  try {
    await withNativeCore(executablePath, async (nativeCore) => {
      assertSuccess(await nativeCore.request("secure_store.status", {}), {
        available: true,
      });
      assertSuccess(
        await nativeCore.request("secure_store.set", {
          secretRef,
          secret: firstSecret,
        }),
        { stored: true },
        firstSecret,
      );
      assertSecret(
        await nativeCore.request("secure_store.get", { secretRef }),
        firstSecret,
      );
      assertSuccess(
        await nativeCore.request("secure_store.set", {
          secretRef,
          secret: rotatedSecret,
        }),
        { stored: true },
        rotatedSecret,
      );
      assertSecret(
        await nativeCore.request("secure_store.get", { secretRef }),
        rotatedSecret,
      );
      nativeCore.assertDiagnosticsRedacted([firstSecret, rotatedSecret]);
    });

    await withNativeCore(executablePath, async (nativeCore) => {
      assertSecret(
        await nativeCore.request("secure_store.get", { secretRef }),
        rotatedSecret,
      );
      assertSuccess(
        await nativeCore.request("secure_store.delete", { secretRef }),
        { deleted: true },
      );
      deleted = true;
      nativeCore.assertDiagnosticsRedacted([firstSecret, rotatedSecret]);
    });

    await withNativeCore(executablePath, async (nativeCore) => {
      assertError(
        await nativeCore.request("secure_store.get", { secretRef }),
        "NOT_FOUND",
        [firstSecret, rotatedSecret],
      );
      nativeCore.assertDiagnosticsRedacted([firstSecret, rotatedSecret]);
    });
  } catch (error) {
    primaryError = error;
  }

  if (!deleted) {
    try {
      await withNativeCore(executablePath, async (nativeCore) => {
        const response = await nativeCore.request("secure_store.delete", {
          secretRef,
        });
        if (
          response?.result?.deleted !== true &&
          response?.error?.data?.reason !== "NOT_FOUND"
        ) {
          throw new Error("Secure store fixture cleanup failed");
        }
        nativeCore.assertDiagnosticsRedacted([firstSecret, rotatedSecret]);
      });
    } catch (error) {
      cleanupError = error;
    }
  }

  if (primaryError !== undefined && cleanupError !== undefined) {
    throw new AggregateError(
      [primaryError, cleanupError],
      "Secure store journey and fixture cleanup failed",
      { cause: primaryError },
    );
  }
  if (primaryError !== undefined) {
    throw new Error("Secure store journey failed", { cause: primaryError });
  }
  if (cleanupError !== undefined) {
    throw new Error("Secure store fixture cleanup failed", {
      cause: cleanupError,
    });
  }
}

async function withNativeCore(executablePath, operation) {
  const nativeCore = await NativeRpcProcess.start(executablePath);
  try {
    return await operation(nativeCore);
  } finally {
    await nativeCore.stop();
  }
}

class NativeRpcProcess {
  static async start(executablePath) {
    const sessionToken = randomBytes(32).toString("hex");
    const child = spawn(executablePath, [], {
      env: { ...process.env, [SESSION_TOKEN_ENV]: sessionToken },
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const nativeProcess = new NativeRpcProcess(child, sessionToken);
    await nativeProcess.spawned;
    return nativeProcess;
  }

  constructor(child, sessionToken) {
    this.child = child;
    this.sessionToken = sessionToken;
    this.pending = new Map();
    this.diagnostics = [];
    this.reader = createInterface({ input: child.stdout });
    this.spawned = new Promise((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", () =>
        reject(new Error("Native Core could not start")),
      );
    });
    this.reader.on("line", (line) => this.receive(line));
    child.stderr.on("data", (chunk) => {
      if (
        this.diagnostics.reduce((sum, item) => sum + item.length, 0) < 32_768
      ) {
        this.diagnostics.push(Buffer.from(chunk));
      }
    });
    child.once("exit", () => this.rejectPending());
    child.once("error", () => this.rejectPending());
  }

  request(method, fields) {
    if (this.child.exitCode !== null) {
      return Promise.reject(new Error("Native Core stopped"));
    }
    const id = randomUUID();
    const payload = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params: {
        schemaVersion: 1,
        sessionToken: this.sessionToken,
        ...fields,
      },
    });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Native Core secure store request timed out"));
      }, RPC_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timeout });
      this.child.stdin.write(`${payload}\n`, (error) => {
        if (error !== null && error !== undefined) {
          const pending = this.pending.get(id);
          if (pending !== undefined) {
            clearTimeout(pending.timeout);
            this.pending.delete(id);
            pending.reject(new Error("Native Core request could not be sent"));
          }
        }
      });
    });
  }

  receive(line) {
    let response;
    try {
      response = JSON.parse(line);
    } catch {
      return;
    }
    const pending =
      response !== null && typeof response.id === "string"
        ? this.pending.get(response.id)
        : undefined;
    if (pending === undefined) return;
    clearTimeout(pending.timeout);
    this.pending.delete(response.id);
    pending.resolve(response);
  }

  rejectPending() {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Native Core stopped"));
    }
    this.pending.clear();
  }

  assertDiagnosticsRedacted(secrets) {
    const diagnostics = Buffer.concat(this.diagnostics).toString("utf8");
    for (const secret of secrets) {
      if (diagnostics.includes(secret)) {
        throw new Error(
          "Native Core diagnostics exposed a secure-store secret",
        );
      }
    }
  }

  async stop() {
    this.reader.close();
    this.child.stdin.end();
    if (this.child.exitCode !== null) return;
    if (await waitForExit(this.child, 5_000)) return;
    this.child.kill();
    await waitForExit(this.child, 5_000);
  }
}

function assertSuccess(response, expected, secret) {
  if (
    response?.jsonrpc !== "2.0" ||
    response?.result?.schemaVersion !== 1 ||
    Object.entries(expected).some(
      ([key, value]) => response.result[key] !== value,
    )
  ) {
    throw new Error(
      "Native Core secure store returned an invalid success response",
    );
  }
  if (secret !== undefined && JSON.stringify(response).includes(secret)) {
    throw new Error("Secure store mutation response exposed a secret");
  }
}

function assertSecret(response, expectedSecret) {
  if (
    response?.jsonrpc !== "2.0" ||
    response?.result?.schemaVersion !== 1 ||
    response?.result?.secret !== expectedSecret
  ) {
    throw new Error(
      "Native Core secure store returned an invalid secret response",
    );
  }
}

function assertError(response, reason, secrets) {
  if (
    response?.jsonrpc !== "2.0" ||
    response?.error?.code !== -32_020 ||
    response?.error?.message !== "Secure store operation failed" ||
    response?.error?.data?.reason !== reason
  ) {
    throw new Error(
      "Native Core secure store returned an invalid error response",
    );
  }
  const serialized = JSON.stringify(response);
  if (secrets.some((secret) => serialized.includes(secret))) {
    throw new Error("Secure store error response exposed a secret");
  }
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = (exited) => {
      clearTimeout(timeout);
      child.off("exit", onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timeout = setTimeout(
      () => finish(child.exitCode !== null),
      timeoutMs,
    );
    child.once("exit", onExit);
    if (child.exitCode !== null) finish(true);
  });
}
