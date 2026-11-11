import type { SaveFiles } from "../game/save-files";
import { bridgeFunctions } from "./desktop-bridge-lookup";

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
  const bridge = bridgeFunctions(scope, ["answerUnsavedProgress"]);
  if (bridge === undefined) return;
  bridge.answerUnsavedProgress(() => {
    const unsaved = saveFiles.unsaved();
    return unsaved === undefined ? null : { ...unsaved };
  });
}
