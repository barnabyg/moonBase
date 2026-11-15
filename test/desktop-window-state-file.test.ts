import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserWindow } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keepWindowState } from "../electron/window-state-file.js";
import type { Rectangle, WindowState } from "../electron/window-state.js";

/** Just enough of a BrowserWindow for keepWindowState, its state set by hand. */
class FakeWindow extends EventEmitter {
  bounds: Rectangle = { x: 10, y: 20, width: 1200, height: 800 };
  maximized = false;
  fullScreen = false;
  getNormalBounds(): Rectangle {
    return this.bounds;
  }
  isMaximized(): boolean {
    return this.maximized;
  }
  isFullScreen(): boolean {
    return this.fullScreen;
  }
  isDestroyed(): boolean {
    return false;
  }
}

let folder: string;
let file: string;
let window: FakeWindow;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "moonbase-window-state-"));
  // In a folder not made yet, as on a first run.
  file = join(folder, "user-data", "window-state.json");
  window = new FakeWindow();
  keepWindowState(window as unknown as BrowserWindow, file);
});

afterEach(() => {
  vi.useRealTimers();
  rmSync(folder, { recursive: true, force: true });
});

function kept(): WindowState {
  return JSON.parse(readFileSync(file, "utf8")) as WindowState;
}

describe("keeping the window's state as the player changes it", () => {
  it("has the file say the latest state as soon as the window is maximised, or goes full screen and back", () => {
    window.maximized = true;
    window.emit("maximize");
    expect(kept()).toMatchObject({ maximized: true, fullScreen: false });

    // Unmaximised and straight into full screen, then closed at once: no
    // earlier state may land in the file after a later one.
    window.maximized = false;
    window.emit("unmaximize");
    window.fullScreen = true;
    window.emit("enter-full-screen");
    expect(kept()).toMatchObject({ maximized: false, fullScreen: true });
    window.emit("close");
    expect(kept()).toMatchObject({ maximized: false, fullScreen: true });

    window.fullScreen = false;
    window.emit("leave-full-screen");
    expect(kept()).toMatchObject({ fullScreen: false });
  });

  it("keeps a move or resize once the window has kept still, and as it closes", () => {
    vi.useFakeTimers();
    window.maximized = true;
    window.emit("maximize");
    window.maximized = false;
    window.bounds = { x: 50, y: 60, width: 1000, height: 700 };
    window.emit("move");
    window.emit("resize");
    vi.advanceTimersByTime(400);
    expect(kept().bounds).not.toEqual(window.bounds);
    vi.advanceTimersByTime(200);
    expect(kept()).toEqual({
      bounds: window.bounds,
      maximized: false,
      fullScreen: false,
    });

    window.bounds = { x: 70, y: 80, width: 900, height: 600 };
    window.emit("resize");
    window.emit("close");
    expect(kept().bounds).toEqual(window.bounds);
    // The move still waiting to be kept writes nothing after the close.
    window.bounds = { x: 0, y: 0, width: 100, height: 100 };
    vi.advanceTimersByTime(1000);
    expect(kept().bounds).toEqual({ x: 70, y: 80, width: 900, height: 600 });
  });
});
