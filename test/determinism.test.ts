import { describe, expect, it } from "vitest";
import { createCampaign } from "../src/simulation";
import { scenario, toGameMinutes } from "./scenario";

describe("determinism", () => {
  it("gives identical snapshots for the same seed and the same game-minutes advanced", () => {
    const duration = { earthDays: 3, hours: 7, minutes: 11 };

    const first = scenario(42).advance(duration).state;
    const second = scenario(42).advance(duration).state;

    expect(second).toEqual(first);
  });

  it("gives the same result however the game-minutes are split into advances", () => {
    const total = toGameMinutes({ earthDays: 1, hours: 2 });
    const inOneGo = scenario(7).advance({ minutes: total }).state;

    const inSteps = scenario(7);
    for (let step = 0; step < total / 6; step++)
      inSteps.advance({ minutes: 6 });

    expect(inSteps.state).toEqual(inOneGo);
  });

  it("refuses a seed that is not a whole number from 0 to 2³² − 1", () => {
    for (const seed of [-1, 1.5, 2 ** 32, Number.NaN]) {
      expect(() => createCampaign({ seed })).toThrow(RangeError);
    }
    expect(() => createCampaign({ seed: 0 })).not.toThrow();
    expect(() => createCampaign({ seed: 2 ** 32 - 1 })).not.toThrow();
  });
});
