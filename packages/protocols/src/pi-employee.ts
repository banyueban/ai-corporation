import { z } from "zod";

export const PI_EMPLOYEE_LIST_IPC_CHANNEL = "pi-employee:list" as const;
export const PI_EMPLOYEE_SAVE_IPC_CHANNEL = "pi-employee:save" as const;

export const piEmployeeSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.uuidv7(),
    name: z.string().trim().min(1).max(80),
    providerId: z.uuidv7(),
    providerVersion: z.number().int().positive(),
    modelId: z.string().min(1).max(512),
    skillName: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
      .max(64),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const piEmployeeListRequestSchema = z
  .object({ schemaVersion: z.literal(1) })
  .strict();

export const piEmployeeSaveRequestSchema = z
  .object({
    schemaVersion: z.literal(1),
    commandId: z.uuidv7(),
    employeeId: z.uuidv7().optional(),
    name: z.string().trim().min(1).max(80),
    providerId: z.uuidv7(),
    expectedProviderVersion: z.number().int().positive(),
    modelId: z.string().min(1).max(512),
    skillName: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
      .max(64),
  })
  .strict();

const piEmployeeErrorSchema = z
  .object({
    code: z.enum([
      "INVALID_REQUEST",
      "UNAUTHORIZED_CALLER",
      "PROVIDER_NOT_READY",
      "SKILL_NOT_FOUND",
      "NOT_FOUND",
      "STORAGE_UNAVAILABLE",
      "INTERNAL",
    ]),
    message: z.literal("员工操作失败"),
  })
  .strict();

export const piEmployeeListResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: z.array(piEmployeeSchema) }).strict(),
  z.object({ ok: z.literal(false), error: piEmployeeErrorSchema }).strict(),
]);

export const piEmployeeItemResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: piEmployeeSchema }).strict(),
  z.object({ ok: z.literal(false), error: piEmployeeErrorSchema }).strict(),
]);

export type PiEmployee = z.infer<typeof piEmployeeSchema>;
export type PiEmployeeListRequest = z.infer<typeof piEmployeeListRequestSchema>;
export type PiEmployeeSaveRequest = z.infer<typeof piEmployeeSaveRequestSchema>;
export type PiEmployeeListResult = z.infer<typeof piEmployeeListResultSchema>;
export type PiEmployeeItemResult = z.infer<typeof piEmployeeItemResultSchema>;
export type PiEmployeeErrorCode = z.infer<typeof piEmployeeErrorSchema>["code"];
