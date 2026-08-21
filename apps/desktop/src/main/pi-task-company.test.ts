import { describe, expect, it, vi } from "vitest";
import type { PiTask } from "@ai-corporation/protocols";
import { PiTaskService } from "./pi-task-service";

const companyId = "019b0000-0000-7000-8000-000000000031";
const otherCompanyId = "019b0000-0000-7000-8000-000000000032";
const employeeId = "019b0000-0000-7000-8000-000000000033";
const workspaceId = "019b0000-0000-7000-8000-000000000034";
const taskId = "019b0000-0000-7000-8000-000000000035";
type ResolveRuntime = (
  providerId: string,
  providerVersion: number,
  modelId: string,
) => {
  readonly endpoint: string;
  readonly key: string;
  readonly timeoutMs: number;
};

describe("Pi task company boundary", () => {
  it("rejects a non-member before resolving the model runtime", () => {
    const resolveRuntime = vi.fn<ResolveRuntime>();
    const service = createService({ resolveRuntime, hasEmployee: false });
    expect(
      service.start({
        schemaVersion: 2,
        commandId: "019b0000-0000-7000-8000-000000000036",
        companyId,
        employeeId,
        workspaceId,
        input: "不应调用模型",
      }),
    ).toMatchObject({ ok: false, error: { code: "NOT_A_MEMBER" } });
    expect(resolveRuntime).not.toHaveBeenCalled();
  });

  it("rejects a workspace outside the company before resolving the model runtime", () => {
    const resolveRuntime = vi.fn<ResolveRuntime>();
    const service = createService({ resolveRuntime, hasWorkspace: false });
    expect(
      service.start({
        schemaVersion: 2,
        commandId: "019b0000-0000-7000-8000-000000000037",
        companyId,
        employeeId,
        workspaceId,
        input: "不应调用模型",
      }),
    ).toMatchObject({ ok: false, error: { code: "NOT_A_MEMBER" } });
    expect(resolveRuntime).not.toHaveBeenCalled();
  });

  it("does not return a task through another company", () => {
    const service = createService({
      task: {
        schemaVersion: 2,
        id: taskId,
        companyId,
        employeeId,
        workspaceId,
        userInput: "测试",
        status: "COMPLETED",
        events: [],
        createdAt: "2026-08-21T00:00:00.000Z",
        updatedAt: "2026-08-21T00:00:00.000Z",
      },
    });
    expect(
      service.get({ schemaVersion: 2, companyId: otherCompanyId, taskId }),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("does not mutate a task through another company", () => {
    const setStatus = vi.fn();
    const revokeCommandGrant = vi.fn();
    const resolveRuntime = vi.fn<ResolveRuntime>();
    const waitingTask = task("WAITING_ACCEPTANCE");
    const service = createService({
      task: waitingTask,
      resolveRuntime,
      taskRepository: {
        get: () => waitingTask,
        setStatus,
        revokeCommandGrant,
      },
    });
    const base = {
      schemaVersion: 2 as const,
      commandId: "019b0000-0000-7000-8000-000000000038",
      companyId: otherCompanyId,
      taskId,
    };

    expect(service.accept(base)).toMatchObject({
      ok: false,
      error: { code: "NOT_A_MEMBER" },
    });
    expect(
      service.requestChanges({ ...base, input: "继续修改" }),
    ).toMatchObject({ ok: false, error: { code: "NOT_A_MEMBER" } });
    expect(
      service.resolveCommandApproval({
        ...base,
        approvalId: "019b0000-0000-7000-8000-000000000039",
        decision: "APPROVE",
      }),
    ).toMatchObject({ ok: false, error: { code: "NOT_A_MEMBER" } });

    const runningTask = task("RUNNING");
    const runningService = createService({
      task: runningTask,
      taskRepository: {
        get: () => runningTask,
        setStatus,
        revokeCommandGrant,
      },
    });
    expect(runningService.cancel(base)).toMatchObject({
      ok: false,
      error: { code: "NOT_A_MEMBER" },
    });
    expect(setStatus).not.toHaveBeenCalled();
    expect(revokeCommandGrant).not.toHaveBeenCalled();
    expect(resolveRuntime).not.toHaveBeenCalled();
  });
});

function createService(options: {
  readonly hasEmployee?: boolean;
  readonly hasWorkspace?: boolean;
  readonly resolveRuntime?: ResolveRuntime;
  readonly task?: PiTask;
  readonly taskRepository?: Record<string, unknown>;
}): PiTaskService {
  return new PiTaskService({
    companyRepository: {
      get: () => ({
        schemaVersion: 1,
        id: companyId,
        name: "公司",
        employeeIds: [],
        workspaceIds: [],
        createdAt: "2026-08-21T00:00:00.000Z",
        updatedAt: "2026-08-21T00:00:00.000Z",
      }),
      hasEmployee: () => options.hasEmployee ?? true,
      hasWorkspace: () => options.hasWorkspace ?? true,
    },
    employeeRepository: { get: () => undefined },
    taskRepository: (options.taskRepository ?? {
      get: () => options.task,
    }) as never,
    skillLibrary: {} as never,
    workspaceRepository: { getTrusted: () => undefined },
    nativeClient: () => undefined,
    resolveRuntime: options.resolveRuntime ?? vi.fn<ResolveRuntime>(),
  });
}

function task(status: PiTask["status"]): PiTask {
  return {
    schemaVersion: 2,
    id: taskId,
    companyId,
    employeeId,
    workspaceId,
    userInput: "测试",
    status,
    events: [],
    createdAt: "2026-08-21T00:00:00.000Z",
    updatedAt: "2026-08-21T00:00:00.000Z",
  };
}
