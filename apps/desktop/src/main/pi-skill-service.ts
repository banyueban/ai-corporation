import type {
  PiSkillConfirmImportRequest,
  PiSkillItemResult,
  PiSkillListResult,
  PiSkillPreviewImportResult,
} from "@ai-corporation/protocols";
import {
  SkillLibrary,
  SkillLibraryError,
  type SkillImportPreview,
} from "./skill-library";
import { createUuidV7 } from "./uuid-v7";

const BUILTIN_SKILL_NAMES = new Set(["text-organize", "coding-task"]);

interface PendingImport {
  readonly preview: SkillImportPreview;
  readonly sourceDirectory: string;
}

export class PiSkillService {
  readonly #pending = new Map<string, PendingImport>();

  constructor(
    private readonly options: {
      readonly library: SkillLibrary;
      readonly selectDirectory: () => Promise<string | undefined>;
      readonly createId?: () => string;
    },
  ) {}

  async list(): Promise<PiSkillListResult> {
    try {
      const skills = await this.options.library.list();
      return {
        ok: true,
        value: await Promise.all(
          skills.map(async (skill) => ({
            schemaVersion: 1 as const,
            name: skill.name,
            description: skill.description,
            content: await this.options.library.readInstructions(skill.name),
            source: BUILTIN_SKILL_NAMES.has(skill.name)
              ? ("BUILTIN" as const)
              : ("IMPORTED" as const),
            readOnly: true as const,
          })),
        ),
      };
    } catch {
      return failure("STORAGE_UNAVAILABLE");
    }
  }

  async previewImport(): Promise<PiSkillPreviewImportResult> {
    const sourceDirectory = await this.options.selectDirectory();
    if (sourceDirectory === undefined) return failure("CANCELLED");
    try {
      const preview = await this.options.library.previewImport(sourceDirectory);
      if (BUILTIN_SKILL_NAMES.has(preview.name))
        return failure("BUILTIN_CONFLICT");
      const previewId = (this.options.createId ?? createUuidV7)();
      this.#pending.clear();
      this.#pending.set(previewId, { preview, sourceDirectory });
      return {
        ok: true,
        value: {
          schemaVersion: 1,
          previewId,
          name: preview.name,
          description: preview.description,
          changes: [...preview.changes],
        },
      };
    } catch (error) {
      return failure(mapSkillError(error));
    }
  }

  async confirmImport(
    request: PiSkillConfirmImportRequest,
  ): Promise<PiSkillItemResult> {
    const pending = this.#pending.get(request.previewId);
    if (pending === undefined) return failure("PREVIEW_EXPIRED");
    this.#pending.delete(request.previewId);
    try {
      const skill = await this.options.library.confirmImport(
        pending.sourceDirectory,
        pending.preview.digest,
      );
      return {
        ok: true,
        value: {
          schemaVersion: 1,
          name: skill.name,
          description: skill.description,
          content: await this.options.library.readInstructions(skill.name),
          source: "IMPORTED",
          readOnly: true,
        },
      };
    } catch (error) {
      return failure(mapSkillError(error));
    }
  }
}

function mapSkillError(error: unknown) {
  return error instanceof SkillLibraryError ? error.code : "INTERNAL";
}

function failure(
  code:
    | "CANCELLED"
    | "INVALID_SKILL"
    | "UNSAFE_ENTRY"
    | "SKILL_TOO_LARGE"
    | "SOURCE_CHANGED"
    | "BUILTIN_CONFLICT"
    | "PREVIEW_EXPIRED"
    | "STORAGE_UNAVAILABLE"
    | "INTERNAL",
): PiSkillItemResult & PiSkillListResult & PiSkillPreviewImportResult {
  return { ok: false, error: { code, message: "技能操作失败" } };
}
