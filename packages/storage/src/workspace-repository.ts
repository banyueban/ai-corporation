import { DatabaseSync } from "node:sqlite";
import {
  workspacePublicSchema,
  workspaceTrustedRecordSchema,
  type WorkspaceAccessStatus,
  type WorkspacePermissionMode,
  type WorkspacePublic,
  type WorkspaceTrustedRecord,
} from "@ai-corporation/protocols";

export class WorkspaceNotFoundError extends Error {
  constructor() {
    super("Workspace not found");
    this.name = "WorkspaceNotFoundError";
  }
}

export class WorkspaceDataError extends Error {
  constructor() {
    super("Workspace data is invalid");
    this.name = "WorkspaceDataError";
  }
}

export interface WorkspaceVerificationUpdate {
  readonly accessStatus: WorkspaceAccessStatus;
  readonly lastVerifiedAt: string;
  readonly permissionMode: WorkspacePermissionMode | null;
}

export class WorkspaceRepository {
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  saveAuthorized(
    name: string,
    record: WorkspaceTrustedRecord,
    now: string,
  ): void {
    const trusted = workspaceTrustedRecordSchema.parse(record);
    this.#database
      .prepare(
        `INSERT INTO workspace (
          id,
          name,
          display_path,
          canonical_root_path,
          platform,
          permission_mode,
          access_status,
          path_identity_json,
          last_verified_at,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        trusted.workspaceId,
        name,
        trusted.displayPath,
        trusted.canonicalRootPath,
        trusted.pathIdentity.platform,
        trusted.permissionMode,
        trusted.accessStatus,
        JSON.stringify(trusted.pathIdentity),
        trusted.lastVerifiedAt,
        now,
        now,
      );
  }

  getTrusted(workspaceId: string): WorkspaceTrustedRecord | undefined {
    const row = this.#database
      .prepare(
        `SELECT
          id,
          display_path,
          canonical_root_path,
          permission_mode,
          access_status,
          path_identity_json,
          last_verified_at
        FROM workspace
        WHERE id = ?`,
      )
      .get(workspaceId);

    return row === undefined ? undefined : parseTrustedRow(row);
  }

  listPublic(): readonly WorkspacePublic[] {
    return this.#database
      .prepare(
        `SELECT
          id,
          display_path,
          permission_mode,
          access_status
        FROM workspace
        ORDER BY created_at, id`,
      )
      .all()
      .map(parsePublicRow);
  }

  updateVerification(
    workspaceId: string,
    update: WorkspaceVerificationUpdate,
  ): WorkspaceTrustedRecord {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const result = this.#database
        .prepare(
          `UPDATE workspace
          SET
            permission_mode = COALESCE(?, permission_mode),
            access_status = ?,
            last_verified_at = ?,
            updated_at = ?
          WHERE id = ?`,
        )
        .run(
          update.permissionMode,
          update.accessStatus,
          update.lastVerifiedAt,
          update.lastVerifiedAt,
          workspaceId,
        );
      if (result.changes !== 1) {
        throw new WorkspaceNotFoundError();
      }

      const updated = this.getTrusted(workspaceId);
      if (updated === undefined) {
        throw new WorkspaceDataError();
      }
      this.#database.exec("COMMIT");
      return updated;
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }
}

function parsePublicRow(row: Record<string, unknown>): WorkspacePublic {
  const parsed = workspacePublicSchema.safeParse({
    workspaceId: row.id,
    displayPath: row.display_path,
    permissionMode: row.permission_mode,
    accessStatus: row.access_status,
  });
  if (!parsed.success) {
    throw new WorkspaceDataError();
  }
  return parsed.data;
}

function parseTrustedRow(row: Record<string, unknown>): WorkspaceTrustedRecord {
  let pathIdentity: unknown;
  try {
    pathIdentity =
      typeof row.path_identity_json === "string"
        ? (JSON.parse(row.path_identity_json) as unknown)
        : undefined;
  } catch {
    throw new WorkspaceDataError();
  }

  const parsed = workspaceTrustedRecordSchema.safeParse({
    workspaceId: row.id,
    displayPath: row.display_path,
    canonicalRootPath: row.canonical_root_path,
    permissionMode: row.permission_mode,
    accessStatus: row.access_status,
    pathIdentity,
    lastVerifiedAt: row.last_verified_at,
  });
  if (!parsed.success) {
    throw new WorkspaceDataError();
  }
  return parsed.data;
}
