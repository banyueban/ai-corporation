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
      .map((row) => this.#parseRow(row));
  }

  get(id: string): PiEmployee | undefined {
    const row = this.database
      .prepare(
        `SELECT id, name, provider_id, provider_version, model_id,
          skill_name, created_at, updated_at
        FROM pi_employee WHERE id = ?`,
      )
      .get(id);
    return row === undefined ? undefined : this.#parseRow(row);
  }

  save(input: {
    readonly id: string;
    readonly name: string;
    readonly providerId: string;
    readonly providerVersion: number;
    readonly modelId: string;
    readonly skillNames: readonly string[];
    readonly now: string;
  }): PiEmployee {
    const firstSkill = input.skillNames[0];
    if (firstSkill === undefined) throw new Error("Employee needs a skill");
    this.database.exec("BEGIN IMMEDIATE");
    try {
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
            firstSkill,
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
            firstSkill,
            input.now,
            input.id,
          );
        this.database
          .prepare("DELETE FROM pi_employee_skill WHERE employee_id = ?")
          .run(input.id);
      }
      const insertSkill = this.database.prepare(
        `INSERT INTO pi_employee_skill (employee_id, skill_name, position)
         VALUES (?, ?, ?)`,
      );
      input.skillNames.forEach((skillName, position) => {
        insertSkill.run(input.id, skillName, position);
      });
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    const saved = this.get(input.id);
    if (saved === undefined) throw new Error("Employee save failed");
    return saved;
  }

  #parseRow(row: Readonly<Record<string, unknown>>): PiEmployee {
    if (typeof row.id !== "string") throw new Error("Employee row is invalid");
    const skills = this.database
      .prepare(
        `SELECT skill_name FROM pi_employee_skill
         WHERE employee_id = ? ORDER BY position`,
      )
      .all(row.id)
      .map(({ skill_name }) => String(skill_name));
    return piEmployeeSchema.parse({
      schemaVersion: 2,
      id: row.id,
      name: row.name,
      providerId: row.provider_id,
      providerVersion: row.provider_version,
      modelId: row.model_id,
      skillNames: skills,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
