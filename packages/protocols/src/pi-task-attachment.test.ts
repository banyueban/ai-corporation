import { describe, expect, it } from "vitest";
import {
  piTaskAttachmentSchema,
  piTaskAttachmentStageResultSchema,
} from "./pi-task-attachment";

describe("Pi task attachment protocol", () => {
  it("exposes only task-local facts and rejects private paths", () => {
    const attachment = {
      id: "019d0000-0000-7000-8000-000000000001",
      displayName: "报告.docx",
      mediaType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" as const,
      sizeBytes: 1024,
      sha256: "a".repeat(64),
    };
    expect(piTaskAttachmentSchema.parse(attachment)).toEqual(attachment);
    expect(
      piTaskAttachmentSchema.safeParse({
        ...attachment,
        originalPath: "C:\\Users\\name\\secret.docx",
      }).success,
    ).toBe(false);
    expect(
      piTaskAttachmentStageResultSchema.safeParse({
        ok: true,
        value: { attachments: [attachment], rejected: [] },
      }).success,
    ).toBe(true);
  });
});
