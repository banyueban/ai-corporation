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

const BUILTIN_SKILL_NAMES = new Set([
  "text-organize",
  "coding-task",
  "document-processing",
]);

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
            ...(skill.license === undefined ? {} : { license: skill.license }),
            ...(skill.compatibility === undefined
              ? {}
              : { compatibility: skill.compatibility }),
            metadata: skill.metadata,
            ...(skill.allowedTools === undefined
              ? {}
              : { allowedTools: skill.allowedTools }),
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
          ...(preview.license === undefined
            ? {}
            : { license: preview.license }),
          ...(preview.compatibility === undefined
            ? {}
            : { compatibility: preview.compatibility }),
          metadata: preview.metadata,
          ...(preview.allowedTools === undefined
            ? {}
            : { allowedTools: preview.allowedTools }),
          changes: [...preview.changes],
        },
      };
    } catch (error) {
      return failure(mapSkillError(error), safeSkillErrorMessage(error));
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
          ...(skill.license === undefined ? {} : { license: skill.license }),
          ...(skill.compatibility === undefined
            ? {}
            : { compatibility: skill.compatibility }),
          metadata: skill.metadata,
          ...(skill.allowedTools === undefined
            ? {}
            : { allowedTools: skill.allowedTools }),
          source: "IMPORTED",
          readOnly: true,
        },
      };
    } catch (error) {
      return failure(mapSkillError(error), safeSkillErrorMessage(error));
    }
  }
}

function mapSkillError(error: unknown) {
  return error instanceof SkillLibraryError ? error.code : "INTERNAL";
}

function safeSkillErrorMessage(error: unknown): string | undefined {
  // SkillLibraryError 只包含经过设计的相对名称和用户可执行说明，不含内部绝对路径。
  return error instanceof SkillLibraryError ? error.message.trim() : undefined;
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
  message = "技能操作失败",
): PiSkillItemResult & PiSkillListResult & PiSkillPreviewImportResult {
  return { ok: false, error: { code, message } };
}
