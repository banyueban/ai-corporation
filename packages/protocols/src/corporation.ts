import { z } from "zod";

export const CORPORATION_SCHEMA_VERSION = "1.0" as const;
export const CORPORATION_CREATE_IPC_CHANNEL = "corporation:create" as const;
export const CORPORATION_GET_IPC_CHANNEL = "corporation:get" as const;
export const CORPORATION_LIST_IPC_CHANNEL = "corporation:list" as const;
export const CORPORATION_UPDATE_NAME_IPC_CHANNEL =
  "corporation:update-name" as const;
export const CORPORATION_ARCHIVE_IPC_CHANNEL = "corporation:archive" as const;
export const CORPORATION_PAUSE_IPC_CHANNEL = "corporation:pause" as const;
export const CORPORATION_RESUME_IPC_CHANNEL = "corporation:resume" as const;

export const corporationStatusSchema = z.enum([
  "DRAFT",
  "PLANNING",
  "ORGANIZING",
  "EXECUTING",
  "VERIFYING",
  "WAITING_HUMAN",
  "PAUSED",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "ARCHIVED",
]);

export const corporationPausableStatusSchema = z.enum([
  "DRAFT",
  "PLANNING",
  "ORGANIZING",
  "EXECUTING",
  "VERIFYING",
  "WAITING_HUMAN",
]);

export const corporationNameSchema = z
  .string()
  .transform((name) => name.normalize("NFC").trim())
  .pipe(
    z
      .string()
      .min(1)
      .refine((name) => Array.from(name).length <= 120)
      .refine((name) => !/\p{Cc}/u.test(name)),
  );

const schemaVersion = z.literal(CORPORATION_SCHEMA_VERSION);
const uuidV7 = z.uuidv7();
const version = z.number().int().positive();
const utcTimestamp = z.iso.datetime({ offset: false });

export const corporationPublicSchema = z
  .object({
    schemaVersion,
    id: uuidV7,
    workspaceId: uuidV7,
    name: corporationNameSchema,
    status: corporationStatusSchema,
    version,
    createdAt: utcTimestamp,
    updatedAt: utcTimestamp,
    archivedAt: utcTimestamp.optional(),
    pausedFrom: corporationPausableStatusSchema.optional(),
    pausedAt: utcTimestamp.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.status === "ARCHIVED") !== (value.archivedAt !== undefined)) {
      context.addIssue({
        code: "custom",
        message: "archivedAt must exist only for archived corporations",
      });
    }
    const hasPauseMetadata =
      value.pausedFrom !== undefined && value.pausedAt !== undefined;
    if ((value.status === "PAUSED") !== hasPauseMetadata) {
      context.addIssue({
        code: "custom",
        message:
          "pausedFrom and pausedAt must exist only for paused corporations",
      });
    }
    if ((value.pausedFrom === undefined) !== (value.pausedAt === undefined)) {
      context.addIssue({
        code: "custom",
        message: "pausedFrom and pausedAt must be provided together",
      });
    }
  });

export const corporationCreateRequestSchema = z
  .object({
    schemaVersion,
    commandId: uuidV7,
    workspaceId: uuidV7,
    name: corporationNameSchema,
  })
  .strict();

export const corporationGetRequestSchema = z
  .object({
    schemaVersion,
    corporationId: uuidV7,
  })
  .strict();

export const corporationListRequestSchema = z
  .object({
    schemaVersion,
    workspaceId: uuidV7,
    includeArchived: z.boolean().optional(),
  })
  .strict();

export const corporationUpdateNameRequestSchema = z
  .object({
    schemaVersion,
    commandId: uuidV7,
    corporationId: uuidV7,
    expectedVersion: version,
    name: corporationNameSchema,
  })
  .strict();

export const corporationArchiveRequestSchema = z
  .object({
    schemaVersion,
    commandId: uuidV7,
    corporationId: uuidV7,
    expectedVersion: version,
  })
  .strict();

export const corporationPauseRequestSchema = corporationArchiveRequestSchema;
export const corporationResumeRequestSchema = corporationArchiveRequestSchema;

export const corporationErrorCodeSchema = z.enum([
  "VALIDATION_FAILED",
  "UNAUTHORIZED_CALLER",
  "WORKSPACE_UNAVAILABLE",
  "NOT_FOUND",
  "VERSION_CONFLICT",
  "STATE_CONFLICT",
  "COMMAND_CONFLICT",
  "STORAGE_UNAVAILABLE",
]);

export const corporationErrorMessages = {
  VALIDATION_FAILED: "Corporation request is invalid.",
  UNAUTHORIZED_CALLER: "Corporation request is not allowed.",
  WORKSPACE_UNAVAILABLE: "Workspace is unavailable.",
  NOT_FOUND: "Corporation was not found.",
  VERSION_CONFLICT: "Corporation changed. Reload and retry.",
  STATE_CONFLICT: "Corporation state does not allow this action.",
  COMMAND_CONFLICT: "Corporation command conflicts with an earlier request.",
  STORAGE_UNAVAILABLE: "Corporation storage is unavailable.",
} as const satisfies Record<CorporationErrorCode, string>;

export const corporationFailureSchema = z
  .object({
    ok: z.literal(false),
    error: z
      .object({
        code: corporationErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.error.message !== corporationErrorMessages[value.error.code]) {
      context.addIssue({ code: "custom", message: "Unexpected error message" });
    }
  });

export const corporationItemResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: corporationPublicSchema }).strict(),
  corporationFailureSchema,
]);

export const corporationListResultSchema = z.discriminatedUnion("ok", [
  z
    .object({ ok: z.literal(true), value: z.array(corporationPublicSchema) })
    .strict(),
  corporationFailureSchema,
]);

export type CorporationArchiveRequest = z.infer<
  typeof corporationArchiveRequestSchema
>;
export type CorporationCreateRequest = z.infer<
  typeof corporationCreateRequestSchema
>;
export type CorporationErrorCode = z.infer<typeof corporationErrorCodeSchema>;
export type CorporationFailure = z.infer<typeof corporationFailureSchema>;
export type CorporationGetRequest = z.infer<typeof corporationGetRequestSchema>;
export type CorporationItemResult = z.infer<typeof corporationItemResultSchema>;
export type CorporationListRequest = z.infer<
  typeof corporationListRequestSchema
>;
export type CorporationListResult = z.infer<typeof corporationListResultSchema>;
export type CorporationPublic = z.infer<typeof corporationPublicSchema>;
export type CorporationPausableStatus = z.infer<
  typeof corporationPausableStatusSchema
>;
export type CorporationPauseRequest = z.infer<
  typeof corporationPauseRequestSchema
>;
export type CorporationResumeRequest = z.infer<
  typeof corporationResumeRequestSchema
>;
export type CorporationStatus = z.infer<typeof corporationStatusSchema>;
export type CorporationUpdateNameRequest = z.infer<
  typeof corporationUpdateNameRequestSchema
>;
