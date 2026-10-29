/**
 * How long, in the real time the game loop counts, a Work panel row whose
 * work is done stays before it goes. At the fastest game speed a Work
 * Order can come and go in a couple of real seconds, so its row holds
 * still through it rather than jumping up and down.
 */
export const HOLD_MS = 5000;

/** How much taller a line has to be, in pixels, to count as growing. */
const TOLERANCE_PX = 0.5;

/**
 * The height to keep a line at, from the one it is held at and the height
 * it takes on the page now, or none while it isn't shown: as tall as it has
 * been while shown, so that it never shrinks and grows back, however slowly
 * its text changes. One no longer shown is forgotten, and starts again from
 * what it needs when it is shown again, such as when its section is folded
 * and opened.
 */
export function nextHeldHeight(
  heldPx: number | undefined,
  shownPx: number | undefined,
): number | undefined {
  if (shownPx === undefined) return undefined;
  return heldPx === undefined || shownPx > heldPx + TOLERANCE_PX
    ? shownPx
    : heldPx;
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
   * Measures every held line under the root, once a frame after the panels
   * have updated, and keeps any that has grown at its new height. They are
   * measured at the heights they are kept at, which needs no extra layout.
   */
  refresh(): void;
  /**
   * Lets every line go back to the height it needs, for a Campaign loaded
   * in place of the last, or a window of another size.
   */
  startAfresh(): void;
}

/**
 * Keeps the panel lines marked by {@link holdHeight} at the tallest they
 * have been while shown, so that a line whose text or rows change length
 * as the game runs, quickly or slowly, never moves the lines below it up
 * and down: they may move down once, as it grows, but never back. What it
 * holds is kept by element, so a line taken off the page is forgotten with
 * it.
 */
export function createHolds(root: HeldRoot): Holds {
  let holds = new WeakMap<HTMLElement, number>();
  let elements: HTMLElement[] = [];
  return {
    refresh() {
      elements = [...root.querySelectorAll<HTMLElement>("[data-hold]")];
      const shown = elements.map((element) =>
        element.getClientRects().length === 0
          ? undefined
          : element.getBoundingClientRect().height,
      );
      elements.forEach((element, index) => {
        const held = holds.get(element);
        const next = nextHeldHeight(held, shown[index]);
        if (next === held) return;
        if (next === undefined) {
          holds.delete(element);
          element.style.minHeight = "";
        } else {
          holds.set(element, next);
          element.style.minHeight = `${next}px`;
        }
      });
    },
    startAfresh() {
      holds = new WeakMap();
      for (const element of elements) element.style.minHeight = "";
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
