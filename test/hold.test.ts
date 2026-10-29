import { describe, expect, it } from "vitest";
import {
  createHolds,
  createLingering,
  nextHeldHeight,
  type HeldRoot,
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
  getClientRects(): unknown[] {
    return this.needed === undefined ? [] : [{}];
  }
  getBoundingClientRect(): { height: number } {
    const held = Number.parseFloat(this.style.minHeight);
    const needed = this.needed ?? 0;
    return { height: Number.isNaN(held) ? needed : Math.max(held, needed) };
  }
}

/** A stand-in for the page, with the held lines under it. */
function fakeRoot(lines: FakeLine[]): HeldRoot {
  return {
    querySelectorAll: () => lines as unknown as NodeListOf<never>,
  };
}

describe("the holds on the page", () => {
  it("keeps a line that got shorter at the tallest it has been, frame after frame", () => {
    const line = new FakeLine();
    const holds = createHolds(fakeRoot([line]));
    line.needed = 40;
    holds.refresh();
    line.needed = 20;

    for (let frame = 0; frame < 1000; frame++) holds.refresh();

    expect(line.getBoundingClientRect().height).toBe(40);
  });

  it("grows a held line at once when it needs more", () => {
    const line = new FakeLine();
    const holds = createHolds(fakeRoot([line]));
    line.needed = 40;
    holds.refresh();
    line.needed = 60;

    holds.refresh();

    expect(line.style.minHeight).toBe("60px");
  });

  it("lets a line go once it is hidden, so that it is shown again at the height it needs", () => {
    const line = new FakeLine();
    const holds = createHolds(fakeRoot([line]));
    line.needed = 40;
    holds.refresh();

    line.needed = undefined;
    holds.refresh();
    line.needed = 20;
    holds.refresh();

    expect(line.getBoundingClientRect().height).toBe(20);
  });

  it("lets a line go once it is given something else to show, such as a pop-up switched to another Structure", () => {
    const line = new FakeLine();
    line.dataset["hold"] = "structure-1";
    const holds = createHolds(fakeRoot([line]));
    line.needed = 40;
    holds.refresh();
    line.needed = 20;
    holds.refresh();
    expect(line.getBoundingClientRect().height).toBe(40);

    line.dataset["hold"] = "structure-2";
    holds.refresh();

    expect(line.getBoundingClientRect().height).toBe(20);
  });

  it("lets every line go when it starts afresh, for a Campaign loaded in place of the last", () => {
    const line = new FakeLine();
    const holds = createHolds(fakeRoot([line]));
    line.needed = 40;
    holds.refresh();
    line.needed = 20;

    holds.startAfresh();
    holds.refresh();

    expect(line.getBoundingClientRect().height).toBe(20);
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
