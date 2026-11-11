// What the page, the preload script and the main process share about the
// desktop app's bridge between the page and the main process: the IPC channels,
// the functions the preload script exposes to the page, and what they
// answer. It imports nothing, so the page's code (DOM, no Node), the main
// process (Node, no DOM) and the preload script can all import it. The
// sandboxed preload script can't load it at run time, so it imports only its
// types, and spells the channel names out against them.

/** The name the preload script exposes the bridge under, on `window`. */
export const bridgeName = "moonbase";

/**
 * The IPC channel of each thing the page may ask the main process for, and of
 * what the main process tells the page unasked (`fullScreenChanged`).
 */
export interface BridgeChannels {
  readonly saveFile: "moonbase:save-file";
  readonly openSaveFile: "moonbase:open-save-file";
  readonly toggleFullScreen: "moonbase:toggle-full-screen";
  readonly isFullScreen: "moonbase:is-full-screen";
  readonly fullScreenChanged: "moonbase:full-screen-changed";
}

/** The extension of a save file, without its dot, as dialog filters give it. */
export const saveFileExtension = "moonbase";

/**
 * The largest save file the bridge carries, either way: well above any save
 * (the largest sample is about 40 kB), and small enough that a file chosen by
 * mistake, such as a video, isn't read into memory.
 */
export const maxSaveFileBytes = 16 * 1024 * 1024;

/** The longest file name the page may suggest. */
export const maxSuggestedNameLength = 200;

/** What saving to a file came to. */
export type SaveFileResult =
  | {
      readonly outcome: "saved";
      /** The name of the file written, without its folder. */
      readonly fileName: string;
    }
  /** The player closed the dialog without choosing a file. */
  | { readonly outcome: "cancelled" }
  /** The file chosen couldn't be written. */
  | { readonly outcome: "failed"; readonly fileName: string };

/** What opening a save file came to. */
export type OpenSaveFileResult =
  | {
      readonly outcome: "opened";
      readonly fileName: string;
      readonly contents: string;
    }
  | { readonly outcome: "cancelled" }
  | {
      readonly outcome: "failed";
      readonly fileName: string;
      readonly reason: "unreadable" | "too-large";
    };

/**
 * What the preload script exposes to the page as `window.moonbase`. The page
 * gets these functions and nothing else: no file system, no ipcRenderer.
 */
export interface DesktopBridge {
  /**
   * Opens the save dialog, suggesting `suggestedName` in the folder last
   * used, and writes `contents` to the file chosen.
   */
  saveFile(suggestedName: string, contents: string): Promise<SaveFileResult>;
  /** Opens the open dialog, filtered to save files, and reads the file chosen. */
  openSaveFile(): Promise<OpenSaveFileResult>;
  /**
   * Has the window fill the screen, or go back to a window if it does. It is
   * the window's own fullscreen, as F11 gives, not the page's (the HTML
   * Fullscreen API's), which Escape would leave.
   */
  toggleFullScreen(): Promise<void>;
  /** Whether the window fills the screen. */
  isFullScreen(): Promise<boolean>;
  /**
   * Calls `listener` each time the window enters or leaves fullscreen, by F11,
   * `toggleFullScreen` or anything else.
   */
  onFullScreenChange(listener: (fullScreen: boolean) => void): void;
}

/** The bridge's saving and loading, which the page's save file store uses. */
export type SaveBridge = Pick<DesktopBridge, "saveFile" | "openSaveFile">;

/** The bridge's fullscreen, which the top bar's Full screen button uses. */
export type FullScreenBridge = Pick<
  DesktopBridge,
  "toggleFullScreen" | "isFullScreen" | "onFullScreenChange"
>;
