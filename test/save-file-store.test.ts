import { describe, expect, it, vi } from "vitest";
import type {
  SaveBridge,
  OpenSaveFileResult,
  SaveFileResult,
} from "../electron/desktop-bridge";
import {
  createDesktopSaveFileStore,
  saveFileStoreFor,
} from "../src/ui/save-file-store";

// The browser's store needs a page, and these tests run in Node, so a
// stand-in takes its place.
const browserStore = vi.hoisted(() => ({ save: vi.fn(), open: vi.fn() }));
vi.mock("../src/ui/browser-save-file-store", () => ({
  createBrowserSaveFileStore: () => browserStore,
}));

function bridge(
  save: SaveFileResult | Error,
  open: OpenSaveFileResult | Error = { outcome: "cancelled" },
) {
  const answer = <T>(result: T | Error) =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
  return {
    saveFile: vi.fn(() => answer(save)),
    openSaveFile: vi.fn(() => answer(open)),
  } satisfies SaveBridge;
}

describe("choosing where save files go", () => {
  it("is the desktop app's dialogs when the preload script has exposed its bridge", async () => {
    const desktop = bridge({ outcome: "saved", fileName: "a.moonbase" });
    const store = saveFileStoreFor({ moonbase: desktop });

    expect(await store.save("a.moonbase", "{}")).toEqual({
      outcome: "saved",
    });
    expect(desktop.saveFile).toHaveBeenCalledWith("a.moonbase", "{}");
  });

  it("is the browser's download and file picker otherwise", () => {
    expect(saveFileStoreFor({})).toBe(browserStore);
    // Something else under the same name isn't the bridge.
    expect(saveFileStoreFor({ moonbase: { saveFile: () => undefined } })).toBe(
      browserStore,
    );
  });
});

describe("the desktop app's save and open dialogs", () => {
  it("say nothing when the player cancels", async () => {
    const store = createDesktopSaveFileStore(
      bridge({ outcome: "cancelled" }, { outcome: "cancelled" }),
    );
    expect(await store.save("a.moonbase", "{}")).toEqual({
      outcome: "cancelled",
    });
    expect(await store.open()).toEqual({ outcome: "cancelled" });
  });

  it("tell the player when the file couldn't be written", async () => {
    const store = createDesktopSaveFileStore(
      bridge({ outcome: "failed", fileName: "b.moonbase" }),
    );
    expect(await store.save("a.moonbase", "{}")).toEqual({
      outcome: "failed",
      message: `Couldn't save "b.moonbase". The file couldn't be written.`,
    });
  });

  it("give the file chosen to be loaded, by its name", async () => {
    const store = createDesktopSaveFileStore(
      bridge(
        { outcome: "cancelled" },
        { outcome: "opened", fileName: "c.moonbase", contents: '{"é":1}' },
      ),
    );
    const result = await store.open();
    if (result.outcome !== "chosen") throw new Error(result.outcome);
    expect(result.file.name).toBe("c.moonbase");
    expect(await result.file.text()).toBe('{"é":1}');
  });

  it("tell the player why a file couldn't be read", async () => {
    const unreadable = createDesktopSaveFileStore(
      bridge(
        { outcome: "cancelled" },
        { outcome: "failed", fileName: "d.moonbase", reason: "unreadable" },
      ),
    );
    expect(await unreadable.open()).toEqual({
      outcome: "failed",
      message: `Couldn't load "d.moonbase". The file couldn't be read.`,
    });
    const tooLarge = createDesktopSaveFileStore(
      bridge(
        { outcome: "cancelled" },
        { outcome: "failed", fileName: "e.moonbase", reason: "too-large" },
      ),
    );
    expect(await tooLarge.open()).toEqual({
      outcome: "failed",
      message: `Couldn't load "e.moonbase". It is too large to be a Moon Base save file.`,
    });
  });

  it("tell the player when the bridge itself fails, and log why", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("refused by the main process");
    const store = createDesktopSaveFileStore(bridge(failure, failure));

    expect(await store.save("a.moonbase", "{}")).toEqual({
      outcome: "failed",
      message: `Couldn't save "a.moonbase". Something went wrong while saving it.`,
    });
    expect(await store.open()).toEqual({
      outcome: "failed",
      message: "Couldn't load a file. Something went wrong while opening it.",
    });
    expect(logged).toHaveBeenCalledWith(failure);
    logged.mockRestore();
  });
});
