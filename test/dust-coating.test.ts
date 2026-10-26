import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import {
  loadCampaign,
  type Campaign,
  type GameEvent,
  type GroundPosition,
  type Snapshot,
  type StructureSnapshot,
} from "../src/simulation";
import { scenario, type Scenario } from "./scenario";
import { changed, coated, worn } from "./worn";

// Dust coats solar arrays but wears nothing down, so that output changes
// only with the coating, or with a Condition a test sets; no Machine draws
// power for a heater at Night.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withoutDust } = await import("./without-dust");
  const { withoutCold } = await import("./without-cold");
  return {
    ...actual,
    catalogue: {
      ...withoutCold(withoutDust(actual.catalogue)),
      dustCoating: actual.catalogue.dustCoating,
    },
  };
});

const arraySite: GroundPosition = { x: 20, y: 12 };
const bankSite: GroundPosition = { x: -30, y: 4 };
const mastSite: GroundPosition = { x: 20, y: -20 };
const {
  percentPerDaylightHour,
  outputLossAtFullCoating,
  cleaningThresholdPercent,
} = catalogue.dustCoating;
const { spareComponentId } = catalogue.maintenance;

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

function array(campaign: Campaign): StructureSnapshot {
  return structure(campaign.snapshot(), "solar-array");
}

function generation(campaign: Campaign): number {
  return campaign
    .snapshot()
    .power.networks.reduce(
      (sum, network) => sum + network.generationKilowatts,
      0,
    );
}

function spareComponents(state: Snapshot): number {
  return (
    state.stockpile.components.find((s) => s.componentId === spareComponentId)
      ?.count ?? 0
  );
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

/** Advances a game-minute at a time until an event comes, returning every event on the way. */
function advanceUntil(
  campaign: Campaign,
  kind: GameEvent["kind"],
): GameEvent[] {
  const events: GameEvent[] = [];
  for (let minutes = 0; !events.some((event) => event.kind === kind);) {
    if (minutes++ > 48 * 60) throw new Error(`No ${kind} event came.`);
    events.push(...campaign.advance(1));
  }
  return events;
}

/** A commissioned solar array, coated with Dust to a percentage. */
function coatedArray(dustCoatingPercent: number): Campaign {
  const game = buildAll(scenario().plan("solar-array", arraySite));
  return coated(
    game.campaign,
    structure(game.state, "solar-array").id,
    dustCoatingPercent,
  );
}

describe("a solar array's Dust coating", () => {
  it("starts at 0% when the array is commissioned", () => {
    const game = scenario().plan("solar-array", arraySite);
    for (let minutes = 0; game.state.structures.length === 0; minutes++) {
      if (minutes > 24 * 60) throw new Error("The array was never built.");
      game.advance({ minutes: 1 });
    }

    expect(structure(game.state, "solar-array").dustCoatingPercent).toBe(0);
  });

  it("builds up at the catalogue rate in Daylight, and not at Night", () => {
    const { campaign } = buildAll(scenario().plan("solar-array", arraySite));
    expect(campaign.snapshot().lunation.part).toBe("daylight");
    const start = array(campaign).dustCoatingPercent;

    campaign.advance(10 * 60);
    expect(array(campaign).dustCoatingPercent - start).toBeCloseTo(
      10 * percentPerDaylightHour,
      9,
    );

    skipUntil(campaign, "night-started");
    campaign.advance(1);
    const atNightfall = array(campaign).dustCoatingPercent;
    campaign.advance(24 * 60);
    expect(array(campaign).dustCoatingPercent).toBe(atNightfall);
  });

  it("isn't on anything but a solar array", () => {
    const { campaign } = buildAll(
      scenario().plan("solar-array", arraySite).plan("battery-bank", bankSite),
    );

    campaign.advance(10 * 60);

    expect(
      structure(campaign.snapshot(), "battery-bank").dustCoatingPercent,
    ).toBe(0);
  });

  it("cuts the array's output in proportion, scaled by the catalogue factor", () => {
    const clean = coatedArray(0);
    const halfCoated = coatedArray(50);
    for (const campaign of [clean, halfCoated]) campaign.advance(1);

    // Each has gathered a game-minute's more Dust meanwhile.
    for (const campaign of [clean, halfCoated]) {
      expect(generation(campaign)).toBeCloseTo(
        10 *
          (1 -
            (outputLossAtFullCoating * array(campaign).dustCoatingPercent) /
              100),
        9,
      );
    }
    expect(generation(halfCoated)).toBeCloseTo(
      10 * (1 - outputLossAtFullCoating / 2),
      2,
    );
  });

  it("cuts output on top of any drop from low Condition", () => {
    const game = buildAll(scenario().plan("solar-array", arraySite));
    const id = structure(game.state, "solar-array").id;
    const campaign = changed(game.campaign, (state) => {
      for (const saved of state.structures) {
        if (saved.id === id) {
          saved.conditionPercent = 25;
          saved.dustCoatingPercent = 50;
        }
      }
      for (const stock of state.stockpile.components) {
        if (stock.componentId === spareComponentId) stock.count = 0;
      }
    });

    campaign.advance(1);

    const { performance, dustCoatingPercent } = array(campaign);
    expect(performance).toBeCloseTo(0.5, 9);
    expect(generation(campaign)).toBeCloseTo(
      10 *
        performance *
        (1 - (outputLossAtFullCoating * dustCoatingPercent) / 100),
      9,
    );
  });

  it("is in the power forecast", () => {
    const game = buildAll(
      scenario().plan("solar-array", arraySite).plan("battery-bank", bankSite),
    );
    // Three hours before Night falls, with the battery bank empty: the
    // array's output in those hours is all the bank has for the Night.
    game.advance({
      minutes: game.state.lunation.minutesRemaining - 3 * 60,
    });
    const arrayId = structure(game.state, "solar-array").id;
    const withCoating = (dustCoatingPercent: number) =>
      changed(game.campaign, (state) => {
        for (const saved of state.structures) {
          if (saved.id === arrayId)
            saved.dustCoatingPercent = dustCoatingPercent;
          saved.storedKilowattHours = 0;
        }
      });

    const forecast = (campaign: Campaign) =>
      campaign
        .forecasts()
        .power.networks.find((network) => network.structureIds.length > 1)
        ?.minutesUntilEmpty ?? 0;
    const clean = forecast(withCoating(0));
    const heavy = forecast(withCoating(100));

    const nightDraw = 0.25 + 0.05;
    const storedBy = (kilowatts: number) => 3 * (kilowatts - nightDraw);
    expect(clean).toBeCloseTo(3 * 60 + (storedBy(10) / nightDraw) * 60, -1);
    expect(heavy).toBeCloseTo(
      3 * 60 + (storedBy(10 * (1 - outputLossAtFullCoating)) / nightDraw) * 60,
      -1,
    );
  });
});

describe("cleaning", () => {
  it("is raised as Maintenance once the coating passes the threshold, and not before", () => {
    const below = coatedArray(cleaningThresholdPercent - 1);
    below.advance(1);
    expect(below.snapshot().maintenance).toEqual([]);

    const campaign = coatedArray(cleaningThresholdPercent - 0.01);
    const events = advanceUntil(campaign, "maintenance-needed");

    expect(events.at(-1)).toMatchObject({
      kind: "maintenance-needed",
      target: { kind: "structure", structureId: array(campaign).id },
      restoresCondition: false,
      cleans: true,
    });
    expect(campaign.snapshot().maintenance).toEqual([
      expect.objectContaining({
        spareComponents: 0,
        cleaning: true,
        step: "cleaning",
        waiting: undefined,
      }),
    ]);
  });

  it("has the Robot walk straight to the array and clean it, using no spare Components, which brings back full output", () => {
    const campaign = coatedArray(40);
    const before = spareComponents(campaign.snapshot());
    const activities = new Set<string>();

    const events: GameEvent[] = [];
    for (let minutes = 0; events.length === 0; minutes++) {
      if (minutes > 24 * 60) throw new Error("Cleaning never finished.");
      events.push(
        ...campaign
          .advance(1)
          .filter((event) => event.kind === "maintenance-completed"),
      );
      const robot = campaign.snapshot().robots[0];
      if (robot?.activity.kind === "walking") {
        activities.add(`walking to the ${robot.activity.destination}`);
      } else if (robot !== undefined) activities.add(robot.activity.kind);
    }
    campaign.advance(1);

    // It never goes to the stockpile.
    expect([...activities]).not.toContain("walking to the stockpile");
    expect([...activities]).not.toContain("loading-components");
    expect([...activities]).toContain("cleaning");
    expect(events).toEqual([
      expect.objectContaining({ spareComponents: 0, cleaned: true }),
    ]);
    expect(array(campaign).dustCoatingPercent).toBeLessThan(0.01);
    expect(spareComponents(campaign.snapshot())).toBe(before);
    expect(generation(campaign)).toBeCloseTo(10, 1);
  });

  it("goes ahead of a Construction planned before it was raised", () => {
    const game = buildAll(scenario().plan("solar-array", arraySite));
    game.plan("light-mast", mastSite);
    const campaign = coated(
      game.campaign,
      structure(game.state, "solar-array").id,
      40,
    );

    advanceUntil(campaign, "maintenance-completed");

    expect(campaign.snapshot().constructions[0]).toMatchObject({
      structureTypeId: "light-mast",
      stage: "site-preparation",
      stageProgress: 0,
    });
  });

  it("is done on the same visit as restoring Condition, when both are due", () => {
    const game = buildAll(scenario().plan("solar-array", arraySite));
    const id = structure(game.state, "solar-array").id;
    const campaign = coated(worn(game.campaign, id, 50), id, 40);
    const before = spareComponents(campaign.snapshot());
    const steps: string[] = [];

    const events: GameEvent[] = [];
    for (let minutes = 0; events.length === 0; minutes++) {
      if (minutes > 24 * 60) throw new Error("Maintenance never finished.");
      events.push(
        ...campaign
          .advance(1)
          .filter((event) => event.kind === "maintenance-completed"),
      );
      const step = campaign.snapshot().maintenance[0]?.step;
      if (step !== undefined && steps.at(-1) !== step) steps.push(step);
    }

    expect(steps).toEqual([
      "loading-spare-components",
      "restoring-condition",
      "cleaning",
    ]);
    expect(events).toEqual([
      expect.objectContaining({ spareComponents: 3, cleaned: true }),
    ]);
    expect(array(campaign)).toMatchObject({
      conditionPercent: 100,
      dustCoatingPercent: 0,
    });
    expect(spareComponents(campaign.snapshot())).toBe(before - 3);
  });
});

describe("cleaning without spare Components", () => {
  it("goes ahead when an array also needs its Condition restored but there are no spares for it, which waits on", () => {
    const game = buildAll(scenario().plan("solar-array", arraySite));
    const id = structure(game.state, "solar-array").id;
    const campaign = coated(worn(game.campaign, id, 50, 0), id, 40);
    campaign.advance(1);
    expect(campaign.snapshot().maintenance).toEqual([
      expect.objectContaining({
        spareComponents: 0,
        cleaning: true,
        waiting: undefined,
      }),
    ]);

    const events = advanceUntil(campaign, "maintenance-completed");

    expect(events.at(-1)).toMatchObject({ spareComponents: 0, cleaned: true });
    expect(array(campaign)).toMatchObject({
      conditionPercent: 50,
      dustCoatingPercent: 0,
    });
    campaign.advance(1);
    expect(campaign.snapshot().maintenance).toEqual([
      expect.objectContaining({
        spareComponents: 3,
        cleaning: false,
        waiting: { reason: "missing-spare-components", missing: 3 },
      }),
    ]);
  });
});

describe("Dust coating through saving and loading", () => {
  it("is kept", () => {
    const campaign = coatedArray(12.5);

    const loaded = loadCampaign(campaign.save());
    if (!loaded.ok) throw new Error(loaded.message);

    expect(array(loaded.campaign).dustCoatingPercent).toBe(12.5);
    expect(loaded.campaign.snapshot()).toEqual(campaign.snapshot());
  });
});
