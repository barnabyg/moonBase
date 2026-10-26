import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import { scenario, toGameMinutes } from "./scenario";

const { lunation } = catalogue;
const firstNightStarts = toGameMinutes({
  earthDays: lunation.initialDaylightRemainingEarthDays,
});
const daylightLasts = toGameMinutes({ earthDays: lunation.daylightEarthDays });
const nightLasts = toGameMinutes({ earthDays: lunation.nightEarthDays });

describe("Daylight and Night", () => {
  it("uses the spec's schedule: 20 Earth Days of Daylight, 9.5 of Night, and 8 of Daylight left at the start", () => {
    expect(lunation).toEqual({
      daylightEarthDays: 20,
      nightEarthDays: 9.5,
      initialDaylightRemainingEarthDays: 8,
    });
  });

  it("starts a new Campaign in Daylight with 8 Earth Days left before Night", () => {
    expect(scenario().state.lunation).toEqual({
      part: "daylight",
      minutesRemaining: firstNightStarts,
    });
  });

  it("counts down the time left in Daylight as the clock runs", () => {
    const { lunation: now } = scenario().advance({
      earthDays: 3,
      hours: 4,
    }).state;

    expect(now).toEqual({
      part: "daylight",
      minutesRemaining:
        firstNightStarts - toGameMinutes({ earthDays: 3, hours: 4 }),
    });
  });

  it("starts the first Night on the minute the starting Daylight runs out", () => {
    const game = scenario().advance({ minutes: firstNightStarts - 1 });
    expect(game.state.lunation).toEqual({
      part: "daylight",
      minutesRemaining: 1,
    });

    expect(game.advance({ minutes: 1 }).state.lunation).toEqual({
      part: "night",
      minutesRemaining: nightLasts,
    });
  });

  it("lasts 9.5 Earth Days of Night, then 20 of Daylight, then Night again", () => {
    const game = scenario().advance({ minutes: firstNightStarts });

    game.advance({ minutes: nightLasts - 1 });
    expect(game.state.lunation.part).toBe("night");
    game.advance({ minutes: 1 });
    expect(game.state.lunation).toEqual({
      part: "daylight",
      minutesRemaining: daylightLasts,
    });

    game.advance({ minutes: daylightLasts - 1 });
    expect(game.state.lunation.part).toBe("daylight");
    game.advance({ minutes: 1 });
    expect(game.state.lunation.part).toBe("night");
  });
});

describe("skip to next event", () => {
  it("advances a new Campaign to exactly the start of the first Night", () => {
    const { campaign } = scenario();

    const events = campaign.advanceToNextEvent();

    expect(events).toEqual([
      { kind: "night-started", atMinute: firstNightStarts },
    ]);
    expect(campaign.snapshot().clock.elapsedMinutes).toBe(firstNightStarts);
    expect(campaign.snapshot().lunation.part).toBe("night");
  });

  it("goes on to the next change each time, rather than staying on the current one", () => {
    const { campaign } = scenario();

    // Skipping past anything else, such as a Solar Particle Event.
    const nextChange = () => {
      for (;;) {
        const events = campaign.advanceToNextEvent();
        if (
          events.some(
            (event) =>
              event.kind === "night-started" ||
              event.kind === "daylight-started",
          )
        ) {
          return events;
        }
      }
    };
    const changes = [1, 2, 3].map(() => nextChange());

    expect(changes).toEqual([
      [{ kind: "night-started", atMinute: firstNightStarts }],
      [{ kind: "daylight-started", atMinute: firstNightStarts + nightLasts }],
      [
        {
          kind: "night-started",
          atMinute: firstNightStarts + nightLasts + daylightLasts,
        },
      ],
    ]);
  });

  it("stops at the next change from part-way through Night", () => {
    const { campaign } = scenario().advance({
      minutes: firstNightStarts + 100,
    });

    campaign.advanceToNextEvent();

    expect(campaign.snapshot().clock.elapsedMinutes).toBe(
      firstNightStarts + nightLasts,
    );
    expect(campaign.snapshot().lunation).toEqual({
      part: "daylight",
      minutesRemaining: daylightLasts,
    });
  });
});
