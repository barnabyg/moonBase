import { describe, expect, it } from "vitest";
import { createGameLoop } from "../src/game/loop";
import { scenario } from "./scenario";

function runFrames(
  loop: ReturnType<typeof createGameLoop>,
  frames: number,
  frameMs: number,
) {
  for (let frame = 0; frame < frames; frame++) loop.update(frameMs);
}

describe("the game loop", () => {
  it.each([
    ["1x", 6],
    ["5x", 30],
    ["20x", 120],
  ])(
    "runs at %s as %i game-minutes per real second",
    (speedId, gameMinutes) => {
      const { campaign } = scenario();
      const loop = createGameLoop(campaign);
      loop.setSpeed(speedId);

      runFrames(loop, 100, 10);

      expect(campaign.snapshot().clock.elapsedMinutes).toBe(gameMinutes);
    },
  );

  it("starts at 1x", () => {
    const { campaign } = scenario();
    const loop = createGameLoop(campaign);

    expect(loop.speed.id).toBe("1x");
  });

  it("stops the game clock while paused", () => {
    const { campaign } = scenario();
    const loop = createGameLoop(campaign);
    loop.setSpeed("paused");

    runFrames(loop, 300, 10);

    expect(campaign.snapshot().clock.elapsedMinutes).toBe(0);
  });

  it("carries part-minutes over between frames, so slow frame rates keep time", () => {
    const { campaign } = scenario();
    const loop = createGameLoop(campaign);

    // 1x is one game-minute every 1000/6 ms, so no single 50 ms frame completes one.
    runFrames(loop, 40, 50);

    expect(campaign.snapshot().clock.elapsedMinutes).toBe(12);
  });

  it("does not leap ahead after a long gap between frames, such as a hidden tab", () => {
    const { campaign } = scenario();
    const loop = createGameLoop(campaign);
    loop.setSpeed("20x");

    loop.update(60_000);

    expect(campaign.snapshot().clock.elapsedMinutes).toBeLessThan(120);
  });

  it("refuses a speed that is not in the catalogue", () => {
    const loop = createGameLoop(scenario().campaign);

    expect(() => {
      loop.setSpeed("1000x");
    }).toThrow(RangeError);
    expect(loop.speed.id).toBe("1x");
  });
});
