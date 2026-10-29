import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  catalogue,
  type Catalogue,
  type StructureType,
} from "../src/catalogue";
import {
  loadCampaign,
  type GameEvent,
  type GroundPosition,
  type Snapshot,
  type StructureSnapshot,
} from "../src/simulation";
import { formatEvent } from "../src/ui/format";
import { scenario, scenarioOf, type Scenario } from "./scenario";
import { worn } from "./worn";

// The telescope's Design is unlocked from the start, with a telescope's
// Components in the starting stock. Nothing wears down by Dust or
// Micrometeorites, so that a telescope works at full performance, and no
// Machine draws power for a heater at Night, so that the battery bank
// carries the telescope through it.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withDesigns } = await import("./with-designs");
  const { withoutDust } = await import("./without-dust");
  const { withoutCold } = await import("./without-cold");
  const { withoutMicrometeorites } = await import("./without-micrometeorites");
  const { withoutDigging } = await import("./without-digging");
  const telescope = actual.catalogue.structureTypes.find(
    (type) => type.id === "telescope",
  );
  const base = withDesigns(
    withoutDigging(
      withoutMicrometeorites(withoutCold(withoutDust(actual.catalogue))),
    ),
    [telescope?.designId ?? "telescope-design-missing"],
  );
  return {
    ...actual,
    catalogue: {
      ...base,
      // A second telescope's worth, for the test that builds two.
      startingStock: [...base.startingStock, ...(telescope?.components ?? [])],
    },
  };
});

function structureType(id: string): StructureType {
  const type = catalogue.structureTypes.find(
    (candidate) => candidate.id === id,
  );
  if (type === undefined) throw new Error(`expected a ${id}`);
  return type;
}
const telescope = structureType("telescope");
const programme = catalogue.observingProgramme;
const roundMinutes = programme.lengthHours * 60;
const solarSite: GroundPosition = { x: 20, y: 12 };
const batterySite: GroundPosition = { x: 30, y: 25 };
const telescopeSite: GroundPosition = { x: 32, y: 12 };
const secondTelescopeSite: GroundPosition = { x: 38, y: 18 };

/** Runs the game until every planned Construction is commissioned. */
function runUntilBuilt(game: Scenario): void {
  for (let hours = 0; game.state.constructions.length > 0; hours++) {
    if (hours > 5 * 24) throw new Error("The Constructions never finished.");
    game.advance({ hours: 1 });
  }
}

/** Runs the game until the given part of the Lunation has just begun. */
function runUntil(game: Scenario, part: "daylight" | "night"): void {
  do {
    game.advance({ minutes: game.state.lunation.minutesRemaining });
  } while (game.state.lunation.part !== part);
}

function telescopesOf(state: Snapshot): StructureSnapshot[] {
  return state.structures.filter(
    (structure) => structure.structureTypeId === telescope.id,
  );
}

function rounds(events: readonly GameEvent[]): GameEvent[] {
  return events.filter((event) => event.kind === "observing-round-completed");
}

/** A solar array, a battery bank and a telescope, all commissioned and joined by cable. */
function observatory(): Scenario {
  const game = scenario()
    .plan("solar-array", solarSite)
    .plan("battery-bank", batterySite)
    .plan(telescope.id, telescopeSite);
  runUntilBuilt(game);
  return game;
}

describe("a telescope", () => {
  it("observes only at Night, completing a round of the observing programme after its length, which earns its Science with a notification", () => {
    const game = observatory();
    game.advance({ hours: 1 });
    expect(game.state.lunation.part).toBe("daylight");
    expect(game.state.observingProgramme).toEqual({
      progress: 0,
      telescopes: 1,
      observing: 0,
      minutesLeft: undefined,
      stoppedFor: "daylight",
    });
    expect(telescopesOf(game.state)[0]).toMatchObject({
      powered: true,
      observing: false,
    });

    runUntil(game, "night");
    const science = game.state.science;
    const before = game.campaign.advance(roundMinutes - 1);

    expect(rounds(before)).toEqual([]);
    expect(game.state.observingProgramme).toEqual({
      progress: (roundMinutes - 1) / roundMinutes,
      telescopes: 1,
      observing: 1,
      minutesLeft: 1,
      stoppedFor: undefined,
    });
    expect(telescopesOf(game.state)[0]).toMatchObject({ observing: true });

    const completed = rounds(game.campaign.advance(1));

    expect(completed).toEqual([
      {
        kind: "observing-round-completed",
        atMinute: game.state.clock.elapsedMinutes,
        science: programme.science,
      },
    ]);
    const [event] = completed;
    if (event === undefined) throw new Error("expected an event");
    expect(formatEvent(event)).toBe(
      `${programme.label}: a round of observing complete, earning ${programme.science} Science`,
    );
    expect(game.state.science).toBe(science + programme.science);
    expect(game.state.observingProgramme.progress).toBe(0);
    // A standing Research Task: it is never completed for good.
    expect(game.state.completedResearchTaskIds).toEqual([]);
  });
});

describe("a telescope without power", () => {
  it("observes nothing at Night once there is no stored power, and the programme says so", () => {
    // No battery bank, so nothing powers it at Night.
    const game = scenario()
      .plan("solar-array", solarSite)
      .plan(telescope.id, telescopeSite);
    runUntilBuilt(game);
    runUntil(game, "night");

    const events = game.campaign.advance(roundMinutes);

    expect(rounds(events)).toEqual([]);
    expect(telescopesOf(game.state)[0]).toMatchObject({
      powered: false,
      observing: false,
    });
    expect(game.state.observingProgramme).toEqual({
      progress: 0,
      telescopes: 1,
      observing: 0,
      minutesLeft: undefined,
      stoppedFor: "no-power",
    });
  });
});

describe("a Broken telescope", () => {
  it("observes nothing, and the programme keeps what was observed for when it is repaired", () => {
    const game = observatory();
    runUntil(game, "night");
    game.advance({ hours: 5 });
    const telescopeId = telescopesOf(game.state)[0]?.id ?? "";
    const broken = scenarioOf(worn(game.campaign, telescopeId, 0));

    broken.advance({ minutes: 10 });

    expect(telescopesOf(broken.state)[0]).toMatchObject({
      conditionPercent: 0,
      observing: false,
    });
    expect(broken.state.observingProgramme).toMatchObject({
      progress: (5 * 60) / roundMinutes,
      observing: 0,
      stoppedFor: "broken",
    });
  });
});

describe("the observing programme", () => {
  it("completes a round every so often through a Night, and keeps the part of a round left over through Daylight for the next Night", () => {
    const game = observatory();
    runUntil(game, "night");
    const nightMinutes = game.state.lunation.minutesRemaining;
    const science = game.state.science;

    const night = game.campaign.advance(nightMinutes);
    const expectedRounds = Math.floor(nightMinutes / roundMinutes);

    expect(game.state.lunation.part).toBe("daylight");
    expect(rounds(night)).toHaveLength(expectedRounds);
    expect(game.state.science).toBe(
      science + expectedRounds * programme.science,
    );
    const leftOver = (nightMinutes % roundMinutes) / roundMinutes;
    expect(game.state.observingProgramme.progress).toBeCloseTo(leftOver);

    const day = game.campaign.advance(game.state.lunation.minutesRemaining);

    expect(rounds(day)).toEqual([]);
    expect(game.state.observingProgramme.progress).toBeCloseTo(leftOver);
    expect(game.state.observingProgramme.stoppedFor).toBe("daylight");
  });

  it("goes twice as fast with two telescopes observing", () => {
    const game = observatory().plan(telescope.id, secondTelescopeSite);
    runUntilBuilt(game);
    runUntil(game, "night");

    game.advance({ hours: 3 });

    expect(game.state.observingProgramme).toEqual({
      progress: (2 * 3 * 60) / roundMinutes,
      telescopes: 2,
      observing: 2,
      minutesLeft: (roundMinutes - 2 * 3 * 60) / 2,
      stoppedFor: undefined,
    });
  });

  it("is saved and loaded part-way through a round, and goes on exactly as an uninterrupted run would", () => {
    const game = observatory();
    runUntil(game, "night");
    game.advance({ hours: 7 });

    const loaded = loadCampaign(game.campaign.save());
    if (!loaded.ok) throw new Error(loaded.message);

    expect(loaded.campaign.snapshot().observingProgramme).toEqual(
      game.state.observingProgramme,
    );
    const original = game.campaign.advance(roundMinutes);
    const reloaded = loaded.campaign.advance(roundMinutes);
    expect(rounds(original)).toHaveLength(1);
    expect(reloaded).toEqual(original);
    expect(loaded.campaign.save()).toBe(game.campaign.save());
  });

  it("has nothing observed and no telescope in a save from before telescopes", () => {
    const loaded = loadCampaign(
      readFileSync(
        new URL("./saves/version-37.moonbase", import.meta.url),
        "utf8",
      ),
    );
    if (!loaded.ok) throw new Error(loaded.message);

    expect(loaded.campaign.snapshot().observingProgramme).toEqual({
      progress: 0,
      telescopes: 0,
      observing: 0,
      minutesLeft: undefined,
      stoppedFor: undefined,
    });
  });
});
