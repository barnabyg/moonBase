import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import {
  loadCampaign,
  type Campaign,
  type GameEvent,
  type GroundPosition,
  type MachineSnapshot,
} from "../src/simulation";
import { scenario, type Scenario } from "./scenario";
import { changed, withSpares, worn } from "./worn";

// Dust wears down the Machines only, so that no Structure needs Maintenance.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withoutDust } = await import("./without-dust");
  const { withoutDigging } = await import("./without-digging");
  return {
    ...actual,
    catalogue: {
      ...withoutDigging(withoutDust(actual.catalogue)),
      machineTypes: actual.catalogue.machineTypes,
    },
  };
});

const EXCAVATOR = "excavator-1";
const arraySite: GroundPosition = { x: 20, y: 12 };
const habitatSite: GroundPosition = { x: 30, y: -30 };
const excavatorType = catalogue.machineTypes.find(
  (type) => type.id === "excavator",
);
const { spareComponentId } = catalogue.maintenance;

function excavator(campaign: Campaign): MachineSnapshot {
  const found = campaign
    .snapshot()
    .machines.find((machine) => machine.id === EXCAVATOR);
  if (found === undefined) throw new Error("expected the excavator");
  return found;
}

function spareComponents(campaign: Campaign): number {
  return (
    campaign
      .snapshot()
      .stockpile.components.find((s) => s.componentId === spareComponentId)
      ?.count ?? 0
  );
}

/** Advances a game-minute at a time until an event comes, returning every event on the way. */
function advanceUntil(
  campaign: Campaign,
  kind: GameEvent["kind"],
  limitHours = 48,
): GameEvent[] {
  const events: GameEvent[] = [];
  for (let minutes = 0; !events.some((event) => event.kind === kind);) {
    if (minutes++ > limitHours * 60) throw new Error(`No ${kind} event came.`);
    events.push(...campaign.advance(1));
  }
  return events;
}

/**
 * Advances a game-minute at a time until a Construction's Site Preparation
 * is done, counting the game-minutes the excavator worked and was driven.
 */
function prepareSite(campaign: Campaign): {
  working: number;
  driving: number;
} {
  let working = 0;
  let driving = 0;
  for (let minutes = 0; ; minutes++) {
    if (minutes > 48 * 60) throw new Error("Site Preparation never ended.");
    if (campaign.snapshot().constructions[0]?.stage !== "site-preparation") {
      return { working, driving };
    }
    campaign.advance(1);
    const state = campaign.snapshot();
    if (excavator(campaign).activity.kind === "working") working += 1;
    const activity = state.robots[0]?.activity;
    if (
      activity?.kind === "driving-machine" &&
      activity.machineId === EXCAVATOR
    ) {
      driving += 1;
    }
  }
}

/** A Campaign with a Construction planned, and the excavator worn down to a Condition. */
function withWornExcavator(
  structureTypeId: string,
  site: GroundPosition,
  conditionPercent: number,
  spares?: number,
): Campaign {
  const game: Scenario = scenario().plan(structureTypeId, site);
  return worn(game.campaign, EXCAVATOR, conditionPercent, spares);
}

describe("a Machine's Condition", () => {
  it("starts at 100% for every Machine, at full performance", () => {
    const { machines } = scenario().state;

    expect(machines.length).toBeGreaterThan(0);
    for (const machine of machines) {
      expect(machine).toMatchObject({ conditionPercent: 100, performance: 1 });
    }
  });

  it("wears down at the catalogue's rates for each hour it works or is driven, and not while it is idle", () => {
    const { campaign } = scenario().plan("habitat", habitatSite);

    const { working, driving } = prepareSite(campaign);

    expect(working).toBe(4 * 60);
    expect(driving).toBeGreaterThan(0);
    const expected =
      100 -
      (working * (excavatorType?.dustWearPercentPerWorkingHour ?? 0) +
        driving * (excavatorType?.dustWearPercentPerDrivingHour ?? 0)) /
        60;
    expect(excavator(campaign).conditionPercent).toBeCloseTo(expected, 9);

    const idle = excavator(campaign).conditionPercent;
    campaign.advance(24 * 60);
    expect(excavator(campaign).activity.kind).toBe("idle");
    expect(excavator(campaign).conditionPercent).toBe(idle);
  });

  it("is kept through saving and loading", () => {
    const campaign = worn(scenario().campaign, EXCAVATOR, 42.5);

    const loaded = loadCampaign(campaign.save());
    if (!loaded.ok) throw new Error(loaded.message);

    expect(excavator(loaded.campaign).conditionPercent).toBe(42.5);
  });
});

describe("a Machine at low Condition", () => {
  it("works and drives more slowly below the performance threshold", () => {
    const fresh = withWornExcavator("solar-array", arraySite, 100);
    // No spare Components, so that it isn't maintained first.
    const halved = withWornExcavator(
      "solar-array",
      arraySite,
      catalogue.machinePerformance.thresholdPercent / 2,
      0,
    );
    expect(excavator(halved).performance).toBeCloseTo(0.5, 9);

    const atFull = prepareSite(fresh);
    const atHalf = prepareSite(halved);

    expect(atFull.working).toBe(2 * 60);
    expect(atHalf.working).toBeGreaterThan(1.9 * atFull.working);
    expect(atHalf.driving).toBeGreaterThan(1.8 * atFull.driving);
  });
});

describe("a Broken Machine", () => {
  it("stops where it stands, gives up its stage, and holds up the Construction until it has been maintained", () => {
    // Worn so far that it breaks within minutes of being driven, with no
    // spare Components to maintain it.
    const campaign = withWornExcavator("solar-array", arraySite, 0.02, 0);

    const events = advanceUntil(campaign, "machine-broken");

    expect(events.at(-1)).toEqual({
      kind: "machine-broken",
      atMinute: campaign.snapshot().clock.elapsedMinutes,
      machineId: EXCAVATOR,
      machineTypeId: "excavator",
    });
    const where = excavator(campaign).position;
    campaign.advance(24 * 60);
    expect(excavator(campaign)).toMatchObject({
      conditionPercent: 0,
      performance: 0,
      position: where,
      activity: { kind: "idle" },
    });
    const [construction] = campaign.snapshot().constructions;
    expect(construction).toMatchObject({
      stage: "site-preparation",
      waiting: { reason: "machine-broken", machineTypeId: "excavator" },
    });
    expect(campaign.snapshot().maintenance).toEqual([
      expect.objectContaining({
        target: {
          kind: "machine",
          machineId: EXCAVATOR,
          machineTypeId: "excavator",
        },
        waiting: { reason: "missing-spare-components", missing: 5 },
      }),
    ]);

    const supplied = changed(campaign, (state) => {
      withSpares(state, 5);
    });
    advanceUntil(supplied, "maintenance-completed");
    expect(excavator(supplied).conditionPercent).toBe(100);
    expect(spareComponents(supplied)).toBe(0);
    advanceUntil(supplied, "construction-completed");
  });
});

describe("Maintenance of a Machine", () => {
  it("goes ahead of a Construction planned before it was raised, using spare Components", () => {
    const campaign = withWornExcavator("solar-array", arraySite, 40);
    const before = spareComponents(campaign);
    const start = excavator(campaign).position;

    const events = advanceUntil(campaign, "maintenance-completed");

    expect(events.at(-1)).toMatchObject({
      target: { kind: "machine", machineId: EXCAVATOR },
      spareComponents: 3,
    });
    expect(spareComponents(campaign)).toBe(before - 3);
    expect(excavator(campaign)).toMatchObject({
      conditionPercent: 100,
      position: start,
    });
    expect(campaign.snapshot().constructions[0]).toMatchObject({
      stage: "site-preparation",
      stageProgress: 0,
    });
  });

  it("waits while the Machine is working on a stage, and goes ahead once it is idle", () => {
    const game = scenario().plan("habitat", habitatSite);
    for (let minutes = 0; ; minutes++) {
      if (minutes > 24 * 60) throw new Error("The excavator never worked.");
      if (excavator(game.campaign).activity.kind === "working") break;
      game.advance({ minutes: 1 });
    }
    const campaign = worn(game.campaign, EXCAVATOR, 60);
    campaign.advance(1);

    expect(campaign.snapshot().maintenance).toEqual([
      expect.objectContaining({ waiting: { reason: "machine-at-work" } }),
    ]);
    expect(excavator(campaign).activity.kind).toBe("working");

    advanceUntil(campaign, "maintenance-completed");

    expect(campaign.snapshot().constructions[0]).toMatchObject({
      stage: "component-delivery",
      componentsTaken: false,
    });
    expect(excavator(campaign).conditionPercent).toBe(100);
  });

  it("shows in the Work panel's snapshot what the Robot is doing for it", () => {
    const campaign = withWornExcavator("solar-array", arraySite, 40);

    for (let minutes = 0; ; minutes++) {
      if (minutes > 24 * 60) throw new Error("Maintenance never started.");
      const activity = campaign.snapshot().robots[0]?.activity;
      if (activity?.kind === "maintaining") {
        expect(activity).toEqual({
          kind: "maintaining",
          machineId: EXCAVATOR,
        });
        break;
      }
      campaign.advance(1);
    }
    expect(campaign.snapshot().maintenance[0]).toMatchObject({
      underWay: true,
      step: "restoring-condition",
    });
  });
});
