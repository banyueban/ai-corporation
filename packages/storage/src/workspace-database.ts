import { DatabaseSync } from "node:sqlite";
import { applyMigrations, loadMigrations } from "./migrations";

export function openWorkspaceDatabase(
  databasePath: string,
  migrationDirectory: string,
): DatabaseSync {
  const database = new DatabaseSync(databasePath);
  try {
    database.exec("PRAGMA journal_mode = WAL");
    applyMigrations(database, loadMigrations(migrationDirectory));
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}
