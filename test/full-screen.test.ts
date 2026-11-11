import { describe, expect, it, vi } from "vitest";
import type { FullScreenBridge } from "../electron/desktop-bridge";
import { fullScreenFor } from "../src/ui/full-screen";

function bridge(fullScreen: boolean) {
  let tell: ((fullScreen: boolean) => void) | undefined;
  return {
    toggleFullScreen: vi.fn(() => Promise.resolve()),
    isFullScreen: vi.fn(() => Promise.resolve(fullScreen)),
    onFullScreenChange: vi.fn((listener: (fullScreen: boolean) => void) => {
      tell = listener;
    }),
    /** Has the main process say the window entered or left fullscreen. */
    change(to: boolean) {
      tell?.(to);
    },
  } satisfies FullScreenBridge & { change(to: boolean): void };
}

describe("the window's fullscreen", () => {
  it("is there only when the desktop app's preload script has exposed its bridge", () => {
    expect(fullScreenFor({})).toBeUndefined();
    expect(fullScreenFor({ moonbase: {} })).toBeUndefined();
    // The bridge of a desktop app from before fullscreen.
    expect(
      fullScreenFor({ moonbase: { saveFile() {}, openSaveFile() {} } }),
    ).toBeUndefined();
    expect(fullScreenFor({ moonbase: bridge(false) })).toBeDefined();
  });

  it("toggles through the bridge", () => {
    const desktop = bridge(false);

    fullScreenFor({ moonbase: desktop })?.toggle();

    expect(desktop.toggleFullScreen).toHaveBeenCalledOnce();
  });

  it("tells a watcher whether the window fills the screen, then each change", async () => {
    const desktop = bridge(true);
    const heard: boolean[] = [];

    fullScreenFor({ moonbase: desktop })?.watch((fullScreen) => {
      heard.push(fullScreen);
    });
    await vi.waitFor(() => {
      expect(heard).toEqual([true]);
    });
    desktop.change(false);
    desktop.change(true);

    expect(heard).toEqual([true, false, true]);
  });

  it("keeps a change heard before the first answer, as the newer", async () => {
    const desktop = bridge(false);
    const heard: boolean[] = [];

    fullScreenFor({ moonbase: desktop })?.watch((fullScreen) => {
      heard.push(fullScreen);
    });
    desktop.change(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(heard).toEqual([true]);
  });
});
