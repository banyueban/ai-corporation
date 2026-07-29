import type { BrowserWindowConstructorOptions } from "electron";

export function createWindowOptions(
  preloadPath: string,
): BrowserWindowConstructorOptions {
  return {
    height: 800,
    minHeight: 700,
    minWidth: 1024,
    show: false,
    title: "AI Corporation Desktop",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
      sandbox: true,
      webSecurity: true,
    },
    width: 1280,
  };
}
