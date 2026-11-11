import {
  bridgeName,
  type UnsavedProgressBridge,
} from "../../electron/desktop-bridge";
import type { SaveFiles } from "../game/save-files";

/**
 * In the desktop app, answers the main process's question, as the window is
 * about to close, with the Campaign's unsaved progress
 * (src/game/unsaved-progress.ts): the save to offer the player, or none. A
 * browser, with no bridge on `scope` (the page's `window`), has no such
 * question.
 */
export function answerUnsavedProgressFor(
  scope: object,
  saveFiles: Pick<SaveFiles, "unsaved">,
): void {
  const bridge: unknown = Reflect.get(scope, bridgeName);
  if (!isUnsavedProgressBridge(bridge)) return;
  bridge.answerUnsavedProgress(() => {
    const unsaved = saveFiles.unsaved();
    return unsaved === undefined ? null : { ...unsaved };
  });
}

function isUnsavedProgressBridge(
  value: unknown,
): value is UnsavedProgressBridge {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "answerUnsavedProgress") === "function"
  );
}
