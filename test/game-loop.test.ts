import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import { createGameLoop } from "../src/game/loop";
import type { GameEvent } from "../src/simulation";
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
      const game = scenario();
      const loop = createGameLoop(game.campaign);
      loop.setSpeed(speedId);

      runFrames(loop, 100, 10);

      expect(game.state.clock.elapsedMinutes).toBe(gameMinutes);
    },
  );

  it("starts at 1x", () => {
    const game = scenario();
    const loop = createGameLoop(game.campaign);

    expect(loop.speed.id).toBe("1x");
  });

  it("stops the game clock while paused", () => {
    const game = scenario();
    const loop = createGameLoop(game.campaign);
    loop.setSpeed("paused");

    runFrames(loop, 300, 10);

    expect(game.state.clock.elapsedMinutes).toBe(0);
  });

  it("carries part-minutes over between frames, so slow frame rates keep time", () => {
    const game = scenario();
    const loop = createGameLoop(game.campaign);

    // 1x is one game-minute every 1000/6 ms, so no single 50 ms frame completes one.
    runFrames(loop, 40, 50);

    expect(game.state.clock.elapsedMinutes).toBe(12);
  });

  it("does not leap ahead after a long gap between frames, such as a hidden tab", () => {
    const game = scenario();
    const loop = createGameLoop(game.campaign);
    loop.setSpeed("20x");

    loop.update(60_000);

    expect(game.state.clock.elapsedMinutes).toBeLessThan(120);
  });

  it("refuses a speed that is not in the catalogue", () => {
    const loop = createGameLoop(scenario().campaign);

    expect(() => {
      loop.setSpeed("1000x");
    }).toThrow(RangeError);
    expect(loop.speed.id).toBe("1x");
  });

  it("skips to the next change between Daylight and Night, keeping the chosen speed", () => {
    const game = scenario();
    const loop = createGameLoop(game.campaign);
    loop.setSpeed("paused");

    loop.skipToNextEvent();

    expect(game.state.clock.elapsedMinutes).toBe(
      catalogue.lunation.initialDaylightRemainingEarthDays * 24 * 60,
    );
    expect(game.state.lunation.part).toBe("night");
    expect(loop.speed.id).toBe("paused");
  });

  it("keeps the state from one game-minute before the latest, so the renderer can draw between ticks", () => {
    const game = scenario();
    const loop = createGameLoop(game.campaign);
    expect(loop.previous).toBeUndefined();
    loop.setSpeed("20x");

    // 20x is 120 game-minutes a second, so 25 ms is 3 game-minutes.
    loop.update(25);

    expect(game.state.clock.elapsedMinutes).toBe(3);
    expect(loop.previous?.clock.elapsedMinutes).toBe(2);
  });

  it("reports how far real time has run towards the next game-minute", () => {
    const loop = createGameLoop(scenario().campaign);

    // At 1x a game-minute takes 1000/6 ms, so 250 ms is one and a half.
    loop.update(250);

    expect(loop.tickProgress).toBeCloseTo(0.5);
  });

  it("forgets the earlier state after a skip, so nothing is drawn sliding across the jump", () => {
    const loop = createGameLoop(scenario().campaign);
    loop.update(250);

    loop.skipToNextEvent();

    expect(loop.previous).toBeUndefined();
    expect(loop.tickProgress).toBe(0);
  });

  it("passes on every event as it happens, whether time runs or the player skips, without pausing", () => {
    const game = scenario();
    const heard: GameEvent[] = [];
    const loop = createGameLoop(game.campaign, {
      onEvents: (events) => heard.push(...events),
    });
    loop.setSpeed("20x");
    const nightFalls =
      catalogue.lunation.initialDaylightRemainingEarthDays * 24 * 60;

    // 20x is 120 game-minutes a second, so a 250 ms frame is 30 game-minutes.
    runFrames(loop, nightFalls / 30 + 1, 250);

    expect(heard).toEqual([{ kind: "night-started", atMinute: nightFalls }]);
    expect(loop.speed.id).toBe("20x");

    loop.skipToNextEvent();

    expect(heard.map((event) => event.kind)).toEqual([
      "night-started",
      "daylight-started",
    ]);
  });
});
