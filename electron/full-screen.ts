// The game window's fullscreen, which F11 and the top bar's Full screen
// button toggle. It is the window's own fullscreen (BrowserWindow's
// setFullScreen), never the page's: Chromium leaves a page's fullscreen (the
// HTML Fullscreen API's) on Escape, but the game uses Escape to close its
// screens and cancel placing a Structure, and closing one of those must never
// leave fullscreen too. The window's fullscreen ignores Escape, so only F11
// and the button leave it (docs/rules.md says so for players).
import {
  BrowserWindow,
  ipcMain,
  type Input,
  type IpcMainInvokeEvent,
} from "electron";
import { channels } from "./desktop-bridge.js";
import { isFromGame } from "./security.js";

/** Whether a key press toggles fullscreen: F11, with no modifier key. */
function togglesFullScreen(
  input: Pick<
    Input,
    "type" | "key" | "alt" | "control" | "meta" | "shift" | "isAutoRepeat"
  >,
): boolean {
  return (
    input.type === "keyDown" &&
    input.key === "F11" &&
    !input.alt &&
    !input.control &&
    !input.meta &&
    !input.shift &&
    !input.isAutoRepeat
  );
}

/**
 * Toggles fullscreen on F11, and tells the page each time the window enters
 * or leaves it, for the Full screen button.
 *
 * F11 is caught here, in the main process, before the page sees it, rather
 * than by the page: it then works whatever the page is doing, with a dialog
 * open or the page still loading, the page can't swallow it, and the page
 * never sees it, so Chromium's own F11 handling can't toggle the window a
 * second time.
 */
export function controlFullScreen(window: BrowserWindow): void {
  const contents = window.webContents;
  contents.on("before-input-event", (event, input) => {
    if (input.key !== "F11") return;
    // A held key's repeats, and its release, go no further either.
    event.preventDefault();
    if (togglesFullScreen(input)) window.setFullScreen(!window.isFullScreen());
  });
  const tell = (fullScreen: boolean) => () => {
    if (!contents.isDestroyed()) {
      contents.send(channels.fullScreenChanged, fullScreen);
    }
  };
  window.on("enter-full-screen", tell(true));
  window.on("leave-full-screen", tell(false));
}

/**
 * Answers the page's requests to toggle fullscreen and to know whether the
 * window is in it, from the game's own page (started at `appUrl`) only, with
 * no arguments, as the bridge sends none.
 */
export function handleFullScreen(appUrl: string): void {
  const owner = (
    event: IpcMainInvokeEvent,
    args: readonly unknown[],
  ): BrowserWindow => {
    if (!isFromGame(event, appUrl)) {
      throw new Error("Only the game's page may change its window.");
    }
    if (args.length !== 0) throw new Error("Fullscreen takes no arguments.");
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window === null) throw new Error("The page has no window.");
    return window;
  };
  ipcMain.handle(channels.toggleFullScreen, (event, ...args: unknown[]) => {
    const window = owner(event, args);
    window.setFullScreen(!window.isFullScreen());
  });
  ipcMain.handle(channels.isFullScreen, (event, ...args: unknown[]) =>
    owner(event, args).isFullScreen(),
  );
}
