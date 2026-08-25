import { z } from "zod";

export const PI_SKILL_LIST_IPC_CHANNEL = "pi-skill:list" as const;
export const PI_SKILL_PREVIEW_IMPORT_IPC_CHANNEL =
  "pi-skill:preview-import" as const;
export const PI_SKILL_CONFIRM_IMPORT_IPC_CHANNEL =
  "pi-skill:confirm-import" as const;

export const piSkillSchema = z
  .object({
    schemaVersion: z.literal(1),
    name: z.string().min(1).max(64),
    description: z.string().min(1).max(1024),
    content: z.string().max(1_048_576),
    license: z.string().min(1).optional(),
    compatibility: z.string().min(1).max(500).optional(),
    metadata: z.record(z.string(), z.string()).optional(),
    allowedTools: z.string().min(1).optional(),
    source: z.enum(["BUILTIN", "IMPORTED"]),
    readOnly: z.literal(true),
  })
  .strict();

export const piSkillFileChangeSchema = z
  .object({
    path: z.string().min(1).max(1024),
    type: z.enum(["ADDED", "CHANGED", "REMOVED"]),
  })
  .strict();

export const piSkillListRequestSchema = z
  .object({ schemaVersion: z.literal(1) })
  .strict();
export const piSkillPreviewImportRequestSchema = piSkillListRequestSchema;
export const piSkillConfirmImportRequestSchema = z
  .object({ schemaVersion: z.literal(1), previewId: z.uuidv7() })
  .strict();

const piSkillErrorSchema = z
  .object({
    code: z.enum([
      "INVALID_REQUEST",
      "UNAUTHORIZED_CALLER",
      "CANCELLED",
      "INVALID_SKILL",
      "UNSAFE_ENTRY",
      "SKILL_TOO_LARGE",
      "SOURCE_CHANGED",
      "BUILTIN_CONFLICT",
      "PREVIEW_EXPIRED",
      "STORAGE_UNAVAILABLE",
      "INTERNAL",
    ]),
    // 只传递主进程整理过的安全说明，让用户在操作位置直接知道哪里不符合要求。
    message: z.string().min(1).max(500),
  })
  .strict();

export const piSkillListResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: z.array(piSkillSchema) }).strict(),
  z.object({ ok: z.literal(false), error: piSkillErrorSchema }).strict(),
]);

export const piSkillPreviewImportResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      value: z
        .object({
          schemaVersion: z.literal(1),
          previewId: z.uuidv7(),
          name: z.string().min(1).max(64),
          description: z.string().min(1).max(1024),
          license: z.string().min(1).optional(),
          compatibility: z.string().min(1).max(500).optional(),
          metadata: z.record(z.string(), z.string()).optional(),
          allowedTools: z.string().min(1).optional(),
          changes: z.array(piSkillFileChangeSchema).max(256),
        })
        .strict(),
    })
    .strict(),
  z.object({ ok: z.literal(false), error: piSkillErrorSchema }).strict(),
]);

export const piSkillItemResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: piSkillSchema }).strict(),
  z.object({ ok: z.literal(false), error: piSkillErrorSchema }).strict(),
]);

export type PiSkill = z.infer<typeof piSkillSchema>;
export type PiSkillListRequest = z.infer<typeof piSkillListRequestSchema>;
export type PiSkillConfirmImportRequest = z.infer<
  typeof piSkillConfirmImportRequestSchema
>;
export type PiSkillListResult = z.infer<typeof piSkillListResultSchema>;
export type PiSkillPreviewImportResult = z.infer<
  typeof piSkillPreviewImportResultSchema
>;
export type PiSkillItemResult = z.infer<typeof piSkillItemResultSchema>;
