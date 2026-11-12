import { bridgeFunctions } from "./desktop-bridge-lookup";

/**
 * Closes the game's window, as its close button (the X) does, which asks
 * first whether to save any unsaved progress. It is the top bar's Exit
 * button, the way out of the game in fullscreen, where the window has no X.
 * Only the desktop app has it, through the bridge its preload script exposes
 * on `scope` (the page's `window`); in a browser there is none, and no button.
 */
export function exitFor(scope: object): (() => void) | undefined {
  const bridge = bridgeFunctions(scope, ["closeWindow"]);
  if (bridge === undefined) return undefined;
  return () => {
    bridge.closeWindow().catch((error: unknown) => {
      console.error(error);
    });
  };
}
