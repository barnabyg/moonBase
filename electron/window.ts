import { BrowserWindow, screen, type Input } from "electron";
import { controlFullScreen } from "./full-screen.js";
import { mainWindowOptions } from "./window-options.js";
import { readWindowState, keepWindowState } from "./window-state-file.js";
import { placeWindow } from "./window-state.js";

/**
 * Opens the game's window at `url`, shown once the page is ready to draw,
 * where and as the player left it last time, as kept in `stateFile`, or on
 * the primary screen if that is now off every screen (window-state.ts).
 * With `devTools`, for a development run only, F12 and Ctrl+Shift+I open the
 * developer tools; otherwise there are none.
 */
export async function createMainWindow(
  url: string,
  preload: string,
  stateFile: string,
  devTools: boolean,
): Promise<BrowserWindow> {
  const primary = screen.getPrimaryDisplay();
  const placement = placeWindow(
    await readWindowState(stateFile),
    screen.getAllDisplays().map((display) => display.workArea),
    primary.workArea,
  );
  const window = new BrowserWindow(
    mainWindowOptions(preload, primary.workAreaSize, devTools),
  );
  // With no menu bar there is no menu shortcut for them.
  if (devTools) {
    window.webContents.on("before-input-event", (event, input) => {
      if (togglesDevTools(input)) {
        event.preventDefault();
        window.webContents.toggleDevTools();
      }
    });
  }
  // The frame's bounds, which the window is resized to while still hidden.
  if (placement.bounds !== undefined) window.setBounds(placement.bounds);
  keepWindowState(window, stateFile);
  controlFullScreen(window);
  window.once("ready-to-show", () => {
    // Maximised first, so that leaving fullscreen goes back to maximised.
    if (placement.maximized) window.maximize();
    if (placement.fullScreen) window.setFullScreen(true);
    if (!window.isVisible()) window.show();
  });
  window.loadURL(url).catch((error: unknown) => {
    console.error(`Moon Base could not load ${url}:`, error);
  });
  return window;
}

/** Whether a key press toggles the developer tools: F12 or Ctrl+Shift+I. */
function togglesDevTools(
  input: Pick<Input, "type" | "key" | "control" | "shift" | "alt" | "meta">,
): boolean {
  if (input.type !== "keyDown" || input.alt || input.meta) return false;
  return (
    (input.key === "F12" && !input.control && !input.shift) ||
    (input.key.toLowerCase() === "i" && input.control && input.shift)
  );
}

/**
 * Brings the game window to the front, as when the game is started again
 * while it runs: shown, no longer minimised, and focused.
 */
export function bringToFront(window: BrowserWindow): void {
  if (window.isMinimized()) window.restore();
  if (!window.isVisible()) window.show();
  window.focus();
}
