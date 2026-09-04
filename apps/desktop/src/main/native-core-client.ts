import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createInterface, type Interface } from "node:readline";
import {
  HEALTH_RPC_METHOD,
  HEALTH_SCHEMA_VERSION,
  healthResultSchema,
  healthRpcResponseSchema,
  WORKSPACE_CANONICALIZE_RPC_METHOD,
  WORKSPACE_COPY_ASSET_RPC_METHOD,
  WORKSPACE_CREATE_BINARY_RPC_METHOD,
  WORKSPACE_INSPECT_FILE_RPC_METHOD,
  WORKSPACE_LIST_RPC_METHOD,
  WORKSPACE_READ_TEXT_RPC_METHOD,
  WORKSPACE_SCHEMA_VERSION,
  WORKSPACE_WRITE_TEXT_RPC_METHOD,
  workspaceCanonicalizeResultSchema,
  workspaceCanonicalizeRpcResponseSchema,
  workspaceCopyAssetResultSchema,
  workspaceCopyAssetRpcResponseSchema,
  workspaceCreateBinaryResultSchema,
  workspaceCreateBinaryRpcResponseSchema,
  workspaceInspectFileResultSchema,
  workspaceInspectFileRpcResponseSchema,
  workspaceListResultSchema,
  workspaceListRpcResponseSchema,
  workspaceReadTextResultSchema,
  workspaceReadTextRpcResponseSchema,
  workspaceWriteTextResultSchema,
  workspaceWriteTextRpcResponseSchema,
  type HealthResult,
  type WorkspaceCanonicalizeResult,
  type WorkspaceCopyAssetResult,
  type WorkspaceCreateBinaryResult,
  type WorkspaceInspectFileResult,
  type WorkspaceListResult,
  type WorkspacePathErrorReason,
  type WorkspaceReadTextResult,
  type WorkspaceWriteTextResult,
} from "@ai-corporation/protocols";

const REQUEST_TIMEOUT_MS = 5_000;
const ASSET_COPY_TIMEOUT_MS = 30_000;
const SESSION_TOKEN_ENV = "AI_CORPORATION_SESSION_TOKEN";

interface PendingRequest {
  readonly reject: (error: Error) => void;
  readonly receive: (response: unknown) => void;
  readonly timeout: NodeJS.Timeout;
}

export class WorkspaceNativeError extends Error {
  readonly reason: WorkspacePathErrorReason;

  constructor(reason: WorkspacePathErrorReason) {
    super("Native Core rejected the Workspace request");
    this.name = "WorkspaceNativeError";
    this.reason = reason;
  }
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
    return this.#request(
      HEALTH_RPC_METHOD,
      {
        schemaVersion: HEALTH_SCHEMA_VERSION,
        sessionToken: this.#sessionToken,
      },
      (response) => {
        const parsed = healthRpcResponseSchema.safeParse(response);
        if (!parsed.success || parsed.data.error !== undefined) {
          throw new Error("Native Core rejected the request");
        }
        const result = healthResultSchema.safeParse(parsed.data.result);
        if (!result.success) {
          throw new Error("Native Core returned an invalid response");
        }
        return result.data;
      },
    );
  }

  canonicalizeWorkspace(
    rootPath: string,
    candidateRelativePath = "",
  ): Promise<WorkspaceCanonicalizeResult> {
    return this.#request(
      WORKSPACE_CANONICALIZE_RPC_METHOD,
      {
        schemaVersion: WORKSPACE_SCHEMA_VERSION,
        sessionToken: this.#sessionToken,
        rootPath,
        candidateRelativePath,
      },
      (response) => {
        const parsed =
          workspaceCanonicalizeRpcResponseSchema.safeParse(response);
        if (!parsed.success) {
          throw new Error("Native Core returned an invalid response");
        }
        if (parsed.data.error !== undefined) {
          throw new WorkspaceNativeError(parsed.data.error.data.reason);
        }
        const result = workspaceCanonicalizeResultSchema.safeParse(
          parsed.data.result,
        );
        if (!result.success) {
          throw new Error("Native Core returned an invalid response");
        }
        return result.data;
      },
    );
  }

  listWorkspace(
    rootPath: string,
    relativePath = "",
  ): Promise<WorkspaceListResult> {
    return this.#workspaceRequest(
      WORKSPACE_LIST_RPC_METHOD,
      { rootPath, relativePath },
      workspaceListRpcResponseSchema,
      workspaceListResultSchema,
    );
  }

  readWorkspaceText(
    rootPath: string,
    relativePath: string,
  ): Promise<WorkspaceReadTextResult> {
    return this.#workspaceRequest(
      WORKSPACE_READ_TEXT_RPC_METHOD,
      { rootPath, relativePath },
      workspaceReadTextRpcResponseSchema,
      workspaceReadTextResultSchema,
    );
  }

  inspectWorkspaceFile(
    rootPath: string,
    relativePath: string,
  ): Promise<WorkspaceInspectFileResult> {
    return this.#workspaceRequest(
      WORKSPACE_INSPECT_FILE_RPC_METHOD,
      { rootPath, relativePath },
      workspaceInspectFileRpcResponseSchema,
      workspaceInspectFileResultSchema,
    );
  }

  writeWorkspaceText(
    rootPath: string,
    relativePath: string,
    content: string,
    baseSha256?: string,
  ): Promise<WorkspaceWriteTextResult> {
    return this.#workspaceRequest(
      WORKSPACE_WRITE_TEXT_RPC_METHOD,
      {
        rootPath,
        relativePath,
        content,
        ...(baseSha256 === undefined ? {} : { baseSha256 }),
      },
      workspaceWriteTextRpcResponseSchema,
      workspaceWriteTextResultSchema,
    );
  }

  copyWorkspaceAsset(
    sourceRootPath: string,
    sourceRelativePath: string,
    expectedSha256: string,
    expectedSizeBytes: number,
    rootPath: string,
    relativePath: string,
  ): Promise<WorkspaceCopyAssetResult> {
    return this.#workspaceRequest(
      WORKSPACE_COPY_ASSET_RPC_METHOD,
      {
        sourceRootPath,
        sourceRelativePath,
        expectedSha256,
        expectedSizeBytes,
        rootPath,
        relativePath,
      },
      workspaceCopyAssetRpcResponseSchema,
      workspaceCopyAssetResultSchema,
      ASSET_COPY_TIMEOUT_MS,
    );
  }

  createWorkspaceBinary(
    rootPath: string,
    relativePath: string,
    content: Uint8Array,
  ): Promise<WorkspaceCreateBinaryResult> {
    return this.#workspaceRequest(
      WORKSPACE_CREATE_BINARY_RPC_METHOD,
      {
        rootPath,
        relativePath,
        contentBase64: Buffer.from(content).toString("base64"),
      },
      workspaceCreateBinaryRpcResponseSchema,
      workspaceCreateBinaryResultSchema,
      ASSET_COPY_TIMEOUT_MS,
    );
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
    const parsed = this.#safeParseJson(line);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("id" in parsed) ||
      typeof parsed.id !== "string"
    ) {
      return;
    }

    const pending = this.#pending.get(parsed.id);
    if (pending === undefined) {
      return;
    }

    clearTimeout(pending.timeout);
    this.#pending.delete(parsed.id);
    pending.receive(parsed);
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

  #workspaceRequest<T>(
    method: string,
    params: Readonly<Record<string, unknown>>,
    responseSchema: {
      safeParse(
        value: unknown,
      ): { success: true; data: unknown } | { success: false; error?: unknown };
    },
    resultSchema: {
      safeParse(
        value: unknown,
      ): { success: true; data: T } | { success: false };
    },
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<T> {
    return this.#request(
      method,
      {
        schemaVersion: WORKSPACE_SCHEMA_VERSION,
        sessionToken: this.#sessionToken,
        ...params,
      },
      (response) => {
        const parsed = responseSchema.safeParse(response);
        if (!parsed.success)
          throw new Error("Native Core returned an invalid response");
        const envelope = parsed.data as {
          readonly result?: unknown;
          readonly error?: {
            readonly data: { readonly reason: WorkspacePathErrorReason };
          };
        };
        if (envelope.error !== undefined) {
          throw new WorkspaceNativeError(envelope.error.data.reason);
        }
        const result = resultSchema.safeParse(envelope.result);
        if (!result.success)
          throw new Error("Native Core returned an invalid response");
        return result.data;
      },
      timeoutMs,
    );
  }

  #request<T>(
    method: string,
    params: Readonly<Record<string, unknown>>,
    parseResponse: (response: unknown) => T,
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<T> {
    const id = randomUUID();

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error("Native Core request timed out"));
      }, timeoutMs);
      const receive = (response: unknown) => {
        try {
          resolve(parseResponse(response));
        } catch (error) {
          reject(
            error instanceof Error
              ? error
              : new Error("Native Core returned an invalid response"),
          );
        }
      };
      this.#pending.set(id, { receive, reject, timeout });

      this.#process.stdin.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id,
          method,
          params,
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
}
