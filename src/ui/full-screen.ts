import {
  bridgeName,
  type FullScreenBridge,
} from "../../electron/desktop-bridge";

/**
 * The window's fullscreen, which the top bar's Full screen button toggles.
 * Only the desktop app has it, through the bridge its preload script exposes;
 * in a browser there is none, and no button (`fullScreenFor`).
 */
export interface FullScreen {
  /** Fills the screen, or goes back to a window if it is filled. */
  toggle(): void;
  /**
   * Calls `listener` with whether the window fills the screen, once as soon
   * as that is known and again whenever it changes, by F11 or the button.
   */
  watch(listener: (fullScreen: boolean) => void): void;
}

/**
 * The window's fullscreen where the game runs: the desktop app's, when its
 * preload script has exposed the bridge on `scope` (the page's `window`), or
 * none in a browser.
 */
export function fullScreenFor(scope: object): FullScreen | undefined {
  const bridge: unknown = Reflect.get(scope, bridgeName);
  return isFullScreenBridge(bridge) ? createFullScreen(bridge) : undefined;
}

function isFullScreenBridge(value: unknown): value is FullScreenBridge {
  return (
    typeof value === "object" &&
    value !== null &&
    ["toggleFullScreen", "isFullScreen", "onFullScreenChange"].every(
      (name) => typeof Reflect.get(value, name) === "function",
    )
  );
}

function createFullScreen(bridge: FullScreenBridge): FullScreen {
  return {
    toggle() {
      bridge.toggleFullScreen().catch((error: unknown) => {
        console.error(error);
      });
    },
    watch(listener) {
      // A change heard before the first answer arrives is the newer.
      let heard = false;
      bridge.onFullScreenChange((fullScreen) => {
        heard = true;
        listener(fullScreen);
      });
      bridge
        .isFullScreen()
        .then((fullScreen) => {
          if (!heard) listener(fullScreen);
        })
        .catch((error: unknown) => {
          console.error(error);
        });
    },
  };
}
