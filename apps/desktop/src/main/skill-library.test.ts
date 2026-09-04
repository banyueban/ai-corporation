import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SkillLibrary, SkillLibraryError } from "./skill-library";

describe("SkillLibrary", () => {
  let root: string;
  let sourceRoot: string;
  let source: string;
  let library: SkillLibrary;

  beforeEach(async () => {
    root = await createTemporaryDirectory("M7-TU-01-library-");
    sourceRoot = await createTemporaryDirectory("M12-TU-01-source-");
    source = path.join(sourceRoot, "text-organize");
    await mkdir(source, { recursive: true });
    library = new SkillLibrary(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(sourceRoot, { recursive: true, force: true });
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
    const external = path.join(root, "external");
    await mkdir(external);
    await writeFile(path.join(external, "secret.txt"), "secret", "utf8");
    await symlink(
      external,
      path.join(source, "unsafe-link"),
      process.platform === "win32" ? "junction" : "dir",
    );

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

  it("parses official optional metadata and keeps allowed-tools informational", async () => {
    await writeFile(
      path.join(source, "SKILL.md"),
      `---
name: text-organize
description: >
  整理文字，并在用户要求总结或检查文本时使用。
license: Apache-2.0
compatibility: Requires Node.js 24
metadata:
  author: example-org
  version: "1.0"
allowed-tools: Bash(git:*) Read
---

# 工作说明
只整理用户指定的内容。
`,
      "utf8",
    );

    const preview = await library.previewImport(source);
    expect(preview).toMatchObject({
      name: "text-organize",
      license: "Apache-2.0",
      compatibility: "Requires Node.js 24",
      metadata: { author: "example-org", version: "1.0" },
      allowedTools: "Bash(git:*) Read",
    });
    await library.confirmImport(source, preview.digest);
    await expect(library.readInstructions("text-organize")).resolves.toBe(
      "# 工作说明\n只整理用户指定的内容。\n",
    );
  });

  it("lists and reads only bounded standard resources", async () => {
    await writeSkill(source, "text-organize", "整理文字", {
      "references/guide.md": "参考说明",
      "assets/template.bin": "\u0001\u0002",
      "scripts/check.js": "console.log('ok');",
      "other.txt": "不会列出",
    });
    const preview = await library.previewImport(source);
    await library.confirmImport(source, preview.digest);

    await expect(library.listResources("text-organize")).resolves.toEqual([
      { kind: "ASSET", relativePath: "assets/template.bin", sizeBytes: 2 },
      {
        kind: "REFERENCE",
        relativePath: "references/guide.md",
        sizeBytes: 12,
      },
      {
        available: "AVAILABLE",
        kind: "SCRIPT",
        relativePath: "scripts/check.js",
        runtime: "JAVASCRIPT",
        sizeBytes: 18,
      },
    ]);
    await expect(
      library.readReference("text-organize", "references/guide.md"),
    ).resolves.toMatchObject({ content: "参考说明" });
    await expect(
      library.inspectAsset("text-organize", "assets/template.bin"),
    ).resolves.toMatchObject({ relativePath: "assets/template.bin" });
    await expect(
      library.readReference("text-organize", "../SKILL.md"),
    ).rejects.toMatchObject({ code: "UNSAFE_ENTRY" });
    await expect(
      library.readReference("text-organize", "assets/template.bin"),
    ).rejects.toMatchObject({ code: "UNSAFE_ENTRY" });
  });

  it("inspects supported scripts and copies the exact managed snapshot", async () => {
    await writeSkill(source, "text-organize", "整理文字", {
      "package.json": '{"dependencies":{"kleur":"4.1.5"}}',
      "scripts/check.js": "console.log('ok');",
    });
    const preview = await library.previewImport(source);
    await library.confirmImport(source, preview.digest);
    const inspection = await library.inspectScript(
      "text-organize",
      "scripts/check.js",
    );
    const target = path.join(sourceRoot, "runtime-copy");

    expect(inspection).toMatchObject({
      digest: preview.digest,
      runtime: "JAVASCRIPT",
      scriptContent: "console.log('ok');",
    });
    await library.materializeRuntimeCopy(
      "text-organize",
      inspection.digest,
      target,
    );
    await expect(
      readFile(path.join(target, "scripts/check.js"), "utf8"),
    ).resolves.toBe("console.log('ok');");
  });

  it("requires the official skill name to match its parent folder", async () => {
    const mismatched = path.join(sourceRoot, "wrong-folder");
    await writeSkill(mismatched, "text-organize", "整理文字", {});
    await expect(library.previewImport(mismatched)).rejects.toMatchObject({
      code: "INVALID_SKILL",
      message:
        "文件夹名称“wrong-folder”必须与 SKILL.md 中的 name“text-organize”一致。",
    });
  });

  it("returns safe errors for missing managed Skills without exposing its root", async () => {
    const result = library.readInstructions("missing-skill");
    await expect(result).rejects.toMatchObject({ code: "INVALID_SKILL" });
    await expect(result).rejects.not.toThrow(root);
  });

  it("rejects binary, oversized and unsafe reference requests", async () => {
    await writeSkill(source, "text-organize", "整理文字", {
      "references/large.txt": "a".repeat(1024 * 1024 + 1),
      "references/nested/guide.md": "合法说明",
    });
    await writeFile(
      path.join(source, "references/binary.bin"),
      Buffer.from([0xff, 0xfe, 0xfd]),
    );
    const preview = await library.previewImport(source);
    await library.confirmImport(source, preview.digest);

    await expect(
      library.readReference("text-organize", "references/binary.bin"),
    ).rejects.toMatchObject({ code: "INVALID_SKILL" });
    await expect(
      library.readReference("text-organize", "references/large.txt"),
    ).rejects.toMatchObject({ code: "SKILL_TOO_LARGE" });
    for (const unsafePath of [
      "C:/outside.txt",
      "references\\guide.md",
      "references/../SKILL.md",
      "references//guide.md",
      "references/",
    ]) {
      await expect(
        library.readReference("text-organize", unsafePath),
      ).rejects.toMatchObject({ code: "UNSAFE_ENTRY" });
    }
  });

  it("keeps the old managed copy when an updated Skill is invalid", async () => {
    await writeSkill(source, "text-organize", "原说明", {});
    const original = await library.previewImport(source);
    await library.confirmImport(source, original.digest);
    await writeFile(
      path.join(source, "SKILL.md"),
      "---\nname: text-organize\ndescription: 123\n---\n错误更新\n",
      "utf8",
    );

    await expect(library.previewImport(source)).rejects.toMatchObject({
      code: "INVALID_SKILL",
    });
    await expect(library.get("text-organize")).resolves.toMatchObject({
      description: "原说明",
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
