import { describe, expect, it, vi } from "vitest";
import type { CloseWindowBridge } from "../electron/desktop-bridge";
import { exitFor } from "../src/ui/exit";

describe("exiting the game", () => {
  it("is there only when the desktop app's preload script has exposed its bridge", () => {
    expect(exitFor({})).toBeUndefined();
    expect(exitFor({ moonbase: {} })).toBeUndefined();
    // The bridge of a desktop app from before the Exit button.
    expect(
      exitFor({ moonbase: { saveFile() {}, openSaveFile() {} } }),
    ).toBeUndefined();
    expect(
      exitFor({ moonbase: { closeWindow: () => Promise.resolve() } }),
    ).toBeDefined();
  });

  it("closes the window through the bridge", () => {
    const desktop = {
      closeWindow: vi.fn(() => Promise.resolve()),
    } satisfies CloseWindowBridge;

    exitFor({ moonbase: desktop })?.();

    expect(desktop.closeWindow).toHaveBeenCalledOnce();
  });
});
