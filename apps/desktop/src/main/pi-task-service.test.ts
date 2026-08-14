import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  applyMigrations,
  loadMigrations,
  PiTaskRepository,
} from "@ai-corporation/storage";
import { afterEach, describe, expect, it } from "vitest";
import { SkillLibrary } from "./skill-library";
import { PiTaskService } from "./pi-task-service";

describe("PiTaskService", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  });

  it("streams model output, writes a real workspace text result, and waits for acceptance", async () => {
    const fixture = await startOpenAiFixture();
    cleanups.push(fixture.close);
    const root = path.join(tmpdir(), `M7-TU-01-${crypto.randomUUID()}`);
    const source = path.join(root, "source");
    const managed = path.join(root, "managed");
    await mkdir(source, { recursive: true });
    await writeFile(
      path.join(source, "SKILL.md"),
      "---\nname: text-organize\ndescription: 整理文字\n---\n把结果写清楚。\n",
      "utf8",
    );
    cleanups.push(() => rm(root, { recursive: true, force: true }));
    const library = new SkillLibrary(managed);
    const preview = await library.previewImport(source);
    await library.confirmImport(source, preview.digest);

    const database = new DatabaseSync(":memory:");
    applyMigrations(
      database,
      loadMigrations(
        path.resolve(__dirname, "../../../../packages/storage/migrations"),
      ),
    );
    const employee = {
      schemaVersion: 1 as const,
      id: "019b7f4d-a100-7000-8000-000000000001",
      name: "小文",
      providerId: "019b7f4d-a100-7000-8000-000000000002",
      providerVersion: 1,
      modelId: "pi-fixture-model",
      skillName: "text-organize",
      createdAt: "2026-08-14T00:00:00.000Z",
      updatedAt: "2026-08-14T00:00:00.000Z",
    };
    // 测试只关心 Pi 运行，员工资料由专门的仓储测试覆盖。
    database.exec("PRAGMA foreign_keys = OFF");
    database
      .prepare(
        `INSERT INTO pi_employee (
          id, name, provider_id, provider_version, model_id, skill_name,
          created_at, updated_at
        ) VALUES (?, ?, ?, 1, ?, ?, ?, ?)`,
      )
      .run(
        employee.id,
        employee.name,
        employee.providerId,
        employee.modelId,
        employee.skillName,
        employee.createdAt,
        employee.updatedAt,
      );

    const repository = new PiTaskRepository(database);
    const workspaceId = "019b7f4d-a100-7000-8000-000000000005";
    const writes: Array<{ relativePath: string; content: string }> = [];
    const service = new PiTaskService({
      employeeRepository: { get: () => employee },
      taskRepository: repository,
      skillLibrary: library,
      workspaceRepository: {
        getTrusted: () => ({
          workspaceId,
          displayPath: "测试工作区",
          canonicalRootPath: root,
          permissionMode: "READ_WRITE",
          accessStatus: "AVAILABLE",
          pathIdentity: {
            platform: "windows",
            volumeRoot: "C:",
            rootCreationTime: "1",
          },
          lastVerifiedAt: "2026-08-14T00:00:00.000Z",
        }),
      },
      nativeClient: () => ({
        listWorkspace: async (_rootPath, relativePath) => ({
          schemaVersion: 1,
          relativePath: relativePath ?? "",
          entries: [],
        }),
        readWorkspaceText: async (_rootPath, relativePath) => ({
          schemaVersion: 1,
          relativePath,
          content: "",
          sizeBytes: 0,
          sha256:
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        }),
        writeWorkspaceText: async (_rootPath, relativePath, content) => {
          writes.push({ relativePath, content });
          return {
            schemaVersion: 1,
            relativePath,
            created: true,
            previousSha256: null,
            sha256: createHash("sha256").update(content, "utf8").digest("hex"),
            sizeBytes: Buffer.byteLength(content),
          };
        },
      }),
      resolveRuntime: () => ({
        endpoint: fixture.endpoint,
        key: "M7-TU-01-fake-key",
        timeoutMs: 5_000,
      }),
      createId: () => "019b7f4d-a100-7000-8000-000000000003",
    });

    const started = service.start({
      schemaVersion: 1,
      commandId: "019b7f4d-a100-7000-8000-000000000004",
      employeeId: employee.id,
      workspaceId,
      input: "整理这段测试文字",
    });
    expect(started).toMatchObject({ ok: true, value: { status: "RUNNING" } });
    const completed = await waitForTask(
      repository,
      started.ok ? started.value.id : "",
    );

    expect(completed.status).toBe("WAITING_ACCEPTANCE");
    expect(completed.finalOutput).toContain("整理完成");
    expect(completed.events.map(({ kind }) => kind)).toEqual(
      expect.arrayContaining([
        "MODEL_INPUT",
        "MODEL_OUTPUT",
        "TOOL_START",
        "TOOL_RESULT",
      ]),
    );
    expect(JSON.stringify(completed.events)).not.toContain("M7-TU-01-fake-key");
    expect(writes).toEqual([
      { relativePath: "result.md", content: "整理完成：测试文字。" },
    ]);
    expect(fixture.requests).toHaveLength(2);
    expect(fixture.requests[0]?.authorization).toBe("Bearer M7-TU-01-fake-key");
    expect(fixture.requests[0]?.body).toMatchObject({
      model: "pi-fixture-model",
      stream: true,
    });

    // 模拟应用在文件写完、写入记录尚未确认时退出；恢复只核对哈希，不重复写入。
    database
      .prepare("UPDATE pi_task SET status = 'RUNNING' WHERE id = ?")
      .run(completed.id);
    repository.beginWorkspaceWrite({
      toolCallId: "call-recover-write",
      taskId: completed.id,
      relativePath: "empty.md",
      targetSha256:
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      now: "2026-08-14T00:00:01.000Z",
    });
    await service.recoverWorkspaceWrites();
    expect(
      database
        .prepare("SELECT status FROM pi_workspace_write WHERE tool_call_id = ?")
        .get("call-recover-write"),
    ).toEqual({ status: "SUCCEEDED" });
    expect(writes).toHaveLength(1);
    expect(repository.get(completed.id)?.events.at(-1)?.kind).toBe(
      "TOOL_RESULT",
    );
    database.close();
  });
});

async function waitForTask(repository: PiTaskRepository, id: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const task = repository.get(id);
    if (task !== undefined && task.status !== "RUNNING") return task;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Pi task did not settle");
}

async function startOpenAiFixture() {
  const requests: Array<{ authorization?: string; body: unknown }> = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      requests.push({
        ...(request.headers.authorization === undefined
          ? {}
          : { authorization: request.headers.authorization }),
        body,
      });
      response.writeHead(200, {
        "content-type": "text/event-stream",
        connection: "keep-alive",
      });
      const call = requests.length;
      if (call === 1) {
        sendChunk(response, {
          choices: [
            {
              index: 0,
              delta: {
                role: "assistant",
                tool_calls: [
                  {
                    index: 0,
                    id: "call-check",
                    type: "function",
                    function: {
                      name: "workspace_write_text",
                      arguments:
                        '{"relativePath":"result.md","content":"整理完成：测试文字。"}',
                    },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        });
        sendChunk(response, {
          choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
        });
      } else {
        sendChunk(response, {
          choices: [
            {
              index: 0,
              delta: { role: "assistant", content: "整理完成：测试文字。" },
              finish_reason: null,
            },
          ],
        });
        sendChunk(response, {
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        });
      }
      response.end("data: [DONE]\n\n");
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("No port");
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) =>
          error === undefined ? resolve() : reject(error),
        );
      }),
  };
}

function sendChunk(
  response: import("node:http").ServerResponse,
  payload: Record<string, unknown>,
) {
  response.write(
    `data: ${JSON.stringify({
      id: "chatcmpl-fixture",
      object: "chat.completion.chunk",
      created: 1,
      model: "pi-fixture-model",
      ...payload,
    })}\n\n`,
  );
}
