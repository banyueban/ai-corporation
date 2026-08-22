import {
  piTaskCommandRequestSchema,
  piTaskDeliverableRequestSchema,
  piTaskGetRequestSchema,
  piTaskListRequestSchema,
  piTaskRequestChangesRequestSchema,
  piTaskResolveCommandApprovalRequestSchema,
  piTaskStartRequestSchema,
  type PiTaskResult,
  type PiTaskListResult,
  type PiTaskDeliverableActionResult,
  type PiTaskDeliverablePreviewResult,
} from "@ai-corporation/protocols";
import type { PiTaskService } from "./pi-task-service";

const invalid = (): PiTaskResult => ({
  ok: false,
  error: { code: "INVALID_REQUEST", message: "任务操作失败" },
});
const unauthorized = (): PiTaskResult => ({
  ok: false,
  error: { code: "UNAUTHORIZED_CALLER", message: "任务操作失败" },
});

export function handlePiTask(
  action:
    | "start"
    | "get"
    | "cancel"
    | "accept"
    | "requestChanges"
    | "resolveCommandApproval",
  authorized: boolean,
  request: unknown,
  service?: PiTaskService,
): PiTaskResult {
  if (!authorized) return unauthorized();
  if (service === undefined) return invalid();
  if (action === "start") {
    const parsed = piTaskStartRequestSchema.safeParse(request);
    return parsed.success ? service.start(parsed.data) : invalid();
  }
  if (action === "get") {
    const parsed = piTaskGetRequestSchema.safeParse(request);
    return parsed.success ? service.get(parsed.data) : invalid();
  }
  if (action === "requestChanges") {
    const parsed = piTaskRequestChangesRequestSchema.safeParse(request);
    return parsed.success ? service.requestChanges(parsed.data) : invalid();
  }
  if (action === "resolveCommandApproval") {
    const parsed = piTaskResolveCommandApprovalRequestSchema.safeParse(request);
    return parsed.success
      ? service.resolveCommandApproval(parsed.data)
      : invalid();
  }
  const parsed = piTaskCommandRequestSchema.safeParse(request);
  if (!parsed.success) return invalid();
  return action === "cancel"
    ? service.cancel(parsed.data)
    : service.accept(parsed.data);
}

export async function handlePiTaskDeliverable(
  action: "preview" | "open" | "reveal",
  authorized: boolean,
  request: unknown,
  service?: PiTaskService,
): Promise<PiTaskDeliverablePreviewResult | PiTaskDeliverableActionResult> {
  if (!authorized) {
    return deliverableIpcFailure("UNAUTHORIZED_CALLER");
  }
  const parsed = piTaskDeliverableRequestSchema.safeParse(request);
  if (!parsed.success || service === undefined) {
    return deliverableIpcFailure("INVALID_REQUEST");
  }
  if (action === "preview") return service.previewDeliverable(parsed.data);
  if (action === "open") return service.openDeliverable(parsed.data);
  return service.revealDeliverable(parsed.data);
}

function deliverableIpcFailure(
  code: "INVALID_REQUEST" | "UNAUTHORIZED_CALLER",
) {
  return {
    ok: false as const,
    error: { code, message: "交付成果操作失败" as const },
  };
}

export function handlePiTaskList(
  authorized: boolean,
  request: unknown,
  service?: PiTaskService,
): PiTaskListResult {
  if (!authorized) {
    return {
      ok: false,
      error: { code: "UNAUTHORIZED_CALLER", message: "任务操作失败" },
    };
  }
  const parsed = piTaskListRequestSchema.safeParse(request);
  if (!parsed.success || service === undefined) {
    return {
      ok: false,
      error: { code: "INVALID_REQUEST", message: "任务操作失败" },
    };
  }
  return service.list(parsed.data);
}
