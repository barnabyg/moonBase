import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import type {
  GameEvent,
  GroundPosition,
  Snapshot,
  StructureSnapshot,
} from "../src/simulation";
import { scenario, scenarioOf, type Scenario } from "./scenario";
import { changed } from "./worn";

// No Machine feels the cold or draws power for a heater at Night, and the
// Robot never has to park one, so that power and time pass as the test
// expects.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withoutCold } = await import("./without-cold");
  return { ...actual, catalogue: withoutCold(actual.catalogue) };
});

const solarSite: GroundPosition = { x: 20, y: 12 };
const batterySite: GroundPosition = { x: 30, y: 25 };
const habitatSite: GroundPosition = { x: 25, y: -20 };
const mastSites: readonly GroundPosition[] = [
  { x: 15, y: -10 },
  { x: -20, y: 20 },
];
const habitatDrawKilowatts =
  catalogue.structureTypes.find((type) => type.id === "habitat")?.power
    .drawKilowatts ?? 0;

/** Runs the game a game-minute at a time until the condition holds. */
function runUntil(game: Scenario, done: (state: Snapshot) => boolean): void {
  for (let minute = 0; minute < 40 * 24 * 60; minute++) {
    if (done(game.state)) return;
    game.advance({ minutes: 1 });
  }
  throw new Error("It never happened.");
}

function structureOf(
  state: Snapshot,
  structureTypeId: string,
): StructureSnapshot {
  const structure = state.structures.find(
    (candidate) => candidate.structureTypeId === structureTypeId,
  );
  if (structure === undefined) throw new Error(`expected a ${structureTypeId}`);
  return structure;
}

/**
 * A solar array, a battery bank, a Habitat and one or more Light Masts, all
 * commissioned and joined by cable, with the Mission Director still aboard
 * the Lander.
 */
function poweredBase(lightMasts = 1): Scenario {
  const game = scenario()
    .plan("solar-array", solarSite)
    .plan("battery-bank", batterySite)
    .plan("habitat", habitatSite);
  for (const site of mastSites.slice(0, lightMasts)) {
    game.plan("light-mast", site);
  }
  runUntil(game, (state) => state.constructions.length === 0);
  expect(game.state.power.networks).toHaveLength(1);
  return game;
}

function moveIn(game: Scenario): string {
  const habitatId = structureOf(game.state, "habitat").id;
  const result = game.campaign.moveMissionDirectorIn(habitatId);
  if (!result.ok) throw new Error(`Moving in was refused: ${result.message}`);
  return habitatId;
}

/** Game-minutes until the Mission Director's Habitat loses power, as forecast. */
function forecastPowerLost(game: Scenario): number {
  const minutes = game.campaign.forecasts().habitatPower?.minutesUntilPowerLost;
  if (minutes === undefined) throw new Error("expected a forecast");
  return minutes;
}

describe("power by priority", () => {
  it("keeps the Habitat powered while a Light Mast on the same network loses power", () => {
    const game = poweredBase();
    runUntil(game, (state) => state.lunation.part === "night");
    expect(game.state.structures.every((structure) => structure.powered)).toBe(
      true,
    );
    // Just enough left for the Habitat's next game-minute, and none for the
    // Structures after it.
    const bankId = structureOf(game.state, "battery-bank").id;
    const campaign = changed(game.campaign, (state) => {
      for (const saved of state.structures) {
        saved.storedKilowattHours =
          saved.id === bankId ? habitatDrawKilowatts / 60 : 0;
      }
    });

    campaign.advance(1);

    const state = campaign.snapshot();
    expect(structureOf(state, "light-mast")).toMatchObject({
      powered: false,
      lit: false,
    });
    expect(structureOf(state, "habitat").powered).toBe(true);
    expect(state.power.networks[0]?.powered).toBe(false);
  });

  it("leaves the Habitat without power when the energy left can't cover all it draws, exactly when forecast", () => {
    // Stored energy for ten hours of the Night, and half a game-minute of
    // the Habitat's draw over, so that the battery's last game-minute of
    // energy falls short of what the Habitat draws in a game-minute.
    const base = poweredBase(0);
    runUntil(base, (state) => state.lunation.part === "night");
    const bankId = structureOf(base.state, "battery-bank").id;
    const drawn = base.state.power.networks[0]?.consumptionKilowatts ?? 0;
    const game = scenarioOf(
      changed(base.campaign, (state) => {
        for (const saved of state.structures) {
          saved.storedKilowattHours =
            saved.id === bankId
              ? (drawn * 600 + habitatDrawKilowatts / 2) / 60
              : 0;
        }
      }),
    );
    moveIn(game);
    const minutes = forecastPowerLost(game);
    game.campaign.advance(minutes - 1);
    const storedBefore = game.state.power.networks[0]?.storedKilowattHours ?? 0;
    expect(structureOf(game.state, "habitat").powered).toBe(true);

    game.campaign.advance(1);

    expect(storedBefore).toBeGreaterThan(0);
    expect(storedBefore).toBeLessThan(habitatDrawKilowatts / 60);
    expect(structureOf(game.state, "habitat").powered).toBe(false);
    expect(game.state.ended?.cause.kind).toBe("habitat-power-failed");
  });

  it("kills nobody when the Habitat loses power with nobody in it", () => {
    const game = poweredBase();

    runUntil(game, (state) => !structureOf(state, "habitat").powered);
    game.advance({ earthDays: 1 });

    expect(game.state.ended).toBeUndefined();
    expect(game.campaign.forecasts().habitatPower).toBeUndefined();
  });
});

describe("moving into a Habitat without power", () => {
  it("is refused, with a reason", () => {
    const game = poweredBase();
    runUntil(game, (state) => !structureOf(state, "habitat").powered);
    const habitatId = structureOf(game.state, "habitat").id;

    const result = game.campaign.moveMissionDirectorIn(habitatId);

    if (result.ok) throw new Error("expected a refusal");
    expect(result.reason).toBe("no-power");
    expect(result.message).toMatch(/power/);
    expect(game.state.missionDirector).toEqual({ residence: "lander" });
  });
});

describe("the Habitat power forecast", () => {
  it.each(["daylight", "night"] as const)(
    "says when the Mission Director's Habitat will lose power, moving in during %s, and they die exactly then",
    (part) => {
      const game = poweredBase();
      if (part === "night") {
        runUntil(game, (state) => state.lunation.part === "night");
      }
      const habitatId = moveIn(game);
      const forecast = game.campaign.forecasts().habitatPower;
      expect(forecast?.habitatId).toBe(habitatId);
      const minutes = forecastPowerLost(game);

      game.campaign.advance(minutes - 1);
      expect(structureOf(game.state, "habitat").powered).toBe(true);
      expect(game.state.ended).toBeUndefined();
      expect(game.state.lunation.part).toBe("night");
      const atMinute = game.state.clock.elapsedMinutes + 1;
      const events = game.campaign.advance(1);

      expect(structureOf(game.state, "habitat").powered).toBe(false);
      const cause = { kind: "habitat-power-failed", habitatId };
      expect(events.at(-1)).toEqual({
        kind: "mission-director-died",
        atMinute,
        cause,
      });
      expect(game.state.ended).toEqual({ atMinute, cause });
    },
  );

  it("says nothing while the Mission Director lives aboard the Lander", () => {
    const game = poweredBase();

    expect(game.campaign.forecasts().habitatPower).toBeUndefined();
  });
});

describe("letting the battery run flat at Night with the Mission Director in the Habitat", () => {
  it("warns on the first game-minute when the Mission Director moves in with less power left than a warning level", () => {
    const game = poweredBase();
    const [firstLevel = 0, secondLevel = 0] =
      catalogue.habitatPowerWarningHoursLeft.map((hours) => hours * 60);
    runUntil(game, (state) => state.lunation.part === "night");
    // An hour inside the first warning level of what is stored, at the
    // Night's rate.
    runUntil(game, (state) => {
      const [network] = state.power.networks;
      return (
        network !== undefined &&
        (network.storedKilowattHours / network.consumptionKilowatts) * 60 <
          firstLevel - 60
      );
    });
    const habitatId = moveIn(game);
    const forecast = forecastPowerLost(game);
    expect(forecast).toBeLessThan(firstLevel);
    expect(forecast).toBeGreaterThan(secondLevel + 1);

    const events = game.campaign.advance(1);

    expect(events).toContainEqual({
      kind: "habitat-power-warning",
      atMinute: game.state.clock.elapsedMinutes,
      habitatId,
      minutesUntilPowerLost: forecast - 1,
    });
  });

  it("warns as the Habitat's power falls to each warning level, stopping each skip to the next event, then kills the Mission Director", () => {
    const game = poweredBase(0);
    const habitatId = moveIn(game);
    const skips: { events: readonly GameEvent[]; stoppedAt: number }[] = [];
    while (game.state.ended === undefined && skips.length < 100) {
      const events = game.campaign.advanceToNextEvent();
      skips.push({ events, stoppedAt: game.state.clock.elapsedMinutes });
    }

    const notable = skips
      .flatMap((skip) => skip.events)
      .filter(
        (event) =>
          event.kind !== "night-started" &&
          event.kind !== "daylight-started" &&
          event.kind !== "milestone-reached" &&
          // Struck at random, now and then, and harmless here.
          event.kind !== "micrometeorite-strike",
      )
      .map((event) =>
        event.kind === "habitat-power-warning"
          ? `${event.habitatId} warning, ${event.minutesUntilPowerLost / 60} hours left`
          : event.kind === "mission-director-died"
            ? `died: ${event.cause.kind}`
            : event.kind,
      );
    expect(notable).toEqual([
      ...catalogue.habitatPowerWarningHoursLeft.map(
        (hours) => `${habitatId} warning, ${hours} hours left`,
      ),
      "died: habitat-power-failed",
    ]);
    for (const { events, stoppedAt } of skips) {
      for (const event of events) expect(event.atMinute).toBe(stoppedAt);
    }
  });
});
