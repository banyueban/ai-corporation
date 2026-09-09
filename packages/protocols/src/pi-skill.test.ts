import { describe, expect, it } from "vitest";
import { piSkillPreviewImportResultSchema } from "./pi-skill";

describe("Pi Skill protocol", () => {
  it("keeps the safe validation reason returned by the main process", () => {
    const message =
      "文件夹名称“wrong-folder-name”必须与 SKILL.md 中的 name“expected-folder-name”一致。";

    expect(
      piSkillPreviewImportResultSchema.parse({
        ok: false,
        error: { code: "INVALID_SKILL", message },
      }),
    ).toEqual({
      ok: false,
      error: { code: "INVALID_SKILL", message },
    });
  });

  it("rejects an empty or excessively long error message", () => {
    for (const message of ["", "x".repeat(501)]) {
      expect(
        piSkillPreviewImportResultSchema.safeParse({
          ok: false,
          error: { code: "INVALID_SKILL", message },
        }).success,
      ).toBe(false);
    }
  });
});
