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
import { desktopShellPath, PiTaskService } from "./pi-task-service";

describe("PiTaskService", () => {
  const cleanups: Array<() => Promise<void>> = [];
  const companyId = "019b7f4d-a000-7000-8000-000000000001";
  const companyRepository = {
    get: () => ({
      schemaVersion: 1 as const,
      id: companyId,
      name: "测试公司",
      employeeIds: [],
      workspaceIds: [],
      createdAt: "2026-08-14T00:00:00.000Z",
      updatedAt: "2026-08-14T00:00:00.000Z",
    }),
    hasEmployee: () => true,
    hasWorkspace: () => true,
  };

  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  });

  it("removes Windows special path prefixes before using the system shell", () => {
    expect(desktopShellPath("\\\\?\\C:\\work\\result.md", "win32")).toBe(
      "C:\\work\\result.md",
    );
    expect(
      desktopShellPath("\\\\?\\UNC\\server\\share\\result.md", "win32"),
    ).toBe("\\\\server\\share\\result.md");
    expect(desktopShellPath("/work/result.md", "darwin")).toBe(
      "/work/result.md",
    );
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
    const opened: string[] = [];
    const revealed: string[] = [];
    const service = new PiTaskService({
      companyRepository,
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
        inspectWorkspaceFile: async (_rootPath, relativePath) => ({
          schemaVersion: 1 as const,
          canonicalPath: `${root}/${relativePath}`,
          relativePath,
          sizeBytes: 0,
          sha256:
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        }),
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
      openPath: async (canonicalPath) => {
        opened.push(canonicalPath);
        return "";
      },
      revealPath: async (canonicalDirectoryPath) => {
        revealed.push(canonicalDirectoryPath);
        return "";
      },
      createId: () => "019b7f4d-a100-7000-8000-000000000003",
    });

    const started = service.start({
      schemaVersion: 2,
      commandId: "019b7f4d-a100-7000-8000-000000000004",
      companyId,
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
    expect(completed.deliverables).toEqual([
      expect.objectContaining({
        relativePath: "result.md",
        source: "WORKSPACE_WRITE",
        changeKind: "CREATED",
        sizeBytes: Buffer.byteLength("整理完成：测试文字。"),
      }),
    ]);
    expect(fixture.requests).toHaveLength(2);
    expect(fixture.requests[0]?.authorization).toBe("Bearer M7-TU-01-fake-key");
    expect(fixture.requests[0]?.body).toMatchObject({
      model: "pi-fixture-model",
      stream: true,
    });
    const deliverableRequest = {
      schemaVersion: 2 as const,
      companyId,
      taskId: completed.id,
      relativePath: "result.md",
    };
    await expect(
      service.previewDeliverable(deliverableRequest),
    ).resolves.toMatchObject({ ok: true, value: { integrity: "CHANGED" } });
    await expect(
      service.previewDeliverable({
        ...deliverableRequest,
        companyId: "019b7f4d-a100-7000-8000-000000000099",
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "NOT_A_MEMBER" } });
    await expect(
      service.previewDeliverable({
        ...deliverableRequest,
        relativePath: "not-registered.md",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "DELIVERABLE_NOT_FOUND" },
    });
    await expect(
      service.openDeliverable(deliverableRequest),
    ).resolves.toMatchObject({
      ok: true,
      value: { status: "OPENED" },
    });
    await expect(
      service.revealDeliverable(deliverableRequest),
    ).resolves.toMatchObject({
      ok: true,
      value: { status: "REVEALED" },
    });
    expect(opened).toEqual([`${root}/result.md`]);
    expect(revealed).toEqual([root]);
    repository.upsertDeliverable({
      taskId: completed.id,
      relativePath: "unsafe.js",
      source: "COMMAND_REGISTERED",
      changeKind: "REGISTERED",
      sha256:
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      sizeBytes: 0,
      sourceCallId: "call-unsafe",
      registeredAt: "2026-08-14T00:00:00.500Z",
    });
    await expect(
      service.openDeliverable({
        ...deliverableRequest,
        relativePath: "unsafe.js",
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "UNSAFE_OPEN" } });

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
    expect(
      repository
        .get(completed.id)
        ?.deliverables?.some(({ relativePath }) => relativePath === "empty.md"),
    ).toBe(true);
    database.close();
  });

  it("waits for one task command approval, then runs a real command with visible output", async () => {
    const fixture = await startCommandFixture();
    cleanups.push(fixture.close);
    const root = path.join(tmpdir(), `M9-TU-01-${crypto.randomUUID()}`);
    const source = path.join(root, "source");
    const managed = path.join(root, "managed");
    await mkdir(source, { recursive: true });
    await writeFile(
      path.join(source, "SKILL.md"),
      "---\nname: coding-task\ndescription: 编码任务\n---\n先检查，再修改。\n",
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
      id: "019b7f4d-a200-7000-8000-000000000001",
      name: "小码",
      providerId: "019b7f4d-a200-7000-8000-000000000002",
      providerVersion: 1,
      modelId: "pi-command-model",
      skillName: "coding-task",
      createdAt: "2026-08-15T00:00:00.000Z",
      updatedAt: "2026-08-15T00:00:00.000Z",
    };
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
    const workspaceId = "019b7f4d-a200-7000-8000-000000000005";
    const service = new PiTaskService({
      companyRepository,
      employeeRepository: { get: () => employee },
      taskRepository: repository,
      skillLibrary: library,
      workspaceRepository: {
        getTrusted: () => ({
          workspaceId,
          displayPath: "测试代码工作区",
          canonicalRootPath: root,
          permissionMode: "READ_WRITE",
          accessStatus: "AVAILABLE",
          pathIdentity: {
            platform: "windows",
            volumeRoot: "C:",
            rootCreationTime: "1",
          },
          lastVerifiedAt: "2026-08-15T00:00:00.000Z",
        }),
      },
      nativeClient: () => ({
        inspectWorkspaceFile: async (_rootPath, relativePath) => ({
          schemaVersion: 1 as const,
          canonicalPath: `${root}/${relativePath}`,
          relativePath,
          sizeBytes: 0,
          sha256:
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        }),
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
        writeWorkspaceText: async () => {
          throw new Error("command fixture does not write text");
        },
      }),
      resolveRuntime: () => ({
        endpoint: fixture.endpoint,
        key: "M9-TU-01-fake-key",
        timeoutMs: 5_000,
      }),
      createId: () => "019b7f4d-a200-7000-8000-000000000003",
    });

    const started = service.start({
      schemaVersion: 2,
      commandId: "019b7f4d-a200-7000-8000-000000000004",
      companyId,
      employeeId: employee.id,
      workspaceId,
      input: "运行测试并告诉我结果",
    });
    expect(started.ok).toBe(true);
    const taskId = started.ok ? started.value.id : "";
    const approvalEvent = await waitForEvent(
      repository,
      taskId,
      "APPROVAL_REQUIRED",
    );
    const approval = JSON.parse(approvalEvent.content) as {
      approvalId: string;
      kind: string;
    };
    expect(approval.kind).toBe("TASK");
    expect(
      database.prepare("SELECT COUNT(*) AS total FROM pi_command_call").get(),
    ).toEqual({ total: 0 });

    const resolved = service.resolveCommandApproval({
      schemaVersion: 2,
      commandId: "019b7f4d-a200-7000-8000-000000000006",
      companyId,
      taskId,
      approvalId: approval.approvalId,
      decision: "APPROVE",
    });
    expect(resolved.ok).toBe(true);
    // 同一次决定重复送达时只返回当前任务，不重复执行，也不误报状态变化。
    expect(
      service.resolveCommandApproval({
        schemaVersion: 2,
        commandId: "019b7f4d-a200-7000-8000-000000000008",
        companyId,
        taskId,
        approvalId: approval.approvalId,
        decision: "APPROVE",
      }).ok,
    ).toBe(true);
    const completed = await waitForTask(repository, taskId);

    expect(completed.status).toBe("WAITING_ACCEPTANCE");
    expect(completed.finalOutput).toContain("真实命令已经通过");
    expect(completed.events.map(({ kind }) => kind)).toEqual(
      expect.arrayContaining([
        "APPROVAL_REQUIRED",
        "APPROVAL_RESOLVED",
        "TOOL_UPDATE",
        "TOOL_ERROR",
        "TOOL_RESULT",
      ]),
    );
    expect(JSON.stringify(completed.events)).toContain("M9-COMMAND-OK");
    expect(JSON.stringify(completed.events)).not.toContain("M9-TU-01-fake-key");
    expect(
      database
        .prepare(
          "SELECT status FROM pi_command_call WHERE task_id = ? ORDER BY created_at, tool_call_id",
        )
        .all(taskId),
    ).toEqual([{ status: "FAILED" }, { status: "SUCCEEDED" }]);
    expect(repository.hasCommandGrant(taskId)).toBe(true);
    expect(
      service.accept({
        schemaVersion: 2,
        commandId: "019b7f4d-a200-7000-8000-000000000007",
        companyId,
        taskId,
      }).ok,
    ).toBe(true);
    expect(repository.hasCommandGrant(taskId)).toBe(false);

    // 模拟命令启动后应用直接退出；恢复只标记未知，不会再次执行命令。
    database
      .prepare("UPDATE pi_task SET status = 'RUNNING' WHERE id = ?")
      .run(taskId);
    database
      .prepare(
        "UPDATE pi_command_call SET status = 'STARTING' WHERE task_id = ?",
      )
      .run(taskId);
    service.recoverCommands();
    expect(
      database
        .prepare("SELECT status FROM pi_command_call WHERE task_id = ?")
        .get(taskId),
    ).toEqual({ status: "UNKNOWN" });
    expect(repository.get(taskId)?.events.at(-1)?.kind).toBe("TOOL_ERROR");
    expect(repository.get(taskId)?.events.at(-1)?.content).toContain(
      "不会自动重放",
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

async function waitForEvent(
  repository: PiTaskRepository,
  id: string,
  kind: string,
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const event = repository
      .get(id)
      ?.events.find((candidate) => candidate.kind === kind);
    if (event !== undefined) return event;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Pi task event did not appear: ${kind}`);
}

async function startCommandFixture() {
  let calls = 0;
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      JSON.parse(Buffer.concat(chunks).toString("utf8"));
      calls += 1;
      response.writeHead(200, {
        "content-type": "text/event-stream",
        connection: "keep-alive",
      });
      if (calls <= 2) {
        const script =
          calls === 1
            ? "console.error('EXPECTED-EARLY-FAILURE'); process.exit(1)"
            : "console.log('M9-COMMAND-OK')";
        sendChunk(response, {
          choices: [
            {
              index: 0,
              delta: {
                role: "assistant",
                tool_calls: [
                  {
                    index: 0,
                    id: `call-command-${calls}`,
                    type: "function",
                    function: {
                      name: "workspace_run_command",
                      arguments: JSON.stringify({
                        command: `${JSON.stringify(process.execPath)} -e "${script}"`,
                      }),
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
              delta: {
                role: "assistant",
                content: "真实命令已经通过，等待验收。",
              },
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
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) =>
          error === undefined ? resolve() : reject(error),
        );
      }),
  };
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
