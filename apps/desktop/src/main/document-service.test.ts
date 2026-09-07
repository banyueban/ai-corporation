import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import mammoth from "mammoth";
import { DocumentService } from "./document-service";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe("document service", () => {
  it("creates a real Word file and reads its common structure back", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "M14-TU-01-document-"));
    roots.push(root);
    const service = new DocumentService();
    const markdown =
      "# 季度总结\n\n第一段。\n\n- 完成事项\n\n1. 下一步\n\n| 项目 | 结果 |\n| --- | --- |\n| 测试 | 通过 |";
    const bytes = await service.createDocx(markdown);
    const filePath = path.join(root, "总结.docx");
    await writeFile(filePath, bytes);

    expect(Buffer.from(bytes).subarray(0, 2).toString("ascii")).toBe("PK");
    const result = await service.readAttachment({
      attachment: {
        id: "019d0000-0000-7000-8000-000000000001",
        displayName: "总结.docx",
        mediaType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sizeBytes: bytes.byteLength,
        sha256: "a".repeat(64),
      },
      filePath,
      offset: 0,
      maxCharacters: 40_000,
    });

    expect(result.content).toContain("# 季度总结");
    expect(result.content).toContain("完成事项");
    expect(result.content).toContain("下一步");
    expect(result.content).toContain("测试");
    const html = (await mammoth.convertToHtml({ path: filePath })).value;
    expect(html).toContain("<h1>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<table>");
    expect(await readFile(filePath)).toHaveLength(bytes.byteLength);
  });

  it("escapes attachment text before PDF rendering", () => {
    const html = new DocumentService().createPdfHtml(
      "# 标题\n\n<script>window.bad = true</script>",
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>window.bad");
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("font-src data:");
    expect(html).toContain("AI Corporation Noto Sans SC");
    expect(html).toContain("/* AI_CORPORATION_PDF_FONT */");
  });

  it("renders common Markdown formatting instead of showing its markers", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "M14-TU-01-format-"));
    roots.push(root);
    const service = new DocumentService();
    const markdown = [
      "# **带粗体的标题**",
      "",
      "正文有 **粗体**、*斜体*、***粗斜体***、~~删除线~~、`inline_code()` 和 [官网](https://example.com)，普通 text_summary_check 不应丢下划线。",
      "",
      "> 这是包含 **重点** 的引用。",
      "",
      "---",
      "",
      "- 一级项目",
      "  - 二级项目",
      "1. 一级编号",
      "  1. 二级编号",
      "",
      "| 项目 | 说明 |",
      "| --- | --- |",
      "| **重点** | *表格斜体* |",
      "",
      "<script>window.bad = true</script> [危险链接](javascript:alert(1))",
    ].join("\n");

    const bytes = await service.createDocx(markdown);
    const filePath = path.join(root, "常用格式.docx");
    await writeFile(filePath, bytes);
    const wordHtml = (await mammoth.convertToHtml({ path: filePath })).value;
    expect(wordHtml).toContain("<strong>带粗体的标题</strong>");
    expect(wordHtml).toContain("<strong>粗体</strong>");
    expect(wordHtml).toContain("<em>斜体</em>");
    expect(wordHtml).toContain("<strong><em>粗斜体</em></strong>");
    expect(wordHtml).toContain("<s>删除线</s>");
    expect(wordHtml).toContain("text_summary_check");
    expect(wordHtml).toContain('href="https://example.com"');
    expect(wordHtml).toContain("二级项目");
    expect(wordHtml).toContain("二级编号");
    expect(wordHtml).toContain("<table>");
    expect(wordHtml).not.toContain("**粗体**");
    expect(wordHtml).not.toContain("~~删除线~~");
    expect(wordHtml).not.toContain("javascript:alert");

    const pdfHtml = service.createPdfHtml(markdown);
    expect(pdfHtml).toContain("<strong>带粗体的标题</strong>");
    expect(pdfHtml).toContain("<em>斜体</em>");
    expect(pdfHtml).toContain("<strong><em>粗斜体</em></strong>");
    expect(pdfHtml).toContain("<del>删除线</del>");
    expect(pdfHtml).toContain("<code>inline_code()</code>");
    expect(pdfHtml).toContain('<a href="https://example.com">官网</a>');
    expect(pdfHtml).toContain("<blockquote>");
    expect(pdfHtml).toContain("<hr>");
    expect(pdfHtml).toContain('class="level-1"');
    expect(pdfHtml).toContain("<td><strong>重点</strong></td>");
    expect(pdfHtml).toContain("&lt;script&gt;");
    expect(pdfHtml).not.toContain("<script>window.bad");
    expect(pdfHtml).not.toContain('href="javascript:');
    expect(pdfHtml).not.toContain("**粗体**");
    expect(pdfHtml).not.toContain("~~删除线~~");
    expect(pdfHtml).toContain("text_summary_check");
  });

  it("returns exact offsets when a long text attachment is read in parts", async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "M14-TU-01-document-parts-"),
    );
    roots.push(root);
    const filePath = path.join(root, "长文.md");
    await writeFile(filePath, "第一段内容\n\n第二段内容\n\n第三段内容", "utf8");
    const attachment = {
      id: "019d0000-0000-7000-8000-000000000002",
      displayName: "长文.md",
      mediaType: "text/markdown" as const,
      sizeBytes: 44,
      sha256: "b".repeat(64),
    };
    const service = new DocumentService();
    const first = await service.readAttachment({
      attachment,
      filePath,
      offset: 0,
      maxCharacters: 6,
    });
    const second = await service.readAttachment({
      attachment,
      filePath,
      offset: first.nextOffset,
      maxCharacters: 40_000,
    });

    expect(first).toMatchObject({ offset: 0, nextOffset: 6, hasMore: true });
    expect(second.offset).toBe(first.nextOffset);
    expect(second.nextOffset).toBe(second.totalCharacters);
    expect(second.hasMore).toBe(false);
    expect(first.content + second.content).toBe(
      "第一段内容\n\n第二段内容\n\n第三段内容",
    );
  });
});
