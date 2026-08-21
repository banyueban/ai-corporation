import { z } from "zod";

export const PI_TASK_START_IPC_CHANNEL = "pi-task:start" as const;
export const PI_TASK_GET_IPC_CHANNEL = "pi-task:get" as const;
export const PI_TASK_LIST_IPC_CHANNEL = "pi-task:list" as const;
export const PI_TASK_CANCEL_IPC_CHANNEL = "pi-task:cancel" as const;
export const PI_TASK_ACCEPT_IPC_CHANNEL = "pi-task:accept" as const;
export const PI_TASK_REQUEST_CHANGES_IPC_CHANNEL =
  "pi-task:request-changes" as const;
export const PI_TASK_RESOLVE_COMMAND_APPROVAL_IPC_CHANNEL =
  "pi-task:resolve-command-approval" as const;

const uuid = z.uuidv7();
const baseRequest = {
  schemaVersion: z.literal(2),
  commandId: uuid,
  companyId: uuid,
} as const;

export const piTaskEventSchema = z
  .object({
    sequence: z.number().int().positive(),
    kind: z.enum([
      "PROGRESS",
      "MODEL_INPUT",
      "MODEL_OUTPUT",
      "TOOL_START",
      "TOOL_RESULT",
      "TOOL_ERROR",
      "TOOL_UPDATE",
      "APPROVAL_REQUIRED",
      "APPROVAL_RESOLVED",
    ]),
    content: z.string(),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const piTaskSchema = z
  .object({
    schemaVersion: z.literal(2),
    id: uuid,
    companyId: uuid,
    employeeId: uuid,
    workspaceId: uuid.optional(),
    userInput: z.string().min(1).max(20_000),
    status: z.enum([
      "RUNNING",
      "WAITING_ACCEPTANCE",
      "CHANGES_REQUESTED",
      "COMPLETED",
      "CANCELLED",
      "FAILED",
      "INTERRUPTED",
    ]),
    finalOutput: z.string().optional(),
    failureMessage: z.string().optional(),
    events: z.array(piTaskEventSchema),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const piTaskStartRequestSchema = z
  .object({
    ...baseRequest,
    employeeId: uuid,
    workspaceId: uuid,
    input: z.string().trim().min(1).max(20_000),
  })
  .strict();
export const piTaskGetRequestSchema = z
  .object({
    schemaVersion: z.literal(2),
    companyId: uuid,
    taskId: uuid.optional(),
    employeeId: uuid.optional(),
  })
  .strict()
  .refine(
    ({ taskId, employeeId }) =>
      (taskId === undefined) !== (employeeId === undefined),
    "必须且只能提供 taskId 或 employeeId",
  );
export const piTaskListRequestSchema = z
  .object({ schemaVersion: z.literal(2), companyId: uuid })
  .strict();
export const piTaskCommandRequestSchema = z
  .object({ ...baseRequest, taskId: uuid })
  .strict();
export const piTaskRequestChangesRequestSchema = z
  .object({
    ...baseRequest,
    taskId: uuid,
    input: z.string().trim().min(1).max(20_000),
  })
  .strict();
export const piTaskResolveCommandApprovalRequestSchema = z
  .object({
    ...baseRequest,
    taskId: uuid,
    approvalId: uuid,
    decision: z.enum(["APPROVE", "REJECT"]),
  })
  .strict();

const errorSchema = z
  .object({
    code: z.enum([
      "INVALID_REQUEST",
      "UNAUTHORIZED_CALLER",
      "NOT_FOUND",
      "EMPLOYEE_NOT_READY",
      "WORKSPACE_NOT_READY",
      "NOT_A_MEMBER",
      "ALREADY_RUNNING",
      "INVALID_STATE",
      "STORAGE_UNAVAILABLE",
      "INTERNAL",
    ]),
    message: z.literal("任务操作失败"),
  })
  .strict();
export const piTaskResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: piTaskSchema }).strict(),
  z.object({ ok: z.literal(false), error: errorSchema }).strict(),
]);
export const piTaskListResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: z.array(piTaskSchema) }).strict(),
  z.object({ ok: z.literal(false), error: errorSchema }).strict(),
]);

export type PiTask = z.infer<typeof piTaskSchema>;
export type PiTaskStartRequest = z.infer<typeof piTaskStartRequestSchema>;
export type PiTaskGetRequest = z.infer<typeof piTaskGetRequestSchema>;
export type PiTaskListRequest = z.infer<typeof piTaskListRequestSchema>;
export type PiTaskCommandRequest = z.infer<typeof piTaskCommandRequestSchema>;
export type PiTaskRequestChangesRequest = z.infer<
  typeof piTaskRequestChangesRequestSchema
>;
export type PiTaskResolveCommandApprovalRequest = z.infer<
  typeof piTaskResolveCommandApprovalRequestSchema
>;
export type PiTaskResult = z.infer<typeof piTaskResultSchema>;
export type PiTaskListResult = z.infer<typeof piTaskListResultSchema>;
