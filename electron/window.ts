import { BrowserWindow, screen } from "electron";
import { controlFullScreen } from "./full-screen.js";
import { mainWindowOptions } from "./window-options.js";
import { readWindowState, keepWindowState } from "./window-state-file.js";
import { placeWindow } from "./window-state.js";

/**
 * Opens the game's window at `url`, shown once the page is ready to draw,
 * where and as the player left it last time, as kept in `stateFile`, or on
 * the primary screen if that is now off every screen (window-state.ts).
 */
export async function createMainWindow(
  url: string,
  preload: string,
  stateFile: string,
): Promise<BrowserWindow> {
  const primary = screen.getPrimaryDisplay();
  const placement = placeWindow(
    await readWindowState(stateFile),
    screen.getAllDisplays().map((display) => display.workArea),
    primary.workArea,
  );
  const window = new BrowserWindow(
    mainWindowOptions(preload, primary.workAreaSize),
  );
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
