import { bridgeName, type SaveBridge } from "../../electron/desktop-bridge";
import { createBrowserSaveFileStore } from "./browser-save-file-store";

/** What keeping a save file came to. */
export type StoreSaveResult =
  | { readonly outcome: "saved" | "cancelled" }
  | {
      readonly outcome: "failed";
      /** Why, in words the player can read. */
      readonly message: string;
    };

/** What asking the player for a save file came to. */
export type StoreOpenResult =
  | { readonly outcome: "chosen"; readonly file: File }
  | { readonly outcome: "cancelled" }
  | { readonly outcome: "failed"; readonly message: string };

/**
 * Where save files go and come from: the one seam between the game's Save
 * and Load buttons and how the platform keeps files (ADR-0006). The desktop
 * app uses the operating system's save and open dialogs, through the bridge
 * its preload script exposes; the browser downloads the file and opens a
 * file picker. Which one is chosen once, as the game starts
 * (`saveFileStoreFor`).
 */
export interface SaveFileStore {
  /**
   * Keeps `text` as a save file, suggesting `name` for it.
   *
   * @param host The element the request comes from, which the browser's
   *   download link goes in.
   */
  save(name: string, text: string, host: HTMLElement): Promise<StoreSaveResult>;
  /**
   * Asks the player for a save file to load.
   *
   * @param host The element the request comes from, which the browser's file
   *   picker goes in.
   */
  open(host: HTMLElement): Promise<StoreOpenResult>;
}

/**
 * The store for where the game runs: the desktop app's when its preload
 * script has exposed the bridge on `scope` (the page's `window`), else the
 * browser's.
 */
export function saveFileStoreFor(scope: object): SaveFileStore {
  const bridge: unknown = Reflect.get(scope, bridgeName);
  return isDesktopBridge(bridge)
    ? createDesktopSaveFileStore(bridge)
    : createBrowserSaveFileStore();
}

function isDesktopBridge(value: unknown): value is SaveBridge {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "saveFile") === "function" &&
    typeof Reflect.get(value, "openSaveFile") === "function"
  );
}

/** Saves and loads with the operating system's dialogs, in the desktop app. */
export function createDesktopSaveFileStore(bridge: SaveBridge): SaveFileStore {
  return {
    async save(name, text) {
      try {
        const result = await bridge.saveFile(name, text);
        if (result.outcome !== "failed") return { outcome: result.outcome };
        return {
          outcome: "failed",
          message: `Couldn't save "${result.fileName}". The file couldn't be written.`,
        };
      } catch (error) {
        console.error(error);
        return {
          outcome: "failed",
          message: `Couldn't save "${name}". Something went wrong while saving it.`,
        };
      }
    },
    async open() {
      try {
        const result = await bridge.openSaveFile();
        switch (result.outcome) {
          case "opened":
            return {
              outcome: "chosen",
              file: new File([result.contents], result.fileName),
            };
          case "cancelled":
            return result;
          case "failed":
            return {
              outcome: "failed",
              message:
                result.reason === "too-large"
                  ? `Couldn't load "${result.fileName}". It is too large to be a Moon Base save file.`
                  : `Couldn't load "${result.fileName}". The file couldn't be read.`,
            };
        }
      } catch (error) {
        console.error(error);
        return {
          outcome: "failed",
          message:
            "Couldn't load a file. Something went wrong while opening it.",
        };
      }
    },
  };
}
