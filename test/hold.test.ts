import { describe, expect, it } from "vitest";
import {
  createHolds,
  createLingering,
  nextHeldHeight,
  type HeldHeight,
  type HeldRoot,
} from "../src/ui/hold";

/** A 60th of a second, a frame at a full frame rate. */
const FRAME_MS = 1000 / 60;

/** Holds a line through a run of frames, each needing a height. */
function runFrames(
  heights: readonly number[],
  frameMs = FRAME_MS,
): HeldHeight | undefined {
  let held: HeldHeight | undefined;
  for (const height of heights) held = nextHeldHeight(held, height, frameMs);
  return held;
}

/** A line needing the height for as many frames. */
const frames = (count: number, height: number): number[] =>
  Array<number>(count).fill(height);

describe("a panel line held against flicker", () => {
  it("grows at once to show everything", () => {
    expect(runFrames([20, 52])?.heldPx).toBe(52);
  });

  it("keeps its height while what it shows toggles shorter and back twice a second", () => {
    const toggling = Array.from({ length: 20 }, () => [
      ...frames(15, 40),
      ...frames(15, 20),
    ]).flat();

    expect(runFrames(toggling)?.heldPx).toBe(40);
  });

  it("shrinks once it has needed less for five seconds", () => {
    expect(runFrames([40, ...frames(290, 20)])?.heldPx).toBe(40);
    expect(runFrames([40, ...frames(310, 20)])?.heldPx).toBe(20);
  });

  it("starts the wait again each time it needs its full height", () => {
    expect(
      runFrames([40, ...frames(250, 20), 40, ...frames(250, 20)])?.heldPx,
    ).toBe(40);
  });
});

/** A stand-in for a held line on the page, needing a height. */
class FakeLine {
  needed = 0;
  readonly dataset: Record<string, string> = { hold: "" };
  readonly style = { minHeight: "" };
  getBoundingClientRect(): { height: number } {
    const held = Number.parseFloat(this.style.minHeight);
    return {
      height: Number.isNaN(held) ? this.needed : Math.max(held, this.needed),
    };
  }
}

/** A stand-in for the page, with the held lines under it. */
function fakeRoot(lines: FakeLine[]): HeldRoot {
  return {
    querySelectorAll: () => lines as unknown as NodeListOf<never>,
  };
}

describe("the holds on the page", () => {
  it("keeps a line that got shorter at the height it needed, and lets it go once the hold is over", () => {
    const line = new FakeLine();
    const holds = createHolds(fakeRoot([line]));
    line.needed = 40;
    holds.refresh(FRAME_MS);
    line.needed = 20;

    holds.refresh(FRAME_MS);
    expect(line.style.minHeight).toBe("40px");
    holds.refresh(4000);
    expect(line.style.minHeight).toBe("40px");
    holds.refresh(1000);
    expect(line.style.minHeight).toBe("");
    expect(line.getBoundingClientRect().height).toBe(20);
  });

  it("sets no height on a line that needs as much as it has", () => {
    const line = new FakeLine();
    const holds = createHolds(fakeRoot([line]));
    line.needed = 40;

    holds.refresh(FRAME_MS);
    holds.refresh(FRAME_MS);

    expect(line.style.minHeight).toBe("");
  });

  it("forgets every height held when it starts afresh, for a Campaign loaded in place of the last", () => {
    const line = new FakeLine();
    const holds = createHolds(fakeRoot([line]));
    line.needed = 40;
    holds.refresh(FRAME_MS);
    line.needed = 20;

    holds.startAfresh();
    holds.refresh(FRAME_MS);

    expect(line.style.minHeight).toBe("");
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
