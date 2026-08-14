import { DatabaseSync } from "node:sqlite";
import { piEmployeeSchema, type PiEmployee } from "@ai-corporation/protocols";

export class PiEmployeeRepository {
  constructor(private readonly database: DatabaseSync) {}

  list(): readonly PiEmployee[] {
    return this.database
      .prepare(
        `SELECT id, name, provider_id, provider_version, model_id,
          skill_name, created_at, updated_at
        FROM pi_employee
        ORDER BY updated_at DESC, id`,
      )
      .all()
      .map(parseRow);
  }

  get(id: string): PiEmployee | undefined {
    const row = this.database
      .prepare(
        `SELECT id, name, provider_id, provider_version, model_id,
          skill_name, created_at, updated_at
        FROM pi_employee WHERE id = ?`,
      )
      .get(id);
    return row === undefined ? undefined : parseRow(row);
  }

  save(input: {
    readonly id: string;
    readonly name: string;
    readonly providerId: string;
    readonly providerVersion: number;
    readonly modelId: string;
    readonly skillName: string;
    readonly now: string;
  }): PiEmployee {
    const existing = this.get(input.id);
    if (existing === undefined) {
      this.database
        .prepare(
          `INSERT INTO pi_employee (
            id, name, provider_id, provider_version, model_id, skill_name,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.id,
          input.name,
          input.providerId,
          input.providerVersion,
          input.modelId,
          input.skillName,
          input.now,
          input.now,
        );
    } else {
      this.database
        .prepare(
          `UPDATE pi_employee SET name = ?, provider_id = ?,
            provider_version = ?, model_id = ?, skill_name = ?, updated_at = ?
          WHERE id = ?`,
        )
        .run(
          input.name,
          input.providerId,
          input.providerVersion,
          input.modelId,
          input.skillName,
          input.now,
          input.id,
        );
    }
    const saved = this.get(input.id);
    if (saved === undefined) throw new Error("Employee save failed");
    return saved;
  }
}

function parseRow(row: Readonly<Record<string, unknown>>): PiEmployee {
  return piEmployeeSchema.parse({
    schemaVersion: 1,
    id: row.id,
    name: row.name,
    providerId: row.provider_id,
    providerVersion: row.provider_version,
    modelId: row.model_id,
    skillName: row.skill_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}
