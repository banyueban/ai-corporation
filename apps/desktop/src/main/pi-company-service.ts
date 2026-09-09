import type {
  PiCompanyCreateRequest,
  PiCompanyEmployeeRequest,
  PiCompanyErrorCode,
  PiCompanyItemResult,
  PiCompanyListResult,
  PiCompanyUpdateNameRequest,
  PiCompanyWorkspaceRequest,
} from "@ai-corporation/protocols";
import {
  PiCompanyCommandConflictError,
  PiCompanyEmployeeNotFoundError,
  PiCompanyNotFoundError,
  type PiCompanyRepository,
  PiCompanyWorkspaceNotFoundError,
  type WorkspaceRepository,
} from "@ai-corporation/storage";
import { createUuidV7 } from "./uuid-v7";

export class PiCompanyService {
  constructor(
    private readonly options: {
      readonly repository: PiCompanyRepository;
      readonly workspaceRepository: Pick<WorkspaceRepository, "getTrusted">;
      readonly createId?: () => string;
      readonly clock?: () => string;
    },
  ) {}

  list(): PiCompanyListResult {
    try {
      return { ok: true, value: [...this.options.repository.list()] };
    } catch {
      return listFailure("STORAGE_UNAVAILABLE");
    }
  }

  create(request: PiCompanyCreateRequest): PiCompanyItemResult {
    return this.run(() =>
      this.options.repository.create({
        commandId: request.commandId,
        id: (this.options.createId ?? createUuidV7)(),
        name: request.name,
        now: this.now(),
      }),
    );
  }

  updateName(request: PiCompanyUpdateNameRequest): PiCompanyItemResult {
    return this.run(() =>
      this.options.repository.updateName({
        commandId: request.commandId,
        companyId: request.companyId,
        name: request.name,
        now: this.now(),
      }),
    );
  }

  changeEmployee(
    request: PiCompanyEmployeeRequest,
    add: boolean,
  ): PiCompanyItemResult {
    return this.run(() =>
      this.options.repository.changeEmployee({
        commandId: request.commandId,
        companyId: request.companyId,
        employeeId: request.employeeId,
        add,
        now: this.now(),
      }),
    );
  }

  changeWorkspace(
    request: PiCompanyWorkspaceRequest,
    add: boolean,
  ): PiCompanyItemResult {
    if (add) {
      const workspace = this.options.workspaceRepository.getTrusted(
        request.workspaceId,
      );
      if (
        workspace === undefined ||
        workspace.accessStatus !== "AVAILABLE" ||
        workspace.permissionMode !== "READ_WRITE"
      ) {
        return failure("WORKSPACE_NOT_READY");
      }
    }
    return this.run(() =>
      this.options.repository.changeWorkspace({
        commandId: request.commandId,
        companyId: request.companyId,
        workspaceId: request.workspaceId,
        add,
        now: this.now(),
      }),
    );
  }

  private run(
    action: () => Extract<PiCompanyItemResult, { ok: true }>["value"],
  ): PiCompanyItemResult {
    try {
      return { ok: true, value: action() };
    } catch (error) {
      if (error instanceof PiCompanyNotFoundError) return failure("NOT_FOUND");
      if (error instanceof PiCompanyEmployeeNotFoundError) {
        return failure("EMPLOYEE_NOT_FOUND");
      }
      if (error instanceof PiCompanyWorkspaceNotFoundError) {
        return failure("WORKSPACE_NOT_READY");
      }
      if (error instanceof PiCompanyCommandConflictError) {
        return failure("INVALID_REQUEST");
      }
      return failure("STORAGE_UNAVAILABLE");
    }
  }

  private now(): string {
    return (this.options.clock ?? (() => new Date().toISOString()))();
  }
}

function failure(code: PiCompanyErrorCode): PiCompanyItemResult {
  return { ok: false, error: { code, message: "公司操作失败" } };
}

function listFailure(code: PiCompanyErrorCode): PiCompanyListResult {
  return { ok: false, error: { code, message: "公司操作失败" } };
}
