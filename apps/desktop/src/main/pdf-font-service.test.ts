import path from "node:path";
import { describe, expect, it } from "vitest";
import { createPdfFontCss, PDF_FONT_FAMILY } from "./pdf-font-service";

describe("PDF font service", () => {
  it("embeds only the Noto Sans SC subsets needed by the document", async () => {
    const fontDirectory = path.resolve(
      __dirname,
      "../../node_modules/@fontsource-variable/noto-sans-sc",
    );
    const css = await createPdfFontCss("整理结果 Word PDF", fontDirectory);

    expect(css).toContain(`font-family:'${PDF_FONT_FAMILY}'`);
    expect(css).toContain("data:font/woff2;base64,");
    expect(css).toContain("unicode-range:");
    // 整套字体约 4.9 MB；这份短文只应加载少量实际用到的片段。
    expect(css.length).toBeLessThan(1_000_000);
  });

  it("reports an incomplete bundled font with a user-readable reason", async () => {
    await expect(
      createPdfFontCss("测试", path.join(__dirname, "missing-font")),
    ).rejects.toThrow("软件内置的 PDF 中文字体不完整");
  });
});
