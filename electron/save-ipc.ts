// Checks on what the page asks the main process for through the save bridge
// (desktop-bridge.ts), before anything is done with it: who sent it, and that its
// arguments are what the bridge sends. A page that has gone wrong, or been
// made to run code it shouldn't, gets an error rather than a file written
// where it chose. Only types are imported from Electron, so the unit tests can
// run this in plain Node.
import type { IpcMainInvokeEvent } from "electron";
import {
  maxSaveFileBytes,
  maxSuggestedNameLength,
  saveFileExtension,
} from "./desktop-bridge.js";
import { isAllowedNavigation } from "./security.js";

/**
 * Whether a message came from the game's own page: the window's main frame,
 * not a frame inside it, showing a page from where the game started.
 */
export function isFromGame(
  event: Pick<IpcMainInvokeEvent, "sender" | "senderFrame">,
  appUrl: string,
): boolean {
  const frame = event.senderFrame;
  if (frame === null) return false;
  return (
    frame === event.sender.mainFrame && isAllowedNavigation(frame.url, appUrl)
  );
}

/** A file name with no folder, drive or character Windows doesn't allow. */
// eslint-disable-next-line no-control-regex -- control characters are what it refuses
const forbiddenInName = /[<>:"/\\|?*\u0000-\u001f]/;

/** The arguments of saveFile, or an error if they aren't what it sends. */
export function parseSaveFileArgs(args: readonly unknown[]): {
  suggestedName: string;
  contents: string;
} {
  const [suggestedName, contents] = args;
  if (args.length !== 2) throw new Error("saveFile takes two arguments.");
  if (
    typeof suggestedName !== "string" ||
    suggestedName.length > maxSuggestedNameLength ||
    forbiddenInName.test(suggestedName) ||
    !suggestedName.endsWith(`.${saveFileExtension}`) ||
    suggestedName.length <= saveFileExtension.length + 1
  ) {
    throw new Error("saveFile's name isn't a save file's name.");
  }
  if (
    typeof contents !== "string" ||
    new TextEncoder().encode(contents).length > maxSaveFileBytes
  ) {
    throw new Error("saveFile's contents aren't a save file's.");
  }
  return { suggestedName, contents };
}

/** Checks that openSaveFile was given nothing, as it takes nothing. */
export function parseOpenSaveFileArgs(args: readonly unknown[]): void {
  if (args.length !== 0) throw new Error("openSaveFile takes no arguments.");
}
