import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import {
  loadCampaign,
  type Campaign,
  type GameEvent,
  type GroundPosition,
  type RobotSnapshot,
  type Snapshot,
  type StructureSnapshot,
} from "../src/simulation";
import { scenario, type Scenario } from "./scenario";
import { worn } from "./worn";

// Dust wears down the Robot only, and nothing feels the cold, so that only
// the Robot's work changes its Condition and nothing else needs Maintenance.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withoutDust } = await import("./without-dust");
  const { withoutCold } = await import("./without-cold");
  return {
    ...actual,
    catalogue: {
      ...withoutCold(withoutDust(actual.catalogue)),
      robot: actual.catalogue.robot,
    },
  };
});

const ROBOT = "robot-1";
const arraySite: GroundPosition = { x: 20, y: 12 };
const habitatSite: GroundPosition = { x: 30, y: -30 };
const mastSite: GroundPosition = { x: -30, y: -25 };
/** Where a cable from the solar array runs straight, clear of the Lander. */
const cabledMastSite: GroundPosition = { x: 45, y: -25 };
const {
  dustWearPercentPerHour,
  selfRepairThresholdPercent,
  makeshiftRepairPercent,
  conditionFloorPercent,
  walkingSpeedMetresPerHour,
} = catalogue.robot;
const { spareComponentId, conditionPercentPerSpareComponent } =
  catalogue.maintenance;

/** Runs the game until the Robot has carried out every planned Construction. */
function buildAll(game: Scenario): Scenario {
  for (let hours = 0; game.state.constructions.length > 0; hours++) {
    if (hours > 10 * 24) throw new Error("The Constructions never finished.");
    game.advance({ hours: 1 });
  }
  return game;
}

function robot(campaign: Campaign): RobotSnapshot {
  const found = campaign.snapshot().robots[0];
  if (found === undefined) throw new Error("expected a Robot");
  return found;
}

function structure(state: Snapshot, type: string): StructureSnapshot {
  const found = state.structures.find((s) => s.structureTypeId === type);
  if (found === undefined) throw new Error(`expected a ${type}`);
  return found;
}

function stock(campaign: Campaign, componentId: string): number {
  return (
    campaign
      .snapshot()
      .stockpile.components.find((s) => s.componentId === componentId)?.count ??
    0
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

/** Each thing the Robot did, in order, as it went for its repair. */
function selfRepairSteps(campaign: Campaign): string[] {
  const steps: string[] = [];
  const events: GameEvent[] = [];
  for (let minutes = 0; !events.some((e) => e.kind === "robot-repaired");) {
    if (minutes++ > 48 * 60) throw new Error("The Robot never repaired.");
    events.push(...campaign.advance(1));
    const { activity } = robot(campaign);
    const step =
      activity.kind === "walking-to-repair"
        ? `walking to the ${activity.destination}`
        : activity.kind;
    if (steps.at(-1) !== step) steps.push(step);
  }
  return steps;
}

describe("the Robot's Condition", () => {
  it("starts at 100%, at full performance", () => {
    expect(robot(scenario().campaign)).toMatchObject({
      conditionPercent: 100,
      performance: 1,
      selfRepair: undefined,
    });
  });

  it("wears down at the catalogue rate for each hour it isn't idle, and not while it is", () => {
    const { campaign } = scenario().plan("light-mast", mastSite);
    let busyMinutes = 0;
    for (let minutes = 0; campaign.snapshot().constructions.length > 0;) {
      if (minutes++ > 48 * 60) throw new Error("The mast was never built.");
      campaign.advance(1);
      if (robot(campaign).activity.kind !== "idle") busyMinutes += 1;
    }
    campaign.advance(60);
    const afterBuilding = robot(campaign).conditionPercent;

    campaign.advance(24 * 60);

    expect(busyMinutes).toBeGreaterThan(60);
    expect(afterBuilding).toBeCloseTo(
      100 - (busyMinutes * dustWearPercentPerHour) / 60,
      9,
    );
    expect(robot(campaign).conditionPercent).toBe(afterBuilding);
  });

  it("is kept through saving and loading", () => {
    const campaign = worn(scenario().campaign, ROBOT, 63.25);

    const loaded = loadCampaign(campaign.save());
    if (!loaded.ok) throw new Error(loaded.message);

    expect(robot(loaded.campaign).conditionPercent).toBe(63.25);
  });
});

describe("a Robot at low Condition", () => {
  it("walks more slowly below the performance threshold", () => {
    const half = catalogue.robot.performance.thresholdPercent / 2;
    const fresh = scenario().plan("light-mast", mastSite).campaign;
    const slowed = worn(
      scenario().plan("light-mast", mastSite).campaign,
      ROBOT,
      half,
    );
    const { exponent } = catalogue.robot.performance;
    expect(robot(slowed).performance).toBeCloseTo(0.5 ** exponent, 9);
    expect(robot(slowed).performance).toBeLessThan(1);
    const step = (campaign: Campaign) => {
      const before = robot(campaign).position;
      campaign.advance(1);
      const after = robot(campaign).position;
      expect(robot(campaign).activity.kind).toBe("walking");
      return Math.hypot(after.x - before.x, after.y - before.y);
    };

    expect(step(fresh)).toBeCloseTo(walkingSpeedMetresPerHour / 60, 9);
    expect(step(slowed)).toBeCloseTo(
      (walkingSpeedMetresPerHour / 60) * robot(slowed).performance,
      9,
    );
  });

  it("works more slowly below the performance threshold", () => {
    const assemblyMinutes = (campaign: Campaign) => {
      let minutes = 0;
      for (let tick = 0; campaign.snapshot().constructions.length > 0;) {
        if (tick++ > 72 * 60) throw new Error("The mast was never built.");
        campaign.advance(1);
        if (robot(campaign).activity.kind === "assembling") minutes += 1;
      }
      return minutes;
    };
    const fresh = assemblyMinutes(
      scenario().plan("light-mast", mastSite).campaign,
    );
    const half = catalogue.robot.performance.thresholdPercent / 2;
    const slowed = assemblyMinutes(
      worn(scenario().plan("light-mast", mastSite).campaign, ROBOT, half),
    );

    // It wears down a little further on the way, so slows a little more.
    const performance = 0.5 ** catalogue.robot.performance.exponent;
    expect(fresh).toBe(60);
    expect(slowed).toBeGreaterThanOrEqual(Math.ceil(fresh / performance));
    expect(slowed).toBeLessThan(Math.ceil(fresh / performance) + 5);
  });
});

describe("self-repair", () => {
  it("has the Robot stop below the threshold, fetch spare Components and repair itself at the Lander while the Mission Director lives aboard", () => {
    const campaign = worn(
      scenario().campaign,
      ROBOT,
      selfRepairThresholdPercent - 0.5,
    );
    const before = stock(campaign, spareComponentId);
    const needed = Math.ceil(
      (100 - (selfRepairThresholdPercent - 0.5)) /
        conditionPercentPerSpareComponent,
    );

    const started = campaign.advance(1);
    const steps = selfRepairSteps(campaign);

    expect(started).toEqual([
      {
        kind: "robot-self-repair-started",
        atMinute: 1,
        robotId: ROBOT,
        conditionPercent: selfRepairThresholdPercent - 0.5,
        home: "lander",
        makeshift: false,
      },
    ]);
    expect(steps).toEqual([
      "walking to the stockpile",
      "loading-spare-components",
      "walking to the lander",
      "repairing-itself",
    ]);
    expect(robot(campaign)).toMatchObject({
      conditionPercent: 100,
      selfRepair: undefined,
      carrying: [],
    });
    expect(stock(campaign, spareComponentId)).toBe(before - needed);
    const lander = campaign.snapshot().lander.position;
    const { position } = robot(campaign);
    expect(
      Math.hypot(position.x - lander.x, position.y - lander.y),
    ).toBeLessThan(catalogue.lander.footprintRadiusMetres + 2);
  });

  it("goes to the Habitat once the Mission Director lives there", () => {
    const game = buildAll(
      scenario().plan("solar-array", arraySite).plan("habitat", habitatSite),
    );
    const movedIn = game.campaign.moveMissionDirectorIn(
      structure(game.state, "habitat").id,
    );
    if (!movedIn.ok) throw new Error(movedIn.message);
    const campaign = worn(game.campaign, ROBOT, 5);

    const started = campaign.advance(1);
    const steps = selfRepairSteps(campaign);

    expect(started).toContainEqual(
      expect.objectContaining({
        kind: "robot-self-repair-started",
        home: "habitat",
      }),
    );
    expect(steps.at(-2)).toBe("walking to the habitat");
    const habitat = structure(campaign.snapshot(), "habitat").position;
    const { position } = robot(campaign);
    expect(
      Math.hypot(position.x - habitat.x, position.y - habitat.y),
    ).toBeLessThan(
      (catalogue.structureTypes.find((t) => t.id === "habitat")
        ?.footprintRadiusMetres ?? 0) + 2,
    );
    expect(robot(campaign).conditionPercent).toBe(100);
  });

  it("is a makeshift repair with too few spare Components, after which the Robot works on, slowly", () => {
    const campaign = worn(scenario().campaign, ROBOT, 5, 0);

    const started = campaign.advance(1);
    const steps = selfRepairSteps(campaign);

    expect(started).toContainEqual(
      expect.objectContaining({ makeshift: true }),
    );
    expect(steps).toEqual(["walking to the lander", "repairing-itself"]);
    expect(robot(campaign).conditionPercent).toBe(makeshiftRepairPercent);
    expect(robot(campaign).performance).toBeLessThan(1);
    expect(robot(campaign).performance).toBeGreaterThan(0);
  });

  it("goes ahead of the Work Order the Robot was on, keeps what it was carrying, and takes the Work Order up again afterwards", () => {
    const game = scenario().plan("light-mast", mastSite);
    for (let minutes = 0; ; minutes++) {
      if (minutes > 24 * 60) throw new Error("The Robot never loaded.");
      const { activity, carrying } =
        game.state.robots[0] ?? robot(game.campaign);
      if (activity.kind === "walking" && carrying.length > 0) break;
      game.advance({ minutes: 1 });
    }
    const carried = robot(game.campaign).carrying;
    const poles = stock(game.campaign, "mast-pole");
    const campaign = worn(game.campaign, ROBOT, 5);

    campaign.advance(1);
    expect(robot(campaign).activity.kind).toBe("walking-to-repair");
    expect(robot(campaign).carrying).toEqual(carried);
    advanceUntil(campaign, "robot-repaired");
    expect(robot(campaign).carrying).toEqual(carried);
    advanceUntil(campaign, "construction-completed");

    expect(stock(campaign, "mast-pole")).toBe(poles);
    expect(robot(campaign).carrying).toEqual([]);
  });

  it("leaves a cable it was laying in one straight run, taking it up again from where it got to", () => {
    const game = buildAll(scenario().plan("solar-array", arraySite));
    game.plan("light-mast", cabledMastSite);
    for (let minutes = 0; ; minutes++) {
      if (minutes > 48 * 60) throw new Error("No cable was laid.");
      if (game.state.robots[0]?.activity.kind === "laying-cable") break;
      game.advance({ minutes: 1 });
    }
    game.advance({ minutes: 30 });
    const campaign = worn(game.campaign, ROBOT, 5);

    advanceUntil(campaign, "robot-repaired");
    advanceUntil(campaign, "construction-completed");

    const [cable] = campaign.snapshot().cables;
    const route = cable?.route ?? [];
    const [start] = route;
    const end = route.at(-1);
    if (start === undefined || end === undefined) {
      throw new Error("expected a cable");
    }
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    for (const point of route) {
      const across =
        Math.abs(
          (end.x - start.x) * (start.y - point.y) -
            (start.x - point.x) * (end.y - start.y),
        ) / length;
      expect(across).toBeLessThan(0.01);
    }
  });

  it("never lets the Robot's Condition reach 0%: it is never Broken", () => {
    const campaign = worn(scenario().campaign, ROBOT, conditionFloorPercent, 0);
    let lowest = 100;

    for (let minutes = 0; minutes < 6 * 60; minutes++) {
      campaign.advance(1);
      lowest = Math.min(lowest, robot(campaign).conditionPercent);
    }

    expect(lowest).toBe(conditionFloorPercent);
    expect(robot(campaign).conditionPercent).toBe(makeshiftRepairPercent);
  });

  it("is kept through saving and loading, part-way through", () => {
    const campaign = worn(scenario().campaign, ROBOT, 5);
    campaign.advance(30);
    expect(robot(campaign).selfRepair).toBeDefined();

    const loaded = loadCampaign(campaign.save());
    if (!loaded.ok) throw new Error(loaded.message);

    expect(loaded.campaign.snapshot()).toEqual(campaign.snapshot());
    expect(loaded.campaign.advance(6 * 60)).toEqual(campaign.advance(6 * 60));
  });
});
