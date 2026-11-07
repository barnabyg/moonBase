import { describe, expect, it, vi } from "vitest";
import {
  catalogue,
  type Catalogue,
  type StructureType,
} from "../src/catalogue";
import {
  loadCampaign,
  reserveKilograms,
  type GroundPosition,
  type Snapshot,
  type StructureSnapshot,
} from "../src/simulation";
import {
  formatExperimentsLabs,
  formatResearchTask,
} from "../src/ui/status-panel-text";
import { scenario, scenarioOf, type Scenario } from "./scenario";
import { changed, worn } from "./worn";

// An automated experiments lab's Design is unlocked from the start, with two labs'
// Components, two large battery banks' and a second solar array's in the starting
// stock. Nothing wears down by Dust or Micrometeorites, no Machine draws power for a
// heater at Night, and the Habitat draws none, so that what the base's stocks and
// battery banks do is the labs' alone: the Mission Director stays aboard the
// Lander, on its own supplies.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withDesigns } = await import("./with-designs");
  const { withoutDust } = await import("./without-dust");
  const { withoutCold } = await import("./without-cold");
  const { withoutMicrometeorites } = await import("./without-micrometeorites");
  const { withoutDigging } = await import("./without-digging");
  const { safeHabitat } = await import("./safe-habitat");
  const componentsOf = (id: string) =>
    actual.catalogue.structureTypes.find((type) => type.id === id)
      ?.components ?? [];
  const base = withDesigns(
    withoutDigging(
      withoutMicrometeorites(
        withoutCold(
          withoutDust(
            safeHabitat(actual.catalogue, [
              "power",
              "radiation",
              "solar-particle-events",
            ]),
          ),
        ),
      ),
    ),
    ["automated-experiments", "large-battery-banks"],
  );
  return {
    ...actual,
    catalogue: {
      ...base,
      startingStock: [
        ...base.startingStock,
        ...componentsOf("experiments-lab"),
        ...componentsOf("large-battery-bank"),
        ...componentsOf("solar-array"),
        {
          componentId: actual.catalogue.maintenance.spareComponentId,
          count: 30,
        },
      ],
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
const lab = structureType("experiments-lab");
const { speedsResearch } = lab;
if (speedsResearch === undefined) throw new Error("expected a speed-up");
const inputs = lab.recipes?.[0]?.inputs ?? [];
const perHour = (stockId: string) =>
  inputs.find(
    ({ resource }) =>
      resource.kind === "life-support" && resource.stockId === stockId,
  )?.kilogramsPerHour ?? Number.NaN;
const waterPerHour = perHour("water");
const oxygenPerHour = perHour("oxygen");
// A long Research Task that needs no Design.
const TASK = "solar-wind-volatiles-survey";

const solarSite: GroundPosition = { x: 20, y: 12 };
const secondSolarSite: GroundPosition = { x: 18, y: 28 };
const batterySite: GroundPosition = { x: 30, y: 25 };
const secondBatterySite: GroundPosition = { x: 30, y: 36 };
const labSite: GroundPosition = { x: 36, y: 8 };
const secondLabSite: GroundPosition = { x: 46, y: 40 };

function runUntilBuilt(game: Scenario): void {
  for (let hours = 0; game.state.constructions.length > 0; hours++) {
    if (hours > 8 * 24) throw new Error("The Constructions never finished.");
    game.advance({ hours: 1 });
  }
}

function runUntil(game: Scenario, part: "daylight" | "night"): void {
  do {
    game.advance({ minutes: game.state.lunation.minutesRemaining });
  } while (game.state.lunation.part !== part);
}

function labsOf(state: Snapshot): StructureSnapshot[] {
  return state.structures.filter(
    ({ structureTypeId }) => structureTypeId === lab.id,
  );
}

function stock(state: Snapshot, stockId: string): number {
  return (
    state.lifeSupport.find((candidate) => candidate.stockId === stockId)
      ?.kilograms ?? 0
  );
}

/** The Campaign as saved, but with so much of each life support stock. */
function withStocks(
  game: Scenario,
  kilograms: { readonly water?: number; readonly oxygen?: number },
): Scenario {
  return scenarioOf(
    changed(game.campaign, (saved) => {
      for (const held of saved.lifeSupport) {
        const set = kilograms[held.stockId as "water" | "oxygen"];
        if (set !== undefined) held.kilograms = set;
      }
    }),
  );
}

/** The Campaign as saved, but with so much energy stored in each battery bank. */
function withStored(game: Scenario, kilowattHours: number): Scenario {
  return scenarioOf(
    changed(game.campaign, (saved) => {
      for (const structure of saved.structures) {
        if (structure.storedKilowattHours > 0) {
          structure.storedKilowattHours = kilowattHours;
        }
      }
    }),
  );
}

/** Two solar arrays, two large battery banks and a lab, all commissioned and cabled. */
function labBase(): Scenario {
  const game = scenario()
    .plan("solar-array", solarSite)
    .plan("solar-array", secondSolarSite)
    .plan("large-battery-bank", batterySite)
    .plan("large-battery-bank", secondBatterySite)
    .plan(lab.id, labSite);
  runUntilBuilt(game);
  return game;
}

/** Plenty of water and oxygen, and the long Research Task started. */
function running(game: Scenario): Scenario {
  const supplied = withStocks(game, { water: 300, oxygen: 100 });
  const started = supplied.campaign.queueResearchTask(TASK);
  if (!started.ok) throw new Error(started.message);
  return supplied;
}

function minutesLeft(state: Snapshot): number {
  return state.researchTask?.minutesLeft ?? Number.NaN;
}

function consumption(state: Snapshot, structureId: string): number {
  return (
    state.power.networks.find(({ structureIds }) =>
      structureIds.includes(structureId),
    )?.consumptionKilowatts ?? Number.NaN
  );
}

describe("an automated experiments lab", () => {
  it("makes the Research Task running advance twice as fast while it has its power, water and oxygen", () => {
    const game = running(labBase());
    expect(game.state.lunation.part).toBe("daylight");
    const before = minutesLeft(game.state);

    game.advance({ hours: 3 });

    expect(minutesLeft(game.state)).toBe(before - 2 * 3 * 60);
    expect(game.state.researchTask).toMatchObject({
      rate: 1 + speedsResearch.addedMinutesPerMinute,
      minutesLeftAtRate: Math.ceil(minutesLeft(game.state) / 2),
    });
    expect(game.state.experimentsLabs).toEqual({
      labs: 1,
      speedingUp: 1,
      short: [],
    });
    expect(formatResearchTask(game.state.researchTask).note).toMatch(
      / left at ×2$/,
    );
    expect(formatExperimentsLabs(game.state)).toBe(
      "1 automated experiments lab speeding it up",
    );
  });

  it("adds its speed-up to a second lab's", () => {
    const game = labBase().plan(lab.id, secondLabSite);
    runUntilBuilt(game);
    const both = running(game);
    const before = minutesLeft(both.state);

    both.advance({ hours: 2 });

    expect(minutesLeft(both.state)).toBe(before - 3 * 2 * 60);
    expect(both.state.researchTask?.rate).toBe(3);
    expect(both.state.experimentsLabs.speedingUp).toBe(2);
    expect(formatResearchTask(both.state.researchTask).note).toMatch(
      / left at ×3$/,
    );
  });

  it("completes the Research Task sooner, paying the same Science, and starts the next in the queue at its usual length", () => {
    const game = running(labBase());
    game.campaign.queueResearchTask("regolith-sample-analysis");
    const science = game.state.science;
    const length = minutesLeft(game.state);

    const events = game.campaign.advance(Math.ceil(length / 2));

    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "research-task-completed",
        researchTaskId: TASK,
      }),
    );
    expect(game.state.science).toBe(
      science +
        (catalogue.researchTasks.find(({ id }) => id === TASK)?.science ?? 0),
    );
    expect(game.state.researchTask).toMatchObject({
      researchTaskId: "regolith-sample-analysis",
      minutesLeft: 6 * 60,
    });
    expect(game.state.researchQueue).toEqual([]);
  });

  it("takes its water and oxygen a batch at a time and draws its power only while a Research Task is running", () => {
    const idle = withStocks(labBase(), { water: 300, oxygen: 100 });
    idle.advance({ hours: 1 });
    const [standing] = labsOf(idle.state);
    expect(standing?.plant).toMatchObject({
      running: false,
      stoppedFor: { reason: "no-research-task" },
      batch: undefined,
    });
    const idleDraw = consumption(idle.state, standing?.id ?? "");
    let water = stock(idle.state, "water");
    let oxygen = stock(idle.state, "oxygen");

    idle.advance({ hours: 4 });

    expect(stock(idle.state, "water")).toBeCloseTo(water, 5);
    expect(stock(idle.state, "oxygen")).toBeCloseTo(oxygen, 5);
    expect(consumption(idle.state, standing?.id ?? "")).toBeCloseTo(idleDraw);
    expect(formatExperimentsLabs(idle.state)).toBe(
      "1 automated experiments lab standing idle until a Research Task runs",
    );

    idle.campaign.queueResearchTask(TASK);
    water = stock(idle.state, "water");
    oxygen = stock(idle.state, "oxygen");
    idle.advance({ hours: 4 });

    expect(labsOf(idle.state)[0]?.plant).toMatchObject({ running: true });
    expect(stock(idle.state, "water")).toBeCloseTo(water - 4 * waterPerHour, 5);
    expect(stock(idle.state, "oxygen")).toBeCloseTo(
      oxygen - 4 * oxygenPerHour,
      5,
    );
    expect(consumption(idle.state, standing?.id ?? "")).toBeCloseTo(
      idleDraw + (lab.power.daylightDrawKilowatts ?? 0),
    );
  });

  it("speeds up less at a low Condition", () => {
    const game = running(labBase());
    const id = labsOf(game.state)[0]?.id ?? "";
    const { thresholdPercent } = catalogue.structurePerformance;
    const half = scenarioOf(worn(game.campaign, id, thresholdPercent / 2, 0));
    const performance = labsOf(half.state)[0]?.performance ?? Number.NaN;
    expect(performance).toBeLessThan(1);
    const before = minutesLeft(half.state);

    half.advance({ hours: 2 });

    expect(minutesLeft(half.state)).toBe(
      Math.ceil(before - 2 * 60 * (1 + performance) - 1e-9),
    );
    expect(half.state.researchTask?.rate).toBeCloseTo(1 + performance);
  });

  it("goes on exactly as an uninterrupted run would when saved and loaded part-way through a Research Task", () => {
    const game = running(labBase());
    const id = labsOf(game.state)[0]?.id ?? "";
    // At a low Condition, so that what it has done isn't a whole number of game-minutes.
    const worse = scenarioOf(
      worn(
        game.campaign,
        id,
        catalogue.structurePerformance.thresholdPercent / 3,
        0,
      ),
    );
    worse.advance({ minutes: 7 });

    const loaded = loadCampaign(worse.campaign.save());
    if (!loaded.ok) throw new Error(loaded.message);

    const original = worse.campaign.advance(24 * 60);
    const reloaded = loaded.campaign.advance(24 * 60);
    expect(reloaded).toEqual(original);
    expect(loaded.campaign.save()).toBe(worse.campaign.save());
  });
});

describe("an automated experiments lab short of water or oxygen", () => {
  for (const [stockId, kilogramsPerHour] of [
    ["water", waterPerHour],
    ["oxygen", oxygenPerHour],
  ] as const) {
    it(`never takes ${stockId} below the reserve, stops speeding up and says so, and starts again once there is a batch's worth above it`, () => {
      const reserve = reserveKilograms(stockId);
      const game = running(labBase());
      const short = withStocks(game, {
        [stockId]: reserve + 2 * kilogramsPerHour,
      });

      short.advance({ hours: 4 });

      expect(stock(short.state, stockId)).toBeCloseTo(reserve, 5);
      const [halted] = labsOf(short.state);
      expect(halted?.plant).toMatchObject({
        running: false,
        stoppedFor: { reason: "reserve", resource: { stockId } },
      });
      expect(short.state.researchTask?.rate).toBe(1);
      expect(short.state.experimentsLabs).toEqual({
        labs: 1,
        speedingUp: 0,
        short: [
          {
            structureId: halted?.id,
            shortOf: {
              reason: "supply",
              resource: { kind: "life-support", stockId },
            },
          },
        ],
      });
      expect(formatExperimentsLabs(short.state)).toBe(
        `1 automated experiments lab short of ${stockId}`,
      );
      // The Research Task goes on at its own pace, with nothing lost.
      const before = minutesLeft(short.state);
      short.advance({ hours: 1 });
      expect(minutesLeft(short.state)).toBe(before - 60);

      const refilled = withStocks(short, { [stockId]: reserve + 20 });
      refilled.advance({ hours: 1 });
      expect(labsOf(refilled.state)[0]?.plant).toMatchObject({
        running: true,
      });
      expect(refilled.state.researchTask?.rate).toBe(2);
    });
  }
});

describe("an automated experiments lab short of power", () => {
  it("has none at Night with no battery bank, speeds up nothing, and starts again by itself at Daylight", () => {
    const game = scenario()
      .plan("solar-array", solarSite)
      .plan(lab.id, labSite);
    runUntilBuilt(game);
    const supplied = running(game);
    supplied.advance({ hours: 1 });
    expect(supplied.state.researchTask?.rate).toBe(2);

    runUntil(supplied, "night");
    supplied.advance({ minutes: 5 });

    expect(labsOf(supplied.state)[0]?.plant).toMatchObject({
      running: false,
      stoppedFor: { reason: "no-power" },
    });
    expect(supplied.state.researchTask?.rate).toBe(1);
    expect(supplied.state.experimentsLabs.short).toMatchObject([
      { shortOf: { reason: "power" } },
    ]);
    expect(formatExperimentsLabs(supplied.state)).toBe(
      "1 automated experiments lab short of power",
    );

    const day = withStocks(supplied, { water: 300, oxygen: 100 });
    runUntil(day, "daylight");
    day.advance({ hours: 1 });
    expect(day.state.researchTask?.rate).toBe(2);
  });

  it("gives up its power at Night before anything else goes without, keeping the battery banks' reserve", () => {
    const game = running(labBase());
    runUntil(game, "night");
    const supplied = withStored(
      withStocks(game, { water: 300, oxygen: 100 }),
      structureType("large-battery-bank").power.storageKilowattHours,
    );
    supplied.advance({ hours: 1 });
    expect(labsOf(supplied.state)[0]?.plant).toMatchObject({ running: true });
    expect(supplied.state.researchTask?.rate).toBe(2);
    // A few hours of the lab above what everything else needs through the rest of
    // the Night and the reserve after it, shared between the two battery banks.
    const solarDraw = 2 * structureType("solar-array").power.drawKilowatts;
    const bankDraw =
      2 * structureType("large-battery-bank").power.drawKilowatts;
    const everythingElse =
      ((solarDraw + bankDraw) *
        (supplied.state.lunation.minutesRemaining +
          catalogue.nightReserveHours * 60)) /
      60;
    const short = withStored(
      supplied,
      (everythingElse + 5 * lab.power.nightDrawKilowatts) / 2,
    );

    short.advance({ hours: 10 });

    expect(labsOf(short.state)[0]?.plant).toMatchObject({
      running: false,
      stoppedFor: { reason: "no-power" },
    });
    expect(short.state.researchTask?.rate).toBe(1);
    expect(
      short.state.structures
        .filter(({ structureTypeId }) => structureTypeId !== lab.id)
        .every(({ powered }) => powered),
    ).toBe(true);
  });
});

describe("what an automated experiments lab asks of a base", () => {
  it("draws more through a Night than a large battery bank stores", () => {
    const nightHours =
      catalogue.lunation.nightEarthDays * 24 + catalogue.nightReserveHours;
    expect(lab.power.nightDrawKilowatts * nightHours).toBeGreaterThan(
      structureType("large-battery-bank").power.storageKilowattHours,
    );
  });
});
