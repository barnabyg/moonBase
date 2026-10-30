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
import { formatEvent } from "../src/ui/notifications-text";
import { scenario, scenarioOf, type Scenario } from "./scenario";
import { changed, worn } from "./worn";

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

describe("a telescope's power", () => {
  const solarArray = structureType("solar-array");
  const batteryBank = structureType("battery-bank");
  const networkDraw = (state: Snapshot) =>
    state.power.networks.find((network) =>
      network.structureIds.includes(telescopesOf(state)[0]?.id ?? ""),
    )?.consumptionKilowatts;

  it("is drawn only at Night, while it observes, and not in Daylight, when it can't", () => {
    const game = observatory();
    game.advance({ hours: 1 });
    const alwaysDrawn =
      solarArray.power.drawKilowatts + batteryBank.power.drawKilowatts;

    expect(telescope.power.drawKilowatts).toBe(0);
    expect(networkDraw(game.state)).toBeCloseTo(alwaysDrawn);

    runUntil(game, "night");
    game.advance({ hours: 1 });

    expect(telescopesOf(game.state)[0]).toMatchObject({ observing: true });
    expect(networkDraw(game.state)).toBeCloseTo(
      alwaysDrawn + telescope.power.nightDrawKilowatts,
    );
  });

  it("is given up at Night to keep the battery banks' reserve for everything else, so it stops observing before anything else goes without", () => {
    const game = observatory();
    runUntil(game, "night");
    // Enough for the solar array and the battery bank through the rest of
    // the Night and the reserve after it, and a tenth of a kWh over: under
    // half an hour of the telescope's observing.
    const everythingElse =
      ((solarArray.power.drawKilowatts + batteryBank.power.drawKilowatts) *
        (game.state.lunation.minutesRemaining +
          catalogue.nightReserveHours * 60)) /
      60;
    const short = scenarioOf(
      changed(game.campaign, (saved) => {
        for (const structure of saved.structures) {
          if (structure.storedKilowattHours > 0) {
            structure.storedKilowattHours = everythingElse + 0.1;
          }
        }
      }),
    );

    short.advance({ hours: 2 });

    expect(telescopesOf(short.state)[0]).toMatchObject({
      observing: false,
      savingPower: true,
    });
    const { progress } = short.state.observingProgramme;
    expect(progress).toBeGreaterThan(0);
    expect(progress * roundMinutes).toBeLessThan(30);
    expect(short.state.observingProgramme.stoppedFor).toBe("no-power");
    expect(short.state.structures.every((structure) => structure.powered)).toBe(
      true,
    );
  });
});

describe("a worn telescope", () => {
  it("observes more slowly below the performance threshold, in step with its Condition", () => {
    const game = observatory();
    runUntil(game, "night");
    const telescopeId = telescopesOf(game.state)[0]?.id ?? "";
    // Half the threshold, with no spares in stock, so that Maintenance
    // waits and the Condition stays where it is.
    const { thresholdPercent } = catalogue.structurePerformance;
    const half = scenarioOf(
      worn(game.campaign, telescopeId, thresholdPercent / 2, 0),
    );

    half.advance({ hours: 2 });

    // Along the data catalogue's curve, which is a straight line.
    expect(catalogue.structurePerformance.exponent).toBe(1);
    expect(telescopesOf(half.state)[0]).toMatchObject({
      performance: 0.5,
      observing: true,
    });
    expect(half.state.observingProgramme).toMatchObject({
      progress: 60 / roundMinutes,
      minutesLeft: (roundMinutes - 60) * 2,
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
