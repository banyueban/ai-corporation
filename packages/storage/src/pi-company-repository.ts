import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { piCompanySchema, type PiCompany } from "@ai-corporation/protocols";

export class PiCompanyNotFoundError extends Error {}
export class PiCompanyEmployeeNotFoundError extends Error {}
export class PiCompanyWorkspaceNotFoundError extends Error {}
export class PiCompanyCommandConflictError extends Error {}

type CompanyCommandType =
  | "CREATE"
  | "UPDATE_NAME"
  | "ADD_EMPLOYEE"
  | "REMOVE_EMPLOYEE"
  | "ADD_WORKSPACE"
  | "REMOVE_WORKSPACE";

/** Stores only the lightweight Pi company and its reusable memberships. */
export class PiCompanyRepository {
  constructor(private readonly database: DatabaseSync) {}

  list(): readonly PiCompany[] {
    return this.database
      .prepare("SELECT * FROM pi_company ORDER BY updated_at DESC, id")
      .all()
      .map((row) => this.parse(row));
  }

  get(id: string): PiCompany | undefined {
    const row = this.database
      .prepare("SELECT * FROM pi_company WHERE id = ?")
      .get(id);
    return row === undefined ? undefined : this.parse(row);
  }

  create(input: {
    readonly commandId: string;
    readonly id: string;
    readonly name: string;
    readonly now: string;
  }): PiCompany {
    const requestHash = hashRequest({ name: input.name });
    const replay = this.replay(input.commandId, "CREATE", requestHash);
    if (replay !== undefined) return replay;
    return this.transaction(() => {
      this.database
        .prepare(
          "INSERT INTO pi_company (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
        )
        .run(input.id, input.name, input.now, input.now);
      this.receipt(input.commandId, "CREATE", input.id, requestHash, input.now);
      return this.require(input.id);
    });
  }

  updateName(input: {
    readonly commandId: string;
    readonly companyId: string;
    readonly name: string;
    readonly now: string;
  }): PiCompany {
    const requestHash = hashRequest({
      companyId: input.companyId,
      name: input.name,
    });
    const replay = this.replay(input.commandId, "UPDATE_NAME", requestHash);
    if (replay !== undefined) return replay;
    return this.transaction(() => {
      this.require(input.companyId);
      this.database
        .prepare("UPDATE pi_company SET name = ?, updated_at = ? WHERE id = ?")
        .run(input.name, input.now, input.companyId);
      this.receipt(
        input.commandId,
        "UPDATE_NAME",
        input.companyId,
        requestHash,
        input.now,
      );
      return this.require(input.companyId);
    });
  }

  changeEmployee(input: {
    readonly commandId: string;
    readonly companyId: string;
    readonly employeeId: string;
    readonly add: boolean;
    readonly now: string;
  }): PiCompany {
    const commandType = input.add ? "ADD_EMPLOYEE" : "REMOVE_EMPLOYEE";
    const requestHash = hashRequest({
      companyId: input.companyId,
      employeeId: input.employeeId,
    });
    const replay = this.replay(input.commandId, commandType, requestHash);
    if (replay !== undefined) return replay;
    return this.transaction(() => {
      this.require(input.companyId);
      if (!this.employeeExists(input.employeeId)) {
        throw new PiCompanyEmployeeNotFoundError();
      }
      if (input.add) {
        this.database
          .prepare(
            `INSERT OR IGNORE INTO pi_company_employee
              (company_id, employee_id, created_at) VALUES (?, ?, ?)`,
          )
          .run(input.companyId, input.employeeId, input.now);
      } else {
        this.database
          .prepare(
            "DELETE FROM pi_company_employee WHERE company_id = ? AND employee_id = ?",
          )
          .run(input.companyId, input.employeeId);
      }
      this.touch(input.companyId, input.now);
      this.receipt(
        input.commandId,
        commandType,
        input.companyId,
        requestHash,
        input.now,
      );
      return this.require(input.companyId);
    });
  }

  changeWorkspace(input: {
    readonly commandId: string;
    readonly companyId: string;
    readonly workspaceId: string;
    readonly add: boolean;
    readonly now: string;
  }): PiCompany {
    const commandType = input.add ? "ADD_WORKSPACE" : "REMOVE_WORKSPACE";
    const requestHash = hashRequest({
      companyId: input.companyId,
      workspaceId: input.workspaceId,
    });
    const replay = this.replay(input.commandId, commandType, requestHash);
    if (replay !== undefined) return replay;
    return this.transaction(() => {
      this.require(input.companyId);
      if (!this.workspaceExists(input.workspaceId)) {
        throw new PiCompanyWorkspaceNotFoundError();
      }
      if (input.add) {
        this.database
          .prepare(
            `INSERT OR IGNORE INTO pi_company_workspace
              (company_id, workspace_id, created_at) VALUES (?, ?, ?)`,
          )
          .run(input.companyId, input.workspaceId, input.now);
      } else {
        this.database
          .prepare(
            "DELETE FROM pi_company_workspace WHERE company_id = ? AND workspace_id = ?",
          )
          .run(input.companyId, input.workspaceId);
      }
      this.touch(input.companyId, input.now);
      this.receipt(
        input.commandId,
        commandType,
        input.companyId,
        requestHash,
        input.now,
      );
      return this.require(input.companyId);
    });
  }

  hasEmployee(companyId: string, employeeId: string): boolean {
    return (
      this.database
        .prepare(
          "SELECT 1 FROM pi_company_employee WHERE company_id = ? AND employee_id = ?",
        )
        .get(companyId, employeeId) !== undefined
    );
  }

  hasWorkspace(companyId: string, workspaceId: string): boolean {
    return (
      this.database
        .prepare(
          "SELECT 1 FROM pi_company_workspace WHERE company_id = ? AND workspace_id = ?",
        )
        .get(companyId, workspaceId) !== undefined
    );
  }

  private require(id: string): PiCompany {
    const company = this.get(id);
    if (company === undefined) throw new PiCompanyNotFoundError();
    return company;
  }

  private parse(row: Readonly<Record<string, unknown>>): PiCompany {
    const id = String(row.id);
    const employeeIds = this.database
      .prepare(
        "SELECT employee_id FROM pi_company_employee WHERE company_id = ? ORDER BY created_at, employee_id",
      )
      .all(id)
      .map((membership) => String(membership.employee_id));
    const workspaceIds = this.database
      .prepare(
        "SELECT workspace_id FROM pi_company_workspace WHERE company_id = ? ORDER BY created_at, workspace_id",
      )
      .all(id)
      .map((membership) => String(membership.workspace_id));
    return piCompanySchema.parse({
      schemaVersion: 1,
      id,
      name: row.name,
      employeeIds,
      workspaceIds,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  private replay(
    commandId: string,
    commandType: CompanyCommandType,
    requestHash: string,
  ): PiCompany | undefined {
    const row = this.database
      .prepare(
        "SELECT command_type, company_id, request_hash FROM pi_company_command WHERE command_id = ?",
      )
      .get(commandId);
    if (row === undefined) return undefined;
    if (row.command_type !== commandType || row.request_hash !== requestHash) {
      throw new PiCompanyCommandConflictError();
    }
    return this.require(String(row.company_id));
  }

  private receipt(
    commandId: string,
    commandType: CompanyCommandType,
    companyId: string,
    requestHash: string,
    now: string,
  ): void {
    this.database
      .prepare(
        `INSERT INTO pi_company_command
          (command_id, command_type, company_id, request_hash, created_at)
        VALUES (?, ?, ?, ?, ?)`,
      )
      .run(commandId, commandType, companyId, requestHash, now);
  }

  private employeeExists(employeeId: string): boolean {
    return (
      this.database
        .prepare("SELECT 1 FROM pi_employee WHERE id = ?")
        .get(employeeId) !== undefined
    );
  }

  private workspaceExists(workspaceId: string): boolean {
    return (
      this.database
        .prepare("SELECT 1 FROM workspace WHERE id = ?")
        .get(workspaceId) !== undefined
    );
  }

  private touch(companyId: string, now: string): void {
    this.database
      .prepare("UPDATE pi_company SET updated_at = ? WHERE id = ?")
      .run(now, companyId);
  }

  private transaction<T>(action: () => T): T {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = action();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

function hashRequest(value: Readonly<Record<string, string>>): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
