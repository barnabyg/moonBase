/**
 * How long, in the real time the game loop counts, a panel line that has
 * got shorter keeps the height it last needed, and a row whose work is
 * done stays before it goes. At the fastest game speed a Plant's batch
 * takes half a real second and a Work Order can come and go in a couple,
 * so a line holds still through them rather than jumping up and down.
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
 * the height it needs now and the real time the frame counted: as tall as
 * it needs at once, and shorter only once it has needed less for
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
  const shorterForMs = held.shorterForMs + frameMs;
  return shorterForMs >= HOLD_MS
    ? { heldPx: neededPx, shorterForMs: 0 }
    : { heldPx: held.heldPx, shorterForMs };
}

/** Marks a panel line, or a whole panel, to be held in place by {@link createHolds}. */
export function holdHeight(element: HTMLElement): void {
  element.dataset["hold"] = "";
}

/** What {@link createHolds} needs of the page: the elements under it. */
export interface HeldRoot {
  querySelectorAll<E extends Element = Element>(
    selectors: string,
  ): NodeListOf<E>;
}

export interface Holds {
  /**
   * Measures the height every held line under the root needs and sets the
   * height it is kept at, once a frame after the panels have updated, with
   * the real time the frame counted. They are all measured together, so
   * that the page is laid out only once for them.
   */
  refresh(frameMs: number): void;
  /** Forgets every height held, for a Campaign loaded in place of the last. */
  startAfresh(): void;
}

/**
 * Keeps the panel lines marked by {@link holdHeight} from getting shorter
 * the moment what they show does, so that a line whose text or rows come
 * and go quickly at high game speed doesn't move everything below it up
 * and down. A line still grows at once to show everything. What it holds
 * is kept by element, so a line taken off the page is forgotten with it.
 */
export function createHolds(root: HeldRoot): Holds {
  let holds = new WeakMap<HTMLElement, HeldHeight>();
  return {
    refresh(frameMs) {
      const elements = [...root.querySelectorAll<HTMLElement>("[data-hold]")];
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
    },
    startAfresh() {
      holds = new WeakMap();
    },
  };
}

export interface Lingering<K> {
  /** Starts a row's stay, once its work is done; one already staying stays on. */
  finish(key: K): void;
  /** Ends a row's stay, as its work is under way again. */
  revive(key: K): void;
  /** Whether a row is staying after its work was done. */
  has(key: K): boolean;
  /**
   * Counts the real time a frame counted, and returns the rows whose stay
   * is over, which are forgotten.
   */
  tick(frameMs: number): K[];
  /** Forgets every row, for a Campaign loaded in place of the last. */
  startAfresh(): void;
}

/**
 * Times the rows that stay in place for {@link HOLD_MS} once their work is
 * done, so that the rows below don't jump as work comes and goes, before
 * they go.
 */
export function createLingering<K>(): Lingering<K> {
  const stays = new Map<K, number>();
  return {
    finish(key) {
      if (!stays.has(key)) stays.set(key, 0);
    },
    revive(key) {
      stays.delete(key);
    },
    has(key) {
      return stays.has(key);
    },
    tick(frameMs) {
      const over: K[] = [];
      for (const [key, ms] of stays) {
        const stayed = ms + frameMs;
        if (stayed >= HOLD_MS) {
          stays.delete(key);
          over.push(key);
        } else {
          stays.set(key, stayed);
        }
      }
      return over;
    },
    startAfresh() {
      stays.clear();
    },
  };
}
