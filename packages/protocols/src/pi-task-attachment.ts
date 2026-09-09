import { z } from "zod";

export const PI_TASK_ATTACHMENT_SELECT_IPC_CHANNEL =
  "pi-task-attachment:select" as const;
export const PI_TASK_ATTACHMENT_STAGE_DROPPED_IPC_CHANNEL =
  "pi-task-attachment:stage-dropped" as const;
export const PI_TASK_ATTACHMENT_DISCARD_IPC_CHANNEL =
  "pi-task-attachment:discard" as const;

const uuid = z.uuidv7();
const commandId = z.uuid();
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);

export const piTaskAttachmentMediaTypeSchema = z.enum([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/pdf",
  "text/plain",
  "text/markdown",
]);

export const piTaskAttachmentSchema = z
  .object({
    id: uuid,
    displayName: z.string().min(1).max(255),
    mediaType: piTaskAttachmentMediaTypeSchema,
    sizeBytes: z.number().int().positive().max(52_428_800),
    sha256,
  })
  .strict();

export const piTaskAttachmentStageRequestSchema = z
  .object({
    schemaVersion: z.literal(1),
    commandId,
    // 只由 Preload 从拖入的 File 对象提取，Renderer 不会收到这些路径。
    paths: z.array(z.string().min(1).max(32_767)).min(1).max(10),
  })
  .strict();

export const piTaskAttachmentSelectRequestSchema = z
  .object({ schemaVersion: z.literal(1), commandId })
  .strict();

export const piTaskAttachmentDiscardRequestSchema = z
  .object({ schemaVersion: z.literal(1), attachmentIds: z.array(uuid).max(10) })
  .strict();

export const piTaskAttachmentStageResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      value: z
        .object({
          attachments: z.array(piTaskAttachmentSchema).max(10),
          rejected: z
            .array(
              z
                .object({
                  displayName: z.string().min(1).max(255),
                  reason: z.string().min(1).max(500),
                })
                .strict(),
            )
            .max(10),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      error: z
        .object({
          code: z.enum([
            "INVALID_REQUEST",
            "UNAUTHORIZED_CALLER",
            "UNAVAILABLE",
          ]),
          message: z.literal("附件操作失败"),
        })
        .strict(),
    })
    .strict(),
]);

export const piTaskAttachmentDiscardResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      value: z
        .object({ discarded: z.number().int().nonnegative().max(10) })
        .strict(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      error: z
        .object({
          code: z.enum([
            "INVALID_REQUEST",
            "UNAUTHORIZED_CALLER",
            "UNAVAILABLE",
          ]),
          message: z.literal("附件操作失败"),
        })
        .strict(),
    })
    .strict(),
]);

export type PiTaskAttachment = z.infer<typeof piTaskAttachmentSchema>;
export type PiTaskAttachmentStageRequest = z.infer<
  typeof piTaskAttachmentStageRequestSchema
>;
export type PiTaskAttachmentSelectRequest = z.infer<
  typeof piTaskAttachmentSelectRequestSchema
>;
export type PiTaskAttachmentDiscardRequest = z.infer<
  typeof piTaskAttachmentDiscardRequestSchema
>;
export type PiTaskAttachmentStageResult = z.infer<
  typeof piTaskAttachmentStageResultSchema
>;
export type PiTaskAttachmentDiscardResult = z.infer<
  typeof piTaskAttachmentDiscardResultSchema
>;
