import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import {
  type Campaign,
  type GameEvent,
  type GroundPosition,
} from "../src/simulation";
import type { CampaignState } from "../src/simulation/campaign";
import { readSaveDocument } from "../src/simulation/save";
import {
  forecastSpareComponents,
  watchSpareComponents,
} from "../src/simulation/spare-forecast";
import { scenario, type Scenario } from "./scenario";
import { changed, withSpares } from "./worn";

// The Mission Director can live in the Habitat through a round trip of the
// Lander. Only Structures and the Robot wear, and Machines and the cold
// only as a test says, so that the rate of wear is known.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { safeHabitat } = await import("./safe-habitat");
  const { withoutCold } = await import("./without-cold");
  const { withoutMicrometeorites } = await import("./without-micrometeorites");
  const { withoutDigging } = await import("./without-digging");
  return {
    ...actual,
    catalogue: safeHabitat(
      withoutDigging(withoutMicrometeorites(withoutCold(actual.catalogue))),
      ["power", "radiation", "life-support", "solar-particle-events"],
    ),
  };
});

const arraySite: GroundPosition = { x: 20, y: 12 };
const bankSite: GroundPosition = { x: -30, y: 4 };
const mastSite: GroundPosition = { x: 20, y: -20 };
const habitatSite: GroundPosition = { x: 60, y: 0 };
/** Out of the Plume Ejecta's reach. */
const farArraySite: GroundPosition = { x: 40, y: 25 };
const { conditionPercentPerSpareComponent } = catalogue.maintenance;
const wear = (structureTypeId: string) =>
  catalogue.structureTypes.find((type) => type.id === structureTypeId)
    ?.dustWearPercentPerHour ?? 0;

/** Runs the game until the Robot has carried out every planned Construction. */
function buildAll(game: Scenario): Scenario {
  for (let hours = 0; game.state.constructions.length > 0; hours++) {
    if (hours > 10 * 24) throw new Error("The Constructions never finished.");
    game.advance({ hours: 1 });
  }
  return game;
}

function forecast(campaign: Campaign) {
  return campaign.forecasts().spareComponents;
}

describe("the forecast of spare Components", () => {
  it("gives no time when nothing is wearing down: the stock lasts indefinitely", () => {
    const { campaign } = scenario();

    expect(forecast(campaign)).toEqual({
      inStock: 6,
      forPendingRepairs: 0,
      perEarthDay: 0,
      minutesUntilEmpty: undefined,
    });
  });

  it("follows the rate of wear of what is operating, at the Maintenance rate", () => {
    const { campaign } = buildAll(scenario().plan("solar-array", arraySite));
    campaign.advance(60);
    expect(campaign.snapshot().robots[0]?.activity.kind).toBe("idle");

    const perMinute =
      wear("solar-array") / 60 / conditionPercentPerSpareComponent;
    expect(forecast(campaign).minutesUntilEmpty).toBe(
      Math.floor(6 / perMinute),
    );
    expect(forecast(campaign).perEarthDay).toBeCloseTo(perMinute * 24 * 60, 9);
  });

  it("falls as more Structures operate, and as the Robot and Machines work", () => {
    const one = buildAll(scenario().plan("solar-array", arraySite)).campaign;
    const three = buildAll(
      scenario()
        .plan("solar-array", arraySite)
        .plan("battery-bank", bankSite)
        .plan("light-mast", mastSite),
    ).campaign;
    for (const campaign of [one, three]) campaign.advance(60);
    const idle = forecast(three).minutesUntilEmpty ?? 0;

    expect(idle).toBeLessThan(forecast(one).minutesUntilEmpty ?? 0);

    const planned = three.planConstruction({
      structureTypeId: "light-mast",
      position: { x: -20, y: -30 },
    });
    if (!planned.ok) throw new Error(planned.message);
    for (let minutes = 0; ; minutes++) {
      if (minutes > 24 * 60) throw new Error("The excavator never worked.");
      three.advance(1);
      if (three.snapshot().machines[0]?.activity.kind === "working") break;
    }
    expect(forecast(three).minutesUntilEmpty).toBeLessThan(idle);
  });

  it("counts the spare Components that Maintenance already raised will take", () => {
    const game = buildAll(scenario().plan("solar-array", arraySite));
    const arrayId = game.state.structures[0]?.id ?? "";
    const campaign = changed(game.campaign, (state) => {
      for (const saved of state.structures) {
        if (saved.id === arrayId) saved.conditionPercent = 50;
      }
      // Too few for it, so that it waits and its spares stay pending.
      withSpares(state, 2);
    });
    campaign.advance(1);

    expect(campaign.snapshot().maintenance[0]?.waiting).toBeDefined();
    expect(forecast(campaign)).toMatchObject({
      inStock: 2,
      forPendingRepairs: 3,
      minutesUntilEmpty: 0,
    });
  });

  it("rises after a Launch delivers spare Components", () => {
    const game = buildAll(
      scenario().plan("habitat", habitatSite).plan("solar-array", farArraySite),
    );
    const habitat = game.state.structures.find(
      (s) => s.structureTypeId === "habitat",
    );
    const movedIn = game.campaign.moveMissionDirectorIn(habitat?.id ?? "");
    if (!movedIn.ok) throw new Error(movedIn.message);
    const manifest = game.campaign.setLaunchManifest([
      { itemId: "spare-component", count: 10 },
    ]);
    if (!manifest.ok) throw new Error(manifest.message);
    const sent = game.campaign.sendLander();
    if (!sent.ok) throw new Error(sent.message);
    const lander = () => game.campaign.snapshot().lander.state;
    for (let skips = 0; lander() !== "travelling-to-moon";) {
      if (skips++ > 100) throw new Error("The Lander never left Earth.");
      game.campaign.advanceToNextEvent();
    }
    const before = forecast(game.campaign);

    for (let skips = 0; lander() !== "landed-free";) {
      if (skips++ > 100) throw new Error("The Lander never landed.");
      game.campaign.advanceToNextEvent();
    }

    const after = forecast(game.campaign);
    expect(after.inStock).toBe(before.inStock + 10);
    expect(after.minutesUntilEmpty ?? 0).toBeGreaterThan(
      before.minutesUntilEmpty ?? 0,
    );
  });
});

describe("spare Component warnings", () => {
  it("come as the time left falls to a catalogue level, stopping each skip to the next event, once for each level", () => {
    // One spare Component, which ordinary work wears through in a few
    // Earth Days.
    const campaign = changed(
      scenario().plan("light-mast", mastSite).campaign,
      (state) => {
        withSpares(state, 1);
      },
    );
    const levels = catalogue.spareComponentWarningEarthDaysLeft.map(
      (earthDays) => earthDays * 24 * 60,
    );

    const skipUntilWarning = (): readonly GameEvent[] => {
      for (let skips = 0; skips <= 20; skips++) {
        const events = campaign.advanceToNextEvent();
        if (events.some((event) => event.kind === "spare-components-warning")) {
          return events;
        }
      }
      throw new Error("No warning came.");
    };
    const skipped = skipUntilWarning();

    const warning = skipped.find(
      (event) => event.kind === "spare-components-warning",
    );
    expect(warning).toMatchObject({ inStock: 1 });
    const left =
      warning?.kind === "spare-components-warning"
        ? warning.minutesUntilEmpty
        : Infinity;
    expect(left).toBeLessThanOrEqual(Math.max(...levels));
    expect(forecast(campaign).minutesUntilEmpty).toBe(left);

    const more = campaign
      .advance(24 * 60)
      .filter((event) => event.kind === "spare-components-warning");
    const below = levels.filter((level) => level < left);
    expect(more.length).toBeLessThanOrEqual(below.length);
  });

  it("are given again once spare Components arrive, as the time left falls to a level once more", () => {
    // The excavator and the Robot at work, wearing through a spare
    // Component every couple of Earth Days.
    const game = scenario().plan("light-mast", mastSite);
    for (let minutes = 0; ; minutes++) {
      if (minutes > 24 * 60) throw new Error("The excavator never worked.");
      if (game.state.machines[0]?.activity.kind === "working") break;
      game.advance({ minutes: 1 });
    }
    const read = readSaveDocument(game.campaign.save());
    if (!read.ok) throw new Error(read.message);
    const { state } = read;
    const setStock = (state: CampaignState, count: number) => {
      const stock = state.stockpile.components.find(
        (s) => s.componentId === "spare-component",
      );
      if (stock !== undefined) stock.count = count;
    };
    const sevenDays = 7 * 24 * 60;
    const perEarthDay = forecastSpareComponents(state).perEarthDay;
    // Enough for ten Earth Days, then for five: past the 7-day level.
    const plenty = Math.ceil(10 * perEarthDay);
    const fewer = Math.floor(5 * perEarthDay);
    expect(fewer).toBeGreaterThan(0);

    // Every warning given, with one spare Component left.
    setStock(state, 1);
    state.spareComponentsWarnedMinutes = 24 * 60;
    const scarce = forecastSpareComponents(state);
    // Spares arrive: no warning, as the time left rises.
    setStock(state, plenty);
    expect(watchSpareComponents(state, scarce)).toEqual([]);
    expect(state.spareComponentsWarnedMinutes).toBeUndefined();
    const restocked = forecastSpareComponents(state);
    expect(restocked.minutesUntilEmpty).toBeGreaterThan(sevenDays);
    expect(restocked.minutesUntilEmpty).toBeLessThan(2 * sevenDays);

    // They are used up, and the time left falls to the 7-day level again.
    setStock(state, fewer);
    expect(watchSpareComponents(state, restocked)).toEqual([
      expect.objectContaining({
        kind: "spare-components-warning",
        inStock: fewer,
      }),
    ]);
  });

  it("aren't given again as the time left swings back and forth with nothing arriving", () => {
    const game = scenario().plan("light-mast", mastSite);
    for (let minutes = 0; ; minutes++) {
      if (minutes > 24 * 60) throw new Error("The excavator never worked.");
      if (game.state.machines[0]?.activity.kind === "working") break;
      game.advance({ minutes: 1 });
    }
    const read = readSaveDocument(game.campaign.save());
    if (!read.ok) throw new Error(read.message);
    const { state } = read;
    const perEarthDay = forecastSpareComponents(state).perEarthDay;
    const stock = state.stockpile.components.find(
      (s) => s.componentId === "spare-component",
    );
    if (stock === undefined) throw new Error("expected spare Components");
    stock.count = Math.ceil(10 * perEarthDay);
    const above = forecastSpareComponents(state);
    stock.count = Math.floor(5 * perEarthDay);

    // Given once; with the stock the same, a swing back over the level
    // and down again brings no second warning.
    expect(watchSpareComponents(state, above)).toHaveLength(1);
    expect(watchSpareComponents(state, above)).toEqual([]);
  });
});
