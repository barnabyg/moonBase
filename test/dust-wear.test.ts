import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import {
  type Campaign,
  type GameEvent,
  type GroundPosition,
  type Snapshot,
  type StructureSnapshot,
} from "../src/simulation";
import { scenario, type Scenario } from "./scenario";
import { worn } from "./worn";

// The starting stock holds a landing pad's Components too, for a Structure
// that has nothing to do with power. No Dust coats the solar arrays, so
// that their output changes only with their Condition.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  return {
    ...actual,
    catalogue: {
      ...actual.catalogue,
      dustCoating: {
        ...actual.catalogue.dustCoating,
        percentPerDaylightHour: 0,
      },
      startingStock: [
        ...actual.catalogue.startingStock,
        { componentId: "pad-panel", count: 8 },
        { componentId: "pad-beacon", count: 1 },
      ],
    },
  };
});

const arraySite: GroundPosition = { x: 20, y: 12 };
const bankSite: GroundPosition = { x: -30, y: 4 };
const mastSite: GroundPosition = { x: 20, y: -20 };
const padSite: GroundPosition = { x: 40, y: 25 };
const { thresholdPercent } = catalogue.structurePerformance;
const bankCapacity =
  catalogue.structureTypes.find((type) => type.id === "battery-bank")?.power
    .storageKilowattHours ?? Number.NaN;

function wearRate(structureTypeId: string): number {
  return (
    catalogue.structureTypes.find((type) => type.id === structureTypeId)
      ?.dustWearPercentPerHour ?? 0
  );
}

/** Runs the game until the Robot has carried out every planned Construction. */
function buildAll(game: Scenario): Scenario {
  for (let hours = 0; game.state.constructions.length > 0; hours++) {
    if (hours > 10 * 24) throw new Error("The Constructions never finished.");
    game.advance({ hours: 1 });
  }
  return game;
}

function structure(state: Snapshot, type: string): StructureSnapshot {
  const found = state.structures.find((s) => s.structureTypeId === type);
  if (found === undefined) throw new Error(`expected a ${type}`);
  return found;
}

function condition(campaign: Campaign, type: string): number {
  return structure(campaign.snapshot(), type).conditionPercent;
}

/** Skips from event to event until the event comes. */
function skipUntil(campaign: Campaign, kind: GameEvent["kind"]): void {
  for (let skips = 0; ; skips++) {
    if (skips > 100) throw new Error(`No ${kind} event came.`);
    if (campaign.advanceToNextEvent().some((event) => event.kind === kind)) {
      return;
    }
  }
}

/**
 * A solar array and a battery bank cabled to it, with the bank worn down to
 * a Condition, and no spare Components to maintain it with.
 */
/**
 * A solar array, a battery bank worn to a Condition and a Light Mast, whose
 * light draws enough at Night to empty the battery bank before Daylight.
 */
function wornBank(conditionPercent: number): Campaign {
  const game = buildAll(
    scenario()
      .plan("solar-array", arraySite)
      .plan("battery-bank", bankSite)
      .plan("light-mast", mastSite),
  );
  return worn(
    game.campaign,
    structure(game.state, "battery-bank").id,
    conditionPercent,
    0,
  );
}

describe("Dust wear", () => {
  it("wears a Structure down by its catalogue rate for each hour it operates", () => {
    const { campaign } = buildAll(scenario().plan("solar-array", arraySite));
    expect(campaign.snapshot().lunation.part).toBe("daylight");
    const start = condition(campaign, "solar-array");

    campaign.advance(10 * 60);
    const afterTen = condition(campaign, "solar-array");
    campaign.advance(10 * 60);

    const rate = wearRate("solar-array");
    expect(rate).toBeGreaterThan(0);
    expect(start - afterTen).toBeCloseTo(10 * rate, 9);
    expect(start - condition(campaign, "solar-array")).toBeCloseTo(
      20 * rate,
      9,
    );
  });

  it("doesn't wear a Structure down while it isn't operating: a solar array with no power at Night", () => {
    const { campaign } = buildAll(scenario().plan("solar-array", arraySite));
    skipUntil(campaign, "night-started");
    campaign.advance(1);
    const atNightfall = condition(campaign, "solar-array");
    expect(structure(campaign.snapshot(), "solar-array").powered).toBe(false);

    campaign.advance(24 * 60);

    expect(condition(campaign, "solar-array")).toBe(atNightfall);
  });

  it("goes on wearing down a Structure that has power at Night", () => {
    const { campaign } = buildAll(
      scenario().plan("solar-array", arraySite).plan("battery-bank", bankSite),
    );
    skipUntil(campaign, "night-started");
    campaign.advance(1);
    const before = condition(campaign, "battery-bank");
    expect(structure(campaign.snapshot(), "battery-bank").powered).toBe(true);

    campaign.advance(10 * 60);

    expect(before - condition(campaign, "battery-bank")).toBeCloseTo(
      10 * wearRate("battery-bank"),
      9,
    );
  });

  it("wears down a Structure that has nothing to do with power all the time, by Day and by Night", () => {
    const { campaign } = buildAll(scenario().plan("landing-pad", padSite));
    const start = condition(campaign, "landing-pad");
    skipUntil(campaign, "night-started");
    const atNightfall = condition(campaign, "landing-pad");

    campaign.advance(24 * 60);

    const rate = wearRate("landing-pad");
    expect(start - atNightfall).toBeGreaterThan(0);
    expect(atNightfall - condition(campaign, "landing-pad")).toBeCloseTo(
      24 * rate,
      9,
    );
  });

  it("stops at Broken, with an event, and wears a Broken Structure down no further", () => {
    const game = buildAll(scenario().plan("solar-array", arraySite));
    const array = structure(game.state, "solar-array");
    // Less than a game-minute's wear left.
    const campaign = worn(
      game.campaign,
      array.id,
      wearRate("solar-array") / 60 / 2,
    );

    const events = campaign.advance(2);

    expect(events).toContainEqual({
      kind: "structure-broken",
      atMinute: expect.any(Number) as number,
      structureId: array.id,
      structureTypeId: "solar-array",
    });
    campaign.advance(60);
    expect(condition(campaign, "solar-array")).toBe(0);
  });
});

describe("performance at low Condition", () => {
  it("is full at or above the threshold", () => {
    const game = buildAll(scenario().plan("solar-array", arraySite));
    const campaign = worn(
      game.campaign,
      structure(game.state, "solar-array").id,
      thresholdPercent + 1,
    );

    campaign.advance(1);

    expect(structure(campaign.snapshot(), "solar-array").performance).toBe(1);
    expect(campaign.snapshot().power.networks[0]?.generationKilowatts).toBe(10);
  });

  it("cuts a solar array's generation along the curve below the threshold", () => {
    const game = buildAll(scenario().plan("solar-array", arraySite));
    const campaign = worn(
      game.campaign,
      structure(game.state, "solar-array").id,
      thresholdPercent / 2,
    );

    campaign.advance(1);

    const array = structure(campaign.snapshot(), "solar-array");
    const expected = (array.conditionPercent / thresholdPercent) ** 1;
    expect(array.performance).toBeCloseTo(expected, 9);
    expect(array.performance).toBeCloseTo(0.5, 2);
    expect(
      campaign.snapshot().power.networks[0]?.generationKilowatts,
    ).toBeCloseTo(10 * array.performance, 9);
  });

  it("cuts a battery bank's storage capacity, losing the energy above it", () => {
    const campaign = wornBank(100);
    const network = () =>
      campaign
        .snapshot()
        .power.networks.find((candidate) => candidate.structureIds.length > 1);
    for (
      let hours = 0;
      (network()?.storedKilowattHours ?? 0) < bankCapacity;
      hours++
    ) {
      if (hours > 48) throw new Error("The battery bank never filled.");
      campaign.advance(60);
    }
    const bankId = structure(campaign.snapshot(), "battery-bank").id;

    const halved = worn(campaign, bankId, thresholdPercent / 2);
    halved.advance(1);

    const after = halved
      .snapshot()
      .power.networks.find((candidate) => candidate.structureIds.length > 1);
    expect(after?.storageCapacityKilowattHours).toBeCloseTo(
      bankCapacity / 2,
      1,
    );
    expect(after?.storedKilowattHours).toBeCloseTo(
      after?.storageCapacityKilowattHours ?? 0,
      9,
    );
  });

  it("shortens the power forecast", () => {
    const fresh = wornBank(100);
    const halved = wornBank(thresholdPercent / 2);
    for (const campaign of [fresh, halved]) {
      skipUntil(campaign, "night-started");
      campaign.advance(1);
    }

    const freshForecast = fresh.forecasts().power.minutesUntilEmpty ?? 0;
    const halvedForecast = halved.forecasts().power.minutesUntilEmpty ?? 0;

    // The worn bank holds what its reduced capacity allows, and the
    // forecast follows it down at the Night's consumption.
    const network = halved
      .snapshot()
      .power.networks.find((candidate) => candidate.structureIds.length > 1);
    const { storedKilowattHours = 0, consumptionKilowatts = 1 } = network ?? {};
    expect(storedKilowattHours).toBeLessThan(bankCapacity / 2);
    expect(halvedForecast).toBeLessThan(freshForecast / 2);
    expect(
      Math.abs(
        halvedForecast - (storedKilowattHours / consumptionKilowatts) * 60,
      ),
    ).toBeLessThanOrEqual(1);
  });

  it("shrinks a Light Mast's light radius", () => {
    const game = buildAll(
      scenario().plan("solar-array", arraySite).plan("light-mast", mastSite),
    );
    const mast = structure(game.state, "light-mast");
    expect(mast.lightRadiusMetres).toBe(18);
    const campaign = worn(game.campaign, mast.id, thresholdPercent / 4);

    campaign.advance(1);

    expect(
      structure(campaign.snapshot(), "light-mast").lightRadiusMetres,
    ).toBeCloseTo(18 / 4, 1);
  });

  it("doesn't touch a Habitat, which works fully until it is Broken", () => {
    const game = buildAll(scenario().plan("habitat", { x: 30, y: -30 }));
    const campaign = worn(
      game.campaign,
      structure(game.state, "habitat").id,
      5,
    );

    campaign.advance(1);

    expect(structure(campaign.snapshot(), "habitat").performance).toBe(1);
  });
});

describe("Dust wear and Maintenance", () => {
  it("raises Maintenance once Dust has worn a Structure below the threshold, and Maintenance brings back full performance", () => {
    const game = buildAll(scenario().plan("solar-array", arraySite));
    const array = structure(game.state, "solar-array");
    const { thresholdPercent: maintenanceThreshold } = catalogue.maintenance;
    const campaign = worn(game.campaign, array.id, maintenanceThreshold + 0.1);

    const raised: GameEvent[] = [];
    for (let minutes = 0; raised.length === 0; minutes++) {
      if (minutes > 24 * 60) throw new Error("Maintenance was never raised.");
      raised.push(
        ...campaign
          .advance(1)
          .filter((event) => event.kind === "maintenance-needed"),
      );
    }
    expect(raised).toEqual([
      expect.objectContaining({
        target: expect.objectContaining({ structureId: array.id }) as unknown,
        conditionPercent: expect.closeTo(maintenanceThreshold, 1) as number,
      }),
    ]);
    // Worn below the performance threshold meanwhile, by a test shortcut.
    const lowered = worn(campaign, array.id, thresholdPercent / 2);
    lowered.advance(1);
    expect(
      lowered.snapshot().power.networks[0]?.generationKilowatts,
    ).toBeLessThan(10);

    skipUntil(lowered, "maintenance-completed");
    lowered.advance(1);

    expect(structure(lowered.snapshot(), "solar-array").performance).toBe(1);
    expect(lowered.snapshot().power.networks[0]?.generationKilowatts).toBe(10);
  });
});
