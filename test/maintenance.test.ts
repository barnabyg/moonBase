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
import { worn } from "./worn";

// The Mission Director has to live in the Habitat for a whole round trip of
// the Lander, for Plume Ejecta to wear Structures down. Dust wears nothing
// down, so that a Condition changes only as each test says.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { safeHabitat } = await import("./safe-habitat");
  const { withoutDust } = await import("./without-dust");
  return {
    ...actual,
    catalogue: safeHabitat(withoutDust(actual.catalogue), [
      "power",
      "radiation",
      "solar-particle-events",
    ]),
  };
});

const {
  thresholdPercent,
  conditionPercentPerSpareComponent,
  spareComponentId,
} = catalogue.maintenance;
const arraySite: GroundPosition = { x: 20, y: 12 };
const mastSite: GroundPosition = { x: 20, y: -20 };
const bankSite: GroundPosition = { x: -30, y: 4 };

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

function spareComponents(state: Snapshot): number {
  return (
    state.stockpile.components.find((s) => s.componentId === spareComponentId)
      ?.count ?? 0
  );
}

/** A solar array, built and then worn down to a Condition. */
function wornArray(conditionPercent: number, spares?: number): Campaign {
  const game = buildAll(scenario().plan("solar-array", arraySite));
  return worn(
    game.campaign,
    structure(game.state, "solar-array").id,
    conditionPercent,
    spares,
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

describe("a Maintenance Work Order", () => {
  it("is raised once a Structure's Condition falls below the threshold, and only once", () => {
    const campaign = wornArray(thresholdPercent - 10);
    const arrayId = structure(campaign.snapshot(), "solar-array").id;

    campaign.advance(1);
    campaign.advance(30);

    expect(campaign.snapshot().maintenance).toEqual([
      expect.objectContaining({
        structureId: arrayId,
        structureTypeId: "solar-array",
        waiting: undefined,
      }),
    ]);
  });

  it("is not raised while the Condition is at the threshold or above", () => {
    const campaign = wornArray(thresholdPercent);

    campaign.advance(60);

    expect(campaign.snapshot().maintenance).toEqual([]);
  });

  it("is raised when Plume Ejecta wears a Structure down", () => {
    const game = buildAll(
      scenario()
        .plan("habitat", { x: 60, y: 0 })
        .plan("light-mast", { x: 10, y: 10 }),
    );
    const movedIn = game.campaign.moveMissionDirectorIn(
      structure(game.state, "habitat").id,
    );
    if (!movedIn.ok) throw new Error(movedIn.message);
    const sent = game.campaign.sendLander();
    if (!sent.ok) throw new Error(sent.message);

    for (let skips = 0; game.state.lander.state !== "landed-free"; skips++) {
      if (skips > 100) throw new Error("The Lander never landed.");
      game.campaign.advanceToNextEvent();
    }
    game.advance({ minutes: 1 });

    const mast = structure(game.state, "light-mast");
    expect(mast.conditionPercent).toBe(
      100 - 2 * catalogue.plumeEjecta.conditionLossPercent,
    );
    expect(mast.conditionPercent).toBeLessThan(thresholdPercent);
    expect(game.state.maintenance.map((m) => m.structureId)).toEqual([mast.id]);
  });

  it("has the Robot load spare Components at the stockpile, carry them to the Structure and work on it, back to 100%", () => {
    const campaign = wornArray(55);
    const before = spareComponents(campaign.snapshot());
    const steps: string[] = [];
    const record = () => {
      const [robot] = campaign.snapshot().robots;
      if (robot === undefined) throw new Error("expected a Robot");
      const { activity } = robot;
      const step =
        activity.kind === "walking"
          ? `walking to the ${activity.destination}, carrying ${robot.carrying.map((c) => `${c.count} ${c.componentId}`).join("") || "nothing"}`
          : activity.kind;
      if (steps.at(-1) !== step) steps.push(step);
    };

    const events: GameEvent[] = [];
    for (let minutes = 0; events.length === 0; minutes++) {
      if (minutes > 24 * 60) throw new Error("Maintenance never finished.");
      events.push(
        ...campaign
          .advance(1)
          .filter((event) => event.kind === "maintenance-completed"),
      );
      record();
    }

    const spares = Math.ceil((100 - 55) / conditionPercentPerSpareComponent);
    expect(steps).toEqual([
      "walking to the stockpile, carrying nothing",
      "loading-components",
      `walking to the site, carrying ${spares} ${spareComponentId}`,
      "maintaining",
    ]);
    const state = campaign.snapshot();
    const array = structure(state, "solar-array");
    expect(array.conditionPercent).toBe(100);
    expect(spareComponents(state)).toBe(before - spares);
    expect(state.maintenance).toEqual([]);
    expect(events).toEqual([
      {
        kind: "maintenance-completed",
        atMinute: state.clock.elapsedMinutes,
        structureId: array.id,
        structureTypeId: "solar-array",
        spareComponents: spares,
        cleaned: false,
      },
    ]);
  });

  it.each([
    [65, 2],
    [60, 2],
    [41, 3],
    [20, 4],
    [0, 5],
  ])(
    "brings a Structure at %i% back to 100%, using spare Components in proportion to the Condition restored: %i",
    (conditionPercent, used) => {
      const campaign = wornArray(conditionPercent);
      const before = spareComponents(campaign.snapshot());

      advanceUntil(campaign, "maintenance-completed");

      expect(spareComponents(campaign.snapshot())).toBe(before - used);
      expect(
        structure(campaign.snapshot(), "solar-array").conditionPercent,
      ).toBe(100);
    },
  );

  it("makes a Broken Structure work again", () => {
    const campaign = wornArray(0);
    campaign.advance(1);
    const network = () => campaign.snapshot().power.networks[0];
    expect(campaign.snapshot().lunation.part).toBe("daylight");
    expect(network()?.generationKilowatts).toBe(0);
    expect(structure(campaign.snapshot(), "solar-array").powered).toBe(false);

    advanceUntil(campaign, "maintenance-completed");
    campaign.advance(1);

    expect(network()?.generationKilowatts).toBeGreaterThan(0);
    expect(structure(campaign.snapshot(), "solar-array").powered).toBe(true);
  });
});

describe("the order of Work Orders", () => {
  it("puts Maintenance ahead of a Construction planned before it was raised", () => {
    const game = buildAll(scenario().plan("solar-array", arraySite));
    game.plan("light-mast", mastSite);
    const campaign = worn(
      game.campaign,
      structure(game.state, "solar-array").id,
      40,
    );

    advanceUntil(campaign, "maintenance-completed");

    const [mast] = campaign.snapshot().constructions;
    expect(mast).toMatchObject({
      structureTypeId: "light-mast",
      stage: "site-preparation",
      stageProgress: 0,
    });
    expect(campaign.snapshot().machines.map((m) => m.activity)).toEqual([
      { kind: "idle" },
      { kind: "idle" },
    ]);
  });

  it("lets the Robot finish the Work Order it holds before it takes up Maintenance", () => {
    const game = buildAll(scenario().plan("solar-array", arraySite));
    game.plan("battery-bank", bankSite);
    for (let minutes = 0; ; minutes++) {
      if (minutes > 24 * 60) throw new Error("Assembly never started.");
      if (game.state.robots[0]?.activity.kind === "assembling") break;
      game.advance({ minutes: 1 });
    }
    const campaign = worn(
      game.campaign,
      structure(game.state, "solar-array").id,
      40,
    );
    const bank = () => campaign.snapshot().constructions[0];

    for (let minutes = 0; bank()?.stage === "assembly"; minutes++) {
      if (minutes > 24 * 60) throw new Error("Assembly never finished.");
      expect(campaign.snapshot().robots[0]?.activity.kind).toBe("assembling");
      campaign.advance(1);
    }
    campaign.advance(1);

    expect(bank()?.stage).toBe("commissioning");
    expect(campaign.snapshot().maintenance[0]?.underWay).toBe(true);
    advanceUntil(campaign, "maintenance-completed");
    expect(bank()).toMatchObject({ stage: "commissioning", stageProgress: 0 });
  });
});

describe("Maintenance with too few spare Components", () => {
  it("waits, saying how many more it needs, while the Robot carries on with other Work Orders", () => {
    const game = buildAll(scenario().plan("solar-array", arraySite));
    game.plan("light-mast", mastSite);
    const campaign = worn(
      game.campaign,
      structure(game.state, "solar-array").id,
      30,
      1,
    );

    advanceUntil(campaign, "construction-completed");

    const state = campaign.snapshot();
    expect(state.constructions).toEqual([]);
    expect(state.maintenance).toEqual([
      expect.objectContaining({
        spareComponents: 4,
        underWay: false,
        waiting: { reason: "missing-spare-components", missing: 3 },
      }),
    ]);
    expect(spareComponents(state)).toBe(1);
    expect(structure(state, "solar-array").conditionPercent).toBe(30);
  });

  it("goes ahead once spare Components are in stock", () => {
    const game = buildAll(scenario().plan("solar-array", arraySite));
    const arrayId = structure(game.state, "solar-array").id;
    const waiting = worn(game.campaign, arrayId, 30, 0);
    waiting.advance(60);
    expect(waiting.snapshot().maintenance[0]?.waiting).toBeDefined();

    const supplied = worn(waiting, arrayId, 30, 4);
    advanceUntil(supplied, "maintenance-completed");

    expect(structure(supplied.snapshot(), "solar-array").conditionPercent).toBe(
      100,
    );
    expect(spareComponents(supplied.snapshot())).toBe(0);
  });
});

describe("a Structure to be dismantled", () => {
  it("is not maintained, and any spare Components loaded for it go back into the base's stock", () => {
    const campaign = wornArray(30);
    const before = spareComponents(campaign.snapshot());
    for (let minutes = 0; ; minutes++) {
      if (minutes > 24 * 60) throw new Error("The spares were never loaded.");
      if ((campaign.snapshot().robots[0]?.carrying.length ?? 0) > 0) break;
      campaign.advance(1);
    }
    expect(spareComponents(campaign.snapshot())).toBe(before - 4);

    const arrayId = structure(campaign.snapshot(), "solar-array").id;
    expect(campaign.dismantleStructure(arrayId)).toEqual({ ok: true });
    campaign.advance(1);

    const state = campaign.snapshot();
    expect(state.maintenance).toEqual([]);
    expect(spareComponents(state)).toBe(before);
    expect(state.robots[0]?.carrying).toEqual([]);
  });
});

describe("Maintenance through saving and loading", () => {
  it("carries on exactly as it would have", () => {
    const campaign = wornArray(30);
    for (let minutes = 0; ; minutes++) {
      if (minutes > 24 * 60) throw new Error("The spares were never loaded.");
      if (campaign.snapshot().robots[0]?.activity.kind === "walking") {
        if ((campaign.snapshot().robots[0]?.carrying.length ?? 0) > 0) break;
      }
      campaign.advance(1);
    }

    const loaded = loadCampaign(campaign.save());
    if (!loaded.ok) throw new Error(loaded.message);

    expect(loaded.campaign.snapshot()).toEqual(campaign.snapshot());
    expect(loaded.campaign.advance(6 * 60)).toEqual(campaign.advance(6 * 60));
    expect(loaded.campaign.snapshot()).toEqual(campaign.snapshot());
  });
});
