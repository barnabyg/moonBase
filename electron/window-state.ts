// Where the game's window opens: where the player left it, if that is still
// on a screen, else on the primary screen. It only works out positions from
// what it is given, with no Electron or file access, so the unit tests can
// run it in plain Node; window-state-file.ts keeps the state, and window.ts
// applies it.
import { frameAllowance, minimumWindowSize } from "./window-options.js";

/** A rectangle on the desktop, in Electron's device-independent pixels. */
export interface Rectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** How the player left the window. */
export interface WindowState {
  /**
   * Where the window stood and how big it was, frame and all, when it was
   * last neither maximised nor full screen.
   */
  readonly bounds: Rectangle;
  readonly maximized: boolean;
  readonly fullScreen: boolean;
}

/** Where the window opens. */
export interface Placement {
  /** Its frame's bounds, or undefined for its own size, centred on the primary screen. */
  readonly bounds: Rectangle | undefined;
  readonly maximized: boolean;
  readonly fullScreen: boolean;
}

/** Beyond any desktop's size or position, so a kept value past it is damage. */
const largestCoordinate = 100_000;

/**
 * The kept state, or undefined if `value` isn't one: missing, damaged, or
 * from something else. Anything kept beside it is ignored.
 */
export function parseWindowState(value: unknown): WindowState | undefined {
  if (!isObject(value)) return undefined;
  const bounds = parseBounds(Reflect.get(value, "bounds"));
  const maximized: unknown = Reflect.get(value, "maximized");
  const fullScreen: unknown = Reflect.get(value, "fullScreen");
  if (
    bounds === undefined ||
    typeof maximized !== "boolean" ||
    typeof fullScreen !== "boolean"
  ) {
    return undefined;
  }
  return { bounds, maximized, fullScreen };
}

function parseBounds(value: unknown): Rectangle | undefined {
  if (!isObject(value)) return undefined;
  const [x, y, width, height] = ["x", "y", "width", "height"].map(
    (name): unknown => Reflect.get(value, name),
  );
  const coordinate = (n: unknown): n is number =>
    Number.isInteger(n) && Math.abs(n as number) <= largestCoordinate;
  const size = (n: unknown): n is number => coordinate(n) && n > 0;
  if (!coordinate(x) || !coordinate(y) || !size(width) || !size(height)) {
    return undefined;
  }
  return { x, y, width, height };
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

/**
 * How much of the window's title bar must be on a screen for it to count as
 * there: enough to see and drag it back.
 */
const titleBar = { height: 32, visibleWidth: 100, visibleHeight: 16 };

/**
 * Where the window opens, given what was kept (`saved`, if anything), every
 * screen's work area (the screen less the taskbar) and the primary screen's.
 *
 * A window whose title bar is still on a screen goes back where it was. One
 * that would open off every screen, as when the screen it was on has been
 * unplugged, opens centred on the primary screen instead, shrunk to fit it if
 * need be, still maximised or full screen if it was. With nothing kept it
 * opens at its own size, or maximised on a screen with no room for the
 * smallest window and its frame, such as a 1366 x 768 laptop's.
 */
export function placeWindow(
  saved: WindowState | undefined,
  workAreas: readonly Rectangle[],
  primary: Rectangle,
): Placement {
  if (saved === undefined) {
    return {
      bounds: undefined,
      maximized: !hasRoomForWindow(primary),
      fullScreen: false,
    };
  }
  const { bounds, maximized, fullScreen } = saved;
  return {
    bounds: workAreas.some((area) => showsTitleBar(bounds, area))
      ? bounds
      : centredIn(primary, bounds),
    maximized,
    fullScreen,
  };
}

function hasRoomForWindow(area: Rectangle): boolean {
  return (
    area.width >= minimumWindowSize.width + frameAllowance.width &&
    area.height >= minimumWindowSize.height + frameAllowance.height
  );
}

function showsTitleBar(window: Rectangle, area: Rectangle): boolean {
  const across =
    Math.min(window.x + window.width, area.x + area.width) -
    Math.max(window.x, area.x);
  const down =
    Math.min(window.y + titleBar.height, area.y + area.height) -
    Math.max(window.y, area.y);
  return across >= titleBar.visibleWidth && down >= titleBar.visibleHeight;
}

function centredIn(area: Rectangle, window: Rectangle): Rectangle {
  const width = Math.min(window.width, area.width);
  const height = Math.min(window.height, area.height);
  return {
    x: area.x + Math.floor((area.width - width) / 2),
    y: area.y + Math.floor((area.height - height) / 2),
    width,
    height,
  };
}
