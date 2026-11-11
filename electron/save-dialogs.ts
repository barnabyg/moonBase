// Saving and loading save files with the operating system's dialogs, which
// the page asks for through the bridge the preload script exposes
// (desktop-bridge.ts). Saves stay files the player manages (ADR-0006): the main
// process writes only the file the player chose in the save dialog, and reads
// only the one chosen in the open dialog.
//
// The dialogs are called as dialog.showSaveDialog(...), never through a
// reference kept to the function, so the end-to-end tests can stub them.
import {
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
  type OpenDialogOptions,
  type SaveDialogOptions,
} from "electron";
import { basename, join } from "node:path";
import type { LastFolder } from "./last-folder.js";
import {
  saveFileExtension,
  type OpenSaveFileResult,
  type BridgeChannels,
  type SaveFileResult,
} from "./desktop-bridge.js";
import { readSaveFile, writeSaveFile } from "./save-file-io.js";
import {
  isFromGame,
  parseOpenSaveFileArgs,
  parseSaveFileArgs,
} from "./save-ipc.js";

const filters = [
  { name: "Moon Base save files", extensions: [saveFileExtension] },
];

/**
 * Opens the save dialog over `window`, suggesting `suggestedName` in the
 * folder last used, and writes `contents` to the file chosen. The page's
 * Save button comes here, and so can anything else in the main process that
 * has a save's name and contents, such as a prompt on closing the window.
 */
export async function saveWithDialog(
  window: BrowserWindow | undefined,
  lastFolder: LastFolder,
  suggestedName: string,
  contents: string,
): Promise<SaveFileResult> {
  const options: SaveDialogOptions = {
    title: "Save the Campaign",
    defaultPath: join(await lastFolder.get(), suggestedName),
    filters,
    properties: ["showOverwriteConfirmation"],
  };
  const chosen = await (window === undefined
    ? dialog.showSaveDialog(options)
    : dialog.showSaveDialog(window, options));
  if (chosen.canceled || chosen.filePath === "") {
    return { outcome: "cancelled" };
  }
  const fileName = basename(chosen.filePath);
  try {
    await writeSaveFile(chosen.filePath, contents);
  } catch (error) {
    console.warn(`Moon Base couldn't write ${chosen.filePath}:`, error);
    return { outcome: "failed", fileName };
  }
  await lastFolder.remember(chosen.filePath);
  return { outcome: "saved", fileName };
}

/**
 * Opens the open dialog over `window`, in the folder last used and filtered
 * to save files, and reads the file chosen.
 */
export async function openWithDialog(
  window: BrowserWindow | undefined,
  lastFolder: LastFolder,
): Promise<OpenSaveFileResult> {
  const options: OpenDialogOptions = {
    title: "Load a Campaign",
    defaultPath: await lastFolder.get(),
    filters,
    properties: ["openFile"],
  };
  const chosen = await (window === undefined
    ? dialog.showOpenDialog(options)
    : dialog.showOpenDialog(window, options));
  const path = chosen.filePaths[0];
  if (chosen.canceled || path === undefined) return { outcome: "cancelled" };
  const fileName = basename(path);
  const read = await readSaveFile(path);
  if ("reason" in read) {
    return { outcome: "failed", fileName, reason: read.reason };
  }
  await lastFolder.remember(path);
  return { outcome: "opened", fileName, contents: read.contents };
}

const channels: Pick<BridgeChannels, "saveFile" | "openSaveFile"> = {
  saveFile: "moonbase:save-file",
  openSaveFile: "moonbase:open-save-file",
};

/**
 * Answers the page's requests to save and open files, from the game's own
 * page (started at `appUrl`) only, and with only the arguments the bridge
 * sends. Anything else is refused with an error.
 */
export function handleSaveFiles(appUrl: string, lastFolder: LastFolder): void {
  const owner = (event: IpcMainInvokeEvent): BrowserWindow | undefined => {
    if (!isFromGame(event, appUrl)) {
      throw new Error("Only the game's page may save and open files.");
    }
    return BrowserWindow.fromWebContents(event.sender) ?? undefined;
  };
  ipcMain.handle(channels.saveFile, (event, ...args: unknown[]) => {
    const window = owner(event);
    const { suggestedName, contents } = parseSaveFileArgs(args);
    return saveWithDialog(window, lastFolder, suggestedName, contents);
  });
  ipcMain.handle(channels.openSaveFile, (event, ...args: unknown[]) => {
    const window = owner(event);
    parseOpenSaveFileArgs(args);
    return openWithDialog(window, lastFolder);
  });
}
