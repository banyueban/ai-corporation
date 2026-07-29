import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveNativeCorePath } from "./native-core-path";

describe("resolveNativeCorePath", () => {
  it("uses the workspace debug binary during development", () => {
    expect(
      resolveNativeCorePath({
        appPath: path.join("workspace", "apps", "desktop"),
        isPackaged: false,
        platform: "win32",
        resourcesPath: path.join("app", "resources"),
      }),
    ).toBe(path.resolve("workspace", "target", "debug", "native-core.exe"));
  });

  it("uses the resources directory when packaged", () => {
    expect(
      resolveNativeCorePath({
        appPath: "ignored",
        isPackaged: true,
        platform: "darwin",
        resourcesPath: path.join("app", "resources"),
      }),
    ).toBe(path.join("app", "resources", "native-core"));
  });
});
