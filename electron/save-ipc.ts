// Checks on what the page asks the main process for through the save bridge
// (desktop-bridge.ts), before anything is done with it: that its arguments are
// what the bridge sends (security.ts's isFromGame checks who sent it). A page
// that has gone wrong, or been made to run code it shouldn't, gets an error
// rather than a file written where it chose. It imports nothing from
// Electron, so the unit tests can run it in plain Node.
import {
  maxSaveFileBytes,
  maxSuggestedNameLength,
  saveFileExtension,
} from "./desktop-bridge.js";

/** The printable characters Windows doesn't allow in a file name. */
const forbiddenInName = /[<>:"/\\|?*]/;

/**
 * Whether `name` is a file name with no folder, drive or character Windows
 * doesn't allow: neither those above nor a control character (below U+0020).
 */
function isPlainFileName(name: string): boolean {
  if (forbiddenInName.test(name)) return false;
  for (let i = 0; i < name.length; i++) {
    if (name.charCodeAt(i) < 0x20) return false;
  }
  return true;
}

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
    !isPlainFileName(suggestedName) ||
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
