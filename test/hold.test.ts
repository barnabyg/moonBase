import { describe, expect, it } from "vitest";
import { nextHeldHeight, type HeldHeight } from "../src/ui/hold";

/** Holds a line through a run of frames, each needing a height, a 60th of a second apart unless given. */
function runFrames(
  heights: readonly number[],
  frameMs = 1000 / 60,
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

  it("counts a frame seconds late as a quarter of a second, as the game clock does, so that it holds through as much game time", () => {
    expect(runFrames([40, ...frames(19, 20)], 3000)?.heldPx).toBe(40);
    expect(runFrames([40, ...frames(20, 20)], 3000)?.heldPx).toBe(20);
  });
});
