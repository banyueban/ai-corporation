import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createInterface, type Interface } from "node:readline";
import {
  HEALTH_RPC_METHOD,
  HEALTH_SCHEMA_VERSION,
  healthResultSchema,
  healthRpcResponseSchema,
  type HealthResult,
} from "@ai-corporation/protocols";

const REQUEST_TIMEOUT_MS = 5_000;
const SESSION_TOKEN_ENV = "AI_CORPORATION_SESSION_TOKEN";

interface PendingRequest {
  readonly reject: (error: Error) => void;
  readonly resolve: (result: HealthResult) => void;
  readonly timeout: NodeJS.Timeout;
}

export class NativeCoreClient {
  readonly #pending = new Map<string, PendingRequest>();
  readonly #process: ChildProcessWithoutNullStreams;
  readonly #reader: Interface;
  readonly #sessionToken: string;

  private constructor(
    process: ChildProcessWithoutNullStreams,
    sessionToken: string,
  ) {
    this.#process = process;
    this.#sessionToken = sessionToken;
    this.#reader = createInterface({ input: process.stdout });
    this.#reader.on("line", (line) => {
      this.#handleLine(line);
    });
    process.once("exit", () => {
      this.#rejectAll(new Error("Native Core stopped"));
    });
    process.once("error", () => {
      this.#rejectAll(new Error("Native Core process failed"));
    });
  }

  static async start(executablePath: string): Promise<NativeCoreClient> {
    const sessionToken = randomBytes(32).toString("hex");
    const child = spawn(executablePath, [], {
      env: {
        [SESSION_TOKEN_ENV]: sessionToken,
      },
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    child.stderr.resume();

    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", () => {
        reject(new Error("Native Core could not start"));
      });
    });

    return new NativeCoreClient(child, sessionToken);
  }

  health(): Promise<HealthResult> {
    const id = randomUUID();

    return new Promise<HealthResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error("Native Core request timed out"));
      }, REQUEST_TIMEOUT_MS);

      this.#pending.set(id, { reject, resolve, timeout });

      this.#process.stdin.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id,
          method: HEALTH_RPC_METHOD,
          params: {
            schemaVersion: HEALTH_SCHEMA_VERSION,
            sessionToken: this.#sessionToken,
          },
        })}\n`,
        (error) => {
          if (error !== null && error !== undefined) {
            const pending = this.#pending.get(id);
            if (pending !== undefined) {
              clearTimeout(pending.timeout);
              this.#pending.delete(id);
              pending.reject(
                new Error("Native Core request could not be sent"),
              );
            }
          }
        },
      );
    });
  }

  stop(): void {
    this.#reader.close();
    this.#rejectAll(new Error("Native Core stopped"));
    this.#process.stdin.end();
    if (!this.#process.killed) {
      this.#process.kill();
    }
  }

  #handleLine(line: string): void {
    const parsed = healthRpcResponseSchema.safeParse(this.#safeParseJson(line));
    if (!parsed.success || typeof parsed.data.id !== "string") {
      return;
    }

    const pending = this.#pending.get(parsed.data.id);
    if (pending === undefined) {
      return;
    }

    clearTimeout(pending.timeout);
    this.#pending.delete(parsed.data.id);

    if (parsed.data.error !== undefined) {
      pending.reject(new Error("Native Core rejected the request"));
      return;
    }

    const result = healthResultSchema.safeParse(parsed.data.result);
    if (!result.success) {
      pending.reject(new Error("Native Core returned an invalid response"));
      return;
    }

    pending.resolve(result.data);
  }

  #rejectAll(error: Error): void {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.#pending.clear();
  }

  #safeParseJson(line: string): unknown {
    try {
      return JSON.parse(line) as unknown;
    } catch {
      return undefined;
    }
  }
}
