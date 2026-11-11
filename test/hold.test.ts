import { describe, expect, it } from "vitest";
import {
  createHolds,
  createLingering,
  nextHeldHeight,
  type HeldRoot,
  type HeldSize,
  type Holds,
  type WatchSizes,
} from "../src/ui/hold";

/** Holds a line through a run of frames, each showing it at a height, or not at all. */
function runFrames(
  heights: readonly (number | undefined)[],
): number | undefined {
  let held: number | undefined;
  for (const height of heights) held = nextHeldHeight(held, height);
  return held;
}

/** A line needing the height for as many frames. */
const frames = (count: number, height: number | undefined) =>
  Array<number | undefined>(count).fill(height);

describe("a panel line held against flicker", () => {
  it("grows at once to show everything", () => {
    expect(runFrames([20, 52])).toBe(52);
  });

  it("keeps its height while what it shows toggles shorter and back twice a second", () => {
    const toggling = Array.from({ length: 20 }, () => [
      ...frames(15, 40),
      ...frames(15, 20),
    ]).flat();

    expect(runFrames(toggling)).toBe(40);
  });

  it("never shrinks back while shown, so that a cycle slower than any hold doesn't move the lines below either", () => {
    // Tall for a second, then short for 20 seconds at 60 frames a second,
    // over and over: a Plant waiting long for its input between Batches.
    const heights: (number | undefined)[] = [];
    for (let cycle = 0; cycle < 5; cycle++) {
      heights.push(...frames(60, 40), ...frames(1200, 20));
    }
    let held: number | undefined;
    const kept = new Set<number | undefined>();
    for (const height of heights) {
      held = nextHeldHeight(held, height);
      kept.add(held);
    }

    expect([...kept]).toEqual([40]);
  });

  it("starts again from what it needs once it has not been shown, such as when its section is folded and opened", () => {
    expect(runFrames([40, undefined, 20])).toBe(20);
  });
});

/** A stand-in for a held line on the page, needing a height, or hidden. */
class FakeLine {
  needed: number | undefined = 0;
  readonly dataset: Record<string, string> = { hold: "" };
  readonly style = { minHeight: "" };
  /** Its height as laid out: what it needs, or what it is held at if more. */
  height(): number | undefined {
    if (this.needed === undefined) return undefined;
    const held = Number.parseFloat(this.style.minHeight);
    return Number.isNaN(held) ? this.needed : Math.max(held, this.needed);
  }
}

/**
 * A stand-in for the page, with the held lines under it, that lays them out
 * as a browser does and tells the holds of each watched line whose height
 * changed, as a ResizeObserver does: a line only just watched counts as
 * having no height, so it is reported once it is shown.
 */
class FakePage implements HeldRoot {
  readonly lines: FakeLine[];
  readonly watched = new Map<FakeLine, number | undefined>();
  private report: (sizes: readonly HeldSize[]) => void = () => undefined;

  constructor(lines: FakeLine[]) {
    this.lines = lines;
  }

  querySelectorAll<E extends Element = Element>(): NodeListOf<E> {
    return this.lines as unknown as NodeListOf<E>;
  }

  readonly watch: WatchSizes = (report) => {
    this.report = report;
    return {
      observe: (line) => {
        this.watched.set(line as unknown as FakeLine, undefined);
      },
      unobserve: (line) => {
        this.watched.delete(line as unknown as FakeLine);
      },
    };
  };

  /** Lays the page out, until no watched line changes height. */
  layOut(): void {
    for (let round = 0; round < 10; round++) {
      const changed: HeldSize[] = [];
      for (const [line, last] of this.watched) {
        const height = line.height();
        if (height !== last) {
          this.watched.set(line, height);
          changed.push({
            line: line as unknown as HTMLElement,
            heightPx: height,
          });
        }
      }
      if (changed.length === 0) return;
      this.report(changed);
    }
    throw new Error("The held lines never settled.");
  }
}

/** A frame: the panels have updated, then the page is laid out. */
function frame(holds: Holds, page: FakePage): void {
  holds.refresh();
  page.layOut();
}

function holdsOn(...lines: FakeLine[]): { holds: Holds; page: FakePage } {
  const page = new FakePage(lines);
  return { holds: createHolds(page, page.watch), page };
}

describe("the holds on the page", () => {
  it("keeps a line that got shorter at the tallest it has been, frame after frame", () => {
    const line = new FakeLine();
    const { holds, page } = holdsOn(line);
    line.needed = 40;
    frame(holds, page);
    line.needed = 20;

    for (let frames = 0; frames < 1000; frames++) frame(holds, page);

    expect(line.height()).toBe(40);
  });

  it("grows a held line at once when it needs more", () => {
    const line = new FakeLine();
    const { holds, page } = holdsOn(line);
    line.needed = 40;
    frame(holds, page);
    line.needed = 60;

    frame(holds, page);

    expect(line.style.minHeight).toBe("60px");
  });

  it("lets a line go once it is hidden, so that it is shown again at the height it needs", () => {
    const line = new FakeLine();
    const { holds, page } = holdsOn(line);
    line.needed = 40;
    frame(holds, page);

    line.needed = undefined;
    frame(holds, page);
    line.needed = 20;
    frame(holds, page);

    expect(line.height()).toBe(20);
  });

  it("lets a line go once it is given something else to show, such as a pop-up switched to another Structure", () => {
    const line = new FakeLine();
    line.dataset["hold"] = "structure-1";
    const { holds, page } = holdsOn(line);
    line.needed = 40;
    frame(holds, page);
    line.needed = 20;
    frame(holds, page);
    expect(line.height()).toBe(40);

    line.dataset["hold"] = "structure-2";
    frame(holds, page);
    line.needed = 10;
    frame(holds, page);

    expect(line.height()).toBe(20);
  });

  it("lets every line go when it starts afresh, for a Campaign loaded in place of the last", () => {
    const line = new FakeLine();
    const { holds, page } = holdsOn(line);
    line.needed = 40;
    frame(holds, page);
    line.needed = 20;

    holds.startAfresh();
    frame(holds, page);
    line.needed = 10;
    frame(holds, page);

    expect(line.height()).toBe(20);
  });

  it("holds a line put on the page after the first frame, and stops watching one taken off it", () => {
    const first = new FakeLine();
    const { holds, page } = holdsOn(first);
    first.needed = 30;
    frame(holds, page);

    const added = new FakeLine();
    added.needed = 40;
    page.lines.splice(0, 1, added);
    frame(holds, page);
    added.needed = 20;
    frame(holds, page);

    expect(added.height()).toBe(40);
    expect([...page.watched.keys()]).toEqual([added]);
  });

  it("measures nothing in a frame where no line changed, as measuring forces the page to be laid out", () => {
    const line = new FakeLine();
    const { holds, page } = holdsOn(line);
    line.needed = 40;
    frame(holds, page);

    // The FakeLine has no getClientRects or getBoundingClientRect: the holds
    // learn its height only from what the page reports once laid out.
    expect(() => {
      holds.refresh();
    }).not.toThrow();
    expect(line.style.minHeight).toBe("40px");
  });
});

describe("a Work panel row staying once its work is done", () => {
  it("stays for five seconds of the time the frames count, then goes", () => {
    const done = createLingering<string>();
    done.finish("maintaining excavator-1");

    expect(done.tick(4990)).toEqual([]);
    expect(done.has("maintaining excavator-1")).toBe(true);
    expect(done.tick(10)).toEqual(["maintaining excavator-1"]);
    expect(done.has("maintaining excavator-1")).toBe(false);
  });

  it("stays on, and doesn't start again, if it is finished again while staying", () => {
    const done = createLingering<string>();
    done.finish("row");
    done.tick(3000);

    done.finish("row");

    expect(done.tick(2000)).toEqual(["row"]);
  });

  it("stays no longer once its work is under way again", () => {
    const done = createLingering<string>();
    done.finish("row");

    done.revive("row");

    expect(done.has("row")).toBe(false);
    expect(done.tick(5000)).toEqual([]);
  });
});
