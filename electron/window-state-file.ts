import { mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
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
 * last as it closes. Each write is synchronous, a few dozen bytes, so they
 * land in the order the changes came: an asynchronous write still under way
 * as the window went full screen, or closed, could otherwise land after the
 * later one and leave the file with an older state.
 */
export function keepWindowState(window: BrowserWindow, file: string): void {
  let timer: NodeJS.Timeout | undefined;
  const keepNow = (): void => {
    clearTimeout(timer);
    timer = undefined;
    keep(file, {
      bounds: window.getNormalBounds(),
      maximized: window.isMaximized(),
      fullScreen: window.isFullScreen(),
    });
  };
  const keepSoon = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!window.isDestroyed()) keepNow();
    }, settleMs);
  };
  window.on("move", keepSoon);
  window.on("resize", keepSoon);
  window.on("maximize", keepNow);
  window.on("unmaximize", keepNow);
  window.on("enter-full-screen", keepNow);
  window.on("leave-full-screen", keepNow);
  // Before the window goes, as the app may quit straight after.
  window.on("close", keepNow);
}

function keep(file: string, state: WindowState): void {
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(state));
  } catch (error) {
    // Only how the next run opens the window; nothing of the game is lost.
    console.warn("Moon Base couldn't keep the window's state:", error);
  }
}
