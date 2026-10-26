import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import type { GameEvent, GroundPosition } from "../src/simulation";
import { scenario, type Scenario } from "./scenario";

// The Habitat needs no power and its oxygen and water last, so that the
// Mission Director can live in it until their Radiation Dose reaches the
// limit, and no Solar Particle Event changes how fast it rises.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { safeHabitat } = await import("./safe-habitat");
  return {
    ...actual,
    catalogue: safeHabitat(actual.catalogue, [
      "power",
      "life-support",
      "solar-particle-events",
    ]),
  };
});

const habitatSite: GroundPosition = { x: 25, y: -20 };
const { doseRateMillisievertsPerEarthDay, doseLimitMillisieverts } =
  catalogue.radiation;

/** A Mission Director who has just moved into a newly commissioned Habitat. */
function movedIn(): Scenario {
  const game = scenario().plan("habitat", habitatSite);
  const habitatId = game.state.constructions[0]?.id ?? "";
  while (game.state.constructions.length > 0) game.advance({ minutes: 1 });
  const result = game.campaign.moveMissionDirectorIn(habitatId);
  if (!result.ok) throw new Error(`Moving in was refused: ${result.message}`);
  return game;
}

/** Game-minutes until the Radiation Dose reaches the limit, as forecast. */
function minutesUntilLimit(game: Scenario): number {
  const minutes = game.campaign.forecasts().radiationDose.minutesUntilLimit;
  if (minutes === undefined) throw new Error("expected a forecast");
  return minutes;
}

describe("the Radiation Dose aboard the Lander", () => {
  it("doesn't rise at all", () => {
    const game = scenario();
    expect(game.state.radiationDoseMillisieverts).toBe(0);

    game.advance({ earthDays: 60 });

    expect(game.state.radiationDoseMillisieverts).toBe(0);
    expect(game.campaign.forecasts().radiationDose).toEqual({
      millisievertsPerEarthDay: 0,
      minutesUntilLimit: undefined,
    });
    expect(game.state.ended).toBeUndefined();
  });
});

describe("the Radiation Dose in an unshielded Habitat", () => {
  it("builds up at the Habitat's dose rate once the Mission Director moves in", () => {
    const game = movedIn();
    expect(game.state.radiationDoseMillisieverts).toBe(0);

    game.advance({ earthDays: 2 });

    expect(game.state.radiationDoseMillisieverts).toBeCloseTo(
      2 * doseRateMillisievertsPerEarthDay.habitat,
      6,
    );
    expect(
      game.campaign.forecasts().radiationDose.millisievertsPerEarthDay,
    ).toBe(doseRateMillisievertsPerEarthDay.habitat);
  });

  it("is forecast to reach the limit after the Earth Days left at that rate", () => {
    const game = movedIn();
    game.advance({ earthDays: 2 });

    const earthDaysLeft =
      (doseLimitMillisieverts - game.state.radiationDoseMillisieverts) /
      doseRateMillisievertsPerEarthDay.habitat;
    expect(minutesUntilLimit(game) / (24 * 60)).toBeCloseTo(earthDaysLeft, 3);
  });
});

describe("reaching the dose limit", () => {
  it("kills the Mission Director exactly when forecast, and ends the Campaign", () => {
    const game = movedIn();
    game.campaign.advance(minutesUntilLimit(game) - 1);
    expect(game.state.ended).toBeUndefined();
    expect(game.state.radiationDoseMillisieverts).toBeLessThan(
      doseLimitMillisieverts,
    );
    const atMinute = game.state.clock.elapsedMinutes + 1;

    const events = game.campaign.advance(1);

    const cause = { kind: "radiation-dose-limit" };
    expect(events.at(-1)).toEqual({
      kind: "mission-director-died",
      atMinute,
      cause,
    });
    expect(game.state.ended).toEqual({ atMinute, cause });
    expect(game.state.radiationDoseMillisieverts).toBeGreaterThanOrEqual(
      doseLimitMillisieverts,
    );
    expect(game.campaign.forecasts().radiationDose).toEqual({
      millisievertsPerEarthDay: 0,
      minutesUntilLimit: undefined,
    });
  });
});

describe("Radiation Dose warnings", () => {
  it("come as the time left falls to each warning level, stopping each skip to the next event, before the Mission Director dies", () => {
    const game = movedIn();
    const skips: { events: readonly GameEvent[]; stoppedAt: number }[] = [];
    while (game.state.ended === undefined && skips.length < 100) {
      const events = game.campaign.advanceToNextEvent();
      skips.push({ events, stoppedAt: game.state.clock.elapsedMinutes });
    }

    const notable = skips
      .flatMap((skip) => skip.events)
      .filter(
        (event) =>
          event.kind !== "night-started" && event.kind !== "daylight-started",
      )
      .map((event) =>
        event.kind === "radiation-dose-warning"
          ? `warning, ${event.minutesUntilLimit / (24 * 60)} Earth Days left`
          : event.kind === "mission-director-died"
            ? `died: ${event.cause.kind}`
            : event.kind,
      );
    expect(notable).toEqual([
      ...catalogue.radiation.warningEarthDaysLeft.map(
        (earthDays) => `warning, ${earthDays} Earth Days left`,
      ),
      "died: radiation-dose-limit",
    ]);
    for (const { events, stoppedAt } of skips) {
      for (const event of events) expect(event.atMinute).toBe(stoppedAt);
    }
  });
});
