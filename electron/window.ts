import { BrowserWindow, screen } from "electron";
import { mainWindowOptions } from "./window-options.js";

/** Opens the game's window at `url`, shown once the page is ready to draw. */
export function createMainWindow(url: string, preload: string): BrowserWindow {
  const window = new BrowserWindow(
    mainWindowOptions(preload, screen.getPrimaryDisplay().workAreaSize),
  );
  window.once("ready-to-show", () => {
    window.show();
  });
  window.loadURL(url).catch((error: unknown) => {
    console.error(`Moon Base could not load ${url}:`, error);
  });
  return window;
}
