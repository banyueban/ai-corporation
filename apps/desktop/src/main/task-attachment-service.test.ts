import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TaskAttachmentService } from "./task-attachment-service";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe("task attachment service", () => {
  it("keeps an app-owned fixed copy and never changes the original", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "M14-TU-01-attachment-"));
    roots.push(root);
    const original = path.join(root, "原始说明.txt");
    await writeFile(original, "第一版", "utf8");
    const service = new TaskAttachmentService(path.join(root, "managed"));
    const staged = await service.stage([original]);
    expect(staged.rejected).toEqual([]);
    expect(staged.attachments).toHaveLength(1);
    expect(JSON.stringify(staged.attachments)).not.toContain(original);

    await writeFile(original, "用户后来修改", "utf8");
    const committed = service.commit(
      "019d0000-0000-7000-8000-000000000002",
      staged.attachments.map((item) => item.id),
    );
    expect(
      await readFile(
        service.taskFile(
          "019d0000-0000-7000-8000-000000000002",
          committed[0]?.storageName ?? "",
        ),
        "utf8",
      ),
    ).toBe("第一版");
    expect(await readFile(original, "utf8")).toBe("用户后来修改");
  });

  it("keeps valid files when another selected file is invalid", async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "M14-TU-01-attachment-mixed-"),
    );
    roots.push(root);
    const valid = path.join(root, "说明.md");
    const invalid = path.join(root, "假文档.pdf");
    await writeFile(valid, "# 有效内容", "utf8");
    await writeFile(invalid, "not a pdf", "utf8");
    const result = await new TaskAttachmentService(
      path.join(root, "managed"),
    ).stage([valid, invalid]);
    expect(result.attachments.map((item) => item.displayName)).toEqual([
      "说明.md",
    ]);
    expect(result.rejected).toEqual([
      { displayName: "假文档.pdf", reason: "文件内容不是有效的 PDF。" },
    ]);
  });

  it("rejects folders, unsupported files and invalid UTF-8 without losing good files", async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "M14-TU-01-attachment-invalid-"),
    );
    roots.push(root);
    const valid = path.join(root, "说明.txt");
    const unsupported = path.join(root, "旧文档.doc");
    const invalidText = path.join(root, "乱码.txt");
    await writeFile(valid, "有效内容", "utf8");
    await writeFile(unsupported, "legacy", "utf8");
    await writeFile(invalidText, Buffer.from([0xff, 0xfe, 0x00]));

    const result = await new TaskAttachmentService(
      path.join(root, "managed"),
    ).stage([root, unsupported, invalidText, valid]);

    expect(result.attachments.map((item) => item.displayName)).toEqual([
      "说明.txt",
    ]);
    expect(result.rejected).toEqual([
      {
        displayName: path.basename(root),
        reason: "只能添加普通文件，不能添加文件夹或链接。",
      },
      {
        displayName: "旧文档.doc",
        reason: "只支持 Word（.docx）、PDF、TXT 和 Markdown 文件。",
      },
      {
        displayName: "乱码.txt",
        reason: "文本附件必须是 UTF-8 编码。",
      },
    ]);
  });

  it("discards pending copies and does not restore them after an app restart", async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "M14-TU-01-attachment-restart-"),
    );
    roots.push(root);
    const original = path.join(root, "待清理.md");
    const managed = path.join(root, "managed");
    await writeFile(original, "不会随应用恢复", "utf8");
    const firstService = new TaskAttachmentService(managed);
    const first = await firstService.stage([original]);
    const firstId = first.attachments[0]?.id ?? "";
    expect(await firstService.discard([firstId])).toBe(1);
    expect(() =>
      firstService.commit("019d0000-0000-7000-8000-000000000003", [firstId]),
    ).toThrow("附件已过期");

    const second = await firstService.stage([original]);
    const secondId = second.attachments[0]?.id ?? "";
    const restartedService = new TaskAttachmentService(managed);
    expect(() =>
      restartedService.commit("019d0000-0000-7000-8000-000000000004", [
        secondId,
      ]),
    ).toThrow("附件已过期");
    expect(await readFile(original, "utf8")).toBe("不会随应用恢复");
  });

  it("does not start a task while an attachment copy is still pending", async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "M14-TU-01-attachment-pending-"),
    );
    roots.push(root);
    const original = path.join(root, "复制中.md");
    await writeFile(original, "等待复制完成", "utf8");
    const service = new TaskAttachmentService(path.join(root, "managed"));

    const staging = service.stage([original]);
    expect(() =>
      service.commit("019d0000-0000-7000-8000-000000000005", []),
    ).toThrow("附件仍在复制");
    await staging;
  });
});
