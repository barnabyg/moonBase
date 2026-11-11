import { mkdirSync, writeFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { BrowserWindow } from "electron";
import { parseWindowState, type WindowState } from "./window-state.js";

/**
 * How the player left the window, kept in a small JSON file in the app's
 * user-data folder, so the next run opens it the same way. The file holds
 * `{ "bounds": { "x", "y", "width", "height" }, "maximized", "fullScreen" }`,
 * the bounds being the window's, frame and all, when it was last neither
 * maximised nor full screen.
 */

/** The kept state, or undefined if none was kept, or the file is damaged. */
export async function readWindowState(
  file: string,
): Promise<WindowState | undefined> {
  try {
    return parseWindowState(JSON.parse(await readFile(file, "utf8")));
  } catch {
    // None kept yet, or damaged: the window opens as on a first run.
    return undefined;
  }
}

/** How long the window must keep still before a move or resize is kept. */
const settleMs = 500;

/**
 * Keeps `window`'s state in `file` as the player changes it: shortly after a
 * move or resize, at once on maximising or going full screen and back, and
 * last as it closes.
 */
export function keepWindowState(window: BrowserWindow, file: string): void {
  let timer: NodeJS.Timeout | undefined;
  const state = (): WindowState => ({
    bounds: window.getNormalBounds(),
    maximized: window.isMaximized(),
    fullScreen: window.isFullScreen(),
  });
  const keepSoon = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      if (window.isDestroyed()) return;
      void keep(file, state());
    }, settleMs);
  };
  window.on("move", keepSoon);
  window.on("resize", keepSoon);
  const keepNow = (): void => {
    clearTimeout(timer);
    void keep(file, state());
  };
  window.on("maximize", keepNow);
  window.on("unmaximize", keepNow);
  window.on("enter-full-screen", keepNow);
  window.on("leave-full-screen", keepNow);
  // Written before the window goes, as the app may quit straight after.
  window.on("close", () => {
    clearTimeout(timer);
    try {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(state()));
    } catch (error) {
      console.warn("Moon Base couldn't keep the window's state:", error);
    }
  });
}

async function keep(file: string, state: WindowState): Promise<void> {
  try {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(state));
  } catch (error) {
    // Only how the next run opens the window; nothing of the game is lost.
    console.warn("Moon Base couldn't keep the window's state:", error);
  }
}
