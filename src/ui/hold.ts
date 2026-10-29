import { MAX_FRAME_MS } from "../game/loop";

/**
 * How long a panel line that has got shorter keeps the height it last
 * needed, and a row whose work is done stays before it goes, in real time.
 * At the fastest game speed a Plant's batch takes half a real second and a
 * Work Order can come and go in a couple, so a line holds still through
 * them rather than jumping up and down. A frame counts for no more real
 * time than the game loop lets it account for, so a page starved of
 * frames, which runs the game no faster, holds for as much game time as it
 * would at a full frame rate.
 */
export const HOLD_MS = 5000;

/** How much a line has to shrink by, in pixels, to count as shorter. */
const TOLERANCE_PX = 0.5;

export interface HeldHeight {
  /** The height kept, in pixels. */
  readonly heldPx: number;
  /** For how long the line has needed less than it is held at. */
  readonly shorterForMs: number;
}

/**
 * The height to keep a line at, once a frame, from the one it was held at,
 * the height it needs now and the real time since the last frame: as tall
 * as it needs at once, and shorter only once it has needed less for
 * {@link HOLD_MS}.
 */
export function nextHeldHeight(
  held: HeldHeight | undefined,
  neededPx: number,
  frameMs: number,
): HeldHeight {
  if (held === undefined || neededPx >= held.heldPx - TOLERANCE_PX) {
    return { heldPx: neededPx, shorterForMs: 0 };
  }
  const shorterForMs =
    held.shorterForMs + Math.min(Math.max(frameMs, 0), MAX_FRAME_MS);
  return shorterForMs >= HOLD_MS
    ? { heldPx: neededPx, shorterForMs: 0 }
    : { heldPx: held.heldPx, shorterForMs };
}

/** The lines held, and the height each is held at once it is on the page. */
const holds = new Map<HTMLElement, HeldHeight | undefined>();
/** The real time of the last frame, and the time holds have counted since the page opened. */
let lastFrameMs: number | undefined;
let heldMs = 0;

/**
 * Keeps a panel line, or a whole panel, from getting shorter the moment
 * what it shows does, so that a line whose text or rows come and go
 * quickly at high game speed doesn't move everything below it up and down.
 * It still grows at once to show everything. A line not yet on the page is
 * held from when it is added, and one taken off the page is forgotten.
 */
export function holdHeight(element: HTMLElement): void {
  holds.set(element, undefined);
}

/**
 * The time holds have counted so far, for a panel that keeps a row whose
 * work is done for a while: it may go once {@link isHoldOver} says so.
 */
export function holdTime(): number {
  return heldMs;
}

/** Whether a hold that started at a {@link holdTime} has lasted {@link HOLD_MS}. */
export function isHoldOver(startedMs: number): boolean {
  return heldMs - startedMs >= HOLD_MS;
}

/**
 * Counts the frame's real time towards every hold and sets the height each
 * held line is kept at, once a frame after the panels have updated. The
 * lines are all measured together, so that the page is laid out only once
 * for them.
 */
export function refreshHolds(nowMs: number): void {
  const frameMs = lastFrameMs === undefined ? 0 : nowMs - lastFrameMs;
  lastFrameMs = nowMs;
  heldMs += Math.min(Math.max(frameMs, 0), MAX_FRAME_MS);

  const elements = [...holds].flatMap(([element, held]) => {
    if (element.isConnected) return [element];
    // One not yet on the page waits for it; one taken off is forgotten.
    if (held !== undefined) holds.delete(element);
    return [];
  });
  for (const element of elements) element.style.minHeight = "";
  const needed = elements.map(
    (element) => element.getBoundingClientRect().height,
  );
  elements.forEach((element, index) => {
    const neededPx = needed[index] ?? 0;
    const held = nextHeldHeight(holds.get(element), neededPx, frameMs);
    holds.set(element, held);
    if (held.heldPx > neededPx + TOLERANCE_PX) {
      element.style.minHeight = `${held.heldPx}px`;
    }
  });
}
