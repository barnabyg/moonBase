import type { BrowserWindowConstructorOptions } from "electron";

/**
 * The smallest the page inside the window may be: as wide as a common
 * laptop's 1366 x 768 screen, the smallest the game is laid out for
 * (ADR-0010), and a little less tall than the page is in a maximised window
 * there, below the title bar and above the taskbar,
 * about 670 to 690 px at 100% scale. It is the page's size, not the
 * frame's, so that on that laptop the window can be maximised, and the game
 * fills its whole 1366 x 768 screen in fullscreen.
 */
export const minimumWindowSize = { width: 1366, height: 660 } as const;

/**
 * About what the window's frame adds to the page's size on Windows 11: the
 * title bar and the invisible borders it is resized by, as measured at 150%
 * scale (15 x 64 px) and rounded up, when the window still had a menu bar, so
 * a little more than it adds now. Only used to judge whether the screen has
 * room for the window and to size it on a first run.
 */
export const frameAllowance = { width: 16, height: 64 } as const;

/** The page's size when the window first opens and the screen has room. */
const preferredWindowSize = { width: 1600, height: 900 } as const;

/**
 * The game window's options. The page gets no Node access: Node integration
 * is off everywhere, and the preload script runs sandboxed and isolated from
 * the page. Anything the page needs from the main process goes through a
 * narrow bridge that the preload script exposes (see preload.cts).
 *
 * `workArea` is the screen's usable area. The page is sized to fit in it with
 * the window's frame, but never smaller than the minimum; window.ts then puts
 * the window back where the player left it, if it can.
 *
 * Developer tools are off unless `devTools` is set, which main.ts sets only
 * for a development run, with the page from the Vite dev server.
 *
 * `icon` is the window's icon, in its title bar and the taskbar. An installed
 * app shows its .exe's icon, the same one, without it; a development run,
 * from Electron's own .exe, would show Electron's.
 */
export function mainWindowOptions(
  preload: string,
  workArea: { readonly width: number; readonly height: number },
  devTools = false,
  icon?: string,
): BrowserWindowConstructorOptions {
  return {
    title: "Moon Base",
    ...(icon === undefined ? {} : { icon }),
    // The width and height, and the minimums, are the page's, not the
    // frame's.
    useContentSize: true,
    width: fit(
      preferredWindowSize.width,
      workArea.width - frameAllowance.width,
      minimumWindowSize.width,
    ),
    height: fit(
      preferredWindowSize.height,
      workArea.height - frameAllowance.height,
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
      devTools,
    },
  };
}

function fit(preferred: number, available: number, minimum: number): number {
  return Math.max(minimum, Math.min(preferred, available));
}
