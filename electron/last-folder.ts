import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * The folder the save and open dialogs start in: the one the player last
 * saved a file to or opened one from, kept in a small JSON file in the app's
 * user-data folder so that the next run starts there too. Only the folder is
 * kept, never a save (ADR-0006).
 */
export interface LastFolder {
  /** The folder last used, or the fallback if none was, or it has gone. */
  get(): Promise<string>;
  /** Keeps the folder `filePath` is in, as the folder last used. */
  remember(filePath: string): Promise<void>;
}

/**
 * @param settingsFile The JSON file it is kept in.
 * @param fallback The folder to start in until one has been used, such as
 *   the player's Documents.
 */
export function createLastFolder(
  settingsFile: string,
  fallback: string,
): LastFolder {
  return {
    async get() {
      let folder: unknown;
      try {
        const kept: unknown = JSON.parse(await readFile(settingsFile, "utf8"));
        folder =
          typeof kept === "object" && kept !== null
            ? Reflect.get(kept, "saveFolder")
            : undefined;
        if (typeof folder === "string" && (await stat(folder)).isDirectory()) {
          return folder;
        }
      } catch {
        // None kept yet, damaged, or gone: start in the fallback.
      }
      return fallback;
    },
    async remember(filePath) {
      try {
        await mkdir(dirname(settingsFile), { recursive: true });
        await writeFile(
          settingsFile,
          JSON.stringify({ saveFolder: dirname(filePath) }),
        );
      } catch (error) {
        // Only where the next dialog starts; the save itself is done.
        console.warn("Moon Base couldn't keep the folder last used:", error);
      }
    },
  };
}
