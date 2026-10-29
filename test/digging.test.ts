import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import {
  loadCampaign,
  type Campaign,
  type GroundPosition,
  type MachineSnapshot,
  type RobotSnapshot,
  type Snapshot,
} from "../src/simulation";
import { scenario, scenarioOf } from "./scenario";
import { changed, worn } from "./worn";

const { digging } = catalogue;
const excavatorType = catalogue.machineTypes.find(
  (type) => type.id === "excavator",
);
if (excavatorType === undefined) throw new Error("expected an excavator");
const site: GroundPosition = { x: 20, y: 12 };

function regolith(state: Snapshot): number {
  return (
    state.bulkResources.find((stock) => stock.resourceId === "regolith")
      ?.kilograms ?? Number.NaN
  );
}

function robotOf(state: Snapshot): RobotSnapshot {
  const [robot] = state.robots;
  if (robot === undefined) throw new Error("expected a Robot");
  return robot;
}

function excavatorOf(state: Snapshot): MachineSnapshot {
  const excavator = state.machines.find(
    (machine) => machine.machineTypeId === "excavator",
  );
  if (excavator === undefined) throw new Error("expected an excavator");
  return excavator;
}

function distanceBetween(a: GroundPosition, b: GroundPosition): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Runs the Campaign one game-minute at a time until the excavator digs, returning the state after every minute. */
function untilDigging(campaign: Campaign): Snapshot[] {
  const states: Snapshot[] = [];
  for (let minute = 0; minute < 24 * 60; minute++) {
    campaign.advance(1);
    const state = campaign.snapshot();
    states.push(state);
    if (excavatorOf(state).activity.kind === "digging") return states;
  }
  throw new Error("The excavator never started digging.");
}

/** Runs the Campaign until the base's Regolith is full. */
function untilFull(campaign: Campaign): void {
  for (
    let hours = 0;
    regolith(campaign.snapshot()) < digging.fullKilograms;
    hours++
  ) {
    if (hours > 5 * 24) throw new Error("The Regolith never filled.");
    campaign.advance(60);
  }
}

/** The Campaign as saved, with the base's Regolith set as given. */
function withRegolith(campaign: Campaign, kilograms: number): Campaign {
  return changed(campaign, (state) => {
    for (const stock of state.bulkResources) {
      if (stock.resourceId === "regolith") stock.kilograms = kilograms;
    }
  });
}

/** How many times the Robot set to activating a Machine to dig, minute by minute. */
function diggingActivations(states: Snapshot[]): number {
  return withoutRepeats(
    states.map((state) => {
      const { activity } = robotOf(state);
      return activity.kind === "activating-machine" && "purpose" in activity
        ? "activating"
        : "other";
    }),
  ).filter((step) => step === "activating").length;
}

/** Runs the Campaign one game-minute at a time for as long as given, returning the state after every minute. */
function everyMinute(campaign: Campaign, minutes: number): Snapshot[] {
  const states: Snapshot[] = [];
  for (let minute = 0; minute < minutes; minute++) {
    campaign.advance(1);
    states.push(campaign.snapshot());
  }
  return states;
}

function withoutRepeats<T>(values: T[]): T[] {
  return values.filter((value, index) => value !== values[index - 1]);
}

describe("the base's bulk resources", () => {
  it("start with no Regolith, in catalogue order", () => {
    const { state } = scenario();

    expect(state.bulkResources).toEqual(
      catalogue.bulkResources.map((resource) => ({
        resourceId: resource.id,
        kilograms: 0,
      })),
    );
  });
});

describe("digging", () => {
  it("has the Robot walk to the excavator, drive it beside the stockpile and activate it, when no Construction needs it", () => {
    const { campaign } = scenario();

    const states = untilDigging(campaign);

    expect(
      withoutRepeats(states.map((state) => robotOf(state).activity.kind)),
    ).toEqual([
      "walking",
      "driving-machine",
      // Climbing down to the controls beside it.
      "walking",
      "activating-machine",
      "idle",
    ]);
    for (const state of states) {
      const { activity } = robotOf(state);
      if (activity.kind === "driving-machine") {
        expect(activity).toEqual({
          kind: "driving-machine",
          machineId: excavatorOf(state).id,
          purpose: "digging",
        });
        expect(excavatorOf(state).activity.kind).toBe(
          "being-positioned-to-dig",
        );
      }
    }
    const last = states.at(-1);
    if (last === undefined) throw new Error("expected a state");
    // Clear of the stockpile, but close beside it.
    const gap =
      distanceBetween(excavatorOf(last).position, last.stockpile.position) -
      catalogue.stockpile.footprintRadiusMetres -
      excavatorType.footprintRadiusMetres;
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(5);
  });

  it("fills the base's stock of Regolith at the data catalogue's rate until it is full, then stops", () => {
    const { campaign } = scenario();
    untilDigging(campaign);
    const before = regolith(campaign.snapshot());

    campaign.advance(60);

    expect(regolith(campaign.snapshot()) - before).toBeCloseTo(
      digging.kilogramsPerWorkingHour,
      6,
    );

    untilFull(campaign);
    expect(regolith(campaign.snapshot())).toBe(digging.fullKilograms);
    campaign.advance(1);
    expect(excavatorOf(campaign.snapshot()).activity.kind).toBe("idle");

    campaign.advance(24 * 60);
    expect(regolith(campaign.snapshot())).toBe(digging.fullKilograms);
    expect(excavatorOf(campaign.snapshot()).activity.kind).toBe("idle");
  });

  it("doesn't start while the base has as much Regolith as the level that starts it", () => {
    const campaign = withRegolith(
      scenario().campaign,
      digging.refillBelowKilograms,
    );

    const states = everyMinute(campaign, 24 * 60);

    expect(diggingActivations(states)).toBe(0);
    expect(regolith(campaign.snapshot())).toBe(digging.refillBelowKilograms);
    expect(excavatorOf(campaign.snapshot()).activity.kind).toBe("idle");
  });

  it("digs from below the level that starts it until the Regolith is full, set digging only once", () => {
    const campaign = withRegolith(
      scenario().campaign,
      digging.refillBelowKilograms - 1,
    );

    const states = everyMinute(campaign, 2 * 24 * 60);

    expect(diggingActivations(states)).toBe(1);
    expect(regolith(campaign.snapshot())).toBe(digging.fullKilograms);
  });

  it("is set digging once for each fill while an extraction plant draws the Regolith down, not for every few kilograms", () => {
    const plantType = catalogue.structureTypes.find(
      (type) => type.id === "extraction-plant",
    );
    if (plantType === undefined) throw new Error("expected a plant");
    // The plant's Components brought to the base's stock, as a Launch would.
    const game = scenarioOf(
      changed(scenario().campaign, (state) => {
        for (const need of plantType.components) {
          const stock = state.stockpile.components.find(
            (candidate) => candidate.componentId === need.componentId,
          );
          if (stock !== undefined) stock.count += need.count;
        }
      }),
    );
    game.plan("solar-array", site).plan("extraction-plant", { x: 30, y: 22 });
    for (let hours = 0; game.state.constructions.length > 0; hours++) {
      if (hours > 10 * 24) throw new Error("The Constructions never finished.");
      game.advance({ hours: 1 });
    }
    // Just above the level that starts digging, so the plant takes it
    // below within the day.
    const campaign = withRegolith(
      game.campaign,
      digging.refillBelowKilograms + 10,
    );
    campaign.advance(1);
    expect(
      campaign
        .snapshot()
        .structures.find(
          (structure) => structure.structureTypeId === "extraction-plant",
        )?.plant?.running,
    ).toBe(true);

    const states = everyMinute(campaign, 2 * 24 * 60);

    expect(diggingActivations(states)).toBe(1);
    expect(Math.max(...states.map((state) => regolith(state)))).toBe(
      digging.fullKilograms,
    );
    expect(regolith(campaign.snapshot())).toBeLessThan(digging.fullKilograms);
  });

  it("wears the excavator down by Dust for each hour it digs", () => {
    const { campaign } = scenario();
    untilDigging(campaign);
    const before = excavatorOf(campaign.snapshot()).conditionPercent;

    campaign.advance(10 * 60);

    expect(
      before - excavatorOf(campaign.snapshot()).conditionPercent,
    ).toBeCloseTo(10 * excavatorType.dustWearPercentPerWorkingHour, 6);
  });

  it("digs more slowly at lower Condition, along the Machine performance curve", () => {
    // Too few spare Components to maintain it, so it carries on worn.
    const campaign = worn(scenario().campaign, "excavator-1", 25, 0);
    untilDigging(campaign);
    const before = campaign.snapshot();

    campaign.advance(60);

    // Its performance falls a little more as it wears through the hour.
    const after = campaign.snapshot();
    const performance =
      (excavatorOf(before).performance + excavatorOf(after).performance) / 2;
    expect(performance).toBeLessThan(1);
    expect(regolith(after) - regolith(before)).toBeCloseTo(
      digging.kilogramsPerWorkingHour * performance,
      1,
    );
  });

  it("doesn't happen while the excavator is Broken", () => {
    const campaign = worn(scenario().campaign, "excavator-1", 0, 0);

    campaign.advance(2 * 24 * 60);

    expect(regolith(campaign.snapshot())).toBe(0);
    expect(robotOf(campaign.snapshot()).activity.kind).toBe("idle");
  });

  it("gives way to the Site Preparation of a Construction planned while it digs, and carries on afterwards", () => {
    const game = scenario();
    untilDigging(game.campaign);

    game.plan("solar-array", site);
    // The Robot takes the excavator off digging in its first game-minute
    // on the Site Preparation.
    game.advance({ minutes: 2 });

    expect(excavatorOf(game.state).activity.kind).toBe("being-positioned");
    expect(game.state.constructions[0]?.waiting).toBeUndefined();
    const stopped = regolith(game.state);

    for (let hours = 0; game.state.constructions.length > 0; hours++) {
      if (hours > 24) throw new Error("The solar array was never built.");
      game.advance({ hours: 1 });
    }
    // Back to digging once the Robot has nothing else to do.
    game.advance({ hours: 6 });

    expect(excavatorOf(game.state).activity.kind).toBe("digging");
    expect(regolith(game.state)).toBeGreaterThan(stopped);
  });

  it("waits after giving way, once the Regolith is back above the level that starts it, until it falls below it again", () => {
    const game = scenarioOf(
      withRegolith(scenario().campaign, digging.refillBelowKilograms - 1),
    );
    untilDigging(game.campaign);
    // Dug past the level that starts digging.
    game.advance({ hours: 2 });
    expect(regolith(game.state)).toBeGreaterThan(digging.refillBelowKilograms);

    game.plan("solar-array", site);
    // The Robot takes the excavator off digging in its first game-minute
    // on the Site Preparation.
    game.advance({ minutes: 2 });
    expect(excavatorOf(game.state).activity.kind).toBe("being-positioned");
    const stopped = regolith(game.state);
    for (let hours = 0; game.state.constructions.length > 0; hours++) {
      if (hours > 24) throw new Error("The solar array was never built.");
      game.advance({ hours: 1 });
    }
    game.advance({ hours: 6 });

    expect(excavatorOf(game.state).activity.kind).toBe("idle");
    expect(robotOf(game.state).activity.kind).toBe("idle");
    expect(regolith(game.state)).toBe(stopped);
  });

  it("is claimed only when no other Work Order can be carried out, once the Robot has finished the one it holds", () => {
    const game = scenario();
    // On its way to the excavator to set it digging.
    game.advance({ minutes: 1 });
    expect(robotOf(game.state).activity).toMatchObject({
      kind: "walking",
      destination: "machine",
    });

    game.plan("light-mast", site);
    const kinds: string[] = [];
    for (let minute = 0; minute < 6 * 60; minute++) {
      game.advance({ minutes: 1 });
      const { activity } = robotOf(game.state);
      kinds.push(
        "structureId" in activity ? `${activity.kind} site` : activity.kind,
      );
    }

    // It sets the excavator digging first, then takes the excavator off
    // digging for the light mast's Site Preparation.
    const steps = withoutRepeats(kinds);
    expect(steps.indexOf("activating-machine")).toBeLessThan(
      steps.indexOf("driving-machine site"),
    );
    expect(steps).toContain("driving-machine site");
  });

  it("carries on after a save and load exactly as it would have", () => {
    const { campaign } = scenario();
    untilDigging(campaign);
    campaign.advance(90);
    const loaded = loadCampaign(campaign.save());
    if (!loaded.ok) throw new Error(loaded.message);

    campaign.advance(6 * 60);
    loaded.campaign.advance(6 * 60);

    expect(loaded.campaign.snapshot()).toEqual(campaign.snapshot());
  });
});
