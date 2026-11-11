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

/**
 * Marks a panel line, or a whole panel, to be held in place by
 * {@link createHolds}, for what it shows: given something else to show,
 * such as a pop-up switched to another Structure, it lets go and is held
 * afresh.
 */
export function holdHeight(element: HTMLElement, showing = ""): void {
  element.dataset["hold"] = showing;
}

/** What {@link createHolds} needs of the page: the elements under it. */
export interface HeldRoot {
  querySelectorAll<E extends Element = Element>(
    selectors: string,
  ): NodeListOf<E>;
}

/** A held line's height as laid out, in pixels, or undefined while it isn't shown. */
export interface HeldSize {
  readonly line: HTMLElement;
  readonly heightPx: number | undefined;
}

/** Watches lines, to report each one's height whenever it changes. */
export interface SizeWatch {
  /** Starts watching a line; its height is reported once it is laid out and shown. */
  observe(line: HTMLElement): void;
  unobserve(line: HTMLElement): void;
}

/** Makes a {@link SizeWatch} that reports to the function given. */
export type WatchSizes = (
  report: (sizes: readonly HeldSize[]) => void,
) => SizeWatch;

/**
 * Watches lines with a ResizeObserver, which reports their heights after
 * the browser has laid the page out for the frame, and before it paints, so
 * that a line held taller is drawn so in the same frame. Measuring them in
 * the frame instead forced Chromium to lay the page out again each time,
 * which took 9 ms a frame on a large base (docs/rendering-performance.md).
 * A line not shown has no box, and is reported as no height.
 */
export const watchSizes: WatchSizes = (report) => {
  const observer = new ResizeObserver((entries) => {
    report(
      entries.map((entry) => {
        const box = entry.borderBoxSize[0];
        const shown =
          box !== undefined && (box.blockSize > 0 || box.inlineSize > 0);
        return {
          line: entry.target as HTMLElement,
          heightPx: shown ? box.blockSize : undefined,
        };
      }),
    );
  });
  return {
    observe(line) {
      observer.observe(line, { box: "border-box" });
    },
    unobserve(line) {
      observer.unobserve(line);
    },
  };
};

export interface Holds {
  /**
   * Finds the held lines under the root, once a frame after the panels
   * have updated: it starts watching those new on the page, stops watching
   * those gone from it, and lets go of those given something else to show.
   * It measures nothing itself; their heights come as the page is laid out.
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
 * and down: they may move down once, as it grows, but never back. A held
 * line can't get shorter, so its height only changes, and is only reported,
 * when it grows or is hidden or shown. What it holds is kept by element,
 * so a line taken off the page is forgotten with it.
 */
export function createHolds(
  root: HeldRoot,
  watch: WatchSizes = watchSizes,
): Holds {
  /** The height each line is held at. */
  let holds = new WeakMap<HTMLElement, number>();
  /** What each watched line was showing when it was first watched. */
  const watched = new Map<HTMLElement, string>();

  function hold(line: HTMLElement, heightPx: number | undefined): void {
    // One given something else to show since is let go and measured afresh.
    if (watched.get(line) !== line.dataset["hold"]) return;
    const held = holds.get(line);
    const next = nextHeldHeight(held, heightPx);
    if (next === held) return;
    if (next === undefined) {
      holds.delete(line);
      line.style.minHeight = "";
    } else {
      holds.set(line, next);
      line.style.minHeight = `${next}px`;
    }
  }

  const sizes = watch((reported) => {
    for (const { line, heightPx } of reported) hold(line, heightPx);
  });

  /** Lets a line go, and watches it afresh, to be held at what it needs. */
  function letGo(line: HTMLElement): void {
    holds.delete(line);
    line.style.minHeight = "";
    sizes.unobserve(line);
    watched.set(line, line.dataset["hold"] ?? "");
    sizes.observe(line);
  }

  return {
    refresh() {
      const lines = new Set(root.querySelectorAll<HTMLElement>("[data-hold]"));
      for (const line of watched.keys()) {
        if (!lines.has(line)) {
          sizes.unobserve(line);
          watched.delete(line);
        }
      }
      for (const line of lines) {
        if (watched.get(line) !== line.dataset["hold"]) letGo(line);
      }
    },
    startAfresh() {
      holds = new WeakMap();
      for (const line of watched.keys()) letGo(line);
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
