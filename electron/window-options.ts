import type { BrowserWindowConstructorOptions } from "electron";

/** The smallest supported window, a common laptop screen's size (ADR-0010). */
export const minimumWindowSize = { width: 1366, height: 768 } as const;

/** The size the window opens at when the screen has room for it. */
const preferredWindowSize = { width: 1600, height: 900 } as const;

/**
 * The game window's options. The page gets no Node access: Node integration
 * is off everywhere, and the preload script runs sandboxed and isolated from
 * the page. Anything the page needs from the main process goes through a
 * narrow bridge that the preload script exposes (see preload.cts).
 *
 * `workArea` is the screen's usable area. The window is fitted into it, but
 * never made smaller than the minimum.
 */
export function mainWindowOptions(
  preload: string,
  workArea: { readonly width: number; readonly height: number },
): BrowserWindowConstructorOptions {
  return {
    title: "Moon Base",
    width: fit(
      preferredWindowSize.width,
      workArea.width,
      minimumWindowSize.width,
    ),
    height: fit(
      preferredWindowSize.height,
      workArea.height,
      minimumWindowSize.height,
    ),
    minWidth: minimumWindowSize.width,
    minHeight: minimumWindowSize.height,
    // The page's own background, so the window doesn't flash white before the
    // game draws.
    backgroundColor: "#000000",
    // Shown once the page is ready to draw (see window.ts).
    show: false,
    webPreferences: {
      preload,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: false,
    },
  };
}

function fit(preferred: number, available: number, minimum: number): number {
  return Math.max(minimum, Math.min(preferred, available));
}
