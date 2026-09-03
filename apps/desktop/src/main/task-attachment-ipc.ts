import {
  piTaskAttachmentDiscardRequestSchema,
  piTaskAttachmentSelectRequestSchema,
  piTaskAttachmentStageRequestSchema,
  type PiTaskAttachmentDiscardResult,
  type PiTaskAttachmentStageResult,
} from "@ai-corporation/protocols";
import type { TaskAttachmentService } from "./task-attachment-service";

export async function handleAttachmentStage(
  authorized: boolean,
  request: unknown,
  service: TaskAttachmentService | undefined,
  selectedPaths?: readonly string[],
): Promise<PiTaskAttachmentStageResult> {
  if (!authorized) return failure("UNAUTHORIZED_CALLER");
  if (service === undefined) return failure("UNAVAILABLE");
  try {
    let paths: readonly string[];
    if (selectedPaths === undefined) {
      const parsed = piTaskAttachmentStageRequestSchema.safeParse(request);
      if (!parsed.success) return failure("INVALID_REQUEST");
      paths = parsed.data.paths;
    } else {
      const parsed = piTaskAttachmentSelectRequestSchema.safeParse(request);
      if (!parsed.success) return failure("INVALID_REQUEST");
      paths = selectedPaths;
    }
    const value = await service.stage(paths);
    return {
      ok: true,
      value: {
        attachments: [...value.attachments],
        rejected: [...value.rejected],
      },
    };
  } catch {
    return failure("UNAVAILABLE");
  }
}

export async function handleAttachmentDiscard(
  authorized: boolean,
  request: unknown,
  service?: TaskAttachmentService,
): Promise<PiTaskAttachmentDiscardResult> {
  if (!authorized) return discardFailure("UNAUTHORIZED_CALLER");
  if (service === undefined) return discardFailure("UNAVAILABLE");
  const parsed = piTaskAttachmentDiscardRequestSchema.safeParse(request);
  if (!parsed.success) return discardFailure("INVALID_REQUEST");
  return {
    ok: true,
    value: { discarded: await service.discard(parsed.data.attachmentIds) },
  };
}

function failure(
  code: "INVALID_REQUEST" | "UNAUTHORIZED_CALLER" | "UNAVAILABLE",
): PiTaskAttachmentStageResult {
  return { ok: false, error: { code, message: "附件操作失败" } };
}

function discardFailure(
  code: "INVALID_REQUEST" | "UNAUTHORIZED_CALLER" | "UNAVAILABLE",
): PiTaskAttachmentDiscardResult {
  return { ok: false, error: { code, message: "附件操作失败" } };
}
