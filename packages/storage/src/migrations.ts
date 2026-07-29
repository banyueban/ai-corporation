import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const MIGRATION_FILE_PATTERN = /^(?<version>\d{4})_(?<name>[a-z0-9_]+)\.sql$/u;

export interface Migration {
  readonly checksum: string;
  readonly name: string;
  readonly sql: string;
  readonly version: number;
}

interface AppliedMigration {
  readonly checksum: string;
  readonly version: number;
}

function checksum(sql: string): string {
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

export function loadMigrations(directory: string): readonly Migration[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => {
      const match = MIGRATION_FILE_PATTERN.exec(entry.name);
      if (match?.groups === undefined) {
        throw new Error(`Invalid migration filename: ${entry.name}`);
      }
      const name = match.groups.name;
      const versionText = match.groups.version;
      if (name === undefined || versionText === undefined) {
        throw new Error(`Invalid migration filename: ${entry.name}`);
      }

      const sql = readFileSync(path.join(directory, entry.name), "utf8");
      return {
        checksum: checksum(sql),
        name,
        sql,
        version: Number.parseInt(versionText, 10),
      };
    })
    .sort((left, right) => left.version - right.version);
}

export function applyMigrations(
  database: DatabaseSync,
  migrations: readonly Migration[],
): void {
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);

  const appliedRows = database
    .prepare("SELECT version, checksum FROM schema_migrations ORDER BY version")
    .all();
  const applied = new Map<number, string>();

  for (const row of appliedRows) {
    if (
      typeof row.version !== "number" ||
      !Number.isInteger(row.version) ||
      typeof row.checksum !== "string"
    ) {
      throw new Error("Migration history is invalid");
    }
    applied.set(row.version, row.checksum);
  }

  const seenVersions = new Set<number>();
  for (const migration of migrations) {
    if (seenVersions.has(migration.version)) {
      throw new Error(`Duplicate migration version: ${migration.version}`);
    }
    seenVersions.add(migration.version);

    const appliedChecksum = applied.get(migration.version);
    if (appliedChecksum !== undefined) {
      if (appliedChecksum !== migration.checksum) {
        throw new Error(`Applied migration changed: ${migration.version}`);
      }
      continue;
    }

    applyMigration(database, migration);
  }
}

function applyMigration(database: DatabaseSync, migration: Migration): void {
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(migration.sql);
    database
      .prepare(
        `INSERT INTO schema_migrations
          (version, name, checksum, applied_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(
        migration.version,
        migration.name,
        migration.checksum,
        new Date().toISOString(),
      );
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function readAppliedMigrations(
  database: DatabaseSync,
): readonly AppliedMigration[] {
  const rows = database
    .prepare("SELECT version, checksum FROM schema_migrations ORDER BY version")
    .all();

  return rows.map((row) => {
    if (
      typeof row.version !== "number" ||
      !Number.isInteger(row.version) ||
      typeof row.checksum !== "string"
    ) {
      throw new Error("Migration history is invalid");
    }
    return {
      checksum: row.checksum,
      version: row.version,
    };
  });
}
