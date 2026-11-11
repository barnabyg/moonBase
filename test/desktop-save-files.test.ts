import type { IpcMainInvokeEvent } from "electron";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLastFolder } from "../electron/last-folder.js";
import { maxSaveFileBytes } from "../electron/save-bridge.js";
import {
  isFromGame,
  parseOpenSaveFileArgs,
  parseSaveFileArgs,
} from "../electron/save-ipc.js";
import { readSaveFile, writeSaveFile } from "../electron/save-file-io.js";

let folder: string;
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "moonbase-test-"));
});
afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

describe("what the page may ask the main process to save", () => {
  it("is a save file's name and its contents", () => {
    expect(
      parseSaveFileArgs(["moon-base-earth-day-3-0705.moonbase", "{}"]),
    ).toEqual({
      suggestedName: "moon-base-earth-day-3-0705.moonbase",
      contents: "{}",
    });
  });

  it.each([
    ["no arguments", []],
    ["a name that isn't a string", [3, "{}"]],
    ["contents that aren't a string", ["a.moonbase", { text: "{}" }]],
    ["an extra argument", ["a.moonbase", "{}", "C:/Windows"]],
    ["an empty name", ["", "{}"]],
    ["a name without the extension", ["a.txt", "{}"]],
    ["a name with a folder", ["../a.moonbase", "{}"]],
    ["a name with a backslash", ["C:\\a.moonbase", "{}"]],
    ["a name with a drive", ["C:a.moonbase", "{}"]],
    ["a name with a control character", ["a\u0000.moonbase", "{}"]],
    ["a name that is only the extension", [".moonbase", "{}"]],
    ["a name too long", [`${"a".repeat(200)}.moonbase`, "{}"]],
  ])("is refused with %s", (_case, args) => {
    expect(() => parseSaveFileArgs(args)).toThrow();
  });

  it("is refused when the contents are larger than a save could be", () => {
    // Multi-byte characters count by their UTF-8 size.
    const contents = "é".repeat(maxSaveFileBytes / 2 + 1);
    expect(() => parseSaveFileArgs(["a.moonbase", contents])).toThrow();
    expect(
      parseSaveFileArgs(["a.moonbase", "é".repeat(maxSaveFileBytes / 2)])
        .contents,
    ).toHaveLength(maxSaveFileBytes / 2);
  });

  it("to open a save file is nothing", () => {
    expect(() => {
      parseOpenSaveFileArgs([]);
    }).not.toThrow();
    expect(() => {
      parseOpenSaveFileArgs(["C:/secrets.txt"]);
    }).toThrow();
  });
});

describe("who may ask", () => {
  const appUrl = "app://moonbase/";
  function event(url: string, mainFrame = true): IpcMainInvokeEvent {
    const frame = { url };
    const other = { url };
    return {
      senderFrame: frame,
      sender: { mainFrame: mainFrame ? frame : other },
    } as unknown as IpcMainInvokeEvent;
  }

  it("is the game's own page", () => {
    expect(isFromGame(event("app://moonbase/?seed=1"), appUrl)).toBe(true);
    expect(
      isFromGame(event("http://127.0.0.1:5173/"), "http://127.0.0.1:5173/"),
    ).toBe(true);
  });

  it("is not a page from anywhere else, a frame inside the page, or a frame gone", () => {
    expect(isFromGame(event("https://example.com/"), appUrl)).toBe(false);
    expect(isFromGame(event("app://other/"), appUrl)).toBe(false);
    expect(isFromGame(event("app://moonbase/", false), appUrl)).toBe(false);
    expect(
      isFromGame(
        { senderFrame: null, sender: {} } as unknown as IpcMainInvokeEvent,
        appUrl,
      ),
    ).toBe(false);
  });
});

describe("the folder the dialogs open in", () => {
  it("is the fallback, such as Documents, until a file has been saved or opened", async () => {
    const lastFolder = createLastFolder(join(folder, "settings.json"), "C:/D");
    expect(await lastFolder.get()).toBe("C:/D");
  });

  it("is the folder of the last file saved or opened, kept for the next run", async () => {
    const settings = join(folder, "settings.json");
    await createLastFolder(settings, "C:/D").remember(
      join(folder, "saved.moonbase"),
    );
    expect(await createLastFolder(settings, "C:/D").get()).toBe(folder);
  });

  it("is the fallback if the folder kept has gone, or what is kept is damaged", async () => {
    const settings = join(folder, "settings.json");
    const lastFolder = createLastFolder(settings, "C:/D");
    await lastFolder.remember(join(folder, "gone", "saved.moonbase"));
    expect(await lastFolder.get()).toBe("C:/D");
    await writeFile(settings, "not JSON");
    expect(await lastFolder.get()).toBe("C:/D");
    await writeFile(settings, JSON.stringify({ saveFolder: 3 }));
    expect(await lastFolder.get()).toBe("C:/D");
  });
});

describe("writing and reading save files", () => {
  it("writes the contents, replacing a file already there, and leaves nothing else", async () => {
    const path = join(folder, "a.moonbase");
    await writeFile(path, "old");
    await writeSaveFile(path, '{"é":1}');
    expect(await readFile(path, "utf8")).toBe('{"é":1}');
    expect(await readdir(folder)).toEqual(["a.moonbase"]);
  });

  it("fails without leaving anything when the folder doesn't exist", async () => {
    await expect(
      writeSaveFile(join(folder, "gone", "a.moonbase"), "{}"),
    ).rejects.toThrow();
    expect(await readdir(folder)).toEqual([]);
  });

  it("reads a file back", async () => {
    const path = join(folder, "a.moonbase");
    await writeFile(path, '{"é":1}');
    expect(await readSaveFile(path)).toEqual({ contents: '{"é":1}' });
  });

  it("refuses a file too large to be a save, or one it can't read", async () => {
    const path = join(folder, "big.moonbase");
    await writeFile(path, Buffer.alloc(maxSaveFileBytes + 1));
    expect(await readSaveFile(path)).toEqual({ reason: "too-large" });
    expect(await readSaveFile(join(folder, "gone.moonbase"))).toEqual({
      reason: "unreadable",
    });
    expect(await readSaveFile(folder)).toEqual({ reason: "unreadable" });
  });
});
