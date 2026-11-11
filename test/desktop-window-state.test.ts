import { describe, expect, it } from "vitest";
import {
  parseWindowState,
  placeWindow,
  type Rectangle,
  type WindowState,
} from "../electron/window-state.js";

// Work areas as Windows gives them in a 100% scale: the screen less a 48 px
// taskbar along the bottom.
const fullHd: Rectangle = { x: 0, y: 0, width: 1920, height: 1032 };
const rightOfIt: Rectangle = { x: 1920, y: 0, width: 2560, height: 1392 };
const laptop: Rectangle = { x: 0, y: 0, width: 1366, height: 720 };

function saved(
  bounds: Rectangle,
  flags: Partial<Omit<WindowState, "bounds">> = {},
): WindowState {
  return { bounds, maximized: false, fullScreen: false, ...flags };
}

describe("reading the kept window state", () => {
  it("takes the window's bounds and whether it was maximised or full screen", () => {
    const kept = {
      bounds: { x: -8, y: 20, width: 1600, height: 900 },
      maximized: true,
      fullScreen: false,
    };

    expect(parseWindowState(kept)).toEqual(kept);
  });

  it("ignores anything else kept with it", () => {
    expect(
      parseWindowState({
        bounds: { x: 0, y: 0, width: 1600, height: 900, z: 3 },
        maximized: false,
        fullScreen: true,
        theme: "dark",
      }),
    ).toEqual(
      saved({ x: 0, y: 0, width: 1600, height: 900 }, { fullScreen: true }),
    );
  });

  it.each([
    ["nothing", undefined],
    ["not an object", "1600x900"],
    ["no bounds", { maximized: false, fullScreen: false }],
    [
      "a bound that isn't a number",
      {
        bounds: { x: "0", y: 0, width: 1600, height: 900 },
        maximized: false,
        fullScreen: false,
      },
    ],
    [
      "a fractional bound",
      {
        bounds: { x: 0.5, y: 0, width: 1600, height: 900 },
        maximized: false,
        fullScreen: false,
      },
    ],
    [
      "no width",
      {
        bounds: { x: 0, y: 0, width: 0, height: 900 },
        maximized: false,
        fullScreen: false,
      },
    ],
    [
      "a size no screen has",
      {
        bounds: { x: 0, y: 0, width: 1600, height: 1e9 },
        maximized: false,
        fullScreen: false,
      },
    ],
    [
      "a position no screen has",
      {
        bounds: { x: -1e9, y: 0, width: 1600, height: 900 },
        maximized: false,
        fullScreen: false,
      },
    ],
    [
      "a flag that isn't true or false",
      {
        bounds: { x: 0, y: 0, width: 1600, height: 900 },
        maximized: "yes",
        fullScreen: false,
      },
    ],
    [
      "a missing flag",
      { bounds: { x: 0, y: 0, width: 1600, height: 900 }, maximized: false },
    ],
  ])("refuses a damaged state: %s", (_case, kept) => {
    expect(parseWindowState(kept)).toBeUndefined();
  });
});

describe("placing the window as it opens", () => {
  it("with nothing kept, opens at its own size on the primary screen, maximised if that has no room for a window", () => {
    expect(placeWindow(undefined, [fullHd], fullHd)).toEqual({
      bounds: undefined,
      maximized: false,
      fullScreen: false,
    });
    // A 1366 x 768 laptop's work area is shorter than the smallest window
    // and its frame.
    expect(placeWindow(undefined, [laptop], laptop)).toEqual({
      bounds: undefined,
      maximized: true,
      fullScreen: false,
    });
  });

  it("puts it back where it was, maximised or full screen if it was", () => {
    const bounds = { x: 2100, y: 100, width: 1700, height: 1000 };

    expect(
      placeWindow(
        saved(bounds, { maximized: true }),
        [fullHd, rightOfIt],
        fullHd,
      ),
    ).toEqual({ bounds, maximized: true, fullScreen: false });
    expect(
      placeWindow(
        saved(bounds, { fullScreen: true }),
        [fullHd, rightOfIt],
        fullHd,
      ),
    ).toEqual({ bounds, maximized: false, fullScreen: true });
  });

  it("keeps a window partly off its screen there, while enough of its title bar shows to drag it back", () => {
    // Over the left edge, as a window snapped there stands, by its invisible
    // border, and mostly off the right edge with 200 px of it showing.
    for (const bounds of [
      { x: -7, y: 0, width: 1600, height: 900 },
      { x: 1720, y: 300, width: 1600, height: 900 },
      { x: 200, y: -10, width: 1600, height: 900 },
    ]) {
      expect(placeWindow(saved(bounds), [fullHd], fullHd).bounds).toEqual(
        bounds,
      );
    }
  });

  it("brings a window on a screen that has gone back to the primary screen, centred, keeping its size and whether it was maximised or full screen", () => {
    const onUnplugged = { x: 2100, y: 100, width: 1600, height: 900 };

    expect(
      placeWindow(
        saved(onUnplugged, { maximized: true, fullScreen: true }),
        [fullHd],
        fullHd,
      ),
    ).toEqual({
      bounds: { x: 160, y: 66, width: 1600, height: 900 },
      maximized: true,
      fullScreen: true,
    });
  });

  it("brings back a window whose title bar is above or below every screen, or shows too little to drag", () => {
    for (const bounds of [
      { x: 100, y: -500, width: 1600, height: 900 },
      { x: 100, y: 1020, width: 1600, height: 900 },
      { x: 1860, y: 100, width: 1600, height: 900 },
      { x: -1560, y: 100, width: 1600, height: 900 },
    ]) {
      expect(placeWindow(saved(bounds), [fullHd], fullHd).bounds).toEqual({
        x: 160,
        y: 66,
        width: 1600,
        height: 900,
      });
    }
  });

  it("shrinks a window brought back to fit the primary screen", () => {
    const fromLargeScreen = { x: 2000, y: 0, width: 2500, height: 1380 };

    expect(
      placeWindow(saved(fromLargeScreen), [laptop], laptop).bounds,
    ).toEqual(laptop);
  });

  it("finds the window on a screen left of or above the primary one", () => {
    const leftOfIt = { x: -1920, y: -200, width: 1920, height: 1032 };
    const bounds = { x: -1700, y: -150, width: 1600, height: 900 };

    expect(
      placeWindow(saved(bounds), [fullHd, leftOfIt], fullHd).bounds,
    ).toEqual(bounds);
  });
});
