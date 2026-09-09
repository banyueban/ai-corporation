import { z } from "zod";

export const PI_COMPANY_LIST_IPC_CHANNEL = "pi-company:list" as const;
export const PI_COMPANY_CREATE_IPC_CHANNEL = "pi-company:create" as const;
export const PI_COMPANY_UPDATE_NAME_IPC_CHANNEL =
  "pi-company:update-name" as const;
export const PI_COMPANY_ADD_EMPLOYEE_IPC_CHANNEL =
  "pi-company:add-employee" as const;
export const PI_COMPANY_REMOVE_EMPLOYEE_IPC_CHANNEL =
  "pi-company:remove-employee" as const;
export const PI_COMPANY_ADD_WORKSPACE_IPC_CHANNEL =
  "pi-company:add-workspace" as const;
export const PI_COMPANY_REMOVE_WORKSPACE_IPC_CHANNEL =
  "pi-company:remove-workspace" as const;

const uuid = z.uuidv7();
const baseCommand = {
  schemaVersion: z.literal(1),
  commandId: uuid,
  companyId: uuid,
} as const;

export const piCompanySchema = z
  .object({
    schemaVersion: z.literal(1),
    id: uuid,
    name: z.string().trim().min(1).max(120),
    employeeIds: z.array(uuid),
    workspaceIds: z.array(uuid),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const piCompanyListRequestSchema = z
  .object({ schemaVersion: z.literal(1) })
  .strict();
export const piCompanyCreateRequestSchema = z
  .object({
    schemaVersion: z.literal(1),
    commandId: uuid,
    name: z.string().trim().min(1).max(120),
  })
  .strict();
export const piCompanyUpdateNameRequestSchema = z
  .object({
    ...baseCommand,
    name: z.string().trim().min(1).max(120),
  })
  .strict();
export const piCompanyEmployeeRequestSchema = z
  .object({ ...baseCommand, employeeId: uuid })
  .strict();
export const piCompanyWorkspaceRequestSchema = z
  .object({ ...baseCommand, workspaceId: uuid })
  .strict();

const errorSchema = z
  .object({
    code: z.enum([
      "INVALID_REQUEST",
      "UNAUTHORIZED_CALLER",
      "NOT_FOUND",
      "NAME_CONFLICT",
      "EMPLOYEE_NOT_FOUND",
      "WORKSPACE_NOT_READY",
      "STORAGE_UNAVAILABLE",
      "INTERNAL",
    ]),
    message: z.literal("公司操作失败"),
  })
  .strict();

export const piCompanyItemResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: piCompanySchema }).strict(),
  z.object({ ok: z.literal(false), error: errorSchema }).strict(),
]);
export const piCompanyListResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: z.array(piCompanySchema) }).strict(),
  z.object({ ok: z.literal(false), error: errorSchema }).strict(),
]);

export type PiCompany = z.infer<typeof piCompanySchema>;
export type PiCompanyListRequest = z.infer<typeof piCompanyListRequestSchema>;
export type PiCompanyCreateRequest = z.infer<
  typeof piCompanyCreateRequestSchema
>;
export type PiCompanyUpdateNameRequest = z.infer<
  typeof piCompanyUpdateNameRequestSchema
>;
export type PiCompanyEmployeeRequest = z.infer<
  typeof piCompanyEmployeeRequestSchema
>;
export type PiCompanyWorkspaceRequest = z.infer<
  typeof piCompanyWorkspaceRequestSchema
>;
export type PiCompanyItemResult = z.infer<typeof piCompanyItemResultSchema>;
export type PiCompanyListResult = z.infer<typeof piCompanyListResultSchema>;
export type PiCompanyErrorCode = z.infer<typeof errorSchema>["code"];
