import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import {
  loadCampaign,
  type Campaign,
  type GameEvent,
  type GroundPosition,
  type Snapshot,
} from "../src/simulation";
import { scenario, toGameMinutes, type Scenario } from "./scenario";
import { changed } from "./worn";

// A Habitat on a single solar array can't get through a Night, and these
// tests keep the Mission Director in one past the first.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { safeHabitat } = await import("./safe-habitat");
  return { ...actual, catalogue: safeHabitat(actual.catalogue, ["power"]) };
});

const solarSite: GroundPosition = { x: 20, y: 12 };
const bankSite: GroundPosition = { x: 28, y: 12 };
const habitatSite: GroundPosition = { x: 25, y: -20 };

/**
 * Runs the game a game-minute at a time until the condition holds,
 * returning every event on the way.
 */
function runUntil(
  game: Scenario,
  done: (state: Snapshot) => boolean,
): GameEvent[] {
  const events: GameEvent[] = [];
  for (let minute = 0; minute < 15 * 24 * 60; minute++) {
    if (done(game.state)) return events;
    events.push(...game.campaign.advance(1));
  }
  throw new Error("It never happened.");
}

function idOfLast(game: Scenario): string {
  const id = game.state.constructions.at(-1)?.id;
  if (id === undefined) throw new Error("expected a Construction");
  return id;
}

function reached(events: readonly GameEvent[]): string[] {
  return events.flatMap((event) =>
    event.kind === "milestone-reached" ? [event.milestoneId] : [],
  );
}

/** A solar array and a battery bank, both commissioned. */
function withPowerStorage(): { game: Scenario; bankId: string } {
  const game = scenario().plan("solar-array", solarSite);
  game.plan("battery-bank", bankSite);
  const bankId = idOfLast(game);
  runUntil(game, (state) => state.constructions.length === 0);
  return { game, bankId };
}

/** The Mission Director moved into a Habitat powered by a solar array, before any battery bank. */
function movedInWithoutStorage(): Scenario {
  const game = scenario().plan("solar-array", solarSite);
  game.plan("habitat", habitatSite);
  const habitatId = idOfLast(game);
  runUntil(game, (state) => state.constructions.length === 0);
  const result = game.campaign.moveMissionDirectorIn(habitatId);
  if (!result.ok) throw new Error(result.message);
  return game;
}

describe("the Milestones", () => {
  it("start a fresh Campaign with power storage as the current Milestone and moving in as the next, none reached", () => {
    const { milestones } = scenario().state;

    expect(milestones).toEqual({
      reachedIds: [],
      currentId: "power-storage",
      nextId: "moved-in",
    });
  });

  it("reach power storage as a battery bank is commissioned, with a notification, and make moving in current", () => {
    const game = scenario().plan("solar-array", solarSite);
    game.plan("battery-bank", bankSite);
    const bankId = idOfLast(game);

    const events = runUntil(game, (state) =>
      state.structures.some((structure) => structure.id === bankId),
    );
    events.push(...game.campaign.advance(1));

    expect(reached(events)).toEqual(["power-storage"]);
    const commissioned = events.findIndex(
      (event) =>
        event.kind === "construction-completed" && event.structureId === bankId,
    );
    const milestone = events.findIndex(
      (event) => event.kind === "milestone-reached",
    );
    expect(milestone).toBeGreaterThan(commissioned);
    expect(game.state.milestones).toEqual({
      reachedIds: ["power-storage"],
      currentId: "moved-in",
      nextId: "lander-departs",
    });
  });

  it("stop a skip to the next event as one is reached", () => {
    const game = scenario().plan("battery-bank", bankSite);
    runUntil(
      game,
      (state) => state.constructions[0]?.stage === "commissioning",
    );

    let events: readonly GameEvent[] = [];
    for (let skips = 0; reached(events).length === 0; skips++) {
      if (skips > 100) throw new Error("It was never reached.");
      events = game.campaign.advanceToNextEvent();
    }

    expect(reached(events)).toEqual(["power-storage"]);
    expect(
      events.every((event) => event.atMinute === events[0]?.atMinute),
    ).toBe(true);
  });

  it("reach moving in as the Mission Director moves into a Habitat, out of order, and skip over it once power storage is reached", () => {
    const game = movedInWithoutStorage();

    const events = game.campaign.advance(1);

    expect(reached(events)).toEqual(["moved-in"]);
    expect(game.state.milestones).toEqual({
      reachedIds: ["moved-in"],
      currentId: "power-storage",
      nextId: "lander-departs",
    });

    game.plan("battery-bank", bankSite);
    const later = runUntil(game, (state) =>
      state.milestones.reachedIds.includes("power-storage"),
    );

    expect(reached(later)).toEqual(["power-storage"]);
    expect(game.state.milestones).toEqual({
      reachedIds: ["moved-in", "power-storage"],
      currentId: "lander-departs",
      nextId: "habitat-shielded",
    });
  });

  it("reach the Lander departing as it takes off for Earth for the first time, and not again", () => {
    const game = movedInWithoutStorage();
    expect(game.campaign.sendLander()).toEqual({ ok: true });

    const events = runUntil(game, (state) =>
      state.milestones.reachedIds.includes("lander-departs"),
    );

    const takeOff = events.findIndex(
      (event) => event.kind === "lander-took-off",
    );
    expect(takeOff).toBeGreaterThanOrEqual(0);
    expect(reached(events)).toEqual(["moved-in", "lander-departs"]);
    expect(
      events.find(
        (event) =>
          event.kind === "milestone-reached" &&
          event.milestoneId === "lander-departs",
      )?.atMinute,
    ).toBe(events[takeOff]?.atMinute);

    const secondTrip = runUntil(
      game,
      (state) => state.lander.state === "landed-free",
    );
    expect(game.campaign.sendLander()).toEqual({ ok: true });
    secondTrip.push(...game.campaign.advance(2));
    expect(secondTrip.some((event) => event.kind === "lander-took-off")).toBe(
      true,
    );
    expect(reached(secondTrip)).toEqual([]);
  });

  it("keep power storage reached once the battery bank is dismantled", () => {
    const { game, bankId } = withPowerStorage();
    game.campaign.advance(1);
    expect(game.state.milestones.reachedIds).toEqual(["power-storage"]);

    expect(game.campaign.dismantleStructure(bankId)).toEqual({ ok: true });
    runUntil(game, (state) => state.dismantlings.length === 0);
    game.campaign.advance(60);

    expect(
      game.state.structures.some((structure) => structure.id === bankId),
    ).toBe(false);
    expect(game.state.milestones).toEqual({
      reachedIds: ["power-storage"],
      currentId: "moved-in",
      nextId: "lander-departs",
    });
  });

  it("are saved and loaded, so that the loaded Campaign carries on exactly as the uninterrupted one does", () => {
    const uninterrupted = movedInWithoutStorage();
    uninterrupted.plan("battery-bank", bankSite);
    const interrupted = movedInWithoutStorage();
    interrupted.plan("battery-bank", bankSite);
    uninterrupted.campaign.advance(1);
    interrupted.campaign.advance(1);
    expect(interrupted.state.milestones.reachedIds).toEqual(["moved-in"]);

    const loaded = loadCampaign(interrupted.campaign.save());
    if (!loaded.ok) throw new Error(loaded.message);
    const later = 3 * 24 * 60;
    const fromSave = loaded.campaign.advance(later);
    const straight = uninterrupted.campaign.advance(later);

    expect(reached(fromSave)).toEqual(["power-storage"]);
    expect(fromSave).toEqual(straight);
    expect(loaded.campaign.snapshot()).toEqual(uninterrupted.state);
  });
});

describe("the later Milestones", () => {
  it("reach the Habitat shielded as Regolith shielding over the Mission Director's Habitat is commissioned", () => {
    const game = movedInWithoutStorage();
    game.plan("regolith-shielding", habitatSite);

    const events = runUntil(game, (state) =>
      state.milestones.reachedIds.includes("habitat-shielded"),
    );

    expect(reached(events)).toEqual(["moved-in", "habitat-shielded"]);
    expect(
      game.state.structures.find(
        (structure) => structure.structureTypeId === "habitat",
      )?.shielded,
    ).toBe(true);
  });

  it("reach the landing pad as one is commissioned from Components a Launch would bring", () => {
    const game = withStock(scenario(), [
      ["pad-panel", 8],
      ["pad-beacon", 1],
    ]);
    game.plan("landing-pad", { x: -40, y: -40 });

    const events = runUntil(game, (state) => state.constructions.length === 0);
    events.push(...game.campaign.advance(1));

    expect(reached(events)).toEqual(["landing-pad"]);
  });

  it("reach the first Research Task as one is completed", () => {
    const game = scenario();
    expect(
      game.campaign.startResearchTask("regolith-sample-analysis"),
    ).toMatchObject({ ok: true });

    const events = runUntil(
      game,
      (state) => state.completedResearchTaskIds.length > 0,
    );

    expect(reached(events)).toEqual(["first-research-task"]);
    expect(events.at(-1)).toMatchObject({
      kind: "milestone-reached",
      milestoneId: "first-research-task",
    });
  });

  it("reach the first Export as it is sold when the Lander reaches Earth, not when it is loaded or taken off", () => {
    const game = withWafers(movedInWithoutStorage(), 30);
    expect(
      game.campaign.loadExports([{ resourceId: "wafers", kilograms: 30 }]),
    ).toMatchObject({ ok: true });
    expect(game.campaign.sendLander()).toEqual({ ok: true });

    const toTakeOff = game.campaign.advance(2);
    expect(toTakeOff.map((event) => event.kind)).toContain("lander-took-off");
    expect(reached(toTakeOff)).not.toContain("first-export");

    const events = runUntil(game, (state) =>
      state.milestones.reachedIds.includes("first-export"),
    );
    const sale = events.find((event) => event.kind === "lander-reached-earth");
    expect(sale).toMatchObject({ sold: [{ resourceId: "wafers" }] });
    expect(
      events.find(
        (event) =>
          event.kind === "milestone-reached" &&
          event.milestoneId === "first-export",
      )?.atMinute,
    ).toBe(sale?.atMinute);
  });

  it("don't reach the first Export when the Lander reaches Earth with nothing to sell", () => {
    const game = movedInWithoutStorage();
    expect(game.campaign.sendLander()).toEqual({ ok: true });

    const events = runUntil(
      game,
      (state) => state.lander.state === "turnaround",
    );

    expect(events.map((event) => event.kind)).toContain("lander-reached-earth");
    expect(reached(events)).not.toContain("first-export");
  });

  it("leave no current or next Milestone once all are reached, and the Campaign carries on", () => {
    const game = withAllReached(scenario());

    expect(game.state.milestones).toEqual({
      reachedIds: catalogue.milestones.map((milestone) => milestone.id),
      currentId: undefined,
      nextId: undefined,
    });

    const events = game.campaign.advance(24 * 60);

    expect(reached(events)).toEqual([]);
    expect(game.state.ended).toBeUndefined();
    expect(game.state.clock.elapsedMinutes).toBe(24 * 60);
  });
});

/** The game as saved, with Components added to the base's stock as a Launch would bring them. */
function withStock(
  game: Scenario,
  counts: readonly (readonly [string, number])[],
): Scenario {
  return fromCampaign(
    changed(game.campaign, (state) => {
      for (const [componentId, count] of counts) {
        const stock = state.stockpile.components.find(
          (candidate) => candidate.componentId === componentId,
        );
        if (stock === undefined) throw new Error(`expected ${componentId}`);
        stock.count += count;
      }
    }),
  );
}

/** The game as saved, with wafers in the base's stock, as if its Plants had made them. */
function withWafers(game: Scenario, kilograms: number): Scenario {
  return fromCampaign(
    changed(game.campaign, (state) => {
      const wafers = state.bulkResources.find(
        (stock) => stock.resourceId === "wafers",
      );
      if (wafers === undefined) throw new Error("expected wafers");
      wafers.kilograms = kilograms;
    }),
  );
}

/** The game as saved, with every Milestone reached. */
function withAllReached(game: Scenario): Scenario {
  const document = JSON.parse(game.campaign.save()) as {
    state: { reachedMilestoneIds: string[] };
  };
  document.state.reachedMilestoneIds = catalogue.milestones.map(
    (milestone) => milestone.id,
  );
  const loaded = loadCampaign(JSON.stringify(document));
  if (!loaded.ok) throw new Error(loaded.message);
  return fromCampaign(loaded.campaign);
}

function fromCampaign(campaign: Campaign): Scenario {
  const self: Scenario = {
    campaign,
    advance(duration) {
      campaign.advance(toGameMinutes(duration));
      return self;
    },
    plan(structureTypeId, position) {
      const result = campaign.planConstruction({ structureTypeId, position });
      if (!result.ok)
        throw new Error(`Planning was refused: ${result.message}`);
      return self;
    },
    get state() {
      return campaign.snapshot();
    },
  };
  return self;
}
