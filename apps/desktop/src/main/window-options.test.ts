import { describe, expect, it } from "vitest";
import { createWindowOptions } from "./window-options";

describe("Electron security baseline", () => {
  it("isolates and sandboxes the renderer", () => {
    const options = createWindowOptions("preload.js");

    expect(options.minWidth).toBe(1024);
    expect(options.minHeight).toBe(700);
    expect(options.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      preload: "preload.js",
      sandbox: true,
      webSecurity: true,
    });
  });

  it("does not expose permissive web preferences", () => {
    const preferences = createWindowOptions("preload.js").webPreferences;

    expect(preferences?.allowRunningInsecureContent).not.toBe(true);
    expect(preferences?.webviewTag).not.toBe(true);
  });
});
