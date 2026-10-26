import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import {
  loadCampaign,
  type Campaign,
  type GameEvent,
  type GroundPosition,
  type Snapshot,
} from "../src/simulation";
import { scenario } from "./scenario";
import { worn } from "./worn";

// Nothing strikes at random, and the Robot digs no Regolith, so that it
// has nothing to do but what a test gives it.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withoutDigging } = await import("./without-digging");
  const { withoutMicrometeorites } = await import("./without-micrometeorites");
  return {
    ...actual,
    catalogue: withoutMicrometeorites(withoutDigging(actual.catalogue)),
  };
});

const { expeditions } = catalogue;
const awayMinutes = expeditions.awayEarthDays * 24 * 60;
const halfWidth = catalogue.map.widthMetres / 2;
const halfDepth = catalogue.map.depthMetres / 2;
const site: GroundPosition = { x: 20, y: 12 };

function ice(state: Snapshot): number {
  return (
    state.bulkResources.find(
      (stock) => stock.resourceId === expeditions.resourceId,
    )?.kilograms ?? Number.NaN
  );
}

function onMap(position: GroundPosition): boolean {
  return Math.abs(position.x) <= halfWidth && Math.abs(position.y) <= halfDepth;
}

function start(campaign: Campaign): void {
  const result = campaign.startExpedition();
  if (!result.ok) throw new Error(result.message);
}

/** Runs the Campaign one game-minute at a time until the Expedition is over, returning every state and event. */
function untilBack(campaign: Campaign): {
  states: Snapshot[];
  events: GameEvent[];
} {
  const states: Snapshot[] = [];
  const events: GameEvent[] = [];
  for (let minute = 0; minute < awayMinutes + 3 * 24 * 60; minute++) {
    events.push(...campaign.advance(1));
    const state = campaign.snapshot();
    states.push(state);
    if (state.expedition === undefined) return { states, events };
  }
  throw new Error("The Expedition never came back.");
}

function withoutRepeats<T>(values: T[]): T[] {
  return values.filter((value, index) => value !== values[index - 1]);
}

describe("an Expedition", () => {
  it("has the Robot walk to the Rover and drive it off the nearest map edge, then come back some time later with water ice", () => {
    const { campaign } = scenario();
    start(campaign);
    expect(campaign.snapshot().expedition).toMatchObject({
      stage: "boarding",
      robotId: "robot-1",
      roverId: "rover-1",
    });

    const { states, events } = untilBack(campaign);

    expect(
      withoutRepeats(states.map((state) => state.robots[0]?.activity.kind)),
    ).toEqual([
      "walking",
      "driving-rover",
      "on-expedition",
      "driving-rover",
      "unloading-expedition",
    ]);
    expect(
      withoutRepeats(states.map((state) => state.expedition?.stage)),
    ).toEqual([
      "boarding",
      "driving-out",
      "away",
      "driving-back",
      "unloading",
      undefined,
    ]);
    // It leaves by the nearest edge: the Rover starts north of the Lander.
    const away = states.filter((state) => state.expedition?.stage === "away");
    const awayAt = away[0]?.rovers[0]?.position;
    expect(awayAt?.y).toBeGreaterThan(halfDepth);
    expect(Math.abs(awayAt?.x ?? Infinity)).toBeLessThan(halfWidth);
    for (const state of away) {
      expect(onMap(state.rovers[0]?.position ?? site)).toBe(false);
      expect(state.rovers[0]?.activity).toEqual({ kind: "on-expedition" });
    }
    expect(away).toHaveLength(awayMinutes);
    const left = events.find((event) => event.kind === "expedition-left");
    const returned = events.find(
      (event) => event.kind === "expedition-returned",
    );
    expect(left).toMatchObject({
      returnsAtMinute: (left?.atMinute ?? 0) + awayMinutes,
    });
    expect(returned).toMatchObject({
      resourceId: expeditions.resourceId,
      kilograms: expeditions.kilograms,
    });
    const last = states.at(-1);
    if (last === undefined) throw new Error("expected a state");
    expect(ice(last)).toBe(expeditions.kilograms);
    // Back beside the stockpile.
    const rover = last.rovers[0]?.position ?? site;
    expect(
      Math.hypot(
        rover.x - last.stockpile.position.x,
        rover.y - last.stockpile.position.y,
      ),
    ).toBeLessThan(6);
  });

  it("says when it will be back, once it has left", () => {
    const { campaign } = scenario();
    start(campaign);
    expect(campaign.snapshot().expedition?.returnsAtMinute).toBeUndefined();

    let left: GameEvent | undefined;
    while (left === undefined) {
      left = campaign
        .advance(1)
        .find((event) => event.kind === "expedition-left");
    }

    expect(campaign.snapshot().expedition).toMatchObject({
      stage: "away",
      returnsAtMinute: left.atMinute + awayMinutes,
    });
  });

  it("wears the Rover down by Dust for every hour it is driven, there and back", () => {
    const { campaign } = scenario();
    const before = campaign.snapshot().rovers[0]?.conditionPercent ?? 0;
    start(campaign);

    const { states } = untilBack(campaign);

    const drivenMinutes = states.filter(
      (state) =>
        state.robots[0]?.activity.kind === "driving-rover" ||
        state.robots[0]?.activity.kind === "on-expedition",
    ).length;
    expect(
      before - (states.at(-1)?.rovers[0]?.conditionPercent ?? 0),
    ).toBeCloseTo(
      (drivenMinutes / 60) * catalogue.rover.dustWearPercentPerDrivingHour,
      1,
    );
  });

  it("lets the Robot finish the Work Order it holds before it leaves", () => {
    const game = scenario().plan("solar-array", site);
    // Driving the excavator to the site for Site Preparation.
    for (
      let minute = 0;
      game.state.robots[0]?.activity.kind !== "driving-machine";
      minute++
    ) {
      if (minute > 6 * 60) throw new Error("The Robot never drove.");
      game.advance({ minutes: 1 });
    }
    start(game.campaign);

    const kinds: string[] = [];
    for (let minute = 0; minute < 6 * 60; minute++) {
      game.advance({ minutes: 1 });
      // A fresh snapshot: the one the loop above read is narrowed.
      const [robot] = game.campaign.snapshot().robots;
      kinds.push(robot?.activity.kind ?? "");
    }

    const steps = withoutRepeats(kinds);
    expect(steps.indexOf("activating-machine")).toBeGreaterThanOrEqual(0);
    expect(steps.indexOf("activating-machine")).toBeLessThan(
      steps.indexOf("driving-rover"),
    );
    // It took up no other Work Order on the way.
    expect(steps.slice(steps.indexOf("activating-machine") + 1)).not.toContain(
      "loading-components",
    );
  });
});

describe("while an Expedition is away", () => {
  /** A Campaign whose Expedition has just left the map. */
  function away(): Campaign {
    const { campaign } = scenario();
    start(campaign);
    for (let minute = 0; ; minute++) {
      if (minute > 24 * 60) throw new Error("The Expedition never left.");
      if (
        campaign.advance(1).some((event) => event.kind === "expedition-left")
      ) {
        return campaign;
      }
    }
  }

  it("claims no Work Order, so planned Constructions wait", () => {
    const campaign = away();
    const planned = campaign.planConstruction({
      structureTypeId: "light-mast",
      position: site,
    });
    if (!planned.ok) throw new Error(planned.message);

    campaign.advance(awayMinutes - 60);

    const state = campaign.snapshot();
    expect(state.robots[0]?.activity).toEqual({ kind: "on-expedition" });
    expect(state.constructions[0]).toMatchObject({
      stage: "site-preparation",
      stageProgress: 0,
    });
    expect(
      state.machines.every((machine) => machine.activity.kind === "idle"),
    ).toBe(true);
  });

  it("carries on with Work Orders in their usual order once it is back", () => {
    const campaign = away();
    const planned = campaign.planConstruction({
      structureTypeId: "light-mast",
      position: site,
    });
    if (!planned.ok) throw new Error(planned.message);

    untilBack(campaign);
    campaign.advance(12 * 60);

    expect(campaign.snapshot().constructions[0]?.stage).not.toBe(
      "site-preparation",
    );
  });

  it("doesn't let the Robot repair itself until it is back", () => {
    const campaign = worn(away(), "robot-1", 5);
    const events: GameEvent[] = [];

    events.push(...campaign.advance(awayMinutes - 60));
    expect(
      events.filter((event) => event.kind === "robot-self-repair-started"),
    ).toEqual([]);
    expect(campaign.snapshot().robots[0]?.selfRepair).toBeUndefined();

    const back = untilBack(campaign);
    expect([...back.events, ...campaign.advance(1)].map((e) => e.kind)).toEqual(
      expect.arrayContaining([
        "expedition-returned",
        "robot-self-repair-started",
      ]),
    );
  });

  it("goes on exactly as it would have through saving and loading", () => {
    const campaign = away();
    campaign.advance(24 * 60);
    const loaded = loadCampaign(campaign.save());
    if (!loaded.ok) throw new Error(loaded.message);

    const original = untilBack(campaign);
    const reloaded = untilBack(loaded.campaign);

    expect(reloaded.events).toEqual(original.events);
    expect(loaded.campaign.snapshot()).toEqual(campaign.snapshot());
  });
});

describe("the spare Components forecast", () => {
  it("counts no cold on the Rover while it is out on an Expedition at Night", () => {
    const { campaign } = scenario();
    // Leaving just before Night, so that it is away through it.
    campaign.advance(campaign.snapshot().lunation.minutesRemaining - 6 * 60);
    start(campaign);
    while (campaign.snapshot().expedition?.stage !== "away") {
      campaign.advance(60);
    }
    campaign.advance(12 * 60);
    expect(campaign.snapshot().lunation.part).toBe("night");

    const { perEarthDay } = campaign.forecasts().spareComponents;

    // The Machines left in the cold, the Rover driven and the Robot at work.
    const machineCold = catalogue.machineTypes.reduce(
      (sum, type) => sum + type.coldWearPercentPerNightHour,
      0,
    );
    expect(perEarthDay).toBeCloseTo(
      ((machineCold +
        catalogue.rover.dustWearPercentPerDrivingHour +
        catalogue.robot.dustWearPercentPerHour) *
        24) /
        catalogue.maintenance.conditionPercentPerSpareComponent,
      6,
    );
  });
});

describe("skipping to the next event", () => {
  it("stops as the Expedition leaves and as it returns", () => {
    const { campaign } = scenario();
    start(campaign);
    const stops: string[] = [];

    for (let skips = 0; campaign.snapshot().expedition !== undefined; skips++) {
      if (skips > 40) throw new Error("The Expedition never came back.");
      stops.push(...campaign.advanceToNextEvent().map((event) => event.kind));
    }

    expect(stops).toEqual(
      expect.arrayContaining(["expedition-left", "expedition-returned"]),
    );
    expect(ice(campaign.snapshot())).toBe(expeditions.kilograms);
  });
});

describe("starting an Expedition", () => {
  it("is refused while one is under way", () => {
    const { campaign } = scenario();
    start(campaign);

    expect(campaign.startExpedition()).toEqual({
      ok: false,
      reason: "under-way",
      message: "An Expedition is already under way.",
    });
  });

  it("is refused while the Rover is Broken", () => {
    const campaign = worn(scenario().campaign, "rover-1", 0);

    expect(campaign.startExpedition()).toEqual({
      ok: false,
      reason: "rover-broken",
      message:
        "The Rover is Broken, and can't be driven until it has been maintained.",
    });
  });

  it("is refused once the Campaign has ended", () => {
    const loaded = loadCampaign(
      readFileSync(
        new URL("./saves/version-1-ended.moonbase", import.meta.url),
        "utf8",
      ),
    );
    if (!loaded.ok) throw new Error(loaded.message);

    expect(loaded.campaign.startExpedition()).toEqual({
      ok: false,
      reason: "campaign-ended",
      message: "The Campaign is over: the Mission Director has died.",
    });
  });
});
