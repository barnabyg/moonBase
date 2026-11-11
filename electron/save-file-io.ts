import { open, rename, rm, writeFile } from "node:fs/promises";
import { maxSaveFileBytes } from "./desktop-bridge.js";

/**
 * Writes a save file, replacing any file already there. It writes a file
 * beside it first and then puts that in its place, so a write that fails
 * part-way, such as on a full disk, leaves the old save whole.
 */
export async function writeSaveFile(
  path: string,
  contents: string,
): Promise<void> {
  const partial = `${path}.${process.pid}.partial`;
  try {
    await writeFile(partial, contents, "utf8");
    await rename(partial, path);
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}

/**
 * Reads a save file, or says why it couldn't: one larger than any save could
 * be isn't read at all.
 */
export async function readSaveFile(
  path: string,
): Promise<
  | { readonly contents: string }
  | { readonly reason: "unreadable" | "too-large" }
> {
  try {
    const file = await open(path, "r");
    try {
      if ((await file.stat()).size > maxSaveFileBytes) {
        return { reason: "too-large" };
      }
      return { contents: await file.readFile("utf8") };
    } finally {
      await file.close();
    }
  } catch {
    return { reason: "unreadable" };
  }
}
