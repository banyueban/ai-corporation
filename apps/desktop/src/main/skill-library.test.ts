import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SkillLibrary, SkillLibraryError } from "./skill-library";

describe("SkillLibrary", () => {
  let root: string;
  let source: string;
  let library: SkillLibrary;

  beforeEach(async () => {
    root = await createTemporaryDirectory("M7-TU-01-library-");
    source = await createTemporaryDirectory("M7-TU-01-source-");
    library = new SkillLibrary(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(source, { recursive: true, force: true });
  });

  it("copies the complete folder and remains usable after the source is deleted", async () => {
    await writeSkill(source, "text-organize", "整理文字", {
      "references/example.md": "示例",
      "scripts/check.js": "console.log('ok');",
    });
    const preview = await library.previewImport(source);
    const imported = await library.confirmImport(source, preview.digest);
    await rm(source, { recursive: true, force: true });

    expect(preview.changes.map((change) => change.path)).toEqual([
      "SKILL.md",
      "references/example.md",
      "scripts/check.js",
    ]);
    expect(
      await readFile(
        path.join(imported.directory, "references/example.md"),
        "utf8",
      ),
    ).toBe("示例");
    await expect(library.list()).resolves.toMatchObject([
      { name: "text-organize", description: "整理文字" },
    ]);
  });

  it("previews added, changed and removed files before replacing a skill", async () => {
    await writeSkill(source, "text-organize", "整理文字", {
      "old.md": "旧",
      "same.md": "不变",
    });
    const first = await library.previewImport(source);
    await library.confirmImport(source, first.digest);
    await rm(source, { recursive: true, force: true });
    await mkdir(source, { recursive: true });
    await writeSkill(source, "text-organize", "整理和检查文字", {
      "new.md": "新",
      "same.md": "不变",
    });

    const update = await library.previewImport(source);
    expect(update.changes).toEqual([
      { path: "SKILL.md", type: "CHANGED" },
      { path: "new.md", type: "ADDED" },
      { path: "old.md", type: "REMOVED" },
    ]);
  });

  it("rejects confirmation when the source changed after preview", async () => {
    await writeSkill(source, "text-organize", "整理文字", {});
    const preview = await library.previewImport(source);
    await writeFile(path.join(source, "extra.md"), "later", "utf8");

    await expect(
      library.confirmImport(source, preview.digest),
    ).rejects.toMatchObject({
      code: "SOURCE_CHANGED",
    });
  });

  it("rejects symbolic links instead of copying content outside the skill", async () => {
    await writeSkill(source, "text-organize", "整理文字", {});
    const external = path.join(root, "external.txt");
    await writeFile(external, "secret", "utf8");
    await symlink(external, path.join(source, "unsafe-link"));

    await expect(library.previewImport(source)).rejects.toBeInstanceOf(
      SkillLibraryError,
    );
  });

  it("requires valid Agent Skills frontmatter", async () => {
    await writeFile(
      path.join(source, "SKILL.md"),
      "# missing metadata",
      "utf8",
    );
    await expect(library.previewImport(source)).rejects.toMatchObject({
      code: "INVALID_SKILL",
    });
  });
});

async function createTemporaryDirectory(prefix: string): Promise<string> {
  const directory = path.join(os.tmpdir(), `${prefix}${randomUUID()}`);
  await mkdir(directory, { recursive: true });
  return directory;
}

async function writeSkill(
  directory: string,
  name: string,
  description: string,
  files: Readonly<Record<string, string>>,
): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
    "utf8",
  );
  for (const [relativePath, content] of Object.entries(files)) {
    const destination = path.join(directory, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content, "utf8");
  }
}
