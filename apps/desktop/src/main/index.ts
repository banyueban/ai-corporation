import path from "node:path";
import { app, BrowserWindow } from "electron";

const rendererEntryPath = path.join(__dirname, "../../renderer/index.html");
const preloadPath = path.join(__dirname, "../preload/index.js");

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    height: 800,
    minHeight: 640,
    minWidth: 960,
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
  });

  window.once("ready-to-show", () => {
    window.show();
  });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (url !== window.webContents.getURL()) {
      event.preventDefault();
    }
  });

  void window.loadFile(rendererEntryPath);

  return window;
}

void app.whenReady().then(() => {
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
