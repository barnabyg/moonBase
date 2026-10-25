import { describe, expect, it } from "vitest";
import { scenario } from "./scenario";

describe("the game clock", () => {
  it("starts a new Campaign at the beginning of Earth Day 1", () => {
    const { clock } = scenario().state;

    expect(clock).toEqual({
      elapsedMinutes: 0,
      earthDay: 1,
      hour: 0,
      minute: 0,
    });
  });

  it("counts advanced game-minutes in Earth Days, hours and minutes", () => {
    const { clock } = scenario().advance({
      earthDays: 2,
      hours: 5,
      minutes: 7,
    }).state;

    expect(clock).toEqual({
      elapsedMinutes: 2 * 1440 + 5 * 60 + 7,
      earthDay: 3,
      hour: 5,
      minute: 7,
    });
  });

  it("rolls over to the next Earth Day after 24 hours", () => {
    const campaign = scenario().advance({ hours: 23, minutes: 59 });
    expect(campaign.state.clock.earthDay).toBe(1);

    expect(campaign.advance({ minutes: 1 }).state.clock).toMatchObject({
      earthDay: 2,
      hour: 0,
      minute: 0,
    });
  });

  it("refuses to advance by a negative or fractional number of game-minutes", () => {
    const { campaign } = scenario();

    expect(() => {
      campaign.advance(-1);
    }).toThrow(RangeError);
    expect(() => {
      campaign.advance(1.5);
    }).toThrow(RangeError);
    expect(campaign.snapshot().clock.elapsedMinutes).toBe(0);
  });
});
