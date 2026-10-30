import { describe, expect, it } from "vitest";
import {
  loadCampaign,
  type GameEvent,
  type GroundPosition,
  type Snapshot,
  type StructureSnapshot,
} from "../src/simulation";
import { scenario, scenarioOf, type Scenario } from "./scenario";

// The real data catalogue, cold and Dust and all: this is the base a new
// player builds from the starting stock before the first Night.
const sites: readonly [string, GroundPosition][] = [
  ["solar-array", { x: 20, y: 12 }],
  ["battery-bank", { x: 30, y: 25 }],
  ["battery-bank", { x: 36, y: 25 }],
  ["battery-bank", { x: 42, y: 25 }],
  ["habitat", { x: 25, y: -20 }],
  ["light-mast", { x: 15, y: -10 }],
  ["light-mast", { x: -20, y: 20 }],
  ["light-mast", { x: 15, y: -30 }],
  ["light-mast", { x: 40, y: -10 }],
];

/** Runs the game a game-minute at a time until the condition holds, keeping the events. */
function runUntil(
  game: Scenario,
  done: (state: Snapshot) => boolean,
  events: GameEvent[] = [],
): GameEvent[] {
  for (let minute = 0; minute < 40 * 24 * 60; minute++) {
    if (done(game.state)) return events;
    events.push(...game.campaign.advance(1));
  }
  throw new Error("It never happened.");
}

function lightsOf(state: Snapshot): StructureSnapshot[] {
  return state.structures.filter(
    (structure) => structure.structureTypeId === "light-mast",
  );
}

/** The starting stock's every Structure built, with the Mission Director moved in. */
function startingBase(): Scenario {
  const game = scenario();
  for (const [structureTypeId, position] of sites) {
    game.plan(structureTypeId, position);
  }
  runUntil(
    game,
    (state) => state.constructions.length === 0 && state.cables.length > 0,
  );
  runUntil(game, (state) => state.cables.every((cable) => cable.complete));
  const habitat = game.state.structures.find(
    (structure) => structure.structureTypeId === "habitat",
  );
  if (habitat === undefined) throw new Error("expected a Habitat");
  const moved = game.campaign.moveMissionDirectorIn(habitat.id);
  if (!moved.ok) throw new Error(`Moving in was refused: ${moved.message}`);
  expect(game.state.lunation.part).toBe("daylight");
  return game;
}

/**
 * The saved text of the starting base as its first Night falls. Played
 * once, and loaded afresh for each test.
 */
let atNightfall: string | undefined;
function startingBaseAtNightfall(): Scenario {
  if (atNightfall === undefined) {
    const game = startingBase();
    runUntil(game, (state) => state.lunation.part === "night");
    atNightfall = game.campaign.save();
  }
  const loaded = loadCampaign(atNightfall);
  if (!loaded.ok) throw new Error(loaded.message);
  return scenarioOf(loaded.campaign);
}

/** What the starting base's first Night brought, from nightfall on. */
interface FirstNight {
  /** The Light Masts an hour into the Night. */
  readonly lightsAnHourIn: readonly StructureSnapshot[];
  /** Whether every Light Mast was saving power at some point in the Night. */
  readonly everyLightSavedPower: boolean;
  /** Everything that happened until Daylight came or the Campaign ended. */
  readonly events: readonly GameEvent[];
  /** The state then. */
  readonly last: Snapshot;
}

/** The starting base's first Night, played once and shared by the tests that watch it. */
let firstNightPlayed: FirstNight | undefined;
function firstNight(): FirstNight {
  if (firstNightPlayed === undefined) {
    const game = startingBaseAtNightfall();
    const events = [...game.campaign.advance(60)];
    const lightsAnHourIn = lightsOf(game.state);
    let everyLightSavedPower = false;
    runUntil(
      game,
      (state) => {
        everyLightSavedPower ||= lightsOf(state).every(
          (light) => light.savingPower,
        );
        return state.lunation.part === "daylight" || state.ended !== undefined;
      },
      events,
    );
    firstNightPlayed = {
      lightsAnHourIn,
      everyLightSavedPower,
      events,
      last: game.state,
    };
  }
  return firstNightPlayed;
}

describe("Light Masts at Night", () => {
  it("switch themselves off before they leave the Habitat without power, so the starting base gets through the first Night", () => {
    const { events, last } = firstNight();

    expect(last.ended).toBeUndefined();
    expect(events.map((event) => event.kind)).not.toContain(
      "habitat-power-warning",
    );
  });

  it("light up the base while there is energy to spare, then switch off to save power, saying so once", () => {
    const { lightsAnHourIn, everyLightSavedPower, events, last } = firstNight();

    expect(lightsAnHourIn).toHaveLength(4);
    expect(
      lightsAnHourIn.every((light) => light.lit && !light.savingPower),
    ).toBe(true);
    expect(everyLightSavedPower).toBe(true);
    const switchedOff = events.flatMap((event) =>
      event.kind === "lights-switched-off" ? [event] : [],
    );
    expect(switchedOff).toHaveLength(1);
    const lightIds = lightsOf(last).map((light) => light.id);
    for (const id of switchedOff[0]?.structureIds ?? []) {
      expect(lightIds).toContain(id);
    }
    expect(switchedOff[0]?.structureIds.length).toBeGreaterThan(0);
  });

  it("are left out of the forecast once they would empty the battery banks, which then last through the Night", () => {
    const game = startingBaseAtNightfall();
    const nightLeft = game.state.lunation.minutesRemaining;

    const { power, habitatPower } = game.campaign.forecasts();

    expect(power.minutesUntilEmpty ?? Infinity).toBeGreaterThan(nightLeft);
    expect(habitatPower?.minutesUntilPowerLost ?? Infinity).toBeGreaterThan(
      nightLeft,
    );
  });
});
